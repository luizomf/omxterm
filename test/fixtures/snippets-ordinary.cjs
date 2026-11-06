// Installed before evaluation of the exact production entry; never replaces it.
const assert = require("node:assert/strict");
const path = require("node:path");

async function waitFor(check) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw Error("Ordinary fixture readiness deadline");
}

function observeYamlWrites(fs, record) {
  const restore = [];
  for (const target of [fs, fs.promises]) {
    for (const name of [
      "writeFile",
      "appendFile",
      "createWriteStream",
      "open",
      "copyFile",
      "cp",
      "rename",
      "unlink",
      "rm",
      "truncate",
    ]) {
      for (const key of [name, `${name}Sync`]) {
        const original = target[key];
        if (typeof original !== "function") continue;
        target[key] = function (...args) {
          const indices = ["copyFile", "cp"].includes(name)
            ? [1]
            : name === "rename"
              ? [0, 1]
              : [0];
          const writing =
            name !== "open" ||
            (typeof args[1] === "number"
              ? (args[1] &
                  (3 |
                    fs.constants.O_CREAT |
                    fs.constants.O_TRUNC |
                    fs.constants.O_APPEND)) !==
                0
              : !["r", "rs"].includes(args[1]));
          if (
            writing &&
            indices.some(
              (i) => path.basename(String(args[i])) === "snippets.yaml",
            )
          )
            record(key);
          return original.apply(this, args);
        };
        restore.push(() => {
          target[key] = original;
        });
      }
    }
  }
  return () => restore.reverse().forEach((f) => f());
}

function observeNodeNetwork(record, modules) {
  const restore = [];
  for (const [label, target, names] of [
    ["http", modules.http, ["request", "get"]],
    ["https", modules.https, ["request", "get"]],
    ["global", modules.global, ["fetch"]],
  ]) {
    for (const name of names) {
      const original = target[name];
      if (typeof original !== "function") continue;
      target[name] = function (...args) {
        record(`${label}.${name}`);
        return original.apply(this, args);
      };
      restore.push(() => {
        target[name] = original;
      });
    }
  }
  return () => restore.reverse().forEach((f) => f());
}

function managementReady(document, generation, enabled) {
  if (
    document
      .querySelector("#settings-tab-extensions")
      ?.getAttribute("aria-selected") !== "true"
  )
    return false;
  const state =
    generation === 3 ? "uninstalled" : enabled ? "enabled" : "disabled";
  const prefix = `omxterm.snippets · generation ${generation} · ${state} ·`;
  const row = [...document.querySelectorAll(".extensions-panel section")].find(
    (row) =>
      [...row.querySelectorAll("p")].some((p) =>
        p.textContent.startsWith(prefix),
      ),
  );
  return !!row && ![...row.querySelectorAll("button")].some((b) => b.disabled);
}

function answerDialog(prompt, manualInstall, digest) {
  if (prompt.title === "Quit OMXTerm") {
    assert.equal(prompt.type, "question");
    assert.equal(
      prompt.message,
      "Quit OMXTerm and close all Terminal Windows?",
    );
    assert.deepEqual(prompt.buttons, ["Quit", "Cancel"]);
    assert.equal(prompt.defaultId, 1);
    assert.equal(prompt.cancelId, 1);
    return { kind: "quit", response: 0 };
  }
  assert.equal(manualInstall, true);
  assert.equal(prompt.title, "Trust extension code?");
  assert.ok(prompt.detail.includes(digest));
  return { kind: "install", response: 1 };
}

let active;
function arm(options) {
  assert.equal(active, undefined, "one cold observer per process");
  const { app, BrowserWindow, webContents, dialog } = require("electron");
  const fs = require("node:fs");
  const cp = require("node:child_process");
  const { createRequire, syncBuiltinESMExports } = require("node:module");
  assert.equal(
    app.isReady(),
    false,
    "late observer cannot qualify cold startup",
  );
  assert.equal(BrowserWindow.getAllWindows().length, 0);
  assert.equal(webContents.getAllWebContents().length, 0);
  // No profile getter, defaultSession access or production-module import here.
  const packageRequire = createRequire(path.join(options.asar, "package.json"));
  const { Terminal } = packageRequire("node-pty/lib/terminal.js");
  const record = {
    ptys: [],
    forks: [],
    urls: [],
    yamlWrites: [],
    nodeNetwork: [],
    approvals: 0,
    quitApprovals: 0,
  };
  const append = (field, value) => {
    assert.ok(record[field].length < 1024, "bounded cold observations");
    record[field].push(value);
  };
  observeYamlWrites(fs, (operation) => append("yamlWrites", operation));
  observeNodeNetwork((operation) => append("nodeNetwork", operation), {
    http: require("node:http"),
    https: require("node:https"),
    global: globalThis,
  });
  const fork = cp.fork;
  cp.fork = function (...args) {
    const child = fork.apply(this, args);
    const entry = {
      module: String(args[0]),
      pid: child.pid,
      exit: null,
      closed: false,
    };
    append("forks", entry);
    child.once("exit", (code, signal) => {
      entry.exit = { code, signal };
    });
    child.once("close", () => {
      entry.closed = true;
    });
    return child;
  };
  syncBuiltinESMExports();
  app.on("web-contents-created", (_event, contents) => {
    contents.on("did-start-navigation", (_e, url) => append("urls", url));
  });
  const forward = Terminal.prototype._forwardEvents;
  Terminal.prototype._forwardEvents = function (...args) {
    const result = forward.apply(this, args);
    const pty = { pid: this.pid, output: "", exited: false, exit: null };
    append("ptys", pty);
    this.onData((text) => {
      assert.ok(
        pty.output.length + text.length <= 65536,
        "bounded synthetic PTY output",
      );
      pty.output += text;
    });
    this.onExit((event) => {
      pty.exited = true;
      pty.exit = event;
    });
    return result;
  };
  dialog.showOpenDialog = async () => {
    assert.equal(
      options.manualInstall,
      true,
      "no chooser in default enrollment",
    );
    return { canceled: false, filePaths: [options.archive] };
  };
  dialog.showMessageBox = async (owner, prompt = owner) => {
    const result = answerDialog(
      prompt,
      options.manualInstall,
      options.archiveSha256,
    );
    if (result.kind === "install") record.approvals++;
    else record.quitApprovals++;
    return { response: result.response, checkboxChecked: false };
  };
  const menu = (label) => {
    const find = (items) => {
      for (const item of items) {
        if (item.label.replace(/…$/, "") === label) return item;
        const nested = item.submenu && find(item.submenu.items);
        if (nested) return nested;
      }
    };
    const item = find(require("electron").Menu.getApplicationMenu().items);
    assert.ok(item, label);
    item.click(item, BrowserWindow.getAllWindows()[0], {});
  };
  const core = () => {
    const window = BrowserWindow.getAllWindows()[0];
    assert.ok(window);
    return window.webContents;
  };
  active = {
    snapshot() {
      assert.equal(app.isPackaged, true);
      assert.equal(app.getVersion(), options.version);
      assert.equal(app.getAppPath(), options.asar);
      assert.equal(process.execPath, options.executable);
      assert.equal(app.getName(), "omxterm");
      assert.equal(app.commandLine.hasSwitch("user-data-dir"), false);
      assert.equal(app.getPath("userData"), options.profile);
      return {
        ...record,
        identity: {
          pid: process.pid,
          version: app.getVersion(),
          electron: process.versions.electron,
          node: process.versions.node,
          arch: process.arch,
          name: app.getName(),
          userData: app.getPath("userData"),
          appData: app.getPath("appData"),
          home: require("node:os").userInfo().homedir,
          argv: process.argv,
          bus: process.env.DBUS_SESSION_BUS_ADDRESS,
          runtime: process.env.XDG_RUNTIME_DIR,
        },
        views: webContents.getAllWebContents().map((v) => v.getURL()),
      };
    },
    async ready() {
      const window = BrowserWindow.getAllWindows()[0];
      return (
        !!window &&
        !window.isDestroyed() &&
        record.ptys.length === 1 &&
        record.ptys[0].output.includes("ORDINARY_SHELL_READY") &&
        (await window.webContents.executeJavaScript(
          "!!document.querySelector('.terminal-surface canvas')",
        ))
      );
    },
    async terminal(marker) {
      const window = BrowserWindow.getAllWindows()[0];
      window.focus();
      await core().executeJavaScript(
        "document.querySelector('.terminal-surface').focus()",
      );
      await core().insertText(`printf '\\n%s\\n' '${marker}'`);
      try {
        core().sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      } finally {
        core().sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      }
    },
    async management(action) {
      const c = core();
      if (
        !(await c.executeJavaScript(
          "(document.querySelector('.settings-dialog')?.getBoundingClientRect().width ?? 0) > 0",
        ))
      )
        menu("Settings");
      await waitFor(() =>
        c.executeJavaScript(
          "!!document.querySelector('#settings-tab-extensions')",
        ),
      );
      await c.executeJavaScript(
        "document.querySelector('#settings-tab-extensions').click()",
      );
      if (action) {
        await waitFor(() =>
          c.executeJavaScript(
            `!![...document.querySelectorAll('.extensions-panel button')].find(b => b.textContent === ${JSON.stringify(action)} && !b.disabled)`,
          ),
        );
        await c.executeJavaScript(`(() => {
        const buttons = [...document.querySelectorAll('.extensions-panel button')];
        const b = buttons.find(b => b.textContent === ${JSON.stringify(action)} && !b.disabled);
        if (!b) throw Error('Management action unavailable'); b.click();
      })()`);
      }
    },
    async closeSettings() {
      await core().executeJavaScript(
        "document.querySelector('.settings-close').click()",
      );
    },
    async capture(file) {
      fs.writeFileSync(file, (await core().capturePage()).toPNG());
    },
    async captureManagement(file, generation, enabled) {
      const expression = `(${managementReady.toString()})(document, ${generation}, ${enabled})`;
      await waitFor(() => core().executeJavaScript(expression));
      await core().executeJavaScript(`(() => {
        const row = [...document.querySelectorAll('.extensions-panel section')].find(row => [...row.querySelectorAll('p')].some(p => p.textContent.startsWith('omxterm.snippets · generation ')));
        row.scrollIntoView({block: 'center'});
        return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      await active.capture(file);
      assert.equal(await core().executeJavaScript(expression), true);
    },
    quit() {
      app.once("will-quit", () => {
        fs.writeFileSync(
          path.join(options.evidence, "quit.json"),
          JSON.stringify(
            {
              natural: true,
              joined:
                record.ptys.length === 1 &&
                record.ptys.every((p) => p.exited) &&
                record.forks.every(
                  (c) =>
                    c.closed && c.exit?.code === 0 && c.exit?.signal === null,
                ),
              ...record,
              views: webContents
                .getAllWebContents()
                .map((view) => view.getURL()),
            },
            null,
            2,
          ),
        );
      });
      app.quit();
    },
  };
  return {
    armed: true,
    pid: process.pid,
    ready: app.isReady(),
    windows: 0,
    ptys: record.ptys.length,
  };
}
module.exports = {
  arm,
  managementReady,
  observeNodeNetwork,
  answerDialog,
  observeYamlWrites,
  current: () => active,
};
