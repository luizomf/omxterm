// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { mountResttyTerminalSurface } from "../fixtures/pending-tab-surface";
import {
  createFakeSurface,
  createTabsHarness,
} from "../fixtures/terminal-tabs-harness";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import type { TerminalSessionAdapter } from "../../src/terminal-surface/terminal-session-adapter";

const realMount = vi.hoisted(() => vi.fn());
vi.mock("../../src/terminal-surface/restty-terminal-surface", () => ({
  mountResttyTerminalSurface: realMount,
}));
const controls = globalThis as typeof globalThis & {
  pendingTabHeld: boolean;
  pendingTabMountedAndFocused: boolean;
  releasePendingTab(): void;
};
afterEach(() => vi.restoreAllMocks());

it("does not admit Paste on B's native start or mount resolution before production publication and focus", async () => {
  const surfaces = [createFakeSurface(), createFakeSurface()];
  const secondFocus = surfaces[1]!.focus;
  let finishMount!: () => void;
  const heldMount = new Promise<void>((resolve) => {
    finishMount = resolve;
  });
  let nativeStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    nativeStarted = resolve;
  });
  let calls = 0;
  realMount.mockImplementation(
    async (
      _container: HTMLElement,
      adapter: TerminalSessionAdapter,
      options: TerminalSurfaceOptions,
    ) => {
      const index = calls++;
      await options.acquireFontInputs!(undefined);
      await adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
      if (index === 1) {
        nativeStarted();
        await heldMount;
      }
      return surfaces[index]!;
    },
  );
  const h = createTabsHarness({
    surfaceOptions: {
      acquireFontInputs: async () => ({ fonts: [], release() {} }),
    },
    tabsOptions: { mount: mountResttyTerminalSurface },
  });
  try {
    await h.tabs.ready;
    expect(controls.pendingTabMountedAndFocused).toBe(false);
    h.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(controls.pendingTabHeld).toBe(true));
    expect(h.adapters[1]!.start).not.toHaveBeenCalled();
    controls.releasePendingTab();
    await started;
    expect(h.adapters[1]!.start).toHaveBeenCalledOnce();
    expect(controls.pendingTabMountedAndFocused).toBe(false);
    expect(h.tabs.captureSnippetTarget()).toBeUndefined();
    // Native start alone is insufficient; production deliberately drops this.
    h.tabs.clipboardAction("paste");
    expect(surfaces[1]!.paste).not.toHaveBeenCalled();
    // Execute the actual native caller's admission-through-send block. Removing
    // its await must send too early and fail, even if the witness still works.
    const main = await readFile("test/fixtures/pending-tab-main.ts", "utf8");
    const begin = main.indexOf(
      '  assert.equal(sessions.length, 2, "Exactly one B PTY");',
    );
    const end = main.indexOf("  await waitFor(\n    () => inputs[1]!", begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    const send = vi.fn((_channel: string, action: "paste") =>
      h.tabs.clipboardAction(action),
    );
    const continuation = runInNewContext(
      // Compile outside jsdom's mixed TextEncoder/Uint8Array realm. Do not
      // depend on optional Node TypeScript support in distribution builds.
      execFileSync(
        process.execPath,
        [
          "-e",
          `process.stdout.write(require("esbuild").transformSync(
            require("node:fs").readFileSync(0, "utf8"),
            { loader: "ts", target: "es2022" },
          ).code)`,
        ],
        {
          input: `(async () => {${main.slice(begin, end)}})()`,
          encoding: "utf8",
          timeout: 10_000,
        },
      ),
      {
        assert,
        sessions: [{}, {}],
        inputs: [[], []],
        terminalIpc,
        trace() {},
        waitFor: async (predicate: () => Promise<boolean>) => {
          expect(await predicate()).toBe(false);
          await barrier;
          expect(await predicate()).toBe(true);
        },
        window: {
          webContents: {
            executeJavaScript: (code: string) =>
              Promise.resolve(
                runInNewContext(code, {
                  pendingTabMountedAndFocused:
                    controls.pendingTabMountedAndFocused,
                }) as boolean,
              ),
            send,
          },
        },
      },
    ) as Promise<void>;
    expect(send).not.toHaveBeenCalled();
    secondFocus.mockImplementation(() => {
      // The real owner has already published the Surface when it calls focus.
      expect(h.tabs.captureSnippetTarget()).toBeDefined();
      expect(controls.pendingTabMountedAndFocused).toBe(false);
    });
    finishMount();
    await vi.waitFor(() =>
      expect(controls.pendingTabMountedAndFocused).toBe(true),
    );
    expect(secondFocus).toHaveBeenCalledOnce();
    expect(surfaces[1]!.paste).not.toHaveBeenCalled(); // no replay
    releaseBarrier();
    await continuation;
    expect(send).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.clipboardAction,
      "paste",
    );
    expect(surfaces[1]!.paste).toHaveBeenCalledOnce();
    expect(surfaces[0]!.paste).not.toHaveBeenCalled();
  } finally {
    finishMount();
    h.tabs.dispose();
  }
});
