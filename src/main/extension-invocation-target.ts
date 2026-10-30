import type { BrowserWindow } from "electron";
import { subscribeWindowOwnerLoss } from "./window-owner-loss";
import type { ExtensionTarget } from "./extension-manager";

/** Capture main-observed OSC7 provenance and native lifetime before async work.
 * Selection changes do not retarget existing invocations. Session death revokes
 * them; no renderer-supplied path or later selected pane is consulted. */
export function extensionInvocationTarget(window: BrowserWindow) {
  const lifetime = new AbortController();
  const sessions = new Map<string, AbortController>();
  let selected: string | null = null;
  const contents = window.webContents;
  let unsubscribeLoss = () => {};
  const lost = () => {
    unsubscribeLoss();
    contents.removeListener("did-finish-load", loaded);
    contents.removeListener("did-start-navigation", navigation);
    lifetime.abort();
  };
  const navigation = (
    _event: unknown,
    _url: unknown,
    inPlace: unknown,
    mainFrame: unknown,
  ) => {
    if (mainFrame && !inPlace) lost();
  };
  const loaded = () => contents.on("did-start-navigation", navigation);
  contents.once("did-finish-load", loaded);
  unsubscribeLoss = subscribeWindowOwnerLoss(window, lost);
  return {
    started(id: string) {
      sessions.set(id, new AbortController());
    },
    ended(id: string) {
      sessions.get(id)?.abort();
      sessions.delete(id);
    },
    selected(id: string | null) {
      selected = id;
    },
    capture(
      directory: (id: string) => string | undefined,
      source = selected ?? undefined,
      context?: "window",
    ): ExtensionTarget {
      if (context === "window")
        return {
          owner: window,
          signal: lifetime.signal,
          terminalDirectory: null,
          ...(source ? { sourceSessionId: source } : {}),
        };
      const session = source ? sessions.get(source) : undefined;
      return {
        owner: window,
        signal: source
          ? session
            ? AbortSignal.any([lifetime.signal, session.signal])
            : AbortSignal.abort()
          : lifetime.signal,
        terminalDirectory:
          source && session ? (directory(source) ?? null) : null,
        ...(source ? { sourceSessionId: source } : {}),
      };
    },
  };
}
