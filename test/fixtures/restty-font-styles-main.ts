import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { isTerminalFontData } from "../../src/shared/terminal-font-data";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

function inkBounds(bitmap: Buffer, blank: Buffer, width: number) {
  let top = Infinity;
  let bottom = -1;
  let coverage = 0;
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
  }
  return { height: bottom < 0 ? 0 : bottom - top + 1, coverage };
}

const directory = process.argv[2]!;
const mode = process.argv[3]!;
const family = process.argv[4]!;
async function run() {
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
  let blankBitmap: Buffer | undefined;
  ipcMain.handle(
    "phase",
    async (_event, name: string, capture: boolean, store: unknown) => {
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
      const ink =
        bitmap && blankBitmap && image
          ? inkBounds(bitmap, blankBitmap, image.getSize().width)
          : undefined;
      phases.push({
        name,
        store,
        heap,
        metrics,
        diagnosticHeap,
        diagnosticMetrics,
        ...(bitmap
          ? { hash: createHash("sha256").update(bitmap).digest("hex"), ink }
          : {}),
      });
    },
  );
  ipcMain.on("report", (_event, result: unknown) => {
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
  });
  await window.loadFile(path.join(directory, "index.html"));
  window.showInactive();
  setTimeout(() => app.exit(2), 60_000).unref();
}
void run().catch((error: unknown) => {
  console.error(error);
  app.exit(1);
});
