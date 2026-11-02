// Loaded synchronously at the paused packaged entry. Never replaces product code.
const { app, BrowserWindow, ipcMain, webContents } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { observe } = require("./snippets-observer.cjs");
const {
  startWindowsProbeReadiness,
} = require("./snippets-windows-readiness.cjs");
const { runScenario } = require("./snippets-scenario.cjs");
let state;

function arm(options) {
  assert.equal(state, undefined, "one observer per process");
  assert.equal(process.platform, "win32");
  assert.equal(process.arch, "arm64");
  assert.equal(app.isPackaged, true);
  assert.equal(app.getVersion(), options.version);
  assert.equal(app.getAppPath(), options.asar);
  assert.equal(process.execPath, options.executable);
  assert.equal(process.versions.electron, options.electronVersion);
  assert.equal(
    BrowserWindow.getAllWindows().length,
    0,
    "arm before any window",
  );
  const packageRequire = createRequire(path.join(options.asar, "package.json"));
  const observer = observe({ ...options, windowsCpr: true }, packageRequire);
  let readiness;
  try {
    const { createInputHandler } = require("./snippets-windows-parser.cjs");
    const { fixtureProcesses } = require("./fixture-processes.cjs");
    readiness = startWindowsProbeReadiness({
      app,
      ipcMain,
      ptys: observer.ptys,
      createInputHandler,
    });
    const window = new Promise((resolve) => {
      app.once("browser-window-created", (_event, created) =>
        created.once("ready-to-show", () => resolve(created)),
      );
    });
    assert.equal(observer.ptys.length, 0, "arm before any observed PTY");
    state = {
      options,
      observer,
      readiness,
      window,
      fixtureProcesses,
      result: undefined,
    };
  } catch (error) {
    readiness?.dispose();
    observer.restore();
    throw error;
  }
  return {
    pid: process.pid,
    armed: true,
    windows: 0,
    ptys: 0,
    packaged: app.isPackaged,
    version: app.getVersion(),
    executable: process.execPath,
    asar: app.getAppPath(),
    electron: process.versions.electron,
    node: process.versions.node,
  };
}

async function run() {
  assert.ok(
    state && !state.result && !state.options.probe,
    "ordinary observer must be armed exactly once",
  );
  const { options, observer, readiness, fixtureProcesses } = state;
  const window = await state.window;
  const result = await runScenario({
    window,
    fixture: options,
    ...observer,
    archiveSha256: options.archiveSha256,
    fixtureProcesses,
    windowsProbeReady: readiness.ready,
    windowsProbeSnapshot: readiness.snapshot,
  });
  assert.equal(observer.ptys.length, 1, "one initial session");
  assert.equal(observer.children.length, 1, "one backend");
  state.result = result;
  const {
    identities: _identities,
    retirementIdentity: _retirementIdentity,
    ...scenario
  } = result;
  return scenario;
}

async function probe() {
  assert.ok(
    state?.options.probe && !state.probeIdentity,
    "one readiness probe only",
  );
  const { observer, readiness, fixtureProcesses } = state;
  const window = await state.window;
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const until = async (check, label) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(`Timed out: ${label}`);
  };
  window.focus();
  await until(
    () =>
      js(
        "!![...document.querySelectorAll('.terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0)",
      ),
    "live Surface",
  );
  await until(
    () =>
      observer.ptys.length === 1 &&
      observer.ptys[0].pid > 0 &&
      observer.ptys[0].output.length > 0,
    "initial PTY",
  );
  const session = observer.ptys[0];
  await until(
    async () =>
      core.isFocused() &&
      (await js("!!document.activeElement?.closest('.terminal-surface')")),
    "initial terminal focus",
  );
  await until(
    () => session.output.includes("\u001b[?2004lSNIPPETS_SHELL_READY\r\n"),
    "controlled probe plain-paste marker",
  );
  await until(
    () => readiness.ready(core, session),
    "controlled Windows probe renderer readiness",
  );
  await js(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  await until(
    () => readiness.ready(core, session),
    "controlled Windows probe renderer readiness",
  );
  assert.equal(
    observer.children.length,
    0,
    "probe must not activate a backend",
  );
  const pty = fixtureProcesses().find((row) => row.pid === session.pid);
  assert.ok(
    pty && pty.identity && pty.identity !== "exited",
    "initial PTY creation identity",
  );
  state.probeIdentity = pty;
  return {
    classification: "early-arm-probe-not-qualification",
    ready: true,
    mainPid: process.pid,
    pty,
    readiness: readiness.snapshot(core, session),
  };
}

function finishQuit(probeOnly) {
  assert.ok(
    probeOnly
      ? state?.options.probe && state.probeIdentity
      : state?.result && !state.options.probe,
    "completed observation required before Quit",
  );
  const { observer, readiness, fixtureProcesses, result, options } = state;
  app.once("will-quit", () => {
    const receipt = {
      joined: false,
      ptys: observer.ptys.map(({ pid, exited }) => ({ pid, exited })),
      children: observer.children,
      identities: [],
      error: null,
    };
    try {
      assert.equal(observer.ptys.length, 1);
      assert.equal(observer.children.length, probeOnly ? 0 : 1);
      assert.ok(observer.ptys[0].exited, "PTY onExit joined");
      let identities;
      if (probeOnly) identities = [state.probeIdentity];
      else {
        assert.equal(observer.children[0].closed, true, "backend close joined");
        assert.deepEqual(observer.children[0].exit, { code: 0, signal: null });
        assert.equal(result.identities.length, 2);
        assert.deepEqual(result.retirementIdentity, result.identities[0]);
        identities = result.identities;
      }
      const remaining = fixtureProcesses();
      receipt.identities = identities.map((owned) => ({
        ...owned,
        alive: remaining.some(
          (row) => row.pid === owned.pid && row.identity === owned.identity,
        ),
      }));
      assert.ok(
        receipt.identities.every((owned) => !owned.alive),
        "captured PTY/backend identities absent",
      );
      receipt.joined = true;
    } catch (error) {
      receipt.error = String(error);
      process.exitCode = 1;
    } finally {
      try {
        fs.writeFileSync(
          path.join(options.evidence, "quit.json"),
          JSON.stringify(receipt, null, 2),
          { flag: "wx" },
        );
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      }
      readiness.dispose();
      observer.restore();
    }
  });
  app.quit();
}
function quit() {
  finishQuit(false);
}
function probeQuit() {
  finishQuit(true);
}
async function diagnose() {
  return {
    ptys: state?.observer.ptys,
    children: state?.observer.children,
    views: await Promise.all(
      webContents
        .getAllWebContents()
        .filter((view) => !view.isDestroyed())
        .map(async (view) => ({
          url: view.getURL(),
          state: await view
            .executeJavaScript("document.body?.outerHTML")
            .catch(String),
        })),
    ),
  };
}
function abort() {
  app.once("will-quit", () => {
    state?.readiness.dispose();
    state?.observer.restore();
  });
  app.quit();
}
module.exports = { arm, run, quit, probe, probeQuit, diagnose, abort };
