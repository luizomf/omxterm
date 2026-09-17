import type { BrowserWindow } from "electron";
import { writeFileSync } from "node:fs";
import { terminalIpc } from "../../src/shared/terminal-ipc";

export function resttyImageEmitterSource(): string {
  return `
const { readFileSync } = require("node:fs");
const png = readFileSync(process.argv[2]);
const write = (value) => process.stdout.write(value);
const encoded = png.toString("base64");
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
  deliverOutputs[0]!("\u001b[2J\u001b[H\u001b[?25l");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const evidence = await exerciseResttyImages({
    window,
    runEmitter: () =>
      terminal.write(
        `${shellQuote(process.execPath)} ${shellQuote(`${root}/image-emitter.cjs`)} ${shellQuote(`${root}/pi-2000.png`)}\r`,
      ),
    output: () => outputs[0]!.join(""),
    input: () => inputs[0]!.join(""),
    size: () => resizes[0]!.at(-1)!,
    waitFor,
  });
  outputs[0] = [
    "__DEFAULT_INPUT__Olá🙂\n__SELECT_ALL_FIRST__\n__SELECT_ALL_LAST__\n__RESTTY_IMAGE_OUTPUT_OMITTED__",
  ];
  return evidence;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

interface PixelEvidence {
  readonly bitmapSize: readonly [number, number];
  readonly changedInPiPlacement: number;
  readonly changedOutsidePlacements: number;
  readonly colorBucketsInPiPlacement: number;
  readonly colorBucketsInBitmap: number;
  readonly greenInChafaPlacement: number;
  readonly greenInBitmap: number;
  readonly greenOutsideChafaPlacement: number;
}

export async function exerciseResttyImages(options: {
  readonly window: BrowserWindow;
  readonly runEmitter: () => void;
  readonly output: () => string;
  readonly input: () => string;
  readonly size: () => { readonly cols: number; readonly rows: number };
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
  const { window, runEmitter, output, input, size, waitFor } = options;
  const inputStart = input().length;
  runEmitter();
  await waitFor(
    () => output().includes("__RESTTY_IMAGES_SENT__"),
    "Pi and Chafa image payload through the owned PTY",
  );

  window.webContents.send(terminalIpc.fontZoom, "in");
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const zoomSize = size();
  const afterZoomPixels = await captureResttyImagePixels(
    window,
    zoomSize.cols,
    zoomSize.rows,
  );

  window.webContents.send(terminalIpc.fontZoom, "reset");
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const terminalSize = size();
  const canvasBounds = await readCanvasBounds(window);
  const captured = await window.webContents.capturePage(canvasBounds);
  const finalPng = captured.toPNG();
  const pixels = await inspectScreenshot(
    window,
    finalPng,
    terminalSize.cols,
    terminalSize.rows,
  );
  const screenshotPath = process.env["OMXTERM_RESTTY_IMAGE_SCREENSHOT_PATH"];
  if (screenshotPath) writeFileSync(screenshotPath, finalPng);

  const windowSize = window.getSize();
  window.setSize(windowSize[0]! + 100, windowSize[1]! + 80);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const resizeSize = size();
  const afterResizePixels = await captureResttyImagePixels(
    window,
    resizeSize.cols,
    resizeSize.rows,
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
    gridSize: terminalSize,
    pixels,
    afterZoomPixels,
    afterResizePixels,
  };
}

export async function completeResttyImageEvidence<T extends object>(
  window: BrowserWindow,
  initial: T,
  selectedSize: { readonly cols: number; readonly rows: number },
): Promise<T & { readonly afterTabAndThemePixels: PixelEvidence }> {
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  return {
    ...initial,
    afterTabAndThemePixels: await captureResttyImagePixels(
      window,
      selectedSize.cols,
      selectedSize.rows,
    ),
  };
}

async function captureResttyImagePixels(
  window: BrowserWindow,
  cols: number,
  rows: number,
): Promise<PixelEvidence> {
  const canvasBounds = await readCanvasBounds(window);
  const captured = await window.webContents.capturePage(canvasBounds);
  return inspectScreenshot(window, captured.toPNG(), cols, rows);
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
  cols: number,
  rows: number,
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
      const cellWidth = canvas.width / ${cols};
      const cellHeight = canvas.height / ${rows};
      const read = (column, row, columns, rowCount) =>
        context.getImageData(
          Math.floor(column * cellWidth),
          Math.floor(row * cellHeight),
          Math.max(1, Math.ceil(columns * cellWidth)),
          Math.max(1, Math.ceil(rowCount * cellHeight)),
        ).data;
      const count = (data, predicate) => {
        let result = 0;
        for (let offset = 0; offset < data.length; offset += 4)
          if (predicate(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) result += 1;
        return result;
      };
      const all = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pi = read(0, 0, 4, 3);
      const chafa = read(9, 4, 2, 2);
      const outside = read(0, 10, ${cols}, Math.max(1, ${rows} - 10));
      const background = [outside[0], outside[1], outside[2]];
      const nonBackground = (r, g, b, a) =>
        a > 0 &&
        (Math.abs(r - background[0]) > 4 ||
          Math.abs(g - background[1]) > 4 ||
          Math.abs(b - background[2]) > 4);
      const green = (r, g, b, a) => a > 200 && g > 200 && r < 150 && b < 120;
      const colorBuckets = (data) => {
        const buckets = new Set();
        for (let offset = 0; offset < data.length; offset += 4)
          if (data[offset + 3] > 200)
            buckets.add((data[offset] >> 4) << 8 | (data[offset + 1] >> 4) << 4 | data[offset + 2] >> 4);
        return buckets.size;
      };
      return {
        bitmapSize: [canvas.width, canvas.height],
        changedInPiPlacement: count(pi, nonBackground),
        changedOutsidePlacements: count(outside, nonBackground),
        colorBucketsInPiPlacement: colorBuckets(pi),
        colorBucketsInBitmap: colorBuckets(all),
        greenInChafaPlacement: count(chafa, green),
        greenInBitmap: count(all, green),
        greenOutsideChafaPlacement: count(outside, green),
      };
    })()`,
    true,
  )) as PixelEvidence;
}
