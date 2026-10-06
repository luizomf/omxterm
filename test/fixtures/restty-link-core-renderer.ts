import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import type { createInputHandler, loadResttyWasm } from "restty/internal";
import type { MouseInputEvent } from "electron";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
import {
  instrumentResttyLinkDestination,
  type createLinkDestinationObserver,
} from "./restty-link-readiness-probe";

export interface LinkCoreRendererOptions {
  readonly wasm: Awaited<ReturnType<typeof loadResttyWasm>>;
  readonly delay: number;
  readonly stopAfterHardBreak?: boolean;
  readonly mutation?:
    | "hard-break-missing"
    | "hard-break-stale"
    | "hard-break-invalidation"
    | "hard-break-excess"
    | "hard-break-wrong"
    | "hard-break-geometry"
    | "scrollback-missing"
    | "scrollback-visible-missing"
    | "alternate-stale"
    | "ordinary-missing"
    | "changed-replacement-missing"
    | "clipped-above-missing"
    | "clipped-below-missing"
    | "replay-loss";
}

const source = instrumentResttyLinkDestination(
  readFileSync("node_modules/restty/dist/chunk-c0rcpsc5.js", "utf8"),
);
const slice = (start: string, end: string) =>
  source.slice(
    source.indexOf(start),
    source.indexOf(end, source.indexOf(start)),
  );

function runtimeLookup(
  wasm: LinkCoreRendererOptions["wasm"],
  handle: number,
  submitted: () => ReturnType<typeof wasm.getRenderState>,
) {
  return runInNewContext(
    [
      slice("function clamp2(", "// src/fonts/manager/entries.ts"),
      slice("function normalizeSelectionCell2(", "function positionToCell2("),
      slice("function readClusterText(", "function classifyCluster("),
      slice(
        "  const normalizeSelectionCell = (cell) =>",
        "  const getCurrentRenderState = () =>",
      ),
      slice(
        "  const getVisibleLinkAtClientPoint =",
        "  const clearSelection =",
      ),
      "getVisibleLinkAtClientPoint",
    ].join("\n"),
    {
      getCurrentRenderState: submitted,
      getLastRenderState: submitted,
      getGridState: () => ({ cols: 80, rows: 20 }),
      getWasm: () => wasm,
      getWasmHandle: () => handle,
      getWasmExports: () => wasm.exports,
      positionToCell: ({
        clientX,
        clientY,
      }: {
        clientX: number;
        clientY: number;
      }) => ({ col: Math.floor(clientX), row: Math.floor(clientY) }),
      resolveVisibleLink: ({
        text,
        offset,
        clippedStart,
        clippedEnd,
      }: {
        text: string;
        offset: number;
        clippedStart: boolean;
        clippedEnd: boolean;
      }) => visibleLinkAtOffset(text, offset, clippedStart, clippedEnd),
    },
  ) as (
    col: number,
    row: number,
  ) => { id: string; url: string; cells: number[] } | null;
}

function missingFrame(
  data: string,
  mutation: LinkCoreRendererOptions["mutation"],
) {
  return (
    (data.includes("https://one.test/a,") &&
      mutation === "hard-break-missing") ||
    (data.includes("https://scroll.test") &&
      mutation === "scrollback-missing") ||
    (data.includes("https://clipped.test") &&
      mutation === "clipped-above-missing") ||
    (data.includes("https://one.test/a\r\n") &&
      mutation === "ordinary-missing") ||
    (data.includes("https://new.test/b") &&
      mutation === "changed-replacement-missing")
  );
}

// Optional real-core drawing/viewport adapter for cancellingPreviewRenderer.
// It exercises the same caller/controller/routing, not a second link simulator.
// Producer timing and the listed input/output faults are controlled; parsing,
// selection-based lookup and the pinned scroll owner are real.
export function createLinkCoreRenderer(
  options: LinkCoreRendererOptions,
  canvas: HTMLCanvasElement,
  transport: { readonly inputs: string[]; readonly events: MouseInputEvent[] },
  handler: ReturnType<typeof createInputHandler>,
  observer: ReturnType<typeof createLinkDestinationObserver>,
  replaceCanvas: () => void,
) {
  const { wasm, mutation } = options;
  const { inputs, events } = transport;
  const handle = wasm.create(80, 20, 10_000_000);
  let submitted: ReturnType<typeof wasm.getRenderState>;
  const lookup = runtimeLookup(wasm, handle, () => submitted);
  let hardBreakDelivered = false;
  let originalPressInputStart = 0;
  let consumedOriginal = false;
  let clippedBelowDelivered = false;
  let suppressFrame = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const produce = () => {
    wasm.renderUpdate(handle);
    const frame = wasm.getRenderState(handle)!;
    observer.present(observer.capture(frame));
    // The controlled drawing port retains owned submitted cells, never borrowed
    // WASM views; core updates without submission cannot advance this frame.
    submitted = structuredClone(frame);
  };
  const schedule = () => {
    if (pending) clearTimeout(pending);
    if (!suppressFrame)
      pending = setTimeout(produce, hardBreakDelivered ? options.delay : 0);
  };
  const scroll = runInNewContext(
    slice(
      "function createScrollbarRuntime(",
      "// src/runtime/create-runtime/interaction-runtime/index.ts",
    ) + "\ncreateScrollbarRuntime(options)",
    {
      performance,
      clamp2: (n: number, min: number, max: number) =>
        Math.min(max, Math.max(min, n)),
      options: {
        scrollbarState: {},
        selectionState: {},
        linkState: {},
        getCanvas: () => canvas,
        getGridState: () => ({ cellH: 20, rows: 20 }),
        getWasmReady: () => true,
        getWasm: () => wasm,
        getWasmHandle: () => handle,
        getWasmExports: () => wasm.exports,
        updateLinkHover() {},
        markNeedsRender: schedule,
      },
    },
  ) as { scrollViewportByWheel(event: WheelEvent): void };
  return {
    viewport: () => ({
      offset: wasm.exports.restty_scrollbar_offset!(handle),
      total: wasm.exports.restty_scrollbar_total!(handle),
      length: wasm.exports.restty_scrollbar_len!(handle),
      alternate: handler.isAltScreen(),
      mouseActive: handler.isMouseActive(),
    }),
    lookup: (x: number, y: number) => lookup(x / 10, y / 20),
    nativeDown() {
      originalPressInputStart = inputs.join("").length;
    },
    consumedOriginal: () => consumedOriginal,
    loseReplay: (event: PointerEvent) =>
      mutation === "replay-loss" &&
      hardBreakDelivered &&
      event.ctrlKey &&
      events.at(-1)?.type !== "mouseDown",
    activations(link: string) {
      if (!hardBreakDelivered) return [link];
      if (mutation === "hard-break-excess") return [link, link];
      return [mutation === "hard-break-wrong" ? "https://wrong.test/" : link];
    },
    scroll(event: WheelEvent) {
      if (
        mutation === "scrollback-visible-missing" ||
        (clippedBelowDelivered && mutation === "clipped-below-missing")
      )
        suppressFrame = true;
      scroll.scrollViewportByWheel(event);
    },
    deliver(data: string) {
      if (data.includes("https://one.test")) {
        if (hardBreakDelivered && options.stopAfterHardBreak) return false;
        hardBreakDelivered = true;
      }
      handler.filterOutput(data);
      observer.invalidate();
      if (data.includes("https://new.test/b"))
        consumedOriginal = inputs.join("").length === originalPressInputStart;
      if (data.includes("https://clipped-end.test"))
        clippedBelowDelivered = true;
      suppressFrame = missingFrame(data, mutation);
      const hardBreak = data.includes("https://one.test/a,");
      if (hardBreak && mutation === "hard-break-geometry") replaceCanvas();
      if (hardBreak && mutation === "hard-break-stale")
        wasm.write(
          handle,
          "\u001b[2J\u001b[Hhttps://old.test/a\r\nhttps://two.test/b",
        );
      else if (
        data.includes("alternate-mouse") &&
        mutation === "alternate-stale"
      )
        wasm.write(handle, "");
      else wasm.write(handle, data);
      schedule();
      return true;
    },
    dispose() {
      if (pending) clearTimeout(pending);
      wasm.destroy(handle);
    },
  };
}
