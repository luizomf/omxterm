import { prepareFixture, type FixtureCleanupOwner } from "./prepare-fixture";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { depthExperimentSource } from "./restty-depth-evidence";
import { observeNativeScrollFeedback } from "./restty-native-scroll-feedback-observer";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const resultPrefix = "__OMXTERM_RESTTY_SCROLLBACK_RESULT__";

export type ScrollbackFixtureMode =
  | "scrollback"
  | "native-scroll-feedback"
  | "native-scroll-feedback-ready-before-map";

export async function buildFixture(
  root: string,
  mode: ScrollbackFixtureMode = "scrollback",
  holdStartup = false,
  cleanupOwner: FixtureCleanupOwner = "recipe",
): Promise<void> {
  return prepareFixture(
    root,
    async (start) => {
      await build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: [
          mode === "scrollback"
            ? "test/fixtures/restty-scrollback-renderer.ts"
            : "test/fixtures/restty-native-scroll-feedback-renderer.ts",
        ],
        format: "iife",
        define: {
          __OMXTERM_SCROLLBACK_HOLD_READY__: JSON.stringify(holdStartup),
        },
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
                  let source = depthExperimentSource(
                    await readFile(runtimePath, "utf8"),
                  );
                  if (mode !== "scrollback")
                    source = observeNativeScrollFeedback(source);
                  else {
                    const dragMarker = "  let selectionAutoScrollTimer = null;";
                    if (source.split(dragMarker).length !== 2)
                      throw new Error("Scrollback drag observer drifted");
                    source = source.replace(
                      dragMarker,
                      "  globalThis.__scrollbackIsDragging = () => selectionState.dragging;\n" +
                        dragMarker,
                    );
                  }
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
          build({
            absWorkingDir: projectRoot,
            bundle: true,
            entryPoints: ["test/fixtures/scrollback-native-input.ts"],
            format: "cjs",
            platform: "node",
            logLevel: "silent",
            outfile: path.join(root, "native-input.cjs"),
          }),
        ),
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
        start(() =>
          writeFile(
            path.join(root, "main.cjs"),
            electronMainSource(mode, holdStartup),
          ),
        ),
        start(() => mkdir(path.join(root, "home"), { recursive: true })),
      ]);
    },
    cleanupOwner,
  );
}

function electronMainSource(
  mode: ScrollbackFixtureMode,
  holdStartup: boolean,
): string {
  return `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { hasNativeDrag } = require('./native-input.cjs');
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
  const readyBeforeMap = ${JSON.stringify(mode === "native-scroll-feedback-ready-before-map")};
  let peer;
  if (readyBeforeMap) {
    // A supervisor-owned tiled peer models an existing desktop terminal. No
    // compositor rule, window size request or core/scroll event is substituted.
    peer = new BrowserWindow({ width: 800, height: 500, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await peer.loadURL('data:text/html,<title>Scroll feedback fixture peer</title>');
    peer.showInactive();
  }
  const window = new BrowserWindow({
    width: 800,
    height: 500,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false },
  });
  const nativeResizes = [];
  window.on('resize', () => {
    if (nativeResizes.length < 16) nativeResizes.push(window.getBounds());
  });
  await window.loadFile(path.join(__dirname, "index.html"));
  if (readyBeforeMap)
    await waitFor(window, "globalThis.__nativeScrollFeedback?.ready ?? false");
  const beforeMap = { visible: window.isVisible(), content: window.getContentBounds(),
    surfaceReady: readyBeforeMap ? await window.webContents.executeJavaScript('globalThis.__nativeScrollFeedback.ready', true) : null };
  window.showInactive();
  if (${JSON.stringify(mode)} !== "scrollback") {
    await waitFor(window, "globalThis.__nativeScrollFeedback?.ready ?? false");
    try {
      const result = await window.webContents.executeJavaScript("globalThis.__nativeScrollFeedback.run()", true);
      process.stdout.write("__OMXTERM_NATIVE_SCROLL_FEEDBACK__" + JSON.stringify({ ...result,
        mapping: { readyBeforeMap, beforeMap, nativeResizes, content: window.getContentBounds() } }) + "\\n");
    } catch (error) {
      const observations = await window.webContents.executeJavaScript("({ metrics: globalThis.__nativeScrollFeedback.metrics(), events: globalThis.__scrollFeedbackEvents })", true);
      process.stderr.write(JSON.stringify({ ...observations, beforeMap, nativeResizes }) + "\\n");
      throw error;
    }
    await window.webContents.executeJavaScript("globalThis.__nativeScrollFeedback.dispose()", true);
    window.destroy();
    peer?.destroy();
    app.exit(0);
    return;
  }
  if (${JSON.stringify(holdStartup)}) {
    await waitFor(window, 'globalThis.__scrollbackStartupHeld === true');
    process.stdout.write('__OMXTERM_SCROLLBACK_STARTUP_HELD__' + JSON.stringify({ pid: process.pid, visible: window.isVisible(), minimized: window.isMinimized() }) + '\\n');
  }
  await waitFor(window, "globalThis.__omxtermResttyScrollback?.ready ?? false");
  class StimulusTimeout extends Error {}
  let inputObservation = null;
  const inputNative = () => ({ visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused() });
  const inputRecord = (phase, status, category = 'none') => process.stdout.write('__OMXTERM_SCROLLBACK_INPUT__' + JSON.stringify({ version: 1, phase, status, category, native: inputNative(), observation: inputObservation }) + '\\n');
  async function inputPhase(phase, predicate, timeout = 5000, initialize, observe) {
    let timer;
    let active = true;
    inputRecord(phase, 'begin');
    try {
      await Promise.race([
        (async () => {
          const deadline = Date.now() + timeout;
          await initialize?.();
          while (active && Date.now() < deadline) {
            inputObservation = await (observe ? observe() : window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.nativeInput()', true));
            if (observe && (!active || Date.now() >= deadline)) throw new StimulusTimeout(); // Reject late consumption, even of a timely event.
            if (predicate(inputObservation)) return;
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          throw new StimulusTimeout();
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new StimulusTimeout()), timeout); }),
      ]);
      inputRecord(phase, 'complete');
    } catch (error) {
      const category = error instanceof StimulusTimeout ? 'stimulus-unavailable' : 'operation-error';
      inputRecord(phase, 'failure', category);
      throw new Error('Scrollback ' + category + ' at ' + phase);
    } finally { active = false; clearTimeout(timer); }
  }
  async function prepareInput(phase) {
    await inputPhase(phase, value => { const state = inputNative(); return state.visible && !state.minimized && state.focused && value.ready; }, 5000, async () => {
      window.show(); window.focus(); window.webContents.focus();
      await window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.prepareNativeInput()', true);
    });
  }
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
  await prepareInput('mouse-ready');
  const autoscroll = await window.webContents.executeJavaScript(
    \`(() => {
      const host = document.querySelector('.restty-native-scroll-host');
      host.scrollTop = host.scrollHeight;
      host.dispatchEvent(new Event('scroll'));
      const bounds = document.querySelector('canvas').getBoundingClientRect();
      return { startTop: host.scrollTop, x: Math.floor(bounds.left + 80), startY: Math.floor(bounds.bottom - 30), endY: Math.floor(bounds.top) };
    })()\`, true);
  const autoscrollStartTop = autoscroll.startTop;
  try {
    window.webContents.sendInputEvent({ type: "mouseDown", x: autoscroll.x, y: autoscroll.startY, button: "left", clickCount: 1 });
    await inputPhase('mouse-down', value => value.down?.trusted && value.down.canvas && value.down.buttons === 1 && value.down.x === autoscroll.x && value.down.y === autoscroll.startY);
    window.webContents.sendInputEvent({ type: "mouseMove", x: autoscroll.x, y: autoscroll.endY, button: "left", modifiers: ["leftButtonDown"], clickCount: 1 });
    await Promise.all([
      new Promise((resolve) => setTimeout(resolve, 500)),
      inputPhase('mouse-drag', value => hasNativeDrag(value, autoscroll), 500, undefined,
        () => window.webContents.executeJavaScript('globalThis.__omxtermResttyScrollback.waitForNativeDrag(' + JSON.stringify(autoscroll) + ')', true)),
    ]);
  } finally {
    window.webContents.sendInputEvent({ type: "mouseUp", x: autoscroll.x, y: autoscroll.endY, button: "left", clickCount: 1 });
  }
  await inputPhase('mouse-up', value => value.up?.trusted && value.up.canvas && value.up.buttons === 0 && value.up.id === value.down.id && value.up.x === autoscroll.x && value.up.y === autoscroll.endY && !value.up.dragging);
  const nativeDrag = inputObservation;
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
  await prepareInput('character-ready');
  window.webContents.sendInputEvent({ type: 'char', keyCode: 'x' });
  await inputPhase('character', value => value.character?.trusted && value.character.input && value.accepted);
  const nativeCharacter = inputObservation;
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
    nativeDrag,
    nativeCharacter,
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
