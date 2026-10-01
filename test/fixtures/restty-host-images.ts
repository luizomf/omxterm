import type { BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  inspectResttyImageFrame,
  hasResttyImagePlacementEvidence,
  type ResttyImagePixelEvidence as PixelEvidence,
} from "./restty-image-evidence";

export function resttyImageEmitterSource(): string {
  return `
const { readFileSync } = require("node:fs");
const png = readFileSync(process.argv[2]);
const write = (value) => process.stdout.write(value);
const encoded = png.toString("base64");
// Remain the foreground image client until owned PTY teardown. Geometry replies
// belong to this client, not the idle shell (which may echo them or ring BEL).
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", () => {});
write("\\x1b[2J\\x1b[H\\x1b[?25l");
for (let offset = 0; offset < encoded.length; offset += 4096) {
  const last = offset + 4096 >= encoded.length;
  const controls = offset === 0
    ? "a=T,f=100,q=2,c=4,r=3,C=0,i=260" + (last ? "" : ",m=1")
    : "m=" + (last ? 0 : 1);
  write("\\x1b_G" + controls + ";" + encoded.slice(offset, offset + 4096) + "\\x1b\\\\");
}
write("\\x1b[5;10H");
write("\\x1b_Ga=T,t=d,f=32,s=1,v=1,c=2,r=2,m=1,q=2\\x1b\\\\");
write("\\x1b_Gm=1;AP8A/w==\\x1b\\\\");
write("\\x1b_Gm=0\\x1b\\\\");
write("\\x1b[16t__RESTTY_IMAGES_SENT__\\n");
`;
}

export async function exerciseResttyImagesThroughPty(options: {
  readonly window: BrowserWindow;
  readonly terminal: { write(data: string): void };
  readonly root: string;
  readonly outputs: string[][];
  readonly inputs: string[][];
  readonly deliverOutputs: Array<(data: string) => void>;
  readonly resizes: Array<Array<{ cols: number; rows: number }>>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const {
    window,
    terminal,
    root,
    outputs,
    inputs,
    deliverOutputs,
    resizes,
    waitFor,
  } = options;
  const nodeExecutable = process.env["npm_node_execpath"];
  if (!nodeExecutable)
    throw new Error("Native image fixture requires npm_node_execpath");
  deliverOutputs[0]!("\u001b[2J\u001b[H\u001b[?25l");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const evidence = await exerciseResttyImages({
    window,
    runEmitter: () =>
      terminal.write(
        `${process.platform === "win32" ? "& " : ""}${shellQuote(nodeExecutable)} ${shellQuote(`${root}/image-emitter.cjs`)} ${shellQuote(`${root}/pi-2000.png`)}\r`,
      ),
    output: () => outputs[0]!.join(""),
    input: () => inputs[0]!.join(""),
    size: () => resizes[0]!.at(-1)!,
    cellSize: () =>
      readResttyImageCellSize(
        deliverOutputs[0]!,
        () => inputs[0]!.join(""),
        waitFor,
      ),
    waitFor,
  });
  outputs[0] = [
    "__DEFAULT_INPUT__Olá🙂\n__SELECT_ALL_FIRST__\n__SELECT_ALL_LAST__\n__RESTTY_IMAGE_OUTPUT_OMITTED__",
  ];
  return evidence;
}

function shellQuote(value: string): string {
  return process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function exerciseResttyImages(options: {
  readonly window: BrowserWindow;
  readonly runEmitter: () => void;
  readonly output: () => string;
  readonly input: () => string;
  readonly size: () => { readonly cols: number; readonly rows: number };
  readonly cellSize: () => Promise<readonly [number, number]>;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}): Promise<{
  readonly cellSizeResponse: string;
  readonly gridSize: { readonly cols: number; readonly rows: number };
  readonly pixels: PixelEvidence;
  readonly afterZoomPixels: PixelEvidence;
  readonly afterResizePixels: PixelEvidence;
}> {
  const { window, runEmitter, output, input, size, cellSize, waitFor } =
    options;
  const inputStart = input().length;
  runEmitter();
  try {
    await waitFor(
      () => output().includes("__RESTTY_IMAGES_SENT__"),
      "Pi and Chafa image payload through the owned PTY",
    );
  } catch (cause) {
    throw new Error("Image emitter produced no completion marker", { cause });
  }

  const waitForImagePixels = async (
    label: string,
    previousGrid?: { readonly cols: number; readonly rows: number },
  ) => {
    let evidence: PixelEvidence | undefined;
    let gridSize: { readonly cols: number; readonly rows: number } | undefined;
    await waitFor(async () => {
      gridSize = size();
      evidence = await captureResttyImagePixels(window, await cellSize());
      return (
        hasResttyImagePlacementEvidence(evidence) &&
        (previousGrid === undefined ||
          gridSize.cols !== previousGrid.cols ||
          gridSize.rows !== previousGrid.rows)
      );
    }, label).catch((cause: unknown) => {
      throw new Error(
        `Image rendering failed at ${label}: ${JSON.stringify({ gridSize, evidence })}`,
        { cause },
      );
    });
    if (!evidence || !gridSize)
      throw new Error(`Image rendering produced no ${label} evidence`);
    return { evidence, gridSize };
  };

  const initial = await waitForImagePixels(
    "initial Pi and Chafa image rendering",
  );
  window.webContents.send(terminalIpc.fontZoom, "in");
  const zoom = await waitForImagePixels(
    "Pi and Chafa images after font zoom",
    initial.gridSize,
  );

  window.webContents.send(terminalIpc.fontZoom, "reset");
  const reset = await waitForImagePixels(
    "Pi and Chafa images after zoom reset",
    zoom.gridSize,
  );
  const canvasBounds = await readCanvasBounds(window);
  const finalPng = (await window.webContents.capturePage(canvasBounds)).toPNG();
  const screenshotPath = process.env["OMXTERM_RESTTY_IMAGE_SCREENSHOT_PATH"];
  if (screenshotPath) writeFileSync(screenshotPath, finalPng);

  const windowSize = window.getSize();
  window.setSize(windowSize[0]! + 100, windowSize[1]! + 80);
  const resized = await waitForImagePixels(
    "Pi and Chafa images after resize",
    reset.gridSize,
  );

  await waitFor(
    () => /\u001b\[6;\d+;\d+t/u.test(input().slice(inputStart)),
    "CSI 16 t cell-size reply",
  );
  const cellSizeResponse = input()
    .slice(inputStart)
    .match(/\u001b\[6;\d+;\d+t/u)?.[0];
  if (!cellSizeResponse) throw new Error("Restty returned no cell-size reply");

  return {
    cellSizeResponse,
    gridSize: reset.gridSize,
    pixels: reset.evidence,
    afterZoomPixels: zoom.evidence,
    afterResizePixels: resized.evidence,
  };
}

export async function completeResttyImageEvidence<T extends object>(
  window: BrowserWindow,
  initial: T,
  source: readonly [
    deliverOutput: (data: string) => void,
    inputs: readonly string[],
  ],
  waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>,
): Promise<T & { readonly afterTabAndThemePixels: PixelEvidence }> {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return {
    ...initial,
    afterTabAndThemePixels: await captureResttyImagePixels(
      window,
      await readResttyImageCellSize(
        source[0],
        () => source[1].join(""),
        waitFor,
      ),
    ),
  };
}

export async function readResttyImageCellSize(
  deliverOutput: (data: string) => void,
  input: () => string,
  waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>,
): Promise<readonly [number, number]> {
  const start = input().length;
  deliverOutput("\u001b[16t");
  await waitFor(
    () => /\u001b\[6;\d+;\d+t/u.test(input().slice(start)),
    "current image cell geometry",
  );
  const [, height, width] = /\u001b\[6;(\d+);(\d+)t/u.exec(
    input().slice(start),
  )!;
  // Restty reports its actual integer device-pixel cell metrics. Dividing the
  // canvas by the grid would distribute unused right/bottom space across cells
  // and silently move the expected anchors, especially at fractional DPRs.
  return [Number(width), Number(height)];
}

async function captureResttyImagePixels(
  window: BrowserWindow,
  cellSize: readonly [number, number],
): Promise<PixelEvidence> {
  const canvasBounds = await readCanvasBounds(window);
  const captured = await window.webContents.capturePage(canvasBounds);
  return inspectScreenshot(window, captured.toPNG(), cellSize);
}

async function readCanvasBounds(window: BrowserWindow): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const bounds = (await window.webContents.executeJavaScript(
    "(() => { const bounds = document.querySelector('.restty-terminal-surface canvas')?.getBoundingClientRect(); return bounds ? { x: Math.floor(bounds.x), y: Math.floor(bounds.y), width: Math.floor(bounds.width), height: Math.floor(bounds.height) } : null })()",
    true,
  )) as { x: number; y: number; width: number; height: number } | null;
  if (!bounds) throw new Error("Restty image canvas bounds are unavailable");
  return bounds;
}

async function inspectScreenshot(
  window: BrowserWindow,
  png: Buffer,
  cellSize: readonly [number, number],
): Promise<PixelEvidence> {
  const encodedScreenshot = png.toString("base64");
  return (await window.webContents.executeJavaScript(
    `(async () => {
      const binary = atob(${JSON.stringify(encodedScreenshot)});
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Screenshot canvas is unavailable');
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const all = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return (${inspectResttyImageFrame.toString()})(all, canvas.width, canvas.height, ${cellSize[0]}, ${cellSize[1]});
    })()`,
    true,
  )) as PixelEvidence;
}
