import type { BrowserWindow } from "electron";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { HOVER_FRAME_HOLD_SOURCE } from "../fixtures/restty-hover-control";
import {
  captureModifiedHoverEvidence,
  HOVER_PHASE_PREFIX,
  type HoverSnapshot,
} from "../fixtures/restty-hover";

// Run the actual renderer expressions/helper/inspector. Only Electron I/O,
// events and frames are controlled; these buffers are not native paint evidence.
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function fixture(
  options: {
    replacement?:
      | "pointer-clear"
      | "pointer-same-count-different-cells"
      | "keyup-replaced-empty";
    captureChange?: "viewport" | "identity" | "clear";
    beforeNoopKeyup?: boolean;
  } = {},
) {
  let snapshot: HoverSnapshot = {
    canvasId: 1,
    geometry: {
      canvas: { x: 0, y: 0, width: 24, height: 24 },
      backing: { width: 24, height: 24 },
      viewport: { width: 24, height: 24 },
      dpr: 1,
      cols: 3,
      rows: 3,
      cellWidth: 8,
      cellHeight: 8,
    },
    draw: {
      revision: 1,
      cells: 0,
      setAt: 1,
      cellRevision: 1,
      cellSetAt: 1,
      drawRevision: 1,
      drawCellRevision: 1,
      drawCells: 0,
      drawAt: 2,
      draws: 1,
    },
    events: [],
    core: { cols: 3, rows: 3, text: "fixture" },
  };
  const replace = (cells: number) => {
    const revision = snapshot.draw.revision + 1;
    snapshot = {
      ...snapshot,
      draw: {
        revision,
        cells,
        setAt: revision,
        cellRevision: revision,
        cellSetAt: revision,
        drawRevision: revision,
        drawCellRevision: revision,
        drawCells: cells,
        drawAt: revision + 1,
        draws: revision,
      },
    };
  };
  class Event {
    readonly type: string;
    readonly modified: boolean;
    constructor(type: string, init: Record<string, unknown> = {}) {
      this.type = type;
      this.modified = Boolean(init["ctrlKey"] || init["metaKey"]);
    }
  }
  const dispatch = (event: Event) => {
    if (event.type === "keyup" && options.beforeNoopKeyup) return true;
    replace(event.type === "keyup" ? 0 : Number(event.modified));
    return true;
  };
  const canvas = {
    getBoundingClientRect: () => snapshot.geometry.canvas,
    __resttyHoverFixture: () => ({ ...snapshot, draw: { ...snapshot.draw } }),
    __localImageFixtureCoreCells: () => snapshot.core,
    dispatchEvent: dispatch,
  };
  const context = {
    document: { querySelectorAll: () => [canvas] },
    PointerEvent: Event,
    KeyboardEvent: Event,
    requestAnimationFrame: (callback: () => void) => callback(),
    window: {
      dispatchEvent: dispatch,
      omxterm: { terminal: { configuration: async () => {} } },
    },
  };
  let captures = 0,
    bitmapReads = 0;
  const records: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    records.push(String(chunk));
    return true;
  });
  const window = {
    isVisible: () => true,
    isMinimized: () => false,
    isFocused: () => false,
    webContents: {
      executeJavaScript: async (source: string) => {
        if (source.includes("new KeyboardEvent") && options.beforeNoopKeyup)
          replace(0);
        const value: unknown = await runInNewContext(source, context);
        // A queued renderer replacement after this task returns, but before
        // main resumes. An atomic returned snapshot must remain the original.
        if (
          source.includes("new PointerEvent") &&
          snapshot.draw.cells === 1 &&
          options.replacement?.startsWith("pointer")
        )
          // Same count denotes a different cell identity, not an equal set.
          replace(
            Number(
              options.replacement === "pointer-same-count-different-cells",
            ),
          );
        if (
          source.includes("new KeyboardEvent") &&
          options.replacement === "keyup-replaced-empty"
        ) {
          // A real empty -> nonempty -> empty transition must invalidate even
          // though the final count matches the keyup's original release.
          replace(1);
          replace(0);
        }
        return value;
      },
      capturePage: async () => {
        captures++;
        if (captures === 2) {
          if (options.captureChange === "viewport")
            snapshot = {
              ...snapshot,
              geometry: {
                ...snapshot.geometry,
                canvas: { ...snapshot.geometry.canvas, width: 32 },
                backing: { width: 32, height: 24 },
                viewport: { width: 32, height: 24 },
                cols: 4,
              },
              core: { ...snapshot.core, cols: 4 },
            };
          if (options.captureChange === "identity")
            snapshot = { ...snapshot, canvasId: 2 };
          if (options.captureChange === "clear") replace(0);
        }
        const { width, height } = snapshot.geometry.viewport;
        const bytes = Buffer.alloc(width * height * 4);
        if (snapshot.draw.cells) bytes[(4 * width + 12) * 4] = 255;
        return {
          getSize: () => ({ width, height }),
          toBitmap: () => {
            bitmapReads++;
            return bytes;
          },
        };
      },
    },
  } as unknown as BrowserWindow;
  return {
    run: () =>
      captureModifiedHoverEvidence({
        window,
        deliverOutput: () => {},
        input: () => "",
        deviceCellSize: [8, 8],
        size: { cols: 3, rows: 3 },
        text: "fixture",
        prefixColumns: 1,
        destinationColumns: 1,
      }),
    counts: () => ({ captures, bitmapReads }),
    records: () =>
      records
        .filter((s) => s.startsWith(HOVER_PHASE_PREFIX))
        .map(
          (s) =>
            JSON.parse(s.slice(HOVER_PHASE_PREFIX.length)) as {
              category: string;
              pixels?: { total: number; missingCells: number };
              stimulus?: { revision: number };
              latest: { draw: { revision: number } };
            },
        ),
  };
}

it("accepts the original pointer and keyup generations without a replacement", async () => {
  const f = fixture();
  await expect(f.run()).resolves.toEqual({
    modifiedHoverChangedPixels: 1,
    releasedHoverChangedPixels: 0,
  });
  expect(f.counts().captures).toBe(3);
});
it("a queued clear before the keyup task cannot stand in for a no-op keyup", async () => {
  const f = fixture({ beforeNoopKeyup: true });
  await expect(f.run()).rejects.toMatchObject({ category: "cue-not-drawn" });
  expect(f.counts().captures).toBe(2);
});
it.each([
  "pointer-clear",
  "pointer-same-count-different-cells",
  "keyup-replaced-empty",
] as const)(
  "rejects %s queued between dispatch return and main resumption",
  async (replacement) => {
    const f = fixture({ replacement });
    await expect(f.run()).rejects.toMatchObject({
      category: "stimulus-invalidated",
    });
    const failed = f.records().at(-1)!;
    expect(failed.category).toBe("stimulus-invalidated");
    expect(failed.stimulus!.revision).toBe(
      replacement === "keyup-replaced-empty" ? 4 : 3,
    );
    expect(failed.latest.draw.revision).toBe(
      failed.stimulus!.revision +
        (replacement === "keyup-replaced-empty" ? 2 : 1),
    );
  },
);
it.each(["viewport", "identity"] as const)(
  "checks changed %s after capture before reading/mapping the bitmap",
  async (captureChange) => {
    const f = fixture({ captureChange });
    await expect(f.run()).rejects.toMatchObject({
      category: "geometry-changed",
    });
    expect(f.counts()).toEqual({ captures: 2, bitmapReads: 1 });
  },
);
it("retains missing-pixel evidence for geometry-stable capture invalidation", async () => {
  const f = fixture({ captureChange: "clear" });
  await expect(f.run()).rejects.toMatchObject({
    category: "stimulus-invalidated",
  });
  expect(f.records().at(-1)).toMatchObject({
    category: "stimulus-invalidated",
    pixels: { total: 0, missingCells: 1 },
  });
  expect(f.counts().captures).toBe(2);
});

function frameFixture() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0,
    revision = 3;
  const window = {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    },
  };
  const canvas = {
    getBoundingClientRect: () => ({ width: 24 }),
    __resttyHoverFixture: () => ({
      canvasId: 1,
      draw: {
        revision,
        cellRevision: revision,
        drawRevision: revision - 1,
        drawCellRevision: revision - 1,
      },
    }),
  };
  interface State {
    active: boolean;
    revision?: number;
    callbackId?: number;
    releasedCallbackId?: number;
    pending: number;
    currentRevision: number;
  }
  const context = {
    window,
    document: { querySelectorAll: () => [canvas] },
    setTimeout,
    __hoverFrame: undefined as unknown as {
      arm: (canvasId: number) => void;
      bind: (revision: number) => State;
      state: () => State;
      release: () => State;
    },
  };
  runInNewContext(HOVER_FRAME_HOLD_SOURCE, context);
  return {
    window,
    hold: context.__hoverFrame,
    invoke: (callbackId: number) => callbacks.get(callbackId)!(1234),
    replace: () => ++revision,
  };
}
it("retains the actual callback through a slow boundary, and explicit cleanup cannot leave expired readiness", async () => {
  vi.useFakeTimers();
  const f = frameFixture(),
    callback = vi.fn();
  f.hold.arm(1);
  const id = f.window.requestAnimationFrame(callback);
  f.invoke(id);
  f.hold.bind(3);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.hold.state()).toMatchObject({
    active: true,
    revision: 3,
    currentRevision: 3,
    callbackId: id,
    pending: 1,
  });
  expect(callback).not.toHaveBeenCalled();
  expect(f.hold.release()).toMatchObject({
    active: false,
    pending: 0,
    releasedCallbackId: id,
  });
  expect(callback).toHaveBeenCalledExactlyOnceWith(1234);
  expect(f.hold.state().callbackId).toBeUndefined();
  expect(() => f.hold.bind(3)).toThrow("not owned");
  f.hold.release();
  expect(callback).toHaveBeenCalledTimes(1);
});
it("a new stimulus requires a new live retained native callback, not a historical hold", () => {
  const f = frameFixture();
  f.hold.arm(1);
  const first = f.window.requestAnimationFrame(() => {});
  f.invoke(first);
  f.hold.bind(3);
  f.hold.release();
  f.replace();
  f.hold.arm(1);
  f.hold.bind(4);
  expect(f.hold.state()).toMatchObject({
    active: true,
    revision: 4,
    currentRevision: 4,
    pending: 0,
  });
  expect(f.hold.state().callbackId).toBeUndefined();
  const second = f.window.requestAnimationFrame(() => {});
  f.invoke(second);
  expect(second).not.toBe(first);
  expect(f.hold.state().callbackId).toBe(second);
  f.hold.release();
});
it("cleanup releases every actual held continuation even when one throws, retaining its error", () => {
  const f = frameFixture(),
    original = new Error("Controlled callback failure"),
    surviving = vi.fn();
  f.hold.arm(1);
  f.invoke(
    f.window.requestAnimationFrame(() => {
      throw original;
    }),
  );
  f.invoke(f.window.requestAnimationFrame(surviving));
  f.hold.bind(3);
  let failure: unknown;
  try {
    f.hold.release();
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ errors: [original] });
  expect(surviving).toHaveBeenCalledExactlyOnceWith(1234);
  expect(f.hold.state()).toMatchObject({ active: false, pending: 0 });
});
