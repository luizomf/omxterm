// Inspector-loaded observer; the extracted application's entry/ASAR stay intact.
const { app, BrowserWindow, Menu, webContents } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { observe } = require("./snippets-observer.cjs");
const { runScenario } = require("./snippets-scenario.cjs");
let observer;
let requestQuit;
function inspect(options) {
  assert.equal(app.isPackaged, true);
  assert.equal(app.getVersion(), options.version);
  assert.equal(app.getAppPath(), options.asar);
  assert.equal(process.execPath, options.executable);
  return {
    packaged: true,
    version: app.getVersion(),
    appPath: app.getAppPath(),
    executable: process.execPath,
  };
}
function identity(pid) {
  try {
    const fields = fs
      .readFileSync(`/proc/${pid}/stat`, "utf8")
      .split(")")
      .at(-1)
      .trim()
      .split(/\s+/);
    return { pid, start: fields[19], state: fields[0] };
  } catch (error) {
    if (["ENOENT", "ESRCH"].includes(error.code)) return null;
    throw error;
  }
}
function alive(record) {
  const current = identity(record.pid);
  return (
    current?.start === record.start && !["Z", "X", "x"].includes(current.state)
  );
}
async function run(options) {
  inspect(options);
  assert.equal(observer, undefined, "one scenario per process");
  const window = BrowserWindow.getAllWindows()[0];
  assert.ok(window);
  const readiness = JSON.parse(fs.readFileSync(options.readiness, "utf8"));
  assert.equal(readiness.mainPid, process.pid);
  const baseline = identity(readiness.probePid);
  assert.ok(baseline && alive(baseline), "initial readiness PTY alive");
  observer = observe(
    options,
    createRequire(path.join(options.asar, "package.json")),
  );
  // Observe a newly created real session: the initial readiness PTY predates
  // inspector attachment. Interception forwards instance writes unchanged.
  const find = (items) => {
    for (const item of items) {
      if (item.label.replace(/…$/, "") === "New Tab") return item;
      const nested = item.submenu && find(item.submenu.items);
      if (nested) return nested;
    }
  };
  const action = find(Menu.getApplicationMenu().items);
  assert.ok(action);
  action.click(action, window, {});
  const result = await runScenario({
    window,
    fixture: options,
    ...observer,
    archiveSha256: options.archiveSha256,
  });
  assert.equal(
    observer.ptys.length,
    1,
    "exactly one post-attachment scenario PTY",
  );
  assert.notEqual(observer.ptys[0].pid, baseline.pid);
  assert.ok(alive(baseline), "baseline PTY preserved through scenario");
  requestQuit = () => {
    app.once("will-quit", () => {
      const baselineExited = !alive(baseline);
      const joined =
        baselineExited &&
        observer.ptys.every((p) => p.exited) &&
        observer.children.every(
          (c) => c.closed && c.exit?.code === 0 && c.exit?.signal === null,
        );
      fs.writeFileSync(
        path.join(options.evidence, "quit.json"),
        JSON.stringify(
          {
            joined,
            baselineExited,
            ptys: observer.ptys.map(({ pid, exited }) => ({ pid, exited })),
            children: observer.children,
          },
          null,
          2,
        ),
      );
      observer.restore();
    });
    app.quit();
  };
  return result;
}
async function diagnose() {
  const views = await Promise.all(
    webContents
      .getAllWebContents()
      .filter((view) => !view.isDestroyed())
      .map(async (view) => ({
        url: view.getURL(),
        state: await view
          .executeJavaScript("document.body?.outerHTML")
          .catch(String),
      })),
  );
  return { ptys: observer?.ptys, children: observer?.children, views };
}
function abort() {
  app.once("will-quit", () => observer?.restore());
  app.quit();
}
module.exports = {
  inspect,
  run,
  diagnose,
  abort,
  quit() {
    assert.ok(requestQuit, "scenario completed");
    requestQuit();
  },
};
