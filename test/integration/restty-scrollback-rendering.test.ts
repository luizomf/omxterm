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
const resultPrefix = "__OMXTERM_RESTTY_SCROLLBACK_RESULT__";

interface Metrics {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollTop: number;
  readonly sameCanvas: boolean;
}

interface Result {
  readonly viewport: {
    readonly outputTop: number;
    readonly typed: Metrics;
    readonly injected: Metrics;
    readonly writes: string[];
    readonly geometry: {
      sizes: { cols: number; rows: number }[];
      baseline: { cols: number; rows: number };
      hiddenSizes: { cols: number; rows: number }[];
      hiddenCanvasUnchanged: boolean;
      sameCanvas: boolean;
    };
  };
  readonly initial: Metrics;
  readonly scrolledTop: number;
  readonly autoscrollStartTop: number;
  readonly autoscrolledTop: number;
  readonly resized: Metrics;
  readonly reduced: Metrics;
  readonly selectedPixels: number;
  readonly zero: Metrics;
  readonly positiveAgain: Metrics;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

describe("Restty scrollback through the production Surface seam", () => {
  it("scrolls and selects retained text while live zero and re-enable keep the same core", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-restty-scrollback-"),
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
        `Scrollback fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result).toBeDefined();
      expect.soft(result!.viewport.outputTop).toBe(0);
      expect
        .soft(result!.viewport.typed.scrollTop)
        .toBe(
          result!.viewport.typed.scrollHeight -
            result!.viewport.typed.clientHeight,
        );
      expect
        .soft(result!.viewport.injected.scrollTop)
        .toBe(
          result!.viewport.injected.scrollHeight -
            result!.viewport.injected.clientHeight,
        );
      expect.soft(result!.viewport.writes).toContain("x");
      expect.soft(result!.viewport.writes).toContain("injected");
      expect.soft(result!.viewport.geometry.sameCanvas).toBe(true);
      expect.soft(result!.viewport.geometry.hiddenSizes).toEqual([]);
      expect.soft(result!.viewport.geometry.hiddenCanvasUnchanged).toBe(true);
      expect
        .soft(result!.viewport.geometry.sizes.at(-1)?.cols)
        .toBeLessThan(result!.viewport.geometry.baseline.cols);
      expect
        .soft(
          result!.viewport.geometry.sizes.every(
            ({ cols, rows }) => cols > 1 && rows > 1,
          ),
        )
        .toBe(true);
      expect(result!.initial.scrollHeight).toBeGreaterThan(
        result!.initial.clientHeight,
      );
      expect(result!.initial.scrollTop).toBeGreaterThan(0);
      expect(result!.scrolledTop).toBe(0);
      expect(result!.autoscrollStartTop).toBeGreaterThan(0);
      expect(result!.autoscrolledTop).toBeLessThan(result!.autoscrollStartTop);
      expect(result!.resized.sameCanvas).toBe(true);
      expect(result!.resized.scrollHeight).toBeGreaterThan(
        result!.resized.clientHeight,
      );
      expect(result!.reduced.scrollTop).toBeGreaterThanOrEqual(0);
      expect(result!.reduced.scrollTop).toBeLessThanOrEqual(
        result!.reduced.scrollHeight - result!.reduced.clientHeight,
      );
      expect(result!.reduced.scrollHeight).toBeLessThan(
        result!.initial.scrollHeight,
      );
      expect(result!.reduced.scrollHeight).toBeGreaterThan(
        result!.reduced.clientHeight,
      );
      expect(result!.reduced.sameCanvas).toBe(true);
      expect(result!.selectedPixels).toBeGreaterThan(0);
      expect(result!.zero.scrollHeight).toBe(result!.zero.clientHeight);
      expect(result!.zero.sameCanvas).toBe(true);
      expect(result!.positiveAgain.scrollHeight).toBeGreaterThan(
        result!.positiveAgain.clientHeight,
      );
      expect(result!.positiveAgain.sameCanvas).toBe(true);
      expect(result!.security).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});

async function buildFixture(root: string): Promise<void> {
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: ["test/fixtures/restty-scrollback-renderer.ts"],
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
      `${JSON.stringify({ name: "omxterm-restty-scrollback", main: "main.cjs" })}\n`,
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
async function waitFor(window, expression) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript(expression, true);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Restty scrollback fixture timed out");
}
function countSelection(bitmap) {
  let count = 0;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    const a = bitmap[offset], b = bitmap[offset + 1], c = bitmap[offset + 2];
    const near = (left, right) => Math.abs(left - right) <= 3;
    if ((near(a, 59) && near(b, 79) && near(c, 166)) || (near(a, 166) && near(b, 79) && near(c, 59))) count += 1;
  }
  return count;
}
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 800,
    height: 500,
    show: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false },
  });
  await window.loadFile(path.join(__dirname, "index.html"));
  await waitFor(window, "globalThis.__omxtermResttyScrollback?.ready ?? false");
  const initial = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.metrics()", true);
  const scrolledTop = await window.webContents.executeJavaScript(
    \`(() => {
      const host = document.querySelector('.restty-native-scroll-host');
      host.scrollTop = 0;
      host.dispatchEvent(new Event('scroll'));
      return host.scrollTop;
    })()\`, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await window.webContents.executeJavaScript(
    \`(() => {
      const canvas = document.querySelector('canvas');
      const bounds = canvas.getBoundingClientRect();
      const y = bounds.top + 40;
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, pointerType: 'mouse', button: 0, buttons: 1, clientX: bounds.left + 20, clientY: y }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 9, pointerType: 'mouse', button: 0, buttons: 1, clientX: bounds.left + 220, clientY: y }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9, pointerType: 'mouse', button: 0, buttons: 0, clientX: bounds.left + 220, clientY: y }));
    })()\`, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const autoscroll = await window.webContents.executeJavaScript(
    \`(() => {
      const host = document.querySelector('.restty-native-scroll-host');
      host.scrollTop = host.scrollHeight;
      host.dispatchEvent(new Event('scroll'));
      const bounds = document.querySelector('canvas').getBoundingClientRect();
      return { startTop: host.scrollTop, x: Math.floor(bounds.left + 80), startY: Math.floor(bounds.bottom - 30), endY: Math.floor(bounds.top) };
    })()\`, true);
  const autoscrollStartTop = autoscroll.startTop;
  window.webContents.sendInputEvent({ type: "mouseDown", x: autoscroll.x, y: autoscroll.startY, button: "left", clickCount: 1 });
  window.webContents.sendInputEvent({ type: "mouseMove", x: autoscroll.x, y: autoscroll.endY, button: "left", clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 500));
  window.webContents.sendInputEvent({ type: "mouseUp", x: autoscroll.x, y: autoscroll.endY, button: "left", clickCount: 1 });
  const autoscrolledTop = await window.webContents.executeJavaScript("document.querySelector('.restty-native-scroll-host').scrollTop", true);
  window.setSize(700, 440);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const resized = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.metrics()", true);
  const reduced = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.reduceHistory()", true);
  const selectedPixels = countSelection((await window.webContents.capturePage()).toBitmap());
  const zero = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.disableHistory()", true);
  const positiveAgain = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.enableHistory()", true);
  const geometry = await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.hiddenGeometry()', true);
  await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.scrollToTop()', true);
  const outputMetrics = await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.outputWhileScrolled()', true);
  window.webContents.sendInputEvent({ type: 'char', keyCode: 'x' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const typed = await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.metrics()', true);
  await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.scrollToTop()', true);
  await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.surface.inject('injected')", true);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const injected = await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.metrics()', true);
  const writes = await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.writes', true);
  const viewport = { geometry, outputTop: outputMetrics.scrollTop, typed, injected, writes };
  const preferences = window.webContents.getLastWebPreferences();
  const result = {
    viewport,
    initial,
    scrolledTop,
    autoscrollStartTop,
    autoscrolledTop,
    resized,
    reduced,
    selectedPixels,
    zero,
    positiveAgain,
    security: {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
    },
  };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(result) + "\\n");
  await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.surface.dispose()", true);
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
