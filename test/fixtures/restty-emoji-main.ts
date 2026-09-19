import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  installedFallbackFontData,
  readInstalledFontFace,
} from "../../src/main/installed-font-family";

declare global {
  var emojiReads: { bytes: number; largest: number };
}
globalThis.emojiReads = { bytes: 0, largest: 0 };

async function run(): Promise<void> {
  const root = process.argv[2]!;
  const input = process.argv[3]!;
  const configured = process.argv[4] === "configured";
  for (const name of ["userData", "sessionData"] as const) {
    const directory = path.join(root, name);
    await mkdir(directory, { recursive: true });
    app.setPath(name, directory);
  }
  const phases: unknown[] = [];
  ipcMain.handle("fonts", async () => {
    const fallbacks = await installedFallbackFontData(
      undefined,
      "darwin",
      undefined,
      (face, max) =>
        readInstalledFontFace(
          face.family === "Apple Color Emoji" ? { ...face, path: input } : face,
          max,
        ),
    );
    const selected = configured
      ? {
          family: "JetBrainsMono Nerd Font Mono",
          data: await readInstalledFontFace({
            family: "JetBrainsMono Nerd Font Mono",
            path: path.join(
              process.cwd(),
              "assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf",
            ),
            cellWidth: 10,
            cellHeight: 16,
          }),
        }
      : undefined;
    return { ...(selected ? { configured: selected } : {}), fallbacks };
  });
  await app.whenReady();
  const window = new BrowserWindow({
    width: 1000,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(root, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.on("console-message", (_event, _level, message) =>
    process.stderr.write(message + "\n"),
  );
  window.webContents.debugger.attach("1.3");
  ipcMain.handle("phase", async (_event, name: string) => {
    const heap: unknown = await window.webContents.debugger.sendCommand(
      "Runtime.getHeapUsage",
    );
    const memory = process.memoryUsage();
    const metrics = app
      .getAppMetrics()
      .map(({ type, memory }) => ({ type, memory }));
    await window.webContents.debugger.sendCommand(
      "HeapProfiler.collectGarbage",
    );
    const settledHeap: unknown = await window.webContents.debugger.sendCommand(
      "Runtime.getHeapUsage",
    );
    const settledMetrics = app
      .getAppMetrics()
      .map(({ type, memory }) => ({ type, memory }));
    const capture = await window.webContents.capturePage();
    const bitmap = capture.toBitmap();
    let ink = 0;
    for (let i = 0; i < bitmap.length; i += 4)
      if (Math.max(bitmap[i]!, bitmap[i + 1]!, bitmap[i + 2]!) > 100) ink += 1;
    phases.push({
      name,
      heap,
      settledHeap,
      settledMetrics,
      mainMemory: memory,
      metrics,
      hash: createHash("sha256").update(bitmap).digest("hex"),
      ink,
    });
    await writeFile(path.join(root, `${name}.png`), capture.toPNG());
  });
  ipcMain.on("report", (_event, result: unknown) => {
    process.stdout.write(
      JSON.stringify({
        result,
        phases,
        reads: globalThis.emojiReads,
        versions: process.versions,
      }) + "\n",
    );
    window.destroy();
    app.exit(0);
  });
  await window.loadFile(path.join(root, "index.html"));
  window.showInactive();
  setTimeout(() => {
    process.stderr.write("Fixture timeout\n");
    app.exit(2);
  }, 90000).unref();
}
void run().catch((error: unknown) => {
  process.stderr.write(String(error));
  app.exit(1);
});
