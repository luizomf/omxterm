import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
import { buildFixture as buildCancellation } from "../fixtures/initialization-cancellation-build";
import { buildFixture as buildPendingTab } from "../fixtures/pending-tab-ownership-build";
import { buildFixture as buildFontOwnership } from "../fixtures/surface-font-ownership-build";
import { buildFixture as buildTabRemoval } from "../fixtures/tab-removal-build";

// Exercise the same complete file-only recipes used by runNativeFixture.
// Stop at the external configuration request: no Surface, GPU, Electron or PTY
// is started. The emitted module initializers still install their real controls.
async function renderer(build: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-consumer-build-"));
  try {
    await build(root);
    const code = await readFile(path.join(root, "renderer/index.js"), "utf8");
    const log = vi.fn();
    const configuration = vi.fn(() => new Promise<never>(() => {}));
    const remove = vi.fn();
    const onTabCommand = vi.fn(
      (_listener: (command: { action: string }) => void) => remove,
    );
    const addEventListener = vi.fn();
    const globals: Record<string, unknown> = {
      console: { log },
      document: { querySelector: () => ({}) },
      location: { search: "?boundary=fonts&tabRemovalControl=held-renderer" },
      omxterm: { terminal: { configuration, onTabCommand } },
      addEventListener,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      atob,
      // Chromium's byte decoder is not available in every supported Node VM.
      Uint8Array: class extends Uint8Array {
        static fromBase64(value: string) {
          return new Uint8Array(Buffer.from(value, "base64"));
        }
      },
    };
    globals.window = globals;
    runInNewContext(code, globals);
    expect(configuration).toHaveBeenCalledOnce();
    return { code, globals, log, onTabCommand, remove, addEventListener };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
type Renderer = Awaited<ReturnType<typeof renderer>>;

function cancellationControls(result: Renderer) {
  // The runtime wrapper alone exposes evidence, even with the stale importer.
  // Require the actual emitted Surface lease/finally hooks as well.
  expect(
    result.code.includes("cancellationEvidence.leases += 1"),
    "missing Surface font-lease hook",
  ).toBe(true);
  expect(
    result.code.includes("cancellationEvidence.settled = true"),
    "missing Surface settlement hook",
  ).toBe(true);
  expect(result.globals.cancellationEvidence).toEqual({
    held: false,
    settled: false,
    destroyed: 0,
    subscriptions: 0,
    leases: 0,
    fatals: 0,
  });
  expect(result.globals.releaseCancelledInitialization).toBeTypeOf("function");
}
function pendingControls(result: Renderer) {
  expect(result.globals.pendingTabHeld).toBe(false);
  expect(result.globals.releasePendingTab).toBeTypeOf("function");
  expect(
    result.code.includes("pendingTabHeld: true"),
    "missing B font-acquisition hold",
  ).toBe(true);
}
function fontControls(result: Renderer) {
  expect(result.globals.fontOwnershipCells).toEqual([]);
  expect(result.globals.queryFontCell).toBeTypeOf("function");
  expect(result.globals.fontOwnershipRuntime).toEqual({
    held: false,
    lineHeights: [],
  });
  expect(result.globals.releaseFontInitialization).toBeTypeOf("function");
  expect(
    result.code.includes("cells[index] = { height:"),
    "missing geometry reply interception",
  ).toBe(true);
}
function tabControls(result: Renderer) {
  const control = result.globals.__omxtermTabRemovalControl as {
    state(): { heldSurface: boolean; newCommands: number };
    release(): void;
    holdRendererBoundary(): Promise<never>;
  };
  expect(control).toBeDefined();
  expect(control.state()).toEqual({ heldSurface: false, newCommands: 0 });
  expect(control.release).toBeTypeOf("function");
  expect(result.onTabCommand).toHaveBeenCalledOnce();
  result.onTabCommand.mock.calls[0]![0]({ action: "new" });
  expect(control.state().newCommands).toBe(1);
  void control.holdRendererBoundary();
  expect(result.log).toHaveBeenCalledExactlyOnceWith(
    "__OMXTERM_TAB_REMOVAL_CONTROL__held-renderer-boundary",
  );
  expect(result.addEventListener).toHaveBeenCalledExactlyOnceWith(
    "pagehide",
    result.remove,
    { once: true },
  );
}

it("bundles the real cancellation Surface lease and settlement hooks", async () => {
  cancellationControls(await renderer(buildCancellation));
}, 30_000);
it("installs the pending-tab font hold and release control in the built renderer", async () => {
  pendingControls(await renderer(buildPendingTab));
}, 30_000);
it("installs the font geometry query and preserves the runtime-readiness hold", async () => {
  fontControls(await renderer(buildFontOwnership));
}, 30_000);
it("executes the tab-removal control setup, command observer and held-renderer marker", async () => {
  tabControls(await renderer(buildTabRemoval));
}, 30_000);

it("rejects all four actual bundles when their importer comparison is deliberately stale", async () => {
  const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
  const join = path.join;
  let staleComparisons = 0;
  // Negative control only: restore exactly the old comparison value at the
  // filesystem path seam. The real esbuild recipes/plugins/output run unchanged;
  // no source files, module resolution results or control exports are fabricated.
  const stale = vi.spyOn(path, "join").mockImplementation((...parts) => {
    if (
      parts.length === 2 &&
      parts[0] === projectRoot &&
      parts[1] === "src/renderer/start-terminal-window.ts"
    ) {
      staleComparisons += 1;
      return join(projectRoot, "src/renderer/index.ts");
    }
    return join(...parts);
  });
  try {
    const cases = [
      [buildCancellation, cancellationControls],
      [buildPendingTab, pendingControls],
      [buildFontOwnership, fontControls],
      [buildTabRemoval, tabControls],
    ] as const;
    for (const [build, controls] of cases) {
      const before = staleComparisons;
      const result = await renderer(build);
      expect(staleComparisons).toBeGreaterThan(before);
      expect(() => controls(result)).toThrow();
    }
  } finally {
    stale.mockRestore();
  }
}, 30_000);
