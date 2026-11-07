import { randomUUID } from "node:crypto";
import { subscribeWindowOwnerLoss } from "./window-owner-loss";
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
import { isTerminalSessionId } from "../shared/terminal-contract";

type Pending = {
  id: string;
  started(): void;
  finish(available: boolean): void;
  cancel(): void;
};
type Owner = {
  contents: BrowserWindow["webContents"];
  revision?: number;
  selectionListeners: Set<(revision: number) => void>;
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
    ) {
      owner.revision = revision;
      for (const listener of owner.selectionListeners) {
        try {
          listener(revision);
        } catch {
          // A lost child cannot interrupt core selection tracking.
        }
      }
    }
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
    owner.selectionListeners.clear();
    owner.pending?.cancel();
    owner.cleanup();
  };
  return {
    register(window: BrowserWindow) {
      const contents = window.webContents;
      if (owners.has(contents)) return;
      const lost = () => remove(owner);
      let unsubscribeLoss = () => {};
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
        selectionListeners: new Set(),
        cleanup() {
          unsubscribeLoss();
          contents.removeListener("did-start-navigation", navigation);
        },
      };
      owners.set(contents, owner);
      contents.on("did-start-navigation", navigation);
      unsubscribeLoss = subscribeWindowOwnerLoss(window, lost);
    },
    subscribeSelection(
      window: BrowserWindow,
      listener: (revision: number) => void,
    ) {
      const owner = owners.get(window.webContents);
      if (!owner || options.quitting()) return () => {};
      owner.selectionListeners.add(listener);
      if (owner.revision !== undefined) listener(owner.revision);
      return () => owner.selectionListeners.delete(listener);
    },
    confirmSelection(
      window: BrowserWindow,
      sessionId: string,
      source: ExtensionViewRequestContext,
      signal: AbortSignal,
    ): Promise<boolean> {
      const owner = owners.get(window.webContents);
      if (
        !owner ||
        owner.pending ||
        owner.revision === undefined ||
        signal.aborted ||
        options.quitting() ||
        !source.isCurrentVisible() ||
        !isTerminalSessionId(sessionId)
      )
        return Promise.resolve(false);
      const revision = owner.revision;
      const id = randomUUID();
      return new Promise((resolve) => {
        let settled = false;
        const finish = (available: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          if (owner.pending?.id === id) delete owner.pending;
          resolve(
            available &&
              owners.get(owner.contents) === owner &&
              owner.revision === revision &&
              !signal.aborted &&
              !options.quitting() &&
              source.isCurrentVisible(),
          );
        };
        const cancel = () => finish(false);
        const timer = setTimeout(cancel, 5000);
        owner.pending = { id, started() {}, finish, cancel };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          if (owner.contents.isDestroyed()) cancel();
          else
            owner.contents.send(semanticInputIpc.command, {
              kind: "confirm-selection",
              id,
              revision,
              sessionId,
            });
        } catch {
          cancel();
        }
      });
    },
    request(
      window: BrowserWindow,
      input: SemanticInputRequest,
      source: ExtensionViewRequestContext,
      signal: AbortSignal,
      admit: (signal: AbortSignal, commit: () => void) => Promise<void>,
      waitForDelivery: boolean | { dropTicket: string } = false,
    ): Promise<{ ok: boolean; reason?: string }> {
      const owner = owners.get(window.webContents);
      const dropTicket =
        typeof waitForDelivery === "object"
          ? waitForDelivery.dropTicket
          : undefined;
      if (waitForDelivery && owner?.pending)
        return Promise.resolve({ ok: false, reason: "terminal-busy" });
      if (
        !owner ||
        owner.pending ||
        owner.revision === undefined ||
        (waitForDelivery &&
          (!isSelectionRevision(source.actionSelectionRevision) ||
            source.actionSelectionRevision !== owner.revision)) ||
        signal.aborted ||
        options.quitting() ||
        !source.isCurrentVisible() ||
        !isSemanticInputRequest(input) ||
        (waitForDelivery && (input.intent !== "insert" || input.preview))
      )
        return waitForDelivery
          ? Promise.resolve({ ok: false, reason: "terminal-unavailable" })
          : Promise.reject(new Error("Semantic input unavailable"));
      // Paths carry the child preload's action-time observation, not the newer
      // revision that may have reached main first. Snippets retain their existing
      // receipt-time capture. Core independently checks before capturing a Surface.
      const revision = waitForDelivery
        ? source.actionSelectionRevision!
        : owner.revision;
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
          if (waitForDelivery && !sent)
            resolve({ ok: false, reason: "terminal-unavailable" });
          else reject(new Error("Semantic input unavailable"));
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
            resolve(
              waitForDelivery && !available
                ? { ok: false, reason: "terminal-not-completed" }
                : { ok: available },
            );
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
                ...(waitForDelivery ? { waitForDelivery: true } : {}),
                ...(dropTicket ? { dropTicket } : {}),
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
