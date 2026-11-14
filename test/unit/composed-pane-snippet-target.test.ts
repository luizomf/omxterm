// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  snippetsWindow,
  cleanupSnippetsWindows,
} from "../fixtures/snippets-window";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

afterEach(cleanupSnippetsWindows);

it.each([
  "ordinary",
  "signal",
  "rendering",
  "close-pane",
  "close-tab",
  "dispose",
] as const)(
  "invalidates captured pane B once on %s without following focused A or replacement C",
  async (ending) => {
    const f = createTabsHarness();
    try {
      await f.tabs.ready;
      f.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
      f.tabs.handleCommand({ action: "split", direction: "right" });
      await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
      const target = f.tabs.captureSnippetTarget()!;
      const unavailable = vi.fn();
      target.onUnavailable(unavailable);
      f.tabs.handleCommand({ action: "prepare-close-pane" });
      f.tabs.handleCommand({ action: "focus-pane", target: "previous" });
      target.deliver("exact B", false);
      expect(f.surfaces[1]!.inject).toHaveBeenCalledExactlyOnceWith("exact B", {
        submit: false,
      });
      expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
      if (ending === "ordinary" || ending === "signal")
        f.adapters[1]!.handlers!.onExit({
          exitCode: 0,
          signal: ending === "ordinary" ? 0 : 9,
        });
      else if (ending === "rendering")
        f.mountedSurfaceOptions[1]!.onFatalError!({ kind: "backend-loss" });
      else if (ending === "close-pane")
        f.tabs.handleCommand({ action: "resolve-close-pane", confirmed: true });
      else if (ending === "close-tab")
        f.tabs.handleCommand({ action: "close" });
      else f.tabs.dispose();
      expect(target.live()).toBe(false);
      expect(unavailable).toHaveBeenCalledOnce();
      target.deliver("never A", true);
      expect(f.surfaces[1]!.inject).toHaveBeenCalledOnce();
      expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
      if (ending !== "close-tab" && ending !== "dispose") {
        f.tabs.handleCommand({ action: "close-session", sessionId: "s2" });
        f.tabs.handleCommand({ action: "split", direction: "right" });
        await vi.waitFor(() => expect(f.surfaces).toHaveLength(3));
        target.deliver("never C", true);
        expect(f.surfaces[2]!.inject).not.toHaveBeenCalled();
      }
      f.tabs.dispose();
      expect(unavailable).toHaveBeenCalledOnce();
    } finally {
      f.tabs.dispose();
    }
  },
);

it("does not deliver accepted Protected Paste or Enter after captured B exits while approval is pending", async () => {
  const f = await snippetsWindow();
  let approve!: (value: boolean) => void;
  f.clipboard.confirmPaste.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        approve = resolve;
      }),
  );
  f.tabCommand({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
  f.toggle();
  await vi.waitFor(() =>
    expect(f.root.querySelector(".snippet-activate")).not.toBeNull(),
  );
  f.root.querySelector<HTMLButtonElement>(".snippet-activate")!.click();
  await vi.waitFor(() =>
    expect(f.clipboard.confirmPaste).toHaveBeenCalledOnce(),
  );
  f.tabCommand({ action: "focus-pane", target: "previous" });
  f.sessionHandlers[1]!.onExit({ exitCode: 0, signal: 0 });
  approve(true);
  await f.surfaces[1]!.inject.mock.results[0]!.value;
  for (const write of f.transportWrites) expect(write).not.toHaveBeenCalled();
  expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
  expect(f.surfaces[1]!.dispose).toHaveBeenCalledOnce();
});
