import "./kitty-image-renderer.css";
import {
  canvasIsPainted,
  cellSizesAgree,
  currentCellSize,
  isWholeCellDistance,
  paintedBounds,
  pixelBoundsEqual,
  placementIsCellAnchored,
  type CellSize,
  type PixelBounds,
} from "./kitty-image-canvas";
import { usedJavaScriptHeap } from "./electron-memory-fixture";
import { exerciseStorageLimit } from "./kitty-image-storage";
import {
  bytesToBase64,
  createPaddedPng,
  createUncompressedPng,
  kittyDelete,
  kittyTransmission,
  KITTY_ENCODED_LIMIT,
  LARGEST_PADDED_BASE64,
  PI_PHOTON_PNG_BASE64_CHARACTERS,
  PI_PHOTON_PNG_BYTES,
  sendKittyBase64,
} from "./kitty-image-data";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import { createTerminalTabs } from "../../src/renderer/terminal-tabs";
import {
  mountTerminalSurface,
  type TerminalSurface,
} from "../../src/terminal-surface/terminal-surface";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSize } from "../../src/shared/terminal-contract";

interface KittyImageFixtureResult {
  readonly ok: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly cellSizeResponse?: string;
  readonly largeFixture?: {
    readonly decodedBytes: number;
    readonly encodedCharacters: number;
  };
  readonly memory?: {
    readonly method: "Chromium performance.memory.usedJSHeapSize";
    readonly beforeLargeFixture: number;
    readonly afterLargeFixture: number;
  };
  readonly error?: string;
}

declare global {
  var __omxtermKittyResult: KittyImageFixtureResult | undefined;
  var __omxtermKittyMemoryStage: "complete" | "large-fixture" | undefined;
}

const terminalContainer = requiredElement<HTMLElement>("#terminal");

const checks: Record<string, boolean> = {};
const adapterWrites: string[] = [];
const terminalSizes: TerminalSize[] = [];
let sessionHandlers: TerminalSessionHandlers | undefined;

const adapter: TerminalSessionAdapter = {
  async start(handlers: TerminalSessionHandlers) {
    sessionHandlers = handlers;
  },
  write(data: string) {
    adapterWrites.push(data);
  },
  resize(size) {
    terminalSizes.push(size);
  },
  close() {},
};

void run().catch((cause: unknown) => {
  globalThis.__omxtermKittyResult = {
    ok: false,
    checks,
    error: formatError(cause),
  };
});

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Fixture element is missing: ${selector}`);
  return element;
}

function formatError(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const nested = cause.cause;
  return `${cause.stack ?? cause.message}${nested === undefined ? "" : `\nCaused by: ${formatError(nested)}`}`;
}

async function run(): Promise<void> {
  const surface = await mountTerminalSurface(terminalContainer, adapter);
  const handlers = sessionHandlers;
  if (!handlers) throw new Error("Terminal Session Adapter did not start");

  record("JavaScript eval remains blocked", javaScriptEvalIsBlocked());
  const cellSizeResponse = await requestCellSize(handlers);
  record("cell-size report", /^\u001b\[6;\d+;\d+t$/u.test(cellSizeResponse));

  const tinyPng = createUncompressedPng(2, 2, 0x2272_2722);
  const contiguous = kittyTransmission(tinyPng, {
    columns: 8,
    id: 101,
    rows: 4,
  });
  send(handlers, `${contiguous}\r\n__CONTIGUOUS_COMPLETE__\r\n`);
  await waitFor(
    () =>
      terminalText().includes("__CONTIGUOUS_COMPLETE__") && canvasIsPainted(),
  );
  record("contiguous Pi-shaped PNG renders", true);
  record("PTY output completes after image decoding", true);

  send(handlers, `${kittyDelete("I", 101)}\r\n__DELETE_ID__\r\n`);
  await waitFor(
    () => terminalText().includes("__DELETE_ID__") && !canvasIsPainted(),
  );
  record("Pi d=I deletes its image ID", true);

  const split = kittyTransmission(tinyPng, {
    columns: 7,
    cursorMovement: 1,
    id: 102,
    rows: 3,
  });
  for (let offset = 0; offset < split.length; offset += 7) {
    send(handlers, split.slice(offset, offset + 7));
    await nextFrames(1);
  }
  await waitFor(canvasIsPainted);
  record("cross-frame transport-split Pi-shaped PNG renders", true);
  send(handlers, `${kittyDelete("a")}\r\n__DELETE_PLACEMENTS__\r\n`);
  await waitFor(
    () =>
      terminalText().includes("__DELETE_PLACEMENTS__") && !canvasIsPainted(),
  );
  record("Pi d=a removes all placements", true);

  send(
    handlers,
    `${kittyTransmission(tinyPng, { columns: 4, id: 103, rows: 2 })}${kittyTransmission(tinyPng, { columns: 4, id: 104, rows: 2 })}`,
  );
  await waitFor(canvasIsPainted);
  send(handlers, `${kittyDelete("A")}\r\n__DELETE_ALL__\r\n`);
  await waitFor(
    () => terminalText().includes("__DELETE_ALL__") && !canvasIsPainted(),
  );
  record("Pi d=A deletes all image state", true);

  send(
    handlers,
    `\u001b[?1049h${kittyTransmission(tinyPng, { columns: 6, id: 201, rows: 3 })}`,
  );
  await waitFor(canvasIsPainted);
  record("alternate buffer image renders", true);
  send(handlers, "\u001b[?1049l\r\n__LEFT_ALTERNATE__\r\n");
  await waitFor(
    () => terminalText().includes("__LEFT_ALTERNATE__") && !canvasIsPainted(),
  );
  record("leaving alternate buffer releases its image", true);

  send(handlers, kittyTransmission(tinyPng, { columns: 6, id: 301, rows: 3 }));
  await waitFor(canvasIsPainted);
  send(handlers, "\u001bc__RESET_COMPLETE__\r\n");
  await waitFor(
    () => terminalText().includes("__RESET_COMPLETE__") && !canvasIsPainted(),
  );
  record("terminal reset releases image resources", true);

  await exerciseAnchoring(surface, handlers, tinyPng);

  send(handlers, "\u001b_Ga=T,f=100,q=2,i=501;%%%\u001b\\__MALFORMED__\r\n");
  await waitFor(() => terminalText().includes("__MALFORMED__"));
  record("malformed Base64 renders nothing", !canvasIsPainted());

  send(
    handlers,
    `${kittyTransmission(tinyPng, { columns: 2_000, id: 502, rows: 2_000 })}__PIXEL_LIMIT__\r\n`,
  );
  await waitFor(() => terminalText().includes("__PIXEL_LIMIT__"));
  record("placement above pixelLimit renders nothing", !canvasIsPainted());

  const incompleteBase64 = bytesToBase64(tinyPng).slice(0, 4_096);
  send(
    handlers,
    `\u001b_Ga=T,f=100,q=2,i=503,m=1;${incompleteBase64}\u001b\\__INCOMPLETE__\r\n`,
  );
  await waitFor(() => terminalText().includes("__INCOMPLETE__"));
  record("incomplete transmission renders nothing", !canvasIsPainted());
  send(handlers, "\u001bc");
  await nextFrames(2);

  record("derived Kitty encoded ceiling", KITTY_ENCODED_LIMIT === 44_739_243);
  record(
    "largest accepted padded Base64",
    LARGEST_PADDED_BASE64 === 44_739_240,
  );
  let boundaryPng: Uint8Array | undefined = createPaddedPng(33_554_430);
  let boundaryBase64: string | undefined = bytesToBase64(boundaryPng);
  record(
    "largest accepted transport-boundary PNG shape",
    boundaryBase64.length === LARGEST_PADDED_BASE64,
  );
  await sendKittyBase64(handlers, boundaryBase64, {
    columns: 1,
    id: 504,
    rows: 1,
  });
  send(handlers, "__KITTY_SIZE_ACCEPTED__\r\n");
  await waitFor(
    () =>
      terminalText().includes("__KITTY_SIZE_ACCEPTED__") && canvasIsPainted(),
    60_000,
  );
  record("largest accepted valid PNG renders", true);
  send(handlers, kittyDelete("A"));
  await waitFor(() => !canvasIsPainted());

  boundaryPng = createPaddedPng(33_554_431);
  boundaryBase64 = bytesToBase64(boundaryPng);
  const rejectedEncodedCharacters = boundaryBase64.length;
  await sendKittyBase64(handlers, boundaryBase64, {
    columns: 1,
    id: 505,
    rows: 1,
  });
  send(handlers, "__KITTY_SIZE_REJECTED__\r\n");
  await waitFor(
    () => terminalText().includes("__KITTY_SIZE_REJECTED__"),
    60_000,
  );
  record(
    "first valid PNG above kittySizeLimit renders nothing",
    !canvasIsPainted(),
  );
  record(
    "first padded Base64 above ceiling exercised",
    rejectedEncodedCharacters === LARGEST_PADDED_BASE64 + 4,
  );
  boundaryPng = undefined;
  boundaryBase64 = undefined;
  send(handlers, "\u001bc");
  await nextFrames(2);

  globalThis.__omxtermKittyMemoryStage = "large-fixture";
  const beforeLargeFixture = usedJavaScriptHeap();
  let largePng: Uint8Array | undefined = createUncompressedPng(
    2_000,
    2_000,
    0x2272_2722,
  );
  record(
    "generated Pi Photon PNG byte shape",
    largePng.length === PI_PHOTON_PNG_BYTES,
  );
  let largeBase64: string | undefined = bytesToBase64(largePng);
  const encodedCharacters = largeBase64.length;
  await sendKittyBase64(
    handlers,
    largeBase64,
    { columns: 20, id: 601, rows: 10 },
    true,
  );
  const decodedBytes = largePng.length;
  send(handlers, "\r\n__LARGE_OUTPUT_COMPLETE__\r\n");
  await waitFor(
    () =>
      terminalText().includes("__LARGE_OUTPUT_COMPLETE__") && canvasIsPainted(),
    60_000,
  );
  record("generated PNG above ten million bytes renders", true);
  record("transport-split multi-chunk PNG renders", true);
  record(
    "generated Pi Photon PNG Base64 shape",
    encodedCharacters === PI_PHOTON_PNG_BASE64_CHARACTERS,
  );

  surface.dispose();
  await nextFrames(2);
  record(
    "tab disposal removes image canvas",
    !document.querySelector(".xterm-image-layer-top"),
  );
  const storageLimit = await exerciseStorageLimit(largeBase64);
  record(
    "storageLimit retains a sentinel below 64,000,000 accounted bytes",
    storageLimit.sentinelRetained,
  );
  record(
    "three maximum canvases plus the sentinel remain below storageLimit",
    storageLimit.belowLimit,
  );
  record(
    "64,000,016 accounted bytes trigger FIFO eviction to 64,000,000",
    storageLimit.fifoEviction,
  );
  largePng = undefined;
  largeBase64 = undefined;
  const afterLargeFixture = usedJavaScriptHeap();
  globalThis.__omxtermKittyMemoryStage = "complete";
  await exerciseTabSelection(tinyPng);

  globalThis.__omxtermKittyResult = {
    ok: Object.values(checks).every(Boolean),
    checks,
    cellSizeResponse,
    largeFixture: { decodedBytes, encodedCharacters },
    memory: {
      method: "Chromium performance.memory.usedJSHeapSize",
      beforeLargeFixture,
      afterLargeFixture,
    },
  };
}

async function exerciseAnchoring(
  surface: TerminalSurface,
  handlers: TerminalSessionHandlers,
  tinyPng: Uint8Array,
): Promise<void> {
  send(
    handlers,
    `${kittyTransmission(tinyPng, { columns: 10, id: 401, rows: 5 })}\r\nanchor scroll\r\n`,
  );
  await waitFor(canvasIsPainted);
  const beforeScroll = paintedBounds();
  if (!beforeScroll) throw new Error("Anchoring fixture did not paint");
  const scrollCellSize = currentCellSize(terminalSizes);
  record(
    "image placement dimensions and position follow terminal cells",
    placementIsCellAnchored(beforeScroll, 10, 5, scrollCellSize),
  );

  let afterScroll: PixelBounds | undefined;
  for (let line = 0; line < 100 && !afterScroll; line += 1) {
    send(handlers, `scroll-${line}\r\n`);
    await nextFrames(2);
    const candidate = paintedBounds();
    if (candidate && candidate.top < beforeScroll.top) afterScroll = candidate;
  }
  const scrollDistance =
    afterScroll === undefined ? 0 : beforeScroll.top - afterScroll.top;
  record(
    "direct-session scroll moves the image by whole terminal cells",
    afterScroll !== undefined &&
      placementIsCellAnchored(afterScroll, 10, 5, scrollCellSize) &&
      isWholeCellDistance(scrollDistance, scrollCellSize.height),
  );

  send(handlers, "\u001bc");
  await nextFrames(2);
  send(handlers, kittyTransmission(tinyPng, { columns: 10, id: 402, rows: 5 }));
  await waitFor(canvasIsPainted);

  terminalContainer.style.width = "760px";
  terminalContainer.style.height = "480px";
  window.dispatchEvent(new Event("resize"));
  await nextFrames(3);
  await waitFor(canvasIsPainted);
  await recordCellAnchoring("Terminal Window resize", handlers, 10, 5);

  surface.zoom("in");
  await nextFrames(3);
  await waitFor(canvasIsPainted);
  await recordCellAnchoring("Window Font Zoom", handlers, 10, 5);

  surface.applyConfiguration({
    appearance: { fontSize: 18, lineHeight: 1.1 },
    optionKeyMode: "none",
    padding: { top: 1, right: 2, bottom: 3, left: 4 },
    scrollbackLines: 10_000,
    theme: DEFAULT_TERMINAL_THEME,
  });
  await nextFrames(3);
  await waitFor(canvasIsPainted);
  await recordCellAnchoring("User Configuration Reload", handlers, 10, 5);
  send(handlers, kittyDelete("A"));
  await waitFor(() => !canvasIsPainted());
}

async function exerciseTabSelection(tinyPng: Uint8Array): Promise<void> {
  terminalContainer.remove();
  const strip = document.createElement("nav");
  const containers = document.createElement("div");
  document.body.append(strip, containers);
  const tabHandlers: TerminalSessionHandlers[] = [];
  let nextSession = 0;
  const tabs = createTerminalTabs(
    { strip, container: containers },
    {
      createAdapter(): ElectronTerminalAdapter {
        const sessionId = `s${++nextSession}`;
        return {
          sessionId: () => sessionId,
          async start(handlers) {
            tabHandlers.push(handlers);
          },
          write() {},
          resize() {},
          close() {},
        };
      },
      mount: mountTerminalSurface,
      surfaceOptions: {},
    },
  );
  await tabs.ready;
  const firstContainer = containers.querySelector<HTMLElement>("main");
  if (!firstContainer || !tabHandlers[0])
    throw new Error("First Terminal Tab did not mount");
  send(
    tabHandlers[0],
    kittyTransmission(tinyPng, { columns: 8, id: 701, rows: 4 }),
  );
  await waitFor(() => canvasIsPainted(firstContainer));
  const beforeSelection = paintedBounds(firstContainer);

  tabs.handleCommand({ action: "new" });
  await waitFor(() => tabHandlers.length === 2);
  record(
    "selecting another tab hides the image Surface",
    firstContainer.hidden === true,
  );
  tabs.handleCommand({ action: "select", position: 1 });
  await waitFor(
    () => firstContainer.hidden === false && canvasIsPainted(firstContainer),
  );
  const afterSelection = paintedBounds(firstContainer);
  record(
    "tab selection preserves and refits the same image Surface",
    beforeSelection !== undefined &&
      afterSelection !== undefined &&
      pixelBoundsEqual(beforeSelection, afterSelection),
  );
  tabs.dispose();
  await nextFrames(2);
  record(
    "tab disposal removes selected image resources",
    !containers.querySelector(".xterm-image-layer-top"),
  );
}

function send(handlers: TerminalSessionHandlers, data: string): void {
  handlers.onOutput(data);
}

function javaScriptEvalIsBlocked(): boolean {
  try {
    globalThis.eval("1 + 1");
    return false;
  } catch {
    return true;
  }
}

function isCellSizeResponse(value: string): boolean {
  return /^\u001b\[6;\d+;\d+t$/u.test(value);
}

async function requestCellSize(
  handlers: TerminalSessionHandlers,
): Promise<string> {
  const previousResponses = adapterWrites.length;
  send(handlers, "\u001b[16t");
  await waitFor(() =>
    adapterWrites.slice(previousResponses).some(isCellSizeResponse),
  );
  return adapterWrites.slice(previousResponses).find(isCellSizeResponse)!;
}

async function recordCellAnchoring(
  operation: string,
  handlers: TerminalSessionHandlers,
  columns: number,
  rows: number,
): Promise<void> {
  const reported = parseCellSize(await requestCellSize(handlers));
  const actual = currentCellSize(terminalSizes);
  const bounds = paintedBounds();
  record(
    `${operation} reports the rendered terminal cell dimensions`,
    cellSizesAgree(reported, actual),
  );
  record(
    `${operation} keeps image dimensions and position cell-anchored`,
    bounds !== undefined &&
      placementIsCellAnchored(bounds, columns, rows, actual),
  );
}

function parseCellSize(response: string): CellSize {
  const match = response.match(/^\u001b\[6;(?<height>\d+);(?<width>\d+)t$/u);
  if (!match?.groups)
    throw new Error(`Invalid cell-size response: ${response}`);
  return {
    height: Number(match.groups["height"]),
    width: Number(match.groups["width"]),
  };
}

function terminalText(): string {
  return document.querySelector(".xterm-rows")?.textContent ?? "";
}

async function waitFor(
  predicate: () => boolean,
  timeoutMilliseconds = 10_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for fixture state: ${terminalText()}`);
}

async function nextFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
}

function record(name: string, result: boolean): void {
  checks[name] = result;
  if (!result) throw new Error(`Kitty image check failed: ${name}`);
}
