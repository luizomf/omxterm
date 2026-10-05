// @vitest-environment jsdom
import type { BrowserWindow } from "electron";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { installResttyVisibleLinks } from "../../src/terminal-surface/restty-visible-links";
import {
  captureModifiedHoverEvidence,
  type HoverSnapshot,
} from "../fixtures/restty-hover";
import { instrumentResttyHover } from "../fixtures/restty-hover-observer";
import { requireHoverDraw } from "../fixtures/restty-hover-evidence";

// Execute the checksum-prepared setter and fixture observer, not a replacement
// that redraws on every request. DOM events use the production controller.
// Frame delivery and Electron bitmap I/O are controlled, NOT native paint proof.
const instrumented = instrumentResttyHover(
  readFileSync("node_modules/restty/dist/chunk-c0rcpsc5.js", "utf8"),
);
const setterStart = instrumented.indexOf("  const hoverCanvasId =");
const setterEnd = instrumented.indexOf(
  "  function updateLinkHover(cell) {",
  setterStart,
);
const drawHook = instrumented.match(
  /  deps\.canvas\.__resttyHoverFixture\?\.didDraw\([^\n]+\);/,
)![0];

afterEach(() => vi.restoreAllMocks());
function fixture(
  options: { clearBeforeKeyup?: boolean; noLink?: boolean } = {},
) {
  const root = document.createElement("main");
  root.className = "restty-terminal-surface";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24;
  root.append(canvas);
  document.body.append(root);
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 24,
    height: 24,
  } as DOMRect);
  const cleanupFns: (() => void)[] = [];
  const runtime = runInNewContext(
    `
    let needsRender = true;
    const linkState = { visibleHoverCells: new Set() };
    ${instrumented.slice(setterStart, setterEnd)}
    ({ setVisibleLinkHover, frame() {
      if (!needsRender) return false;
      needsRender = false;
      const deps = { canvas, linkState };
      ${drawHook}
      return true;
    } });`,
    {
      canvas,
      window,
      cleanupFns,
      performance,
      innerWidth: 24,
      innerHeight: 24,
      devicePixelRatio: 1,
      gridState: { cols: 3, rows: 3, cellW: 8, cellH: 8 },
    },
  ) as {
    setVisibleLinkHover: (cells: readonly number[] | null) => void;
    frame: () => boolean;
  };
  let cells = options.noLink ? [] : [1];
  const controller = installResttyVisibleLinks(
    canvas,
    {
      getVisibleLinkAtClientPoint: () => ({
        id: "fixture",
        url: "https://example.test",
        cells,
      }),
      setVisibleLinkHover: runtime.setVisibleLinkHover,
    },
    () => {},
    process.platform === "darwin" ? "MacIntel" : "Windows",
  );
  const observed = canvas as HTMLCanvasElement & {
    __resttyHoverFixture: () => Omit<HoverSnapshot, "core">;
    __localImageFixtureCoreCells: () => HoverSnapshot["core"];
  };
  observed.__localImageFixtureCoreCells = () => ({
    cols: 3,
    rows: 3,
    text: "fixture",
  });
  const snapshot = () => observed.__resttyHoverFixture();
  const move = (modified: boolean) =>
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: 12,
        clientY: 4,
        metaKey: modified && process.platform === "darwin",
        ctrlKey: modified && process.platform !== "darwin",
      }),
    );
  const release = () =>
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control" }));
  // Start with a cue so baseline preparation clears a real nonempty set.
  move(true);
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  const context = {
    document,
    PointerEvent,
    KeyboardEvent,
    window: {
      dispatchEvent: window.dispatchEvent.bind(window),
      omxterm: { terminal: { configuration: async () => {} } },
    },
    requestAnimationFrame: (callback: () => void) => {
      runtime.frame();
      callback();
    },
  };
  let captures = 0;
  let boundary:
    | {
        before: ReturnType<typeof snapshot>;
        after: ReturnType<typeof snapshot>;
        redrawn: boolean;
      }
    | undefined;
  const browser = {
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => false,
    webContents: {
      executeJavaScript: async (source: string) => {
        if (source.includes("new KeyboardEvent") && options.clearBeforeKeyup) {
          move(false);
          runtime.frame();
        }
        const result: unknown = await runInNewContext(source, context);
        runtime.frame();
        return result;
      },
      capturePage: async () => {
        captures++;
        if (captures === 3) {
          const before = snapshot();
          move(false);
          const redrawn = runtime.frame();
          boundary = { before, after: snapshot(), redrawn };
        }
        const bytes = Buffer.alloc(24 * 24 * 4);
        if (snapshot().draw.drawCells) bytes[(4 * 24 + 12) * 4] = 255;
        return {
          getSize: () => ({ width: 24, height: 24 }),
          toBitmap: () => bytes,
        };
      },
    },
  } as unknown as BrowserWindow;
  return {
    snapshot,
    move,
    release,
    frame: runtime.frame,
    setCells: (value: number[]) => {
      cells = value;
    },
    boundary: () => boundary!,
    run: () =>
      captureModifiedHoverEvidence({
        window: browser,
        deliverOutput: () => {},
        input: () => "",
        deviceCellSize: [8, 8],
        size: { cols: 3, rows: 3 },
        text: "fixture",
        prefixColumns: 1,
        destinationColumns: options.noLink ? 0 : 1,
      }),
    dispose: () => {
      controller.dispose();
      for (const cleanup of cleanupFns) cleanup();
      root.remove();
    },
  };
}

it("accepts the completed release across an unmodified pointermove without redrawing unchanged empty cells", async () => {
  const f = fixture();
  try {
    await expect(f.run()).resolves.toEqual({
      modifiedHoverChangedPixels: 1,
      releasedHoverChangedPixels: 0,
    });
    const { before, after, redrawn } = f.boundary();
    expect(before.draw).toMatchObject({ cells: 0, drawCells: 0 });
    expect(before.draw.drawCellRevision).toBe(before.draw.cellRevision);
    expect(before.draw.drawAt).toBeGreaterThanOrEqual(before.draw.cellSetAt);
    expect(after.draw.setAt).toBeGreaterThanOrEqual(before.draw.drawAt);
    expect(after.draw.revision).toBe(before.draw.revision + 1);
    expect(after.events.at(-1)).toMatchObject({
      type: "pointermove",
      modified: false,
      trusted: false,
    });
    expect(redrawn).toBe(false);
    expect(after.draw.draws).toBe(before.draw.draws);
    expect(after.draw.drawRevision).toBe(before.draw.drawRevision);
    expect(after.draw.cellRevision).toBe(before.draw.cellRevision);
    expect(after.draw.drawCellRevision).toBe(before.draw.cellRevision);
    expect(after.draw.cellSetAt).toBe(before.draw.cellSetAt);
  } finally {
    f.dispose();
  }
});

it.each([{ cells: [] }, { cells: [2] }])(
  "rejects replacement cells $cells even after they draw",
  ({ cells: replacement }) => {
    const f = fixture();
    try {
      f.frame();
      const intended = f.snapshot().draw; // [1]: [2] has equal count, NOT identity.
      f.setCells(replacement);
      f.move(true);
      const changed = f.snapshot().draw;
      expect(changed.cellRevision).toBeGreaterThan(intended.cellRevision);
      expect(() => requireHoverDraw(changed, intended.cellRevision, 1)).toThrow(
        "stimulus-invalidated",
      );
      expect(f.frame()).toBe(true);
      expect(() =>
        requireHoverDraw(f.snapshot().draw, intended.cellRevision, 1),
      ).toThrow("stimulus-invalidated");
    } finally {
      f.dispose();
    }
  },
);

it("rejects a clear and restoration of the same cells before the intended draw", () => {
  const f = fixture();
  try {
    const intended = f.snapshot().draw;
    f.move(false);
    f.move(true);
    expect(f.snapshot().draw.cells).toBe(intended.cells);
    expect(() =>
      requireHoverDraw(f.snapshot().draw, intended.cellRevision, 1),
    ).toThrow("stimulus-invalidated");
    f.frame();
    expect(() =>
      requireHoverDraw(f.snapshot().draw, intended.cellRevision, 1),
    ).toThrow("stimulus-invalidated");
  } finally {
    f.dispose();
  }
});

it("a redundant request cannot stand in for the pending cue or release draw", () => {
  const f = fixture();
  try {
    const cue = f.snapshot().draw;
    f.move(true);
    expect(() =>
      requireHoverDraw(f.snapshot().draw, cue.cellRevision, 1),
    ).toThrow("cue-not-drawn");
    f.frame();
    requireHoverDraw(f.snapshot().draw, cue.cellRevision, 1);
    f.release();
    const released = f.snapshot().draw;
    f.move(false);
    expect(f.snapshot().draw.cellRevision).toBe(released.cellRevision);
    expect(() =>
      requireHoverDraw(f.snapshot().draw, released.cellRevision, 0),
    ).toThrow("cue-not-drawn");
    f.frame();
    requireHoverDraw(f.snapshot().draw, released.cellRevision, 0);
  } finally {
    f.dispose();
  }
});

it("retains cell identity across reordered equivalent nonempty requests without redrawing", () => {
  const f = fixture();
  try {
    f.setCells([1, 2]);
    f.move(true);
    f.frame();
    const intended = f.snapshot().draw;
    f.setCells([2, 1]);
    f.move(true);
    expect(f.snapshot().draw.revision).toBe(intended.revision + 1);
    expect(f.snapshot().draw.cellRevision).toBe(intended.cellRevision);
    expect(f.frame()).toBe(false);
    requireHoverDraw(f.snapshot().draw, intended.cellRevision, 2);
  } finally {
    f.dispose();
  }
});

it("an actual no-op keyup cannot claim a queued clear made before its dispatch", async () => {
  const f = fixture({ clearBeforeKeyup: true });
  try {
    await expect(f.run()).rejects.toMatchObject({ category: "cue-not-drawn" });
  } finally {
    f.dispose();
  }
});

it("accepts no-link dispatch ownership and an initially drawn empty set without a fabricated redraw", async () => {
  const f = fixture({ noLink: true });
  try {
    await expect(f.run()).resolves.toEqual({
      modifiedHoverChangedPixels: 0,
      releasedHoverChangedPixels: 0,
    });
    expect(f.snapshot().draw.cellRevision).toBe(0);
    expect(f.boundary().redrawn).toBe(false);
    expect(f.boundary().after.draw.revision).toBe(
      f.boundary().before.draw.revision + 1,
    );
  } finally {
    f.dispose();
  }
});
