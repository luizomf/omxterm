import { prepareFixture } from "./prepare-fixture";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { depthExperimentSource } from "./restty-depth-evidence";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const resultPrefix = "__OMXTERM_RESTTY_SCROLLBACK_RESULT__";

export async function buildFixture(root: string): Promise<void> {
  return prepareFixture(root, async (start) => {
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
          `${JSON.stringify({ name: "omxterm-restty-scrollback", main: "main.cjs" })}\n`,
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
  const typed = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.inputViewport('x')", true);
  await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.scrollToTop()', true);
  await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.surface.inject('injected')", true);
  const injected = await window.webContents.executeJavaScript("globalThis.__omxtermResttyScrollback.inputViewport('injected')", true);
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
    pendingGeometrySynchronizedReveal: await window.webContents.executeJavaScript('globalThis.__hiddenFixture.pendingGeometrySynchronizedReveal()', true),
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
