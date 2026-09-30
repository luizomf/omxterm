import { createReadStream, mkdirSync } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeImage } from "electron";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";
import { createLocalImageIpcBoundary } from "../../src/main/local-image-ipc";
import { terminalIpc } from "../../src/shared/terminal-ipc";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function run() {
  for (const name of ["userData", "sessionData"] as const) {
    const directory = path.join(process.cwd(), name);
    mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  await app.whenReady();
  const window = new BrowserWindow({
    width: 960,
    height: 640,
    show: true,
    webPreferences: {
      preload: path.join(process.cwd(), "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const boundary = createLocalImageIpcBoundary({
    load: (request, signal) => loadLocalImageForWindow(window, request, signal),
    isOwnerLost: () => window.isDestroyed(),
    reject: () => {
      throw new Error("Unexpected invalid IPC request");
    },
  });
  ipcMain.handle(terminalIpc.localImage, (event, request: unknown) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("Foreign image request");
    return boundary.request(request);
  });
  window.on("closed", () => boundary.dispose());
  // Generate a real JPEG before observation starts; source PNGs are never changed.
  const original = await readFile(path.join(process.cwd(), "sample-a.png"));
  await writeFile(
    path.join(process.cwd(), "sample-a.jpg"),
    nativeImage.createFromBuffer(original).toJPEG(90),
  );
  const sources = (await readdir(process.cwd())).filter((name) =>
    /\.(?:png|jpg|webp)$/u.test(name),
  );
  const hashes = async () =>
    Promise.all(
      sources.map(async (name) => {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(
          path.join(process.cwd(), name),
        ))
          hash.update(chunk as Buffer);
        return hash.digest("hex");
      }),
    );
  const originalHashes = await hashes();
  await window.loadFile(path.join(process.cwd(), "preview.html"));
  const snapshots: unknown[] = [];
  const sample = () =>
    app.getAppMetrics().map(({ pid, type, memory }) => ({ pid, type, memory }));
  let peakWorkingSetKiB = 0;
  let longestMainTickMs = 0;
  let lastTick = performance.now();
  const observe = () => {
    const now = performance.now();
    longestMainTickMs = Math.max(longestMainTickMs, now - lastTick);
    lastTick = now;
    const processes = sample();
    peakWorkingSetKiB = Math.max(
      peakWorkingSetKiB,
      processes.reduce((sum, row) => sum + row.memory.workingSetSize, 0),
    );
    return processes;
  };
  const timer = setInterval(observe, 50);
  const evaluate = (expression: string) =>
    window.webContents.executeJavaScript(expression, true);
  const baseline = observe();
  const displayed = [];
  for (const filename of [
    "sample-a.png",
    "sample-b.png",
    "pixel-ceiling.png",
    "byte-ceiling.png",
    "sample-a.jpg",
  ]) {
    const start = performance.now();
    const state: unknown = await evaluate(
      `__capacity.open(${JSON.stringify(path.join(process.cwd(), filename))})`,
    );
    const latencyMs = performance.now() - start;
    const memory = observe();
    const capture = await window.webContents.capturePage();
    // Synthetic samples have a solid green region on the right. Actual capture proves it
    // was presented, rather than only decoded into a detached image element.
    const bitmap = capture.toBitmap();
    let greenPixels = 0;
    for (let offset = 0; offset < bitmap.length; offset += 4)
      if (
        bitmap[offset + 1]! > 180 &&
        bitmap[offset]! < 80 &&
        bitmap[offset + 2]! < 80
      )
        greenPixels += 1;
    displayed.push({ filename, state, latencyMs, greenPixels, memory });
    const dismissed: unknown = await evaluate("__capacity.dismiss()");
    snapshots.push({ filename, dismissed });
    await wait(1000);
  }
  const cycles = [];
  for (let cycle = 0; cycle < 12; cycle += 1) {
    const filename = cycle % 2 ? "sample-b.png" : "sample-a.png";
    const start = performance.now();
    const opened: unknown = await evaluate(
      `__capacity.open(${JSON.stringify(path.join(process.cwd(), filename))})`,
    );
    observe();
    const dismissed: unknown = await evaluate("__capacity.dismiss()");
    await wait(1000);
    cycles.push({
      cycle,
      filename,
      latencyMs: performance.now() - start - 1000,
      opened,
      dismissed,
      settled: observe(),
    });
  }
  await wait(5000);
  const settled = observe();
  const errors = [];
  for (const filename of [
    "corrupt.png",
    "animated.png",
    "unsupported.webp",
    "over-bytes.png",
    "over-pixels.png",
    "over-side.png",
    "missing.png",
  ]) {
    const state: unknown = await evaluate(
      `__capacity.open(${JSON.stringify(path.join(process.cwd(), filename))})`,
    );
    errors.push({ filename, state });
    await evaluate("__capacity.dismiss()");
  }
  const disposed: unknown = await evaluate(
    `__capacity.disposeDuringDecode(${JSON.stringify(path.join(process.cwd(), "sample-a.png"))})`,
  );
  clearInterval(timer);
  const final = observe();
  const sourceFilesUnchanged =
    JSON.stringify(await hashes()) === JSON.stringify(originalHashes);
  window.destroy();
  process.stdout.write(
    `__OMXTERM_CAPACITY_RESULT__${JSON.stringify({ platform: process.platform, arch: process.arch, baseline, displayed, snapshots, cycles, settled, final, errors, disposed, peakWorkingSetKiB, longestMainTickMs, gpu: app.getGPUFeatureStatus(), sourceFilesUnchanged })}\n`,
  );
  app.exit(0);
}
void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  app.exit(1);
});
