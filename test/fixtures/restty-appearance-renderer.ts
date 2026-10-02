import configuredFontBytes from "../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf";
import { verifyInBandResize } from "./restty-resize-regression";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";
import {
  DEFAULT_TERMINAL_THEME,
  type TerminalTheme,
} from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";
import {
  beginSelectionFrameGate,
  nativeFrame,
  releaseSelectionFrames,
  selectionFrame,
  selectionFrameDiagnostics,
  waitForLayout,
} from "./restty-appearance-frames";

export interface Measurement {
  readonly size: number;
  readonly lineHeight: number;
  readonly padding: number;
  readonly nativeTitleInset: number;
  readonly containerPaddingTop: string;
  readonly cols: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly canvasCssWidth: number;
  readonly canvasCssHeight: number;
  readonly canvasBackingWidth: number;
  readonly canvasBackingHeight: number;
  readonly liveCellWidth: number;
  readonly liveCellHeight: number;
  readonly liveCols: number;
  readonly liveRows: number;
  readonly imeFontSize: string;
  readonly starts: number;
  readonly closes: number;
}

interface AppearanceResult {
  readonly deferredOutputFrame: boolean;
  readonly measurements: readonly Measurement[];
  readonly live: {
    readonly sameCanvas: boolean;
    readonly starts: number;
    readonly closesBeforeDispose: number;
    readonly resizeCount: number;
    readonly cols: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly imeFontSize: string;
    readonly containerPadding: readonly string[];
    readonly canvasCssWidth: number;
    readonly canvasCssHeight: number;
    readonly canvasBackingWidth: number;
    readonly canvasBackingHeight: number;
    readonly externalLinks: number;
  };
  readonly devicePixelRatio: number;
}

export interface SelectionObservation {
  readonly beforeFrame: boolean;
  readonly afterFrame: boolean;
  readonly deferredFrame: boolean;
  readonly lateFrameArrivalMs: number;
  readonly visibilityState: DocumentVisibilityState;
  readonly focused: boolean;
}

declare global {
  var __omxtermResttyAppearanceResult: AppearanceResult | undefined;
  var __omxtermRenderConfiguredFont: (reference: boolean) => Promise<void>;
  var __omxtermBeginSelection: () => void;
  var __omxtermSelectionAfterFrames: () => Promise<SelectionObservation>;
  var __omxtermHasNoSelection: () => Promise<boolean>;
  var __omxtermSelectionState: () => Promise<{
    readonly exactCopy: boolean;
    readonly focused: boolean;
    readonly visibilityState: DocumentVisibilityState;
    readonly devicePixelRatio: number;
    readonly deferredFrame: boolean;
    readonly gateHeld: boolean;
    readonly heldCallbacks: readonly number[];
    readonly queuedCallbacks: readonly number[];
    readonly releasedCallbacks: number;
    readonly releasedFrameTimes: readonly number[];
    readonly frameCount: number;
    readonly frameTimes: readonly number[];
    readonly lastFrameAt: number | null;
    readonly observedAt: number;
  }>;
  var __omxtermSelectionFrame: () => Promise<void>;
  var __omxtermReleaseSelectionFrames: () => void;
}

globalThis.__omxtermReleaseSelectionFrames = releaseSelectionFrames;
globalThis.__omxtermSelectionFrame = selectionFrame;

const deferFrames =
  new URLSearchParams(location.search).get("deferFrames") === "true";
const lateFrameArrival =
  new URLSearchParams(location.search).get("lateFrameArrival") === "true";
let deferUntil = 0;
let deferSelectionFrame = false;
let deferredFrame = false;
let selectionArmedAt: number | null = null;
let lateFrameArrivalMs = 0;
if (deferFrames) {
  window.requestAnimationFrame = (callback) => {
    const arrive = (time: number) => {
      const now = performance.now();
      if (lateFrameArrival && selectionArmedAt !== null) {
        const remainingArrival = selectionArmedAt + 350 - now;
        if (remainingArrival > 0) {
          // Delay delivery at the live RAF seam, not the renderer task. Resume
          // on another actual native frame; input and capture remain unblocked.
          setTimeout(() => nativeFrame(arrive), remainingArrival);
          return;
        }
        if (lateFrameArrivalMs === 0)
          lateFrameArrivalMs = now - selectionArmedAt;
      }
      // Selection arms an affected frame, not a wall-clock opportunity that can
      // expire before native delivery. Configured-font output keeps its interval.
      const remaining = deferSelectionFrame ? 300 : deferUntil - now;
      deferSelectionFrame = false;
      if (remaining > 0) {
        deferredFrame = true;
        // Exercise a late frame without blocking input/capture or changing native
        // focus. This delay is a regression stimulus, never a readiness wait.
        setTimeout(() => nativeFrame(callback), remaining);
      } else callback(time);
    };
    return nativeFrame(arrive);
  };
}
globalThis.__omxtermBeginSelection = () => {
  selectionArmedAt = performance.now();
  if (deferFrames) deferSelectionFrame = true;
  beginSelectionFrameGate();
};

const customTheme: TerminalTheme = {
  version: 1,
  name: "Browser fixture",
  colors: {
    background: "#010203",
    foreground: "#e1e2e3",
    cursor: "#a1b2c3",
    selectionBackground: "#314159",
    selectionForeground: "#fefefe",
    black: "#101011",
    red: "#201012",
    green: "#102013",
    yellow: "#303014",
    blue: "#101025",
    magenta: "#301026",
    cyan: "#103027",
    white: "#d0d0d8",
    brightBlack: "#505059",
    brightRed: "#90105a",
    brightGreen: "#10905b",
    brightYellow: "#90905c",
    brightBlue: "#10109d",
    brightMagenta: "#90109e",
    brightCyan: "#10909f",
    brightWhite: "#f0f0f0",
  },
};

const queriedRoot = document.querySelector<HTMLElement>("#terminal-tabs");
if (!queriedRoot)
  throw new Error("Restty appearance fixture container is missing");
const root: HTMLElement = queriedRoot;

async function measure(
  size: number,
  lineHeight: number,
  padding: number,
  zoomToOne = false,
  nativeTitleInset = 0,
): Promise<Measurement> {
  document.documentElement.style.setProperty(
    "--native-title-inset",
    `${nativeTitleInset}px`,
  );
  const container = document.createElement("main");
  container.className = "terminal-surface";
  root.replaceChildren(container);
  let handlers: TerminalSessionHandlers | undefined;
  let starts = 0;
  let closes = 0;
  let latest = { cols: 0, rows: 0 };
  let cellWidth = 0;
  let cellHeight = 0;
  const surface = await mountResttyTerminalSurface(
    container,
    {
      async start(nextHandlers) {
        starts += 1;
        handlers = nextHandlers;
      },
      write(data) {
        const match = /\u001b\[6;(\d+);(\d+)t/u.exec(data);
        if (match) {
          cellHeight = Number(match[1]);
          cellWidth = Number(match[2]);
        }
      },
      resize(next) {
        latest = next;
      },
      close() {
        closes += 1;
      },
    },
    {
      appearance: { fontSize: size, lineHeight },
      padding: { top: padding, right: padding, bottom: padding, left: padding },
      theme: customTheme,
    },
  );
  if (zoomToOne) for (let step = size; step > 1; step -= 1) surface.zoom("out");
  await waitForLayout();
  handlers?.onOutput("\u001b[16t");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const ime = container.querySelector<HTMLElement>("textarea, input");
  const canvas = container.querySelector("canvas");
  const canvasBounds = canvas?.getBoundingClientRect();
  const result = {
    size: zoomToOne ? 1 : size,
    lineHeight,
    padding,
    nativeTitleInset,
    containerPaddingTop: getComputedStyle(container).paddingTop,
    ...latest,
    cellWidth,
    cellHeight,
    canvasCssWidth: canvasBounds?.width ?? 0,
    canvasCssHeight: canvasBounds?.height ?? 0,
    canvasBackingWidth: canvas?.width ?? 0,
    canvasBackingHeight: canvas?.height ?? 0,
    imeFontSize: ime?.style.fontSize ?? "",
    starts,
    closes,
  };
  // Exercise the live setter at both endpoints, not only creation-time size.
  surface.zoom("in");
  surface.zoom("out");
  await waitForLayout();
  handlers?.onOutput("\u001b[16t");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const live = {
    liveCellWidth: cellWidth,
    liveCellHeight: cellHeight,
    liveCols: latest.cols,
    liveRows: latest.rows,
  };
  surface.dispose();
  return { ...result, ...live };
}

async function run() {
  if (document.body.dataset.configuredFont !== "true")
    await verifyInBandResize(root);
  const measurements = [];
  for (const [size, lineHeight, padding, zoom, nativeTitleInset] of [
    [8, 1, 0, false, 0],
    [10, 1, 0, false, 0],
    [16, 1, 0, false, 0],
    [64, 1, 0, false, 0],
    [72, 1, 0, false, 0],
    [16, 2, 0, false, 0],
    [16, 1, 128, false, 0],
    [16, 1, 0, true, 0],
    [16, 1, 0, false, 30],
  ] as const)
    if (document.body.dataset.configuredFont !== "true")
      measurements.push(
        await measure(size, lineHeight, padding, zoom, nativeTitleInset),
      );

  document.documentElement.style.setProperty("--native-title-inset", "0px");
  const container = document.createElement("main");
  container.className = "terminal-surface";
  root.replaceChildren(container);
  let handlers: TerminalSessionHandlers | undefined;
  let starts = 0;
  let closes = 0;
  let resizeCount = 0;
  let latest = { cols: 0, rows: 0 };
  let cellWidth = 0;
  let cellHeight = 0;
  let externalLinks = 0;
  let copiedSelection = "";
  const surface = await mountResttyTerminalSurface(
    container,
    {
      async start(nextHandlers) {
        starts += 1;
        handlers = nextHandlers;
      },
      write(data) {
        const match = /\u001b\[6;(\d+);(\d+)t/u.exec(data);
        if (match) {
          cellHeight = Number(match[1]);
          cellWidth = Number(match[2]);
        }
      },
      resize(next) {
        resizeCount += 1;
        latest = next;
      },
      close() {
        closes += 1;
      },
    },
    {
      appearance: {
        fontSize: 8,
        lineHeight: 1,
        ligatures: true,
        ...(document.body.dataset.configuredFont === "true"
          ? {
              systemFont: {
                family: "JetBrainsMono Nerd Font Mono",
                available: true,
              },
            }
          : {}),
      },
      ...(document.body.dataset.configuredFont === "true"
        ? {
            acquireFontInputs: async () => ({
              fonts: terminalFontInputs({
                configured: {
                  family: "JetBrainsMono Nerd Font Mono",
                  data: configuredFontBytes,
                },
                fallbacks: [],
              }),
              release: () => undefined,
            }),
          }
        : {}),
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      theme: DEFAULT_TERMINAL_THEME,
      clipboard: {
        readText: async () => "",
        writeText: async (text) => {
          copiedSelection = text;
        },
        confirmPaste: async () => true,
        requestContextMenu: () => undefined,
      },
      onExternalLink() {
        externalLinks += 1;
      },
    },
  );
  const canvas = container.querySelector("canvas");
  surface.applyConfiguration({
    appearance: { fontSize: 16, lineHeight: 2, ligatures: true },
    padding: { top: 128, right: 128, bottom: 128, left: 128 },
    scrollbackLines: 10_000,
    optionKeyMode: "none",
    theme: customTheme,
  });
  surface.zoom("out");
  surface.zoom("in");
  await waitForLayout();
  root.style.width = "700px";
  await waitForLayout();
  root.style.removeProperty("width");
  await waitForLayout();
  const normalForeground = Array.from(
    { length: 8 },
    (_, index) => `\u001b[${30 + index}m██`,
  ).join("");
  const brightForeground = Array.from(
    { length: 8 },
    (_, index) => `\u001b[${90 + index}m██`,
  ).join("");
  deferredFrame = false;
  if (
    deferFrames &&
    document.body.dataset.configuredFont === "true" &&
    document.body.dataset.referenceFonts === "false"
  )
    deferUntil = performance.now() + 300;
  handlers?.onOutput(
    `${normalForeground}\r\n${brightForeground}\r\n\u001b[31m██\u001b[1m██\u001b[22;91m██\u001b[38;2;18;58;188m██ https://example.com\u001b[0m\u001b[4;1HMMMMMMMM\u001b[5;1H\u001b[1mMMMMMMMM\u001b[22m\u001b[6;1H${"\ue8f0".repeat(8)}\u001b[7;1H${"ƀ".repeat(8)}\u001b[8;1H${"͸".repeat(8)}\u001b[${latest.rows};1H\u001b[48;2;171;205;239m  \u001b[0m\u001b[16t`,
  );
  // Ordered output and the cell-size reply do not establish a painted frame.
  // Cross real frames after this remount's output before allowing pixel capture.
  await waitForLayout();
  const liveCanvas = container.querySelector("canvas");
  const canvasBounds = liveCanvas?.getBoundingClientRect();
  const containerStyle = getComputedStyle(container);
  const ime = container.querySelector<HTMLElement>("textarea, input");
  globalThis.__omxtermRenderConfiguredFont = async (reference) => {
    surface.dispose();
    document.body.dataset.configuredFont = "true";
    document.body.dataset.referenceFonts = String(reference);
    globalThis.__omxtermResttyAppearanceResult = undefined;
    await run();
  };
  globalThis.__omxtermHasNoSelection = async () => {
    copiedSelection = "";
    await surface.copy();
    return copiedSelection === "";
  };
  globalThis.__omxtermSelectionState = async () => {
    copiedSelection = "";
    await surface.copy();
    return {
      exactCopy: copiedSelection === " https",
      focused: document.hasFocus(),
      visibilityState: document.visibilityState,
      devicePixelRatio,
      deferredFrame,
      ...selectionFrameDiagnostics(),
      observedAt: performance.now(),
    };
  };
  globalThis.__omxtermSelectionAfterFrames = async () => {
    copiedSelection = "";
    await surface.copy();
    const beforeFrame = copiedSelection === " https";
    await waitForLayout(true);
    copiedSelection = "";
    await surface.copy();
    const afterFrame = copiedSelection === " https";
    if (!beforeFrame || !afterFrame)
      throw new Error(
        "Synthetic pointer selection was absent before or after frames",
      );
    return {
      beforeFrame,
      afterFrame,
      deferredFrame,
      lateFrameArrivalMs,
      visibilityState: document.visibilityState,
      focused: document.hasFocus(),
    };
  };
  globalThis.__omxtermResttyAppearanceResult = {
    deferredOutputFrame: deferredFrame,
    measurements,
    live: {
      sameCanvas: canvas === liveCanvas,
      starts,
      closesBeforeDispose: closes,
      resizeCount,
      ...latest,
      cellWidth,
      cellHeight,
      imeFontSize: ime?.style.fontSize ?? "",
      containerPadding: [
        containerStyle.paddingTop,
        containerStyle.paddingRight,
        containerStyle.paddingBottom,
        containerStyle.paddingLeft,
      ],
      canvasCssWidth: canvasBounds?.width ?? 0,
      canvasCssHeight: canvasBounds?.height ?? 0,
      canvasBackingWidth: liveCanvas?.width ?? 0,
      canvasBackingHeight: liveCanvas?.height ?? 0,
      externalLinks,
    },
    devicePixelRatio,
  };
}

void run().catch((error: unknown) => {
  const cause = error instanceof Error ? error.cause : undefined;
  document.body.dataset.fixtureError = String(error) + ": " + String(cause);
});
