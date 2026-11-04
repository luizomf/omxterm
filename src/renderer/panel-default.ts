import type { ExtensionsBridge } from "../shared/extensions";

export function createPanelDefaultIntent() {
  let pending: { abort: AbortController; token?: string } | undefined;
  return {
    start(open: (signal: AbortSignal) => void) {
      if (pending) return;
      pending = { abort: new AbortController() };
      open(pending.abort.signal);
    },
    cancel() {
      pending?.abort.abort();
      pending = undefined;
    },
    expect(signal: AbortSignal, token: string) {
      if (pending?.abort.signal === signal) pending.token = token;
    },
    claim(token: string) {
      if (!pending || pending.abort.signal.aborted || pending.token !== token)
        return false;
      pending = undefined; // Publication won: showing this view must not cancel it.
      return true;
    },
  };
}

// Empty-panel intent is revoked by the panel/application owner. Preparation is
// inert; only the acknowledged token may activate code, with normal admission.
export async function openPanelDefault(
  bridge: ExtensionsBridge,
  signal: AbortSignal,
  notice: () => void,
  expectOpen: (token: string) => void,
): Promise<boolean> {
  let token: string | undefined;
  const cancel = () => {
    if (token)
      void bridge
        .request({ operation: "cancel-panel-default", token })
        .catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const prepared = await bridge.request({ operation: "panel-default" });
    token = prepared.openToken;
    if (signal.aborted) {
      cancel();
      return false;
    }
    if (token) expectOpen(token);
    const result = token
      ? await bridge.request({ operation: "open", token, accepted: true })
      : prepared;
    if (!signal.aborted && result.noticeEmpty) notice();
    return !signal.aborted && !!token && result.ok;
  } catch {
    // Lost transport is unknown, not permission to retry or open another tool.
    cancel();
    return false;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
