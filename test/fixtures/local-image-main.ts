import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, nativeImage } from "electron";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";

const resultPrefix = "__OMXTERM_LOCAL_IMAGE_RESULT__";

async function run() {
  for (const name of ["userData", "sessionData"] as const) {
    const directory = path.join(process.cwd(), name);
    mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  await app.whenReady();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const load = (filePath: string, source: "file-url" | "native-path") =>
    loadLocalImageForWindow(
      window,
      source === "file-url"
        ? { source, url: pathToFileURL(filePath).href }
        : { source, path: filePath },
      new AbortController().signal,
    );
  const loaded = await load(
    path.join(process.cwd(), "fixture%23#literal.data"),
    "native-path",
  );
  if (!loaded) throw new Error("PNG fixture was not loaded");
  const jpegBytes = nativeImage
    .createFromBuffer(Buffer.from(loaded.data))
    .toJPEG(90);
  const jpegPath = path.join(process.cwd(), "fixture-jpeg.data");
  await writeFile(jpegPath, jpegBytes);
  const jpeg = await load(jpegPath, "file-url");
  if (!jpeg) throw new Error("JPEG fixture was not loaded");
  await window.loadFile(path.join(process.cwd(), "preview.html"));
  const preview = [];
  for (const image of [loaded, jpeg]) {
    const payload = JSON.stringify({ ...image, data: [...image.data] });
    const opened: unknown = await window.webContents.executeJavaScript(
      `globalThis.__localImagePreviewProbe.open(${payload})`,
      true,
    );
    const dismissed: unknown = await window.webContents.executeJavaScript(
      "globalThis.__localImagePreviewProbe.dismiss()",
      true,
    );
    preview.push({ opened, dismissed });
  }
  const layouts = await measureLayouts(window);
  const devicePixelRatio: unknown = await window.webContents.executeJavaScript(
    "devicePixelRatio",
    true,
  );
  window.destroy();
  process.stdout.write(
    `${resultPrefix}${JSON.stringify({
      preview,
      layouts,
      devicePixelRatio,
      isolatedProfiles: (["userData", "sessionData"] as const).every(
        (name) => path.dirname(app.getPath(name)) === process.cwd(),
      ),
      mime: loaded.mime,
      width: loaded.width,
      height: loaded.height,
      bytes: loaded.data.byteLength,
      jpegMime: jpeg.mime,
      jpegWidth: jpeg.width,
      jpegHeight: jpeg.height,
    })}\n`,
  );
  app.exit(0);
}

async function measureLayouts(window: BrowserWindow) {
  const layouts: unknown[] = [];
  for (const [width, height] of [
    [3172, 1984],
    [1984, 3172],
    [8192, 100],
    [100, 8192],
    [32, 32],
  ]) {
    window.setContentSize(1600, 1000);
    await window.webContents.executeJavaScript(
      `globalThis.__localImagePreviewProbe.openGenerated(${width}, ${height})`,
      true,
    );
    for (const [windowWidth, windowHeight] of [
      [1600, 1000],
      [640, 480],
      [320, 200],
      [1600, 1000],
    ]) {
      window.setContentSize(windowWidth!, windowHeight!);
      layouts.push(
        await window.webContents.executeJavaScript(
          "globalThis.__localImagePreviewProbe.layout()",
          true,
        ),
      );
    }
    await window.webContents.executeJavaScript(
      "globalThis.__localImagePreviewProbe.dismiss()",
      true,
    );
  }
  return layouts;
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  app.exit(1);
});
