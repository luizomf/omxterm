import { prepareFixture } from "./prepare-fixture";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const resultPrefix = "__OMXTERM_RESTTY_RESULT__";

export async function buildFixture(root: string): Promise<void> {
  return prepareFixture(root, async (start) => {
    await build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/restty-renderer.ts"],
      format: "iife",
      loader: { ".ttf": "binary" },
      logLevel: "silent",
      outfile: path.join(root, "renderer.js"),
      platform: "browser",
    });
    await build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/text-rendering-evidence.ts"],
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(root, "text-rendering-evidence.cjs"),
      platform: "node",
    });
    const productionHtml = await readFile(
      path.join(projectRoot, "src", "renderer", "index.html"),
      "utf8",
    );
    const policy = productionHtml.match(/content="(?<policy>[^"]+)"/u)?.groups
      ?.policy;
    if (!policy) throw new Error("Production renderer CSP is missing");

    await Promise.all([
      start(() =>
        writeFile(
          path.join(root, "index.html"),
          `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./renderer.css"></head><body><main id="terminal"></main><script src="./renderer.js"></script></body></html>`,
        ),
      ),
      start(() =>
        writeFile(
          path.join(root, "renderer.css"),
          "html,body,#terminal,.pane-split,.pane{width:100%;height:100%;margin:0;overflow:hidden;background:#000}.pane-split{display:flex}.pane{position:relative;flex:1}.pane-canvas{display:block;width:100%;height:100%}",
        ),
      ),
      start(() =>
        writeFile(
          path.join(root, "package.json"),
          `${JSON.stringify({ name: "omxterm-restty-fixture", main: "main.cjs" })}\n`,
        ),
      ),
      start(() => writeFile(path.join(root, "main.cjs"), electronMainSource())),
      start(() =>
        copyFile(path.join(projectRoot, "LICENSE"), path.join(root, "LICENSE")),
      ),
      start(() => mkdir(path.join(root, "home"), { recursive: true })),
    ]);
  });
}

function electronMainSource(): string {
  return `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { hasTextRenderingEvidence } = require("./text-rendering-evidence.cjs");
for (const name of ["userData", "sessionData"]) {
  const directory = path.join(__dirname, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
async function waitForResult(window) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript("globalThis.__omxtermResttyResult ?? null", true);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Restty renderer fixture timed out");
}
async function open(search = "") {
  const window = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false },
  });
  if (process.platform === "linux" || process.platform === "win32") window.showInactive();
  await window.loadFile(path.join(__dirname, "index.html"), { search });
  return window;
}
app.whenReady().then(async () => {
  const availableWindow = await open();
  const available = await waitForResult(availableWindow);
  if (!available.textCapture) throw new Error("Text capture region is missing");
  const blank = await availableWindow.webContents.capturePage(available.textCapture);
  await availableWindow.webContents.executeJavaScript("globalThis.__omxtermResttyShowText()", true);
  const image = await availableWindow.webContents.capturePage(available.textCapture);
  if (process.env.OMXTERM_RESTTY_SCREENSHOT_PATH) {
    fs.writeFileSync(process.env.OMXTERM_RESTTY_SCREENSHOT_PATH, image.toPNG());
    fs.writeFileSync(process.env.OMXTERM_RESTTY_SCREENSHOT_PATH + ".blank.png", blank.toPNG());
  }
  const size = image.getSize();
  const blankSize = blank.getSize();
  // Crop spans 18 cells: OMXTerm (7), space, Restty (6), space, Olá (3).
  // Scale from captured pixels rather than assuming a desktop DPI.
  const regions = [[0, 7], [8, 14], [15, 18]].map(([start, end]) => ({
    x: Math.floor(start * size.width / 18), y: 0,
    width: Math.floor(end * size.width / 18) - Math.floor(start * size.width / 18),
    height: size.height,
  }));
  const textRenderingEvidence = blankSize.width === size.width && blankSize.height === size.height &&
    hasTextRenderingEvidence(blank.toBitmap(), image.toBitmap(), size.width, size.height, regions);
  const preferences = availableWindow.webContents.getLastWebPreferences();
  const unavailableWindow = await open("unavailable=1");
  const unavailable = await waitForResult(unavailableWindow);
  availableWindow.destroy();
  unavailableWindow.destroy();
  const result = {
    available,
    unavailable,
    textRenderingEvidence,
    textCaptureSize: size,
    security: {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
    },
  };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(result) + "\\n");
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  app.exit(1);
});
`;
}
