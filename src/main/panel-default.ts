import { BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import { terminalIpc } from "../shared/terminal-ipc";
import type { ExtensionsRequest, ExtensionsResult } from "../shared/extensions";
import type {
  createExtensionManager,
  ExtensionTarget,
} from "./extension-manager";

export type PendingExtensionOpen = {
  token: string;
  invoke(): Promise<void | ExtensionsResult>;
  cancel?(): void;
};

async function acknowledge(
  pending: Map<BrowserWindow, PendingExtensionOpen>,
  window: BrowserWindow,
  token: string,
  accepted: boolean,
  stopping: boolean,
): Promise<ExtensionsResult> {
  const issued = pending.get(window);
  if (!issued || issued.token !== token)
    return { ok: false, error: "unavailable" };
  pending.delete(window);
  if (!accepted || BrowserWindow.getFocusedWindow() !== window || stopping) {
    issued.cancel?.();
    return { ok: false, error: "unavailable" };
  }
  return (await issued.invoke()) ?? { ok: true };
}

// One application-process owner, shared by its registered windows. Default
// preparation uses the same one-shot acknowledgement as ordinary tool opens.
export function createPanelDefault(options: {
  manager: ReturnType<typeof createExtensionManager> | undefined;
  capture(window: BrowserWindow): ExtensionTarget | undefined;
  pending: Map<BrowserWindow, PendingExtensionOpen>;
  stopping(): boolean;
}) {
  const defaults = new Map<
    BrowserWindow,
    { token: string; abort: AbortController }
  >();
  const windows = new Set<BrowserWindow>();
  // Native child creation can blur core DOM without blurring its window.
  // Also revoke renderer intent when publication is already in transit.
  function onWindowBlur(this: BrowserWindow) {
    if (options.stopping()) return;
    cancel(this);
    if (!this.webContents.isDestroyed())
      this.webContents.send(terminalIpc.tabCommand, {
        action: "cancel-panel-default",
      });
  }
  function unregister(window: BrowserWindow) {
    window.removeListener("blur", onWindowBlur);
    windows.delete(window);
  }
  let noticed = false;
  const unavailable = (): ExtensionsResult => {
    const noticeEmpty = !noticed;
    noticed = true;
    return { ok: false, error: "unavailable", noticeEmpty };
  };
  function cancel(window: BrowserWindow, token?: string) {
    const current = defaults.get(window);
    if (!current || (token && current.token !== token)) return;
    defaults.delete(window);
    if (options.pending.get(window)?.token === current.token)
      options.pending.delete(window);
    current.abort.abort();
  }
  async function prepare(window: BrowserWindow): Promise<ExtensionsResult> {
    if (BrowserWindow.getFocusedWindow() !== window) return { ok: false };
    cancel(window);
    const target = options.capture(window);
    if (!target || target.signal.aborted) return { ok: false };
    const token = randomUUID();
    const abort = new AbortController();
    defaults.set(window, { token, abort });
    const signal = AbortSignal.any([target.signal, abort.signal]);
    const current = () =>
      !options.stopping() &&
      !signal.aborted &&
      BrowserWindow.getFocusedWindow() === window;
    try {
      const entries = await options.manager?.snapshot();
      if (!current()) {
        cancel(window, token);
        return { ok: false };
      }
      const entry = entries?.find((entry) => entry.id === "omxterm.snippets");
      if (
        !entry?.enabled ||
        !entry.digest ||
        entry.manifest?.view?.action !== "omxterm.snippets.open"
      ) {
        cancel(window, token);
        return unavailable();
      }
      const open = options.manager!.action({
        id: entry.id,
        generation: entry.generation,
        digest: entry.digest,
      });
      options.pending.set(window, {
        token,
        cancel: () => cancel(window, token),
        async invoke() {
          try {
            await open({
              ...target,
              presentation: "panel",
              panelDefaultToken: token,
              signal,
            });
            return { ok: true };
          } catch {
            return current() ? unavailable() : { ok: false };
          } finally {
            if (defaults.get(window)?.token === token) defaults.delete(window);
          }
        },
      });
      return { ok: true, openToken: token };
    } catch {
      const result = current() ? unavailable() : { ok: false };
      cancel(window, token);
      return result;
    }
  }
  return {
    request(
      window: BrowserWindow,
      request: ExtensionsRequest,
    ): Promise<ExtensionsResult> | undefined {
      if (request.operation === "panel-default") return prepare(window);
      if (request.operation === "cancel-panel-default") {
        cancel(window, request.token);
        return Promise.resolve({ ok: true });
      }
      if (request.operation === "open")
        return acknowledge(
          options.pending,
          window,
          request.token,
          request.accepted,
          options.stopping(),
        );
      return undefined;
    },
    cancel,
    registerWindow(window: BrowserWindow) {
      if (windows.has(window)) return;
      windows.add(window);
      window.on("blur", onWindowBlur);
      window.once("closed", () => unregister(window));
    },
    dispose() {
      for (const window of windows) unregister(window);
      for (const window of defaults.keys()) cancel(window);
    },
  };
}
