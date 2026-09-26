import { spawn } from "node:child_process";
import {
  depthExperimentSource,
  verifyDepthEvidence,
  type DepthPhase,
} from "../fixtures/restty-depth-evidence";
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
  readonly depth: DepthPhase[];
  readonly hidden: {
    synchronizedReveal: {
      batchedClears: number;
      before: number[];
      selected: number[];
      focused: number[];
      completed: number[];
    };
    ingestion: {
      acked: boolean;
      titles: string[];
      bells: number;
      replies: number;
      retained: boolean;
      ordered: boolean;
    };
    lifecycle: {
      rapidRefreshes: number;
      deadRafCallbacks: number;
      mountCalls: Record<string, number>;
      beforeClose: Record<string, number>;
      afterClose: Record<string, number>;
      hiddenClosed: boolean;
      pendingClosed: boolean;
      usable: boolean;
    };
    images: {
      retained: { red: number; green: number };
      retainedAgain: { red: number; green: number };
      deleted: {
        name: string;
        acked: boolean;
        visible: { red: number };
        revealed: { red: number };
        hiddenClears: number;
        releasedTextures: number;
      }[];
      disposal: {
        releasedTextures: number;
        hiddenClears: number;
        detached: boolean;
      };
    };
    idle: { surfaces: Record<string, number>[] };
    output: { surfaces: Record<string, number>[] };
    reveal: {
      geometry: {
        cursor: { row: number; col: number };
        rows: number;
        cols: number;
      };
      foregroundPixels: number;
      cursorForeground: number;
      revealedSize: { rows: number; cols: number };
      baseline: { rows: number; cols: number };
      pixel: number[];
      calls: Record<string, number>;
      hiddenSizes: unknown[];
      sameCanvas: boolean;
      canvasWidth: number;
      expectedWidth: number;
    };
  };
  readonly resizeAtBottom: {
    readonly before: Metrics;
    readonly reduced: Metrics;
    readonly restored: Metrics;
  };
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
      if (process.env.OMXTERM_HIDDEN_EVIDENCE)
        await writeFile(
          process.env.OMXTERM_HIDDEN_EVIDENCE,
          JSON.stringify(result!.hidden, null, 2) + "\n",
        );
      await verifyDepthEvidence(result!);
      for (const measurement of [result!.hidden.idle, result!.hidden.output]) {
        for (const [name, count] of Object.entries(measurement.surfaces[0]!))
          if (name !== "deleteTexture")
            expect.soft(count, `hidden ${name}`).toBe(0);
        expect.soft(measurement.surfaces[1]!.clear).toBeGreaterThan(0);
      }
      const synchronized = result!.hidden.synchronizedReveal;
      expect.soft(synchronized.batchedClears).toBe(0);
      expect.soft(synchronized.before).toEqual([12, 34, 56, 255]);
      expect.soft(synchronized.selected).toEqual(synchronized.before);
      expect.soft(synchronized.focused).toEqual(synchronized.before);
      expect.soft(synchronized.completed).toEqual([65, 43, 21, 255]);
      expect.soft(result!.hidden.reveal.pixel).toEqual([12, 34, 56, 255]);
      expect.soft(result!.hidden.reveal.foregroundPixels).toBeGreaterThan(0);
      expect.soft(result!.hidden.reveal.cursorForeground).toBeGreaterThan(0);
      expect.soft(result!.hidden.reveal.geometry.cursor.col).toBe(14);
      expect
        .soft(result!.hidden.reveal.geometry.cursor.row)
        .toBeLessThan(result!.hidden.reveal.revealedSize.rows);
      expect
        .soft(result!.hidden.reveal.geometry.rows)
        .toBe(result!.hidden.reveal.revealedSize.rows);
      expect
        .soft(result!.hidden.reveal.geometry.cols)
        .toBe(result!.hidden.reveal.revealedSize.cols);
      expect
        .soft(result!.hidden.reveal.revealedSize.cols)
        .toBeLessThan(result!.hidden.reveal.baseline.cols);
      expect.soft(result!.hidden.reveal.calls.clear).toBeGreaterThan(0);
      expect.soft(result!.hidden.reveal.hiddenSizes).toEqual([]);
      expect.soft(result!.hidden.reveal.sameCanvas).toBe(true);
      expect
        .soft(result!.hidden.reveal.canvasWidth)
        .toBe(result!.hidden.reveal.expectedWidth);
      expect.soft(result!.hidden.ingestion).toEqual({
        acked: true,
        titles: ["hidden-title"],
        bells: 1,
        replies: 1,
        retained: true,
        ordered: true,
      });
      const lifetime = result!.hidden.lifecycle;
      expect.soft(lifetime.rapidRefreshes).toBe(8);
      expect.soft(lifetime.deadRafCallbacks).toBe(0);
      for (const name of [
        "clear",
        "drawArraysInstanced",
        "bufferSubData",
        "texImage2D",
        "texSubImage2D",
      ])
        expect
          .soft(lifetime.mountCalls[name] ?? 0, `hidden mount ${name}`)
          .toBe(0);
      expect
        .soft(lifetime.afterClose.clear ?? 0)
        .toBe(lifetime.beforeClose.clear ?? 0);
      expect
        .soft(
          lifetime.hiddenClosed && lifetime.pendingClosed && lifetime.usable,
        )
        .toBe(true);
      expect
        .soft(result!.hidden.images.retainedAgain)
        .toEqual(result!.hidden.images.retained);
      expect.soft(result!.hidden.images.retained.red).toBeGreaterThan(0);
      expect.soft(result!.hidden.images.retained.green).toBeGreaterThan(0);
      for (const deletion of result!.hidden.images.deleted) {
        expect.soft(deletion.acked, deletion.name).toBe(true);
        expect.soft(deletion.visible.red, deletion.name).toBeGreaterThan(0);
        expect.soft(deletion.revealed.red, deletion.name).toBe(0);
        expect.soft(deletion.hiddenClears, deletion.name).toBe(0);
        expect
          .soft(deletion.releasedTextures, deletion.name)
          .toBeGreaterThan(0);
      }
      expect.soft(result!.hidden.images.disposal.detached).toBe(true);
      expect.soft(result!.hidden.images.disposal.hiddenClears).toBe(0);
      expect
        .soft(result!.hidden.images.disposal.releasedTextures)
        .toBeGreaterThan(0);
      for (const metrics of Object.values(result!.resizeAtBottom)) {
        expect
          .soft(metrics.scrollTop)
          .toBe(metrics.scrollHeight - metrics.clientHeight);
        expect.soft(metrics.sameCanvas).toBe(true);
      }
      expect
        .soft(result!.resizeAtBottom.reduced.clientHeight)
        .toBeLessThan(result!.resizeAtBottom.before.clientHeight);
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
      // Windows can retain Chromium profile handles briefly after child exit.
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
    entryPoints: ["test/fixtures/restty-scrollback-renderer.ts"],
    format: "iife",
    loader: { ".ttf": "binary" },
    logLevel: "silent",
    outfile: path.join(root, "renderer.js"),
    platform: "browser",
    plugins: [
      {
        name: "fixture-only-raf-counts",
        setup(builder) {
          builder.onLoad(
            { filter: /chunk-c0rcpsc5\.js$/ },
            async ({ path: runtimePath }) => {
              const source = depthExperimentSource(
                await readFile(runtimePath, "utf8"),
              );
              const marker = "  function loop(state) {";
              if (source.split(marker).length !== 2)
                throw new Error("Restty RAF instrumentation drifted");
              return {
                contents: source
                  .replace(
                    "  reportCursor(cursorPos);",
                    `  (globalThis.__hiddenRenderGeometry ??= new WeakMap()).set(canvas, { cursor: cursorPos, cols: gridState.cols, rows: gridState.rows, cellW: gridState.cellW, cellH: gridState.cellH });\n  reportCursor(cursorPos);`,
                  )
                  .replace(
                    marker,
                    marker +
                      `
            const canvas = state.gl?.canvas;
            if (canvas) {
              const counts = globalThis.__hiddenRuntimeRaf ??= new WeakMap();
              counts.set(canvas, (counts.get(canvas) ?? 0) + 1);
            }
          `,
                  ),
                loader: "js",
              };
            },
          );
        },
      },
    ],
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
    // Canonical selection background #505064, accepting RGBA or BGRA order.
    if ((near(a, 80) && near(b, 80) && near(c, 100)) || (near(a, 100) && near(b, 80) && near(c, 80))) count += 1;
  }
  return count;
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
  await waitFor(window, "globalThis.__omxtermResttyScrollback?.ready ?? false");
  const resizeAtBottom = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.resizeAtBottom()", true);
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
  await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.surface.dispose(); globalThis.__omxtermResttyScrollback.hiddenRenderingFixture().then(fixture => { globalThis.__hiddenFixture = fixture; return true; })", true);
  const cpu = () => app.getAppMetrics().filter(metric => metric.type === 'Tab').reduce((sum, metric) => sum + metric.cpu.cumulativeCPUUsage, 0);
  async function measure(output) {
    const before = cpu();
    const measurement = await window.webContents.executeJavaScript('globalThis.__hiddenFixture.measure(' + output + ')', true);
    return { ...measurement, rendererCpuSeconds: cpu() - before };
  }
  const idle = await measure(false);
  const output = await measure(true);
  window.setSize(520, 440);
  const hidden = {
    environment: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.environment', true),
    idle,
    output,
    reveal: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.reveal()', true),
    synchronizedReveal: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.synchronizedReveal()', true),
    ingestion: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.ingestion()', true),
    lifecycle: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.lifecycle()', true),
    images: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.images()', true),
  };
  await window.webContents.executeJavaScript('globalThis.__hiddenFixture.dispose()', true);
  await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.depthRenderingFixture().then(fixture => { globalThis.__depthFixture = fixture; return true; })', true);
  const processMemory = () => app.getAppMetrics().filter(metric => ['GPU', 'Tab'].includes(metric.type)).map(({ type, memory }) => ({ type, memory }));
  const depth = [];
  for (const count of [1, 3, 1]) {
    const phase = await window.webContents.executeJavaScript('globalThis.__depthFixture.phase(' + count + ')', true);
    const immediate = processMemory();
    await new Promise(resolve => setTimeout(resolve, 500));
    depth.push({ ...phase, memoryImmediate: immediate, memoryAfter500ms: processMemory() });
  }
  await window.webContents.executeJavaScript('globalThis.__depthFixture.dispose()', true);
  const result = {
    environment: { versions: process.versions, gpu: await app.getGPUInfo('basic') },
    depth,
    hidden,
    resizeAtBottom,
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
