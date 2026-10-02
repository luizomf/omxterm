import { prepareFixture } from "./prepare-fixture";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { installedFallbackFontData } from "../../src/main/installed-font-family";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const resultPrefix = "__OMXTERM_RESTTY_LIGATURES_RESULT__";

export async function buildFixture(root: string): Promise<void> {
  return prepareFixture(root, async (start) => {
    const fallbacks = await installedFallbackFontData();
    const imports: string[] = [];
    const entries: string[] = [];
    for (const [index, font] of fallbacks.entries()) {
      await writeFile(path.join(root, `fallback-${index}.ttf`), font.data);
      imports.push(`import data${index} from './fallback-${index}.ttf';`);
      entries.push(
        `{ family: ${JSON.stringify(font.family)}, data: data${index} }`,
      );
    }
    const injected = path.join(root, "fallbacks.ts");
    await writeFile(
      injected,
      `${imports.join("\n")}\nexport const ligatureFixtureFallbacks = [${entries.join(",")}];`,
    );
    await build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/restty-ligatures-renderer.ts"],
      inject: [injected],
      format: "iife",
      loader: { ".ttf": "binary" },
      logLevel: "silent",
      outfile: path.join(root, "renderer.js"),
      platform: "browser",
    });
    const productionHtml = await readFile(
      path.join(projectRoot, "src/renderer/index.html"),
      "utf8",
    );
    const policy = productionHtml.match(/content="(?<policy>[^"]+)"/u)?.groups
      ?.policy;
    if (!policy) throw new Error("Production renderer CSP is missing");

    await Promise.all([
      start(() =>
        writeFile(
          path.join(root, "index.html"),
          `<!doctype html><html style="--native-title-inset:0px"><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./renderer.css"></head><body><div id="terminal-window-content"><div id="terminal-tabs"></div></div><script src="./renderer.js"></script></body></html>`,
        ),
      ),
      start(() =>
        copyFile(
          path.join(projectRoot, "src/renderer/terminal-window.css"),
          path.join(root, "renderer.css"),
        ),
      ),
      start(() =>
        writeFile(
          path.join(root, "package.json"),
          `${JSON.stringify({ name: "omxterm-restty-ligatures", main: "main.cjs" })}\n`,
        ),
      ),
      start(() => writeFile(path.join(root, "main.cjs"), electronMainSource())),
      start(() => mkdir(path.join(root, "home"), { recursive: true })),
    ]);
  });
}

function electronMainSource(): string {
  return `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
for (const name of ["userData", "sessionData"]) {
  const directory = path.join(__dirname, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
async function waitForState(window) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript("globalThis.__omxtermLigaturesState ?? null", true);
    if (state && state.cellWidth > 0 && state.cellHeight > 0) return state;
    const error = await window.webContents.executeJavaScript("document.body.dataset.fixtureError ?? null", true);
    if (error) throw new Error(error);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Restty ligature fixture timed out");
}
async function captureEvidence(window, state) {
  const bounds = await window.webContents.executeJavaScript("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()", true);
  const ratio = await window.webContents.executeJavaScript("devicePixelRatio", true);
  const cellWidth = state.cellWidth / ratio;
  const cellHeight = state.cellHeight / ratio;
  const capture = async (row, column, columns = 1) => {
    const image = await window.webContents.capturePage({
      x: Math.round(bounds.x + cellWidth * (column - 1)),
      y: Math.round(bounds.y + cellHeight * (row - 1)),
      width: Math.round(cellWidth * columns),
      height: Math.round(cellHeight),
    });
    return image.toBitmap();
  };
  return {
    regularRun: await capture(1, 1, 2),
    boldRun: await capture(2, 1, 2),
    regularFirst: await capture(1, 1),
    regularSecond: await capture(1, 2),
    regularFirstReference: await capture(3, 1),
    regularSecondReference: await capture(4, 2),
    boldFirst: await capture(2, 1),
    boldSecond: await capture(2, 2),
    boldFirstReference: await capture(5, 1),
    boldSecondReference: await capture(6, 2),
    unicode: await Promise.all([7, 8, 9, 10, 11, 12].map(row => capture(row, 1, 3))),
    coverage: await Promise.all([7, 9, 10, 11, 12].map(row => capture(row, 1))),
    missing: await capture(8, 1),
    markers: await Promise.all([9, 11, 12, 13].map(row => capture(row, 3))),
    combiningMarker: await capture(10, 2),
    singleMarker: await capture(14, 2),
  };
}
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 800,
    height: 800,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false },
  });
  await window.loadFile(path.join(__dirname, "index.html"));
  window.showInactive();

  const defaultEnabled = await waitForState(window);
  const enabledPixels = await captureEvidence(window, defaultEnabled);
  await window.webContents.executeJavaScript("globalThis.__omxtermSetLigatures(false)", true);
  const liveDisabled = await waitForState(window);
  const disabledPixels = await captureEvidence(window, liveDisabled);
  await window.webContents.executeJavaScript("globalThis.__omxtermSetLigatures(true)", true);
  const liveReenabled = await waitForState(window);
  const reenabledPixels = await captureEvidence(window, liveReenabled);
  await window.webContents.executeJavaScript("globalThis.__omxtermMountLigatures(false)", true);
  const newSurfaceDisabled = await waitForState(window);
  const newDisabledPixels = await captureEvidence(window, newSurfaceDisabled);
  const preferences = window.webContents.getLastWebPreferences();
  const result = {
    defaultEnabled,
    liveDisabled,
    liveReenabled,
    newSurfaceDisabled,
    enabledDiffersFromDisabled: !enabledPixels.regularRun.equals(disabledPixels.regularRun) && !enabledPixels.boldRun.equals(disabledPixels.boldRun),
    reenabledMatchesDefault: reenabledPixels.regularRun.equals(enabledPixels.regularRun) && reenabledPixels.boldRun.equals(enabledPixels.boldRun),
    newDisabledMatchesLiveDisabled: newDisabledPixels.regularRun.equals(disabledPixels.regularRun) && newDisabledPixels.boldRun.equals(disabledPixels.boldRun),
    disabledRegularMatchesIndividualGlyphs: disabledPixels.regularFirst.equals(disabledPixels.regularFirstReference) && disabledPixels.regularSecond.equals(disabledPixels.regularSecondReference),
    disabledBoldMatchesIndividualGlyphs: disabledPixels.boldFirst.equals(disabledPixels.boldFirstReference) && disabledPixels.boldSecond.equals(disabledPixels.boldSecondReference),
    unicodePixelsPreserved: disabledPixels.unicode.every((pixels, index) => pixels.equals(enabledPixels.unicode[index]) && pixels.equals(reenabledPixels.unicode[index]) && pixels.equals(newDisabledPixels.unicode[index])),
    glyphCoverage: disabledPixels.coverage.map(pixels => !pixels.equals(disabledPixels.missing) && pixels.some((value, index) => index % 4 !== 3 && value > 180)),
    cellSpansPreserved: [enabledPixels, disabledPixels, reenabledPixels, newDisabledPixels].every(pixels => pixels.markers.every(marker => marker.equals(pixels.markers[3])) && pixels.combiningMarker.equals(pixels.singleMarker)),
    security: {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
    },
  };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(result) + "\\n");
  window.destroy();
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  app.exit(1);
});
`;
}
