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
const resultPrefix = "__OMXTERM_RESTTY_APPEARANCE_RESULT__";

interface Measurement {
  readonly size: number;
  readonly lineHeight: number;
  readonly padding: number;
  readonly nativeTitleInset: number;
  readonly containerPaddingTop: string;
  readonly cols: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly canvasCssWidth: number;
  readonly canvasCssHeight: number;
  readonly canvasBackingWidth: number;
  readonly canvasBackingHeight: number;
  readonly liveCellWidth: number;
  readonly liveCellHeight: number;
  readonly liveCols: number;
  readonly liveRows: number;
  readonly imeFontSize: string;
  readonly starts: number;
  readonly closes: number;
}

interface Result {
  readonly configuredFont: {
    readonly regularInk: number;
    readonly preservesConfiguredRendering: boolean;
  };
  readonly measurements: readonly Measurement[];
  readonly live: Measurement & {
    readonly sameCanvas: boolean;
    readonly closesBeforeDispose: number;
    readonly resizeCount: number;
    readonly containerPadding: readonly string[];
    readonly canvasCssWidth: number;
    readonly canvasCssHeight: number;
    readonly canvasBackingWidth: number;
    readonly canvasBackingHeight: number;
    readonly externalLinks: number;
  };
  readonly colorCounts: Record<string, number>;
  readonly fontRendering: {
    readonly regularInk: number;
    readonly boldInk: number;
    readonly firaCoverageInk: number;
    readonly dejaVuCoverageInk: number;
    readonly firaDiffersFromMissing: boolean;
    readonly dejaVuDiffersFromMissing: boolean;
  };
  readonly devicePixelRatio: number;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

const expectedColors = [
  "#010203",
  "#a1b2c3",
  "#314159",
  "#fefefe",
  "#101011",
  "#201012",
  "#102013",
  "#303014",
  "#101025",
  "#301026",
  "#103027",
  "#d0d0d8",
  "#505059",
  "#90105a",
  "#10905b",
  "#90905c",
  "#10109d",
  "#90109e",
  "#10909f",
  "#f0f0f0",
  "#123abc",
  "#abcdef",
] as const;

describe("Restty OMXTerm appearance under production Electron policy", () => {
  it("renders theme colors and preserves configured geometry through live updates", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-restty-appearance-"),
    );
    try {
      await buildFixture(root);
      const runs: Array<{
        readonly label: string;
        readonly requestedScaleFactor: number | undefined;
        readonly result: Result;
      }> = [];
      for (const requestedScaleFactor of [undefined, 1, 2] as const) {
        const execution = await runFixture(root, requestedScaleFactor);
        const line = execution.stdout
          .split("\n")
          .find((entry) => entry.startsWith(resultPrefix));
        const result = line
          ? (JSON.parse(line.slice(resultPrefix.length)) as Result)
          : undefined;
        const label = requestedScaleFactor
          ? `forced DPR ${requestedScaleFactor}`
          : "actual display DPR";

        expect(
          execution.exitCode,
          `${label} appearance fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
        ).toBe(0);
        expect(result, label).toBeDefined();
        runs.push({ label, requestedScaleFactor, result: result! });
      }
      const evidencePath = process.env.OMXTERM_RESTTY_APPEARANCE_EVIDENCE_PATH;
      if (evidencePath)
        await writeFile(
          evidencePath,
          `${JSON.stringify(
            {
              platform: process.platform,
              architecture: process.arch,
              runs: runs.map(({ label, requestedScaleFactor, result }) => ({
                label,
                requestedScaleFactor,
                devicePixelRatio: result.devicePixelRatio,
                measurements: result.measurements,
                live: result.live,
              })),
            },
            undefined,
            2,
          )}\n`,
        );

      expect(runs[1]!.result.devicePixelRatio).toBeCloseTo(1, 5);
      expect(runs[2]!.result.devicePixelRatio).toBeCloseTo(2, 5);
      for (const run of runs) assertFontGeometry(run.result, run.label);
      for (const size of [1, 8, 10, 16, 64, 72]) {
        const dpr1 = fontMeasurement(runs[1]!.result, size);
        const dpr2 = fontMeasurement(runs[2]!.result, size);
        expect(
          Math.abs(
            dpr1.cellWidth / runs[1]!.result.devicePixelRatio -
              dpr2.cellWidth / runs[2]!.result.devicePixelRatio,
          ),
          `normalized CSI width at size ${size}`,
        ).toBeLessThanOrEqual(0.5);
      }

      const result = runs[0]!.result;
      const measurements = result.measurements;
      const size8 = measurements.find((entry) => entry.size === 8)!;
      const size16 = measurements.find(
        (entry) =>
          entry.size === 16 &&
          entry.lineHeight === 1 &&
          entry.padding === 0 &&
          entry.nativeTitleInset === 0,
      )!;
      const size72 = measurements.find((entry) => entry.size === 72)!;
      const line2 = measurements.find((entry) => entry.lineHeight === 2)!;
      const padding128 = measurements.find((entry) => entry.padding === 128)!;
      const size1 = measurements.find((entry) => entry.size === 1)!;
      const titleInset = measurements.find(
        (entry) => entry.nativeTitleInset === 30,
      )!;

      expect(size8.cols).toBeGreaterThan(size16.cols);
      expect(size16.cols).toBeGreaterThan(size72.cols);
      expect(size1.cols).toBeGreaterThan(size8.cols);
      expect(size72.cellWidth).toBeGreaterThan(size16.cellWidth);
      expect(line2.cols).toBe(size16.cols);
      expect(line2.cellWidth).toBeCloseTo(size16.cellWidth, 5);
      expect(line2.cellHeight).toBeGreaterThanOrEqual(
        size16.cellHeight * 2 - 1,
      );
      expect(line2.rows).toBeLessThan(size16.rows);
      expect(line2.imeFontSize).toBe(size16.imeFontSize);
      expect(padding128.cols).toBeLessThan(size16.cols);
      expect(padding128.rows).toBeLessThan(size16.rows);
      expect(titleInset.cols).toBe(size16.cols);
      expect(titleInset.rows).toBeLessThan(size16.rows);
      expect(titleInset.containerPaddingTop).toBe("30px");
      expect(measurements.every((entry) => entry.starts === 1)).toBe(true);

      expect(result!.live).toMatchObject({
        sameCanvas: true,
        starts: 1,
        closesBeforeDispose: 0,
        externalLinks: 0,
      });
      expect(result!.live.resizeCount).toBeGreaterThan(1);
      expect(result!.live.containerPadding).toEqual([
        "128px",
        "128px",
        "128px",
        "128px",
      ]);
      expect(result!.live.cols).toBe(padding128.cols);
      expect(result!.live.rows).toBe(padding128.rows);
      expect(result!.live.cellWidth).toBeCloseTo(size16.cellWidth, 5);
      expect(result!.live.cellHeight).toBe(size16.cellHeight);
      expect(result!.live.cellHeight).toBeLessThan(line2.cellHeight);
      expect(result!.live.imeFontSize).toBe(size16.imeFontSize);
      expect(result!.live.canvasCssWidth).toBeGreaterThan(0);
      expect(result!.live.canvasCssHeight).toBeGreaterThan(0);
      expect(result!.devicePixelRatio).toBeGreaterThanOrEqual(1);
      expect(result!.live.canvasBackingWidth).toBeCloseTo(
        result!.live.canvasCssWidth * result!.devicePixelRatio,
        0,
      );
      expect(result!.live.canvasBackingHeight).toBeCloseTo(
        result!.live.canvasCssHeight * result!.devicePixelRatio,
        0,
      );
      for (const color of expectedColors)
        expect(result!.colorCounts[color], color).toBeGreaterThan(0);
      expect(result!.colorCounts["#201012"]).toBeGreaterThan(
        result!.colorCounts["#90105a"]!,
      );
      expect(result!.fontRendering.boldInk).toBeGreaterThan(
        result!.fontRendering.regularInk,
      );
      expect(result!.fontRendering.firaCoverageInk).toBeGreaterThan(20);
      expect(result!.fontRendering.dejaVuCoverageInk).toBeGreaterThan(20);
      expect(result!.fontRendering.firaDiffersFromMissing).toBe(true);
      expect(result!.fontRendering.dejaVuDiffersFromMissing).toBe(true);
      expect(result!.configuredFont.regularInk).toBeGreaterThan(20);
      expect(result!.configuredFont.preservesConfiguredRendering).toBe(true);
      expect(result!.security).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      // Windows can retain Chromium profile handles briefly after child exit.
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  }, 240_000);
});

function fontMeasurement(result: Result, size: number): Measurement {
  return result.measurements.find(
    (entry) =>
      entry.size === size &&
      entry.lineHeight === 1 &&
      entry.padding === 0 &&
      entry.nativeTitleInset === 0,
  )!;
}

function assertFontGeometry(result: Result, label: string): void {
  const size1 = fontMeasurement(result, 1);
  const size8 = fontMeasurement(result, 8);
  const size10 = fontMeasurement(result, 10);
  const size16 = fontMeasurement(result, 16);
  const size64 = fontMeasurement(result, 64);
  const size72 = fontMeasurement(result, 72);
  const cssCellWidth = (entry: Measurement) =>
    entry.cellWidth / result.devicePixelRatio;

  expect(size1.cols, label).toBeGreaterThan(size8.cols);
  expect(size8.cols, label).toBeGreaterThan(size10.cols);
  expect(size10.cols, label).toBeGreaterThan(size16.cols);
  expect(size16.cols, label).toBeGreaterThan(size64.cols);
  expect(size64.cols, label).toBeGreaterThan(size72.cols);
  expect(cssCellWidth(size1), label).toBeLessThan(cssCellWidth(size8));
  expect(cssCellWidth(size8), label).toBeLessThan(cssCellWidth(size10));
  expect(cssCellWidth(size10), label).toBeLessThan(cssCellWidth(size16));
  expect(cssCellWidth(size16), label).toBeLessThan(cssCellWidth(size64));
  expect(cssCellWidth(size64), label).toBeLessThan(cssCellWidth(size72));
  for (const entry of result.measurements) {
    expect(entry.liveCellWidth, `${label}, size ${entry.size} live width`).toBe(
      entry.cellWidth,
    );
    expect(
      entry.liveCellHeight,
      `${label}, size ${entry.size} live height`,
    ).toBe(entry.cellHeight);
    expect(entry.liveCols, `${label}, size ${entry.size} live columns`).toBe(
      entry.cols,
    );
    expect(entry.liveRows, `${label}, size ${entry.size} live rows`).toBe(
      entry.rows,
    );
    expect(entry.starts, `${label}, size ${entry.size} readiness`).toBe(1);
    expect(entry.closes, `${label}, size ${entry.size} lifecycle`).toBe(0);
    expect(
      entry.cellWidth,
      `${label}, size ${entry.size} CSI width`,
    ).toBeGreaterThan(0);
    expect(
      entry.cellHeight,
      `${label}, size ${entry.size} CSI height`,
    ).toBeGreaterThan(0);
    const cssCellWidth = entry.cellWidth / result.devicePixelRatio;
    const cssCellHeight = entry.cellHeight / result.devicePixelRatio;
    const unusedWidth = entry.canvasCssWidth - entry.cols * cssCellWidth;
    const unusedHeight = entry.canvasCssHeight - entry.rows * cssCellHeight;
    expect(
      unusedWidth,
      `${label}, size ${entry.size} CSI backing-pixel width`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      unusedWidth,
      `${label}, size ${entry.size} CSI backing-pixel width`,
    ).toBeLessThan(cssCellWidth + 1);
    expect(
      unusedHeight,
      `${label}, size ${entry.size} CSI backing-pixel height`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      unusedHeight,
      `${label}, size ${entry.size} CSI backing-pixel height`,
    ).toBeLessThan(cssCellHeight + 1);
    expect(
      entry.canvasCssWidth,
      `${label}, size ${entry.size} CSS width`,
    ).toBeGreaterThan(0);
    expect(
      entry.canvasCssHeight,
      `${label}, size ${entry.size} CSS height`,
    ).toBeGreaterThan(0);
    expect(
      entry.canvasBackingWidth,
      `${label}, size ${entry.size} backing width`,
    ).toBeCloseTo(entry.canvasCssWidth * result.devicePixelRatio, 0);
    expect(
      entry.canvasBackingHeight,
      `${label}, size ${entry.size} backing height`,
    ).toBeCloseTo(entry.canvasCssHeight * result.devicePixelRatio, 0);
  }
}

async function buildFixture(root: string): Promise<void> {
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: ["test/fixtures/restty-appearance-renderer.ts"],
    plugins: [
      {
        name: "configured-font-reference",
        setup(builder) {
          builder.onLoad(
            { filter: /terminal-font-stack\.ts$/ },
            async ({ path: sourcePath }) => {
              // Differential rendering reference: the existing configured-family
              // policy has regular faces only. Keep the production caller/runtime.
              const source = await readFile(sourcePath, "utf8");
              return {
                loader: "ts",
                contents:
                  source.replace(
                    "export function terminalFontInputs",
                    "function productionTerminalFontInputs",
                  ) +
                  `
export function terminalFontInputs(data: TerminalFontData): TerminalFontInput[] {
  const fonts = productionTerminalFontInputs(data);
  return document.body.dataset.referenceFonts === 'true' ? fonts.filter(font => font.weight !== 700) : fonts;
}`,
              };
            },
          );
        },
      },
    ],
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
      `${JSON.stringify({ name: "omxterm-restty-appearance", main: "main.cjs" })}\n`,
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
const expectedColors = ${JSON.stringify(expectedColors)};
const countColors = (bitmap) => {
  const counts = Object.fromEntries(expectedColors.map((color) => [color, 0]));
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const a = bitmap[offset], b = bitmap[offset + 1], c = bitmap[offset + 2];
    for (const color of expectedColors) {
      const r = Number.parseInt(color.slice(1, 3), 16);
      const g = Number.parseInt(color.slice(3, 5), 16);
      const bl = Number.parseInt(color.slice(5, 7), 16);
      const near = (left, right) => Math.abs(left - right) <= 3;
      if ((near(a, r) && near(b, g) && near(c, bl)) || (near(a, bl) && near(b, g) && near(c, r))) counts[color] += 1;
    }
  }
  return counts;
};
async function waitForResult(window) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript("globalThis.__omxtermResttyAppearanceResult ?? null", true);
    if (result) return result;
    const error = await window.webContents.executeJavaScript('document.body.dataset.fixtureError ?? null', true);
    if (error) throw new Error(error);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Restty appearance fixture timed out");
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
  let result = await waitForResult(window);
  let bounds = await window.webContents.executeJavaScript("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()", true);
  const cellWidth = result.live.cellWidth / result.devicePixelRatio;
  const cellHeight = result.live.cellHeight / result.devicePixelRatio;
  const x = Math.round(bounds.x + cellWidth * 0.5);
  const y = Math.round(bounds.y + cellHeight * 2.5);
  await window.webContents.executeJavaScript(\`(() => {
    const canvas = document.querySelector('canvas');
    const start = { x: \${x + cellWidth * 8}, y: \${y} };
    const end = { x: \${x + cellWidth * 13}, y: \${y} };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: start.x, clientY: start.y }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 1, clientX: end.x, clientY: end.y }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'mouse', button: 0, buttons: 0, clientX: end.x, clientY: end.y }));
  })()\`, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const image = await window.webContents.capturePage();
  if (process.env.OMXTERM_RESTTY_APPEARANCE_SCREENSHOT_PATH)
    fs.writeFileSync(process.env.OMXTERM_RESTTY_APPEARANCE_SCREENSHOT_PATH, image.toPNG());
  const captureInk = async (row) => {
    const region = await window.webContents.capturePage({
      x: Math.floor(bounds.x),
      y: Math.floor(bounds.y + (result.live.cellHeight / result.devicePixelRatio) * (row - 1)),
      width: Math.ceil((result.live.cellWidth / result.devicePixelRatio) * 8),
      height: Math.ceil(result.live.cellHeight / result.devicePixelRatio),
    });
    const bitmap = region.toBitmap();
    let ink = 0;
    for (let offset = 0; offset < bitmap.length; offset += 4)
      if (Math.max(bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]) > 40) ink += 1;
    return { ink, bitmap };
  };
  const [regular, bold, firaCoverage, dejaVuCoverage, missing] = await Promise.all(
    [4, 5, 6, 7, 8].map(captureInk),
  );
  const preferences = window.webContents.getLastWebPreferences();
  const complete = {
    ...result,
    colorCounts: countColors(image.toBitmap()),
    fontRendering: {
      regularInk: regular.ink,
      boldInk: bold.ink,
      firaCoverageInk: firaCoverage.ink,
      dejaVuCoverageInk: dejaVuCoverage.ink,
      firaDiffersFromMissing: !firaCoverage.bitmap.equals(missing.bitmap),
      dejaVuDiffersFromMissing: !dejaVuCoverage.bitmap.equals(missing.bitmap),
    },
    security: {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
    },
  };
  await window.webContents.executeJavaScript('globalThis.__omxtermRenderConfiguredFont(false)', true);
  result = await waitForResult(window);
  bounds = await window.webContents.executeJavaScript("(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()", true);
  const configuredRegular = await captureInk(4);
  const configuredBold = await captureInk(5);
  await window.webContents.executeJavaScript('globalThis.__omxtermRenderConfiguredFont(true)', true);
  result = await waitForResult(window);
  const referenceRegular = await captureInk(4);
  const referenceBold = await captureInk(5);
  complete.configuredFont = { regularInk: configuredRegular.ink, preservesConfiguredRendering: configuredRegular.bitmap.equals(referenceRegular.bitmap) && configuredBold.bitmap.equals(referenceBold.bitmap) };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(complete) + "\\n");
  window.destroy();
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  app.exit(1);
});
`;
}

async function runFixture(
  root: string,
  scaleFactor?: number,
): Promise<{
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
  if (scaleFactor !== undefined)
    chromiumArguments.push(`--force-device-scale-factor=${scaleFactor}`);
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
