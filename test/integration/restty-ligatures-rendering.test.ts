import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_RESTTY_LIGATURES_RESULT__";

interface StageResult {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly copiedText: string;
  readonly cursorReports: readonly string[];
  readonly starts: number;
  readonly closes: number;
  readonly canvasIdentity: number;
}

interface Result {
  readonly defaultEnabled: StageResult;
  readonly liveDisabled: StageResult;
  readonly liveReenabled: StageResult;
  readonly newSurfaceDisabled: StageResult;
  readonly enabledDiffersFromDisabled: boolean;
  readonly reenabledMatchesDefault: boolean;
  readonly newDisabledMatchesLiveDisabled: boolean;
  readonly disabledRegularMatchesIndividualGlyphs: boolean;
  readonly disabledBoldMatchesIndividualGlyphs: boolean;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

describe("Restty programming ligatures under production Electron policy", () => {
  it("renders bundled regular and bold operators as source glyphs when disabled, including live changes", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-restty-ligatures-"),
    );
    try {
      await buildFixture(root);
      const execution = await runFixture(root);
      const line = execution.stdout
        .split("\n")
        .find((entry) => entry.startsWith(resultPrefix));
      const result = line
        ? (JSON.parse(line.slice(resultPrefix.length)) as Result)
        : undefined;

      expect(
        execution.exitCode,
        `Ligature fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result).toBeDefined();
      expect(result!.enabledDiffersFromDisabled).toBe(true);
      expect(result!.disabledRegularMatchesIndividualGlyphs).toBe(true);
      expect(result!.disabledBoldMatchesIndividualGlyphs).toBe(true);
      expect(result!.reenabledMatchesDefault).toBe(true);
      expect(result!.newDisabledMatchesLiveDisabled).toBe(true);

      expect(result!.defaultEnabled).toMatchObject({ starts: 1, closes: 0 });
      expect(result!.liveDisabled).toMatchObject({ starts: 1, closes: 0 });
      expect(result!.liveReenabled).toMatchObject({ starts: 1, closes: 0 });
      expect(result!.newSurfaceDisabled).toMatchObject({
        starts: 2,
        closes: 1,
      });
      expect(result!.liveDisabled.canvasIdentity).toBe(
        result!.defaultEnabled.canvasIdentity,
      );
      expect(result!.liveReenabled.canvasIdentity).toBe(
        result!.defaultEnabled.canvasIdentity,
      );
      expect(result!.newSurfaceDisabled.canvasIdentity).not.toBe(
        result!.defaultEnabled.canvasIdentity,
      );

      for (const stage of [
        result!.defaultEnabled,
        result!.liveDisabled,
        result!.liveReenabled,
        result!.newSurfaceDisabled,
      ]) {
        expect(stage.cellWidth).toBeGreaterThan(0);
        expect(stage.cellHeight).toBeGreaterThan(0);
        expect(stage.cursorReports.join("")).toContain("\u001b[1;3R");
        expect(stage.copiedText).toContain("source => text");
        expect(stage.copiedText).toContain("界é🙂");
      }
      expect(result!.liveDisabled.cellWidth).toBe(
        result!.defaultEnabled.cellWidth,
      );
      expect(result!.liveDisabled.cellHeight).toBe(
        result!.defaultEnabled.cellHeight,
      );
      expect(result!.security).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  }, 120_000);
});

async function buildFixture(root: string): Promise<void> {
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: ["test/fixtures/restty-ligatures-renderer.ts"],
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
    writeFile(
      path.join(root, "index.html"),
      `<!doctype html><html style="--native-title-inset:0px"><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./renderer.css"></head><body><div id="terminal-window-content"><div id="terminal-tabs"></div></div><script src="./renderer.js"></script></body></html>`,
    ),
    copyFile(
      path.join(projectRoot, "src/renderer/terminal-window.css"),
      path.join(root, "renderer.css"),
    ),
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "omxterm-restty-ligatures", main: "main.cjs" })}\n`,
    ),
    writeFile(path.join(root, "main.cjs"), electronMainSource()),
    mkdir(path.join(root, "home"), { recursive: true }),
  ]);
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
  };
}
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 800,
    height: 500,
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

async function runFixture(root: string): Promise<{
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const chromiumArguments: string[] = [];
  applyChromiumSandboxPolicy({
    appendSwitch(name) {
      chromiumArguments.push(`--${name}`);
    },
  });
  const child = spawn(electronExecutable, [...chromiumArguments, root], {
    cwd: root,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      HOME: path.join(root, "home"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.on("data", (chunk: string) => (stderr += chunk));
  const timeout = setTimeout(() => {
    if (process.platform !== "win32" && child.pid)
      process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  }, 110_000);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  return { exitCode, stderr, stdout };
}
