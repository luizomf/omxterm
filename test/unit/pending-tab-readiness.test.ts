// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  createFakeSurface,
  createTabsHarness,
} from "../fixtures/terminal-tabs-harness";
import type { TerminalSessionAdapter } from "../../src/terminal-surface/terminal-session-adapter";

afterEach(() => vi.restoreAllMocks());

it("drops Paste for a started tab until its Surface is published, without replaying it", async () => {
  const surfaces = [createFakeSurface(), createFakeSurface()];
  let finishMount!: () => void;
  const heldMount = new Promise<void>((resolve) => {
    finishMount = resolve;
  });
  let nativeStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    nativeStarted = resolve;
  });
  let calls = 0;
  const h = createTabsHarness({
    tabsOptions: {
      mount: async (
        _container: HTMLElement,
        adapter: TerminalSessionAdapter,
      ) => {
        const index = calls++;
        await adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
        if (index === 1) {
          nativeStarted();
          await heldMount;
        }
        return surfaces[index]!;
      },
    },
  });
  try {
    await h.tabs.ready;
    h.tabs.handleCommand({ action: "new" });
    await started;
    expect(h.tabs.captureSnippetTarget()).toBeUndefined();
    h.tabs.clipboardAction("paste");
    finishMount();
    await vi.waitFor(() => expect(surfaces[1]!.focus).toHaveBeenCalledOnce());
    expect(surfaces[1]!.paste).not.toHaveBeenCalled();

    h.tabs.clipboardAction("paste");
    expect(surfaces[1]!.paste).toHaveBeenCalledOnce();
    expect(surfaces[0]!.paste).not.toHaveBeenCalled();
  } finally {
    finishMount();
    h.tabs.dispose();
  }
});
