import configuredFontBytes from "../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import {
  DEFAULT_TERMINAL_THEME,
  type TerminalTheme,
} from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

interface Measurement {
  readonly size: number;
  readonly lineHeight: number;
  readonly padding: number;
  readonly nativeTitleInset: number;
  readonly containerPaddingTop: string;
  readonly cols: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly imeFontSize: string;
  readonly starts: number;
  readonly closes: number;
}

interface AppearanceResult {
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

declare global {
  var __omxtermResttyAppearanceResult: AppearanceResult | undefined;
  var __omxtermRenderConfiguredFont: (reference: boolean) => Promise<void>;
}

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

const waitForLayout = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );

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
  const result = {
    size: zoomToOne ? 1 : size,
    lineHeight,
    padding,
    nativeTitleInset,
    containerPaddingTop: getComputedStyle(container).paddingTop,
    ...latest,
    cellWidth,
    cellHeight,
    imeFontSize: ime?.style.fontSize ?? "",
    starts,
    closes,
  };
  surface.dispose();
  return result;
}

async function run() {
  const measurements = [];
  for (const [size, lineHeight, padding, zoom, nativeTitleInset] of [
    [8, 1, 0, false, 0],
    [16, 1, 0, false, 0],
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
            loadFontData: async () => ({
              configured: {
                family: "JetBrainsMono Nerd Font Mono",
                data: configuredFontBytes,
              },
              fallbacks: [],
            }),
          }
        : {}),
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      theme: DEFAULT_TERMINAL_THEME,
      onExternalLink() {
        externalLinks += 1;
      },
    },
  );
  const canvas = container.querySelector("canvas");
  surface.applyConfiguration({
    appearance: { fontSize: 16, lineHeight: 2 },
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
  handlers?.onOutput(
    `${normalForeground}\r\n${brightForeground}\r\n\u001b[31m██\u001b[1m██\u001b[22;91m██\u001b[38;2;18;58;188m██ https://example.com\u001b[0m\u001b[4;1HMMMMMMMM\u001b[5;1H\u001b[1mMMMMMMMM\u001b[22m\u001b[6;1H${"\ue8f0".repeat(8)}\u001b[7;1H${"ƀ".repeat(8)}\u001b[8;1H${"͸".repeat(8)}\u001b[${latest.rows};1H\u001b[48;2;171;205;239m  \u001b[0m\u001b[16t`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
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
  globalThis.__omxtermResttyAppearanceResult = {
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
