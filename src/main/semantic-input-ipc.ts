import { randomUUID } from "node:crypto";
import type { BrowserWindow } from "electron";
import {
  isSelectionRevision,
  isSemanticInputReply,
  isSemanticInputRequest,
  semanticInputIpc,
  type SemanticInputRequest,
} from "../shared/semantic-input";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import type { ExtensionViewRequestContext } from "./extension-view-host";

type Pending = {
  id: string;
  started(): void;
  finish(available: boolean): void;
  cancel(): void;
};
type Owner = {
  contents: BrowserWindow["webContents"];
  revision?: number;
  pending?: Pending;
  cleanup(): void;
};

/** One bounded, revocable semantic interaction per window; never a PTY handle. */
export function registerSemanticInputIpc(options: {
  ipc: IpcMainPort;
  trusted(event: IpcEvent): boolean;
  quitting(): boolean;
}) {
  const owners = new Map<object, Owner>();
  const ownerFor = (event: IpcEvent) =>
    options.trusted(event) && !options.quitting()
      ? owners.get(event.sender)
      : undefined;
  const selection = (event: IpcEvent, revision?: unknown) => {
    const owner = ownerFor(event);
    if (
      owner &&
      isSelectionRevision(revision) &&
      (owner.revision === undefined || revision > owner.revision)
    )
      owner.revision = revision;
  };
  const reply = (event: IpcEvent, value?: unknown) => {
    const owner = ownerFor(event);
    if (
      !owner?.pending ||
      !isSemanticInputReply(value) ||
      value.id !== owner.pending.id
    )
      return;
    if (value.kind === "started") owner.pending.started();
    else owner.pending.finish(value.available);
  };
  options.ipc.on(semanticInputIpc.selection, selection);
  options.ipc.on(semanticInputIpc.reply, reply);
  const remove = (owner: Owner) => {
    owners.delete(owner.contents);
    owner.pending?.cancel();
    owner.cleanup();
  };
  return {
    register(window: BrowserWindow) {
      const contents = window.webContents;
      if (owners.has(contents)) return;
      const lost = () => remove(owner);
      const navigation = (
        _event: unknown,
        _url: unknown,
        inPlace: unknown,
        mainFrame: unknown,
      ) => {
        if (mainFrame && !inPlace && owner.revision !== undefined) lost();
      };
      const owner: Owner = {
        contents,
        cleanup() {
          window.removeListener("closed", lost);
          contents.removeListener("destroyed", lost);
          contents.removeListener("render-process-gone", lost);
          contents.removeListener("did-start-navigation", navigation);
        },
      };
      owners.set(contents, owner);
      window.on("closed", lost);
      contents.on("destroyed", lost);
      contents.on("render-process-gone", lost);
      contents.on("did-start-navigation", navigation);
    },
    request(
      window: BrowserWindow,
      input: SemanticInputRequest,
      source: ExtensionViewRequestContext,
      signal: AbortSignal,
      admit: (signal: AbortSignal, commit: () => void) => Promise<void>,
    ): Promise<{ ok: boolean }> {
      const owner = owners.get(window.webContents);
      if (
        !owner ||
        owner.pending ||
        owner.revision === undefined ||
        signal.aborted ||
        options.quitting() ||
        !source.isCurrentVisible() ||
        !isSemanticInputRequest(input)
      )
        return Promise.reject(new Error("Semantic input unavailable"));
      // Capture before asynchronous admission. The renderer independently checks
      // this revision before capturing its exact Surface; neither side retargets.
      const revision = owner.revision;
      return new Promise((resolve, reject) => {
        const id = randomUUID();
        let sent = false;
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          if (owner.pending?.id === id) delete owner.pending;
        };
        const cancel = () => {
          if (settled) return;
          settled = true;
          cleanup();
          if (sent && !owner.contents.isDestroyed()) {
            try {
              owner.contents.send(semanticInputIpc.command, {
                kind: "revoke",
                id,
              });
            } catch {
              /* Lost renderer has no remaining authority. */
            }
          }
          reject(new Error("Semantic input unavailable"));
        };
        // Bound a missing renderer acknowledgement, not the user's preview time.
        const timer = setTimeout(cancel, 5000);
        owner.pending = {
          id,
          started() {
            if (sent) clearTimeout(timer);
          },
          finish(available) {
            if (settled || !sent) return;
            settled = true;
            cleanup();
            resolve({ ok: available });
          },
          cancel,
        };
        signal.addEventListener("abort", cancel, { once: true });
        void Promise.resolve()
          .then(() =>
            admit(signal, () => {
              if (
                settled ||
                sent ||
                signal.aborted ||
                owners.get(owner.contents) !== owner ||
                owner.revision !== revision ||
                options.quitting() ||
                !source.isCurrentVisible()
              )
                throw new Error("Semantic input unavailable");
              sent = true;
              owner.contents.send(semanticInputIpc.command, {
                kind: "request",
                id,
                source: source.id,
                revision,
                input,
              });
            }),
          )
          .catch(cancel);
      });
    },
    dispose() {
      for (const owner of owners.values()) remove(owner);
      options.ipc.removeListener(semanticInputIpc.selection, selection);
      options.ipc.removeListener(semanticInputIpc.reply, reply);
    },
  };
}
