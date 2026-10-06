import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { isTerminalFontData } from "../../src/shared/terminal-font-data";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import {
  fontStyleCaptureNames,
  writeFontStyleCaptures,
  type FontStyleCapture,
  type FontStyleCaptureMetadata,
} from "./restty-font-style-evidence";

function inkBounds(bitmap: Buffer, blank: Buffer, width: number) {
  let top = Infinity;
  let bottom = -1;
  let coverage = 0;
  let left = Infinity;
  let right = -1;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const difference =
      Math.abs(bitmap[offset]! - blank[offset]!) +
      Math.abs(bitmap[offset + 1]! - blank[offset + 1]!) +
      Math.abs(bitmap[offset + 2]! - blank[offset + 2]!);
    if (difference <= 24) continue;
    const row = Math.floor(offset / 4 / width);
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
    coverage += difference;
    const column = (offset / 4) % width;
    left = Math.min(left, column);
    right = Math.max(right, column);
  }
  let centerColumnInk = 0;
  const centerX = Math.floor((left + right) / 2);
  for (let row = top; row <= bottom; row++) {
    const offset = (row * width + centerX) * 4;
    const difference =
      Math.abs(bitmap[offset]! - blank[offset]!) +
      Math.abs(bitmap[offset + 1]! - blank[offset + 1]!) +
      Math.abs(bitmap[offset + 2]! - blank[offset + 2]!);
    if (difference > 24) centerColumnInk++;
  }
  return {
    centerColumnInk,
    width: right < 0 ? 0 : right - left + 1,
    height: bottom < 0 ? 0 : bottom - top + 1,
    coverage,
  };
}

function outsideInkGrowth(
  bitmap: Buffer,
  prior: Buffer,
  blank: Buffer,
  width: number,
  cell: { right: number; bottom: number },
) {
  let growth = 0;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const x = (offset / 4) % width;
    const y = Math.floor(offset / 4 / width);
    if (x < cell.right && y < cell.bottom) continue;
    let difference = 0;
    for (let channel = 0; channel < 3; channel++)
      difference +=
        Math.abs(bitmap[offset + channel]! - blank[offset + channel]!) -
        Math.abs(prior[offset + channel]! - blank[offset + channel]!);
    if (difference > 24) growth += difference;
  }
  return growth;
}

const directory = process.argv[2]!;
const mode = process.argv[3]!;
const family = process.argv[4]!;
async function run() {
  const captureDirectory = process.env.OMXTERM_FONT_STYLES_CAPTURE_DIRECTORY;
  const captureMetadata = captureDirectory
    ? (JSON.parse(
        process.env.OMXTERM_FONT_STYLES_CAPTURE_METADATA!,
      ) as FontStyleCaptureMetadata)
    : undefined;
  if (
    captureMetadata &&
    (mode !== "regular" ||
      !["current-regular", "prior-regular"].includes(captureMetadata.variant))
  )
    throw new Error("Invalid font capture variant");
  applyChromiumSandboxPolicy(app.commandLine);
  for (const name of ["userData", "sessionData"] as const) {
    await mkdir(path.join(directory, name), { recursive: true });
    app.setPath(name, path.join(directory, name));
  }
  ipcMain.handle("fonts", async () => {
    const data = await loadTerminalFontData(family);
    if (!isTerminalFontData(data))
      throw new Error("Invalid production font response");
    if (mode === "regular") return { ...data, configuredStyles: {} };
    if (mode === "italicOnly")
      return {
        ...data,
        configuredStyles: { italic: data.configuredStyles!.italic! },
      };
    if (mode === "partial")
      return {
        ...data,
        configuredStyles: { boldItalic: data.configuredStyles!.boldItalic! },
      };
    return data;
  });
  await app.whenReady();
  const window = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(directory, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.debugger.attach("1.3");
  const phases: unknown[] = [];
  const retainedCaptures: FontStyleCapture[] = [];
  let blankBitmap: Buffer | undefined;
  let wideItalicBitmap: Buffer | undefined;
  ipcMain.handle(
    "phase",
    async (
      _event,
      name: string,
      capture: boolean,
      store: unknown,
      cell?: { right: number; bottom: number },
    ) => {
      const heap: unknown = await window.webContents.debugger.sendCommand(
        "Runtime.getHeapUsage",
      );
      const metrics = app
        .getAppMetrics()
        .map(({ type, memory }) => ({ type, memory }));
      await window.webContents.debugger.sendCommand(
        "HeapProfiler.collectGarbage",
      );
      const diagnosticHeap: unknown =
        await window.webContents.debugger.sendCommand("Runtime.getHeapUsage");
      const diagnosticMetrics = app
        .getAppMetrics()
        .map(({ type, memory }) => ({ type, memory }));
      const image = capture
        ? await window.webContents.capturePage()
        : undefined;
      const bitmap = image?.toBitmap();
      if (name === "blank") blankBitmap = bitmap;
      if (name === "wideItalic") wideItalicBitmap = bitmap;
      const outsideGrowth =
        name === "wideBoldItalic" &&
        bitmap &&
        wideItalicBitmap &&
        blankBitmap &&
        image &&
        cell
          ? outsideInkGrowth(
              bitmap,
              wideItalicBitmap,
              blankBitmap,
              image.getSize().width,
              cell,
            )
          : undefined;
      const ink =
        bitmap && blankBitmap && image
          ? inkBounds(bitmap, blankBitmap, image.getSize().width)
          : undefined;
      const phase = {
        name,
        store,
        heap,
        metrics,
        diagnosticHeap,
        diagnosticMetrics,
        ...(bitmap
          ? {
              hash: createHash("sha256").update(bitmap).digest("hex"),
              ink,
              outsideGrowth,
              pixelSize: image?.getSize(),
              bitmapBytes: bitmap.byteLength,
            }
          : {}),
      };
      phases.push(phase);
      // Opt-in only: keep the exact original images, not new capturePage calls.
      if (
        captureDirectory &&
        image &&
        fontStyleCaptureNames.some((value) => value === name)
      )
        retainedCaptures.push({ image, phase });
    },
  );
  ipcMain.on("report", (_event, result: unknown) => {
    void (async () => {
      if (captureDirectory && captureMetadata) {
        const dpr =
          result &&
          typeof result === "object" &&
          "dpr" in result &&
          typeof result.dpr === "number"
            ? result.dpr
            : undefined;
        await writeFontStyleCaptures(
          captureDirectory,
          { ...captureMetadata, dpr },
          retainedCaptures,
        );
      }
      process.stdout.write(
        JSON.stringify({
          mode,
          family,
          versions: process.versions,
          phases,
          result,
        }) + "\n",
      );
      window.destroy();
      app.exit(0);
    })().catch(() => {
      console.error(
        "Font style evidence retention failed; partial artifacts preserved",
      );
      window.destroy();
      app.exit(1);
    });
  });
  await window.loadFile(path.join(directory, "index.html"));
  window.showInactive();
  setTimeout(() => app.exit(2), 60_000).unref();
}
void run().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
