// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each(["signal", "rendering", "close", "dispose"] as const)(
  "invalidates a captured target on %s and notifies its subscriber once",
  async (kind) => {
    const f = createTabsHarness();
    cleanups.push(f.tabs.dispose);
    await f.tabs.ready;
    const target = f.tabs.captureSnippetTarget()!;
    const unavailable = vi.fn();
    const unsubscribed = vi.fn();
    const unsubscribe = target.onUnavailable(unsubscribed);
    unsubscribe();
    const stop = target.onUnavailable(unavailable);
    expect(target.live()).toBe(true);
    expect(unavailable).not.toHaveBeenCalled();

    if (kind === "signal")
      f.adapters[0]!.handlers!.onExit({ exitCode: 0, signal: 9 });
    else if (kind === "rendering")
      f.mountedSurfaceOptions[0]!.onFatalError!({ kind: "backend-loss" });
    else if (kind === "close") f.tabs.handleCommand({ action: "close" });
    else f.tabs.dispose();

    expect(target.live()).toBe(false);
    expect(f.tabs.captureSnippetTarget()).toBeUndefined();
    expect(unavailable).toHaveBeenCalledOnce();
    expect(unsubscribed).not.toHaveBeenCalled();
    target.deliver("must not be delivered", true);
    expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
    // Retained failure ownership can end later without a second notification.
    f.adapters[0]!.handlers!.onExit({ exitCode: 1, signal: 9 });
    f.tabs.handleCommand({ action: "close-session", sessionId: "s1" });
    f.tabs.dispose();
    expect(unavailable).toHaveBeenCalledOnce();
    stop();
    const late = vi.fn();
    target.onUnavailable(late)();
    expect(late).toHaveBeenCalledOnce();
  },
);

it("keeps a live captured target when selection changes and never follows a replacement", async () => {
  const f = createTabsHarness();
  cleanups.push(f.tabs.dispose);
  await f.tabs.ready;
  const original = f.tabs.captureSnippetTarget()!;
  f.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(f.surfaces[1]?.focus).toHaveBeenCalled());
  original.deliver("  literal $VALUE\n", false);
  expect(f.surfaces[0]!.inject).toHaveBeenCalledExactlyOnceWith(
    "  literal $VALUE\n",
    { submit: false },
  );
  expect(f.surfaces[1]!.inject).not.toHaveBeenCalled();
  f.tabs.handleCommand({ action: "close-session", sessionId: "s1" });
  original.deliver("no retarget", true);
  expect(f.surfaces[0]!.inject).toHaveBeenCalledOnce();
  expect(f.surfaces[1]!.inject).not.toHaveBeenCalled();
});
