import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { app, BrowserWindow } from "electron";
import { loadMacOSWindowBlur } from "../../src/main/macos-window-blur";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { createWindowBackgroundEffectsOwner } from "../../src/main/window-background-effects";

const root = import.meta.dirname;
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const windows: BrowserWindow[] = [];
const native = loadMacOSWindowBlur();
function finish(code: number): void {
  for (const window of windows) {
    if (window.isDestroyed()) continue;
    try {
      native?.setBlur(window.getNativeWindowHandle(), false);
    } catch {
      /* Best-effort fixture cleanup. */
    }
    window.destroy();
  }
  app.exit(code);
}
const fail = (error: unknown): void => {
  process.stderr.write(
    `${String(error instanceof Error ? error.stack : error)}\n`,
  );
  finish(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
app.on("window-all-closed", () => {});

const configuration = (blur = true, transparency = 0.15) => ({
  ...DEFAULT_USER_CONFIGURATION,
  blur,
  transparency,
});
function terminalWindow(): BrowserWindow {
  const options = terminalWindowOptions(
    "",
    DEFAULT_USER_CONFIGURATION,
    "darwin",
  );
  delete options.webPreferences?.preload;
  const window = new BrowserWindow({
    ...options,
    width: 800,
    height: 500,
    webPreferences: { ...options.webPreferences, backgroundThrottling: false },
  });
  windows.push(window);
  return window;
}
async function loadSurface(
  window: BrowserWindow,
  owner: ReturnType<typeof createWindowBackgroundEffectsOwner>,
): Promise<void> {
  // The same registration -> ready-to-show -> owner.show sequence as main.
  const shown = new Promise<void>((resolve) =>
    window.once("ready-to-show", () => {
      owner.show(window);
      resolve();
    }),
  );
  await window.loadFile(path.join(root, "index.html"));
  await shown;
  await window.webContents.executeJavaScript(`(async () => {
    for (let i = 0; i < 600; i++) {
      if (document.body.dataset.fixtureError) throw new Error(document.body.dataset.fixtureError);
      if (globalThis.backgroundFixture?.ready) return;
      await new Promise(requestAnimationFrame);
    }
    throw new Error('Surface readiness timed out');
  })()`);
}
async function paint(
  window: BrowserWindow,
  transparency: number,
): Promise<void> {
  const phase = (await window.webContents.executeJavaScript(
    `backgroundFixture.phase(${transparency}, '#000000')`,
  )) as {
    implicit: number[];
    equalRgb: number[];
    glyphs: Record<string, number>;
    error: number;
    sameCanvas: boolean;
    starts: number;
    closes: number;
    bodyBackground: string;
  };
  assert.deepEqual(phase.implicit, [0, 0, 0, 0]);
  assert.deepEqual(phase.equalRgb, [18, 52, 86, 255]);
  assert.ok((phase.glyphs["240,240,255"] ?? 0) > 0);
  assert.equal(phase.error, 0);
  assert.equal(phase.sameCanvas, true);
  assert.equal(phase.starts, 1);
  assert.equal(phase.closes, 0);
  const alpha = 1 - transparency;
  assert.ok(
    [
      `color(srgb 0 0 0 / ${alpha})`,
      alpha === 1 ? "color(srgb 0 0 0)" : `rgba(0, 0, 0, ${alpha})`,
      ...(alpha === 1 ? ["rgb(0, 0, 0)"] : []),
    ].includes(phase.bodyBackground),
    `single configured tint: ${phase.bodyBackground}`,
  );
}
async function productionLifecycle(): Promise<void> {
  assert.ok(native);
  const calls: Array<{ window: BrowserWindow; enabled: boolean }> = [];
  const owner = createWindowBackgroundEffectsOwner("darwin", "", {
    loadMacBlur: () => ({
      setBlur(handle, enabled) {
        const window = windows.find(
          (candidate) =>
            !candidate.isDestroyed() &&
            candidate.getNativeWindowHandle().equals(handle),
        );
        assert.ok(window);
        if (enabled)
          assert.equal(
            window.isVisible(),
            true,
            "apply follows native show, not ready-to-show",
          );
        const result = native.setBlur(handle, enabled);
        assert.equal(result, 0);
        calls.push({ window, enabled });
        return result;
      },
    }),
  });
  const first = terminalWindow();
  const firstContents = first.webContents;
  const transparency = owner.register(first, configuration());
  assert.equal(calls.length, 0);
  await loadSurface(first, owner);
  assert.deepEqual(calls, [{ window: first, enabled: true }]);
  await paint(first, transparency());
  owner.apply(configuration(true, 0.35));
  await paint(first, transparency());
  assert.equal(
    calls.length,
    1,
    "tint-only reload does not churn native effects",
  );
  const second = terminalWindow();
  const secondTransparency = owner.register(second, configuration(true, 0.35));
  await loadSurface(second, owner);
  await paint(second, secondTransparency());
  assert.deepEqual(calls.slice(1), [{ window: second, enabled: true }]);
  first.hide();
  owner.show(first);
  await paint(first, transparency());
  assert.deepEqual(calls.slice(-2), [
    { window: first, enabled: false },
    { window: first, enabled: true },
  ]);
  first.maximize();
  await paint(first, transparency());
  assert.equal(first.isMaximized(), true);
  first.unmaximize();
  await paint(first, transparency());
  assert.equal(first.isMaximized(), false);
  const minimized = once(first, "minimize", {
    signal: AbortSignal.timeout(5_000),
  });
  first.minimize();
  await minimized;
  assert.equal(first.isMinimized(), true);
  const beforeRestore = calls.length;
  const restored = once(first, "restore", {
    signal: AbortSignal.timeout(5_000),
  });
  first.restore();
  await restored;
  await paint(first, transparency());
  assert.equal(first.isMinimized(), false);
  assert.deepEqual(calls.slice(beforeRestore), [
    { window: first, enabled: false },
    { window: first, enabled: true },
  ]);
  owner.apply(configuration(true, 0));
  await paint(first, transparency());
  await paint(second, secondTransparency());
  assert.equal(first.webContents, firstContents);
  const retiredHandle = first.getNativeWindowHandle();
  assert.deepEqual(
    await first.webContents.executeJavaScript("backgroundFixture.dispose()"),
    { starts: 1, closes: 1 },
  );
  first.destroy();
  const count = calls.length;
  owner.apply(configuration());
  assert.deepEqual(calls.slice(count), [{ window: second, enabled: true }]);
  assert.throws(() => native.setBlur(retiredHandle, false), /owned/u);
  owner.apply(configuration(false, 1));
  assert.deepEqual(
    await second.webContents.executeJavaScript("backgroundFixture.dispose()"),
    { starts: 1, closes: 1 },
  );
  second.destroy();
}
async function fullscreenControl(): Promise<void> {
  const results = [];
  for (const mode of ["hud", "direct"] as const) {
    const window = terminalWindow();
    const owner = createWindowBackgroundEffectsOwner("darwin", "", {
      loadMacBlur: mode === "hud" ? () => undefined : () => native,
    });
    owner.register(window, configuration());
    await loadSurface(window, owner);
    await paint(window, 0.15);
    const transition = (enabled: boolean) =>
      new Promise<boolean>((resolve) => {
        const event = enabled ? "enter-full-screen" : "leave-full-screen";
        const done = () => {
          clearTimeout(timer);
          resolve(true);
        };
        const timer = setTimeout(() => {
          if (event === "enter-full-screen")
            window.removeListener("enter-full-screen", done);
          else window.removeListener("leave-full-screen", done);
          resolve(false);
        }, 8_000);
        if (event === "enter-full-screen")
          window.once("enter-full-screen", done);
        else window.once("leave-full-screen", done);
        window.setFullScreen(enabled);
      });
    const entered = await transition(true);
    const fullScreen = window.isFullScreen();
    const left = await transition(false);
    const restored = !window.isFullScreen();
    await paint(window, 0.15);
    results.push({ mode, entered, fullScreen, left, restored });
    owner.apply(configuration(false, 0));
    await window.webContents.executeJavaScript("backgroundFixture.dispose()");
    window.destroy();
  }
  writeSync(1, `__OMXTERM_FULLSCREEN_CONTROL__${JSON.stringify(results)}\n`);
  assert.ok(
    results.every(
      (result) =>
        result.entered && result.fullScreen && result.left && result.restored,
    ),
    "Native fullscreen control did not complete; compare both modes, do not infer causality",
  );
}

app
  .whenReady()
  .then(async () => {
    assert.ok(
      native,
      "production optional loader resolves the built ESM-adjacent addon",
    );
    assert.deepEqual(Object.keys(native), ["setBlur"]);
    const options = terminalWindowOptions(
      "",
      DEFAULT_USER_CONFIGURATION,
      "darwin",
    );
    delete options.webPreferences?.preload;
    const window = new BrowserWindow(options);
    windows.push(window);
    const handle = window.getNativeWindowHandle();
    for (const args of [
      [],
      [handle],
      [handle, true, 20],
      [handle, 1],
      [handle, "true"],
      [Buffer.alloc(7), true],
      [Buffer.alloc(9), true],
      [Buffer.alloc(8), true],
      [Buffer.alloc(8, 1), true],
      [new Uint8Array(handle), true],
    ]) {
      assert.throws(() => Reflect.apply(native.setBlur, native, args));
    }
    // A hidden native success must never stand in for a visible effect.
    assert.notEqual(native.setBlur(handle, true), 0);
    assert.equal(native.setBlur(handle, false), 0);
    await window.loadURL(
      "data:text/html,<body>Owned native blur fixture</body>",
    );
    window.showInactive();
    assert.equal(window.isVisible(), true);
    assert.equal(
      native.setBlur(handle, true),
      0,
      "native private API apply on this runtime",
    );
    assert.equal(
      native.setBlur(handle, false),
      0,
      "native private API reset on this runtime",
    );
    assert.equal(native.setBlur(handle, false), 0, "idempotent native reset");
    const worker = new Worker(
      `
    const { parentPort, workerData } = require('node:worker_threads');
    try { require(workerData).setBlur(Buffer.alloc(8, 1), true); parentPort.postMessage('accepted'); }
    catch (error) { parentPort.postMessage(error.message); }
  `,
      { eval: true, workerData: path.join(root, "macos-window-blur.node") },
    );
    const message = await new Promise<unknown>((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
    });
    await worker.terminate();
    assert.match(String(message), /main thread/u);
    window.destroy();
    assert.throws(() => native.setBlur(handle, true), /owned/u);
    await productionLifecycle();
    if (process.argv.includes("--fullscreen-control"))
      await fullscreenControl();
    writeSync(
      1,
      '__OMXTERM_MACOS_BLUR_RESULT__{"nativeApply":0,"nativeReset":0,"validation":true,"workerRejected":true,"productionLifecycle":true,"sameCanvas":true}\n',
    );
    finish(0);
  })
  .catch(fail);
