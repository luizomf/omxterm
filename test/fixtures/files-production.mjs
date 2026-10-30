// Disposable assigned-guest fixture. Runs the built production entry point;
// native chooser/consent responses, DOM/Chromium input and observability are controlled here.
import { app, BrowserWindow, Menu, dialog, webContents } from "electron";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:https";
import { pathToFileURL } from "node:url";
const root = import.meta.dirname;
const fixture = JSON.parse(
  await readFile(path.join(root, "fixture.json"), "utf8"),
);
const source = fixture.source;
const manifest = JSON.parse(
  await readFile(path.join(source, "extensions/files/extension.json"), "utf8"),
);
const archivePath = path.join(
  source,
  `dist/extensions/files-${manifest.version}.omxext`,
);
const require = createRequire(path.join(source, "package.json"));
await mkdir(path.join(root, "profile"));
app.setPath("userData", path.join(root, "profile"));
process.env.XDG_CONFIG_HOME = path.join(root, "config");
process.env.XDG_DATA_HOME = path.join(root, "data");
await mkdir(path.join(root, "config", "omxterm"), { recursive: true });
await writeFile(
  path.join(root, "config", "omxterm", "config.json"),
  JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
);
const files = path.join(root, "owned-files");
await mkdir(files);
await writeFile(path.join(files, "source.txt"), "preserved-source");
await writeFile(path.join(files, "conflict.txt"), "preserved-destination");
let server;
let archiveUrl;
let slowStarted = false;
let slowClosed = false;
if (fixture.https) {
  const archive = await readFile(archivePath);
  server = createServer(
    {
      key: await readFile(path.join(root, "key.pem")),
      cert: await readFile(path.join(root, "cert.pem")),
    },
    (request, response) => {
      if (request.url === "/slow") {
        slowStarted = true;
        response.on("close", () => {
          slowClosed = true;
        });
        response.writeHead(200);
        response.write("pending");
      } else if (request.url === "/bad") {
        response.end("not an archive");
      } else if (request.url === "/redirect") {
        response.writeHead(302, { location: "/archive" });
        response.end();
      } else {
        response.writeHead(200, { "content-length": archive.length });
        response.end(archive);
      }
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  archiveUrl = `https://localhost:${server.address().port}`;
}
async function closeServer() {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
const checks = [];
let failed = false;
let output = "";
const ptys = [];
const pty = require("node-pty");
const spawnPty = pty.spawn;
pty.spawn = (...args) => {
  const session = spawnPty(...args);
  const record = { pid: session.pid, exited: false };
  ptys.push(record);
  session.onData((data) => {
    output = (output + data).slice(-65536);
  });
  session.onExit(() => {
    record.exited = true;
  });
  return session;
};
const children = [];
const childProcess = require("node:child_process");
const fork = childProcess.fork;
childProcess.fork = (...args) => {
  const child = fork(...args);
  if (String(args[0]).endsWith("extension-runtime/bootstrap.mjs")) {
    const record = { child, pid: child.pid, closed: false, exit: null };
    child.once("exit", (code, signal) => {
      record.exit = { code, signal };
    });
    child.once("close", () => {
      record.closed = true;
    });
    children.push(record);
  }
  return child;
};
syncBuiltinESMExports();
let approved = 0;
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [archivePath],
});
dialog.showMessageBox = async (_window, options) => {
  assert.equal(
    options.title,
    "Trust extension code?",
    "unexpected production dialog",
  );
  assert.match(options.detail, /SHA-256: [a-f0-9]{64}/);
  assert.match(options.detail, /network/);
  assert.match(options.detail, /Third-party/);
  approved++;
  return { response: 1, checkboxChecked: false };
};
const ready = new Promise((resolve) =>
  app.once("browser-window-created", (_event, window) =>
    window.once("ready-to-show", () => resolve(window)),
  ),
);
await import(pathToFileURL(path.join(source, "dist/main/index.js")).href);
// Electron emits ready only after this ESM entry has finished evaluating.
// Observe window readiness without making module evaluation depend on it.
void ready.then(async (window) => {
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  async function until(check, label, timeout = 15000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${label}`);
  }
  function menu(label) {
    const search = (items) => {
      for (const item of items) {
        if (item.label.replace(/…$/, "") === label) return item;
        const child = item.submenu && search(item.submenu.items);
        if (child) return child;
      }
    };
    const item = search(Menu.getApplicationMenu().items);
    assert.ok(item, `menu ${label}`);
    item.click(item, window, {});
  }
  function click(contents, label) {
    return contents.executeJavaScript(
      `(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.closest('[hidden]')); if (!button) throw Error('button missing'); if (button.disabled || button.closest('[inert]')) throw Error('button unavailable'); button.click(); })()`,
    );
  }
  const hosted = () =>
    webContents
      .getAllWebContents()
      .filter(
        (contents) =>
          contents.getURL().startsWith("omx-extension://") &&
          !contents.isDestroyed(),
      );
  async function sameTerminal(selected = true) {
    assert.equal(ptys.length, 1, "no extra PTY allocated");
    assert.equal(ptys[0].exited, false, "original PTY remains live");
    assert.equal(
      await js(
        "Math.max(1, document.querySelectorAll('#tab-strip [role=tab]').length)",
      ),
      selected ? 1 : 2,
      "only the original terminal and explicitly opened Settings own tabs",
    );
    assert.equal(
      await js(
        `window.__filesOriginalCanvas === document.querySelector('.terminal-surface canvas') && (window.__filesOriginalCanvas.getBoundingClientRect().width > 0) === ${selected}`,
      ),
      true,
      "same selected terminal Surface",
    );
  }
  async function panel(view, visible, focus, terminalSelected = true) {
    await until(async () => {
      const native = window.contentView.children.find(
        (child) => child.webContents === view,
      );
      return (
        !view.isDestroyed() &&
        !!native &&
        native.getVisible() === visible &&
        (await js(
          `document.querySelector('.auxiliary-panel')?.hidden === ${!visible}`,
        )) &&
        (focus === "core"
          ? core.isFocused() && !view.isFocused()
          : view.isFocused() && !core.isFocused())
      );
    }, `Files panel visible=${visible} native focus=${focus}`);
    assert.equal(hosted().length, 1, "one retained Files companion");
    assert.equal(hosted()[0], view, "same native view identity");
    await sameTerminal(terminalSelected);
  }
  async function reopen(action) {
    // Existing pixels cannot acknowledge a new asynchronous admission.
    await js(`(() => {
      window.__filesReopened = false;
      window.__removeFilesReopen = window.omxterm.terminal.hostedContent.onOpen(() => {
        window.__filesReopened = true;
      });
    })()`);
    try {
      await action();
      await until(
        () => js("window.__filesReopened"),
        "repeated Files admission",
      );
    } finally {
      await js("window.__removeFilesReopen(); void 0;");
    }
  }
  async function openFiles() {
    menu("Files");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(listingReady())),
      "Files companion loaded",
    );
    const view = hosted()[0];
    await panel(view, true, "child");
    return view;
  }
  // These DOM-driven gestures qualify fixture-controlled input, not physical keys.
  async function filesAction(contents, label) {
    const visible = await contents.executeJavaScript(
      `!![...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.closest('[hidden]'))`,
    );
    if (!visible) await click(contents, "Actions…");
    await click(contents, label);
  }
  // Both fixtures run en-US. Settled errors are not successful listings.
  function listingReady(directory) {
    return `(() => {
      const location = document.querySelector('form.location');
      const entries = document.querySelector('.entries');
      const summary = document.querySelector('.summary')?.textContent ?? '';
      if (!location || !entries) return false;
      if (${directory !== undefined} && location.querySelector('input')?.value !== ${JSON.stringify(directory)}) return false;
      return entries.matches('[role=tree]')
        ? entries.getAttribute('aria-busy') === 'false' && /^[0-9][0-9,]* visible entr(?:y|ies)(?: · Truncated at 5,000 per folder)?$/.test(summary)
        : entries.matches('[role=list]') && entries.getAttribute('aria-busy') !== 'true' && /^[0-9][0-9,]* entries(?: · Truncated at 5,000; refine the directory)?(?:\\. Double-click a folder to open it\\.)?$/.test(summary);
    })()`;
  }
  function entryQuery(directory, name) {
    return `(() => {
      const entries = document.querySelector('.entries');
      if (!(${listingReady(directory)}) || document.querySelector('.operation-editor').inert) return null;
      return entries.matches('[role=tree]')
        ? [...entries.querySelectorAll('.file-row[role=treeitem][data-path]')].find(row => row.dataset.path === ${JSON.stringify(path.join(directory, name))})
        : [...entries.querySelectorAll('button.file-row')].find(row => row.firstElementChild?.textContent === ${JSON.stringify(name)});
    })()`;
  }
  async function terminal(marker) {
    await js("document.querySelector('#tab-strip [role=tab]')?.click()");
    await until(
      () => js("!!document.activeElement?.closest('.terminal-surface')"),
      "terminal focus",
    );
    await core.insertText(`printf '${marker}\\n'`);
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(() => output.includes(`${marker}\r\n`), "real PTY marker");
  }
  async function location(contents) {
    await contents.executeJavaScript(
      `document.querySelector('[aria-label=Directory]').value = ${JSON.stringify(files)}; document.querySelector('form.location').requestSubmit()`,
    );
    await until(
      () => contents.executeJavaScript(listingReady(files)),
      "directory list",
    );
  }
  async function select(contents, name) {
    // Legacy mutations leave a stale flat list; the tree refreshes on success.
    if (
      await contents.executeJavaScript(
        "!!document.querySelector('.operations')",
      )
    )
      await click(contents, "Refresh");
    const query = entryQuery(files, name);
    await until(() => contents.executeJavaScript(`!!${query}`), "exact entry");
    await contents.executeJavaScript(`${query}.click()`);
  }
  async function apply(contents, value, outcome = "success") {
    await contents.executeJavaScript(
      `document.querySelector('.operation-editor input').value = ${JSON.stringify(value)}; document.querySelector('.operation-editor').requestSubmit()`,
    );
    await until(
      () =>
        contents.executeJavaScript(
          `!document.querySelector('.operation-editor').inert && [...document.querySelectorAll('[role=status]')].some(notice => ${outcome === "conflict" ? "notice.textContent.startsWith('Operation not completed: conflict.')" : "notice.textContent === 'Operation completed.' || notice.textContent === 'Operation completed. Refresh to see the current directory.'"})`,
        ),
      "mutation completion",
    );
  }
  app.once("will-quit", () => {
    assert.ok(
      children.every((child) => child.closed),
      "backend close joined before Quit",
    );
    assert.ok(
      ptys.every((session) => session.exited),
      "native PTY exits joined before Quit",
    );
    process.stdout.write(
      `__FILES_PRODUCTION__${JSON.stringify({ checks, failed, approved, backends: children.map(({ pid, closed, exit }) => ({ pid, closed, exit })), ptys, input: "synthetic-Chromium-input; native chooser responses controlled", quit: "joined" })}\n`,
    );
  });
  try {
    window.focus();
    await until(
      () => js("!!document.querySelector('.terminal-surface canvas')"),
      "real surface",
    );
    await terminal("OMX_FILES_BEFORE");
    assert.equal(ptys.length, 1);
    await js(
      "window.__filesOriginalCanvas = document.querySelector('.terminal-surface canvas')",
    );
    menu("Settings");
    await until(
      () => js("!!document.querySelector('#settings-tab-extensions')"),
      "production Settings",
    );
    await click(core, "Extensions");
    if (fixture.https) {
      await until(
        () =>
          js(
            "![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
          ),
        "initial snapshot",
      );
      const installLink = async (route) => {
        await js(
          `document.querySelector('.extensions-panel input').value = ${JSON.stringify(archiveUrl)} + ${JSON.stringify(route)}`,
        );
        await click(core, "Install from link");
      };
      await installLink("/slow");
      await until(() => slowStarted, "actual HTTPS pending stream");
      await click(core, "Cancel");
      await until(() => slowClosed, "actual HTTPS socket cancellation");
      await until(
        () =>
          js(
            "document.querySelector('.extensions-panel').textContent.includes('Installation cancelled')",
          ),
        "cancel feedback",
      );
      assert.equal(approved, 0);
      checks.push("HTTPS-cancellation-before-trust");
      await installLink("/bad");
      await until(
        () =>
          js(
            "document.querySelector('.extensions-panel').textContent.includes('Invalid extension package')",
          ),
        "malformed archive feedback",
      );
      assert.equal(approved, 0);
      checks.push("HTTPS-malformed-before-trust");
      await installLink("/redirect");
    } else await click(core, "Install local .omxext…");
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('local dormant')",
        ),
      "dormant install",
    );
    assert.equal(children.length, 0);
    if (fixture.https) {
      assert.equal(approved, 1);
      checks.push("HTTPS-redirect-captured-trust-dormant-no-backend");
      await click(core, "Install local .omxext…");
      await until(
        () =>
          js(
            "document.querySelector('.extensions-panel').textContent.includes('generation 2')",
          ),
        "explicit local replacement",
      );
      assert.equal(approved, 2);
      assert.equal(children.length, 0);
      if (fixture.evidence) {
        await writeFile(
          path.join(fixture.evidence, "https-settings.png"),
          (await core.capturePage()).toPNG(),
        );
      }
      await js("document.querySelector('.settings-close').click()");
      await until(
        () => js("!document.querySelector('.settings-dialog')"),
        "HTTPS Settings closed",
      );
      await terminal("OMX_HTTPS_AFTER");
      assert.equal(ptys.length, 1);
      assert.equal(
        await js(
          "window.__filesOriginalCanvas === document.querySelector('.terminal-surface canvas')",
        ),
        true,
      );
      checks.push("HTTPS-local-replacement-same-PTY");
      await closeServer();
      app.quit();
      return;
    }
    checks.push("Settings-captured-trust-dormant-no-backend");
    // Shared actions must not bypass Settings' modal input ownership.
    await js("document.querySelector('.settings-close').click()");
    await until(
      () => js("!document.querySelector('.settings-dialog')"),
      "Settings closed",
    );
    const view = await openFiles();
    await reopen(() => menu("Files"));
    await panel(view, true, "child");
    assert.equal(children.length, 1, "menu reopen retains backend");
    await js("document.querySelector('.auxiliary-header button').click()");
    await panel(view, false, "core");
    await terminal("OMX_FILES_HIDDEN");
    menu("Command Palette");
    await until(
      () =>
        js(
          "!![...document.querySelectorAll('.command-palette [role=option]')].find(row => row.textContent === 'Files')",
        ),
      "shared Files palette contribution",
    );
    await reopen(() =>
      js(
        "[...document.querySelectorAll('.command-palette [role=option]')].find(row => row.textContent === 'Files').click()",
      ),
    );
    await panel(view, true, "child");
    assert.equal(children.length, 1, "palette reopen retains backend");
    menu("Settings");
    await until(
      () => js("!!document.querySelector('#settings-tab-extensions')"),
      "Settings suspends Files",
    );
    await panel(view, false, "core", false);
    await js("document.querySelector('.settings-close').click()");
    await until(
      () => js("!document.querySelector('.settings-dialog')"),
      "Settings closed with retained Files",
    );
    await panel(view, true, "core");
    await reopen(() => menu("Files"));
    await panel(view, true, "child");
    checks.push(
      "menu-palette-single-companion-reopen-hide-settings-same-terminal",
    );
    await location(view);
    await filesAction(view, "New file");
    await apply(view, "created.txt");
    assert.equal((await stat(path.join(files, "created.txt"))).isFile(), true);
    await filesAction(view, "New folder");
    await apply(view, "created-folder");
    assert.equal(
      (await stat(path.join(files, "created-folder"))).isDirectory(),
      true,
    );
    await select(view, "source.txt");
    await filesAction(view, "Rename / move");
    await apply(view, path.join(files, "conflict.txt"), "conflict");
    assert.equal(
      await readFile(path.join(files, "source.txt"), "utf8"),
      "preserved-source",
    );
    assert.equal(
      await readFile(path.join(files, "conflict.txt"), "utf8"),
      "preserved-destination",
    );
    await filesAction(view, "Rename / move");
    await apply(view, path.join(files, "moved.txt"));
    assert.equal(
      await readFile(path.join(files, "moved.txt"), "utf8"),
      "preserved-source",
    );
    await select(view, "created.txt");
    await filesAction(view, "Delete permanently…");
    await until(
      () =>
        view.executeJavaScript(
          "document.querySelector('.operation-editor').textContent.includes('cannot be undone')",
        ),
      "separate delete confirmation",
    );
    assert.ok(await stat(path.join(files, "created.txt")));
    await click(view, "Delete permanently");
    await until(
      async () =>
        !(await stat(path.join(files, "created.txt")).catch(() => null)),
      "permanent delete",
    );
    await select(view, "moved.txt");
    await filesAction(view, "Move to Trash");
    await until(
      async () =>
        !(await stat(path.join(files, "moved.txt")).catch(() => null)),
      "OS trash",
    );
    assert.equal(
      await readFile(path.join(root, "data/Trash/files/moved.txt"), "utf8"),
      "preserved-source",
    );
    checks.push("real-create-folder-no-clobber-move-trash-confirmed-delete");
    if (fixture.evidence) {
      await writeFile(
        path.join(fixture.evidence, "production-files.png"),
        (await view.capturePage()).toPNG(),
      );
      await writeFile(
        path.join(fixture.evidence, "production-window.png"),
        (await core.capturePage()).toPNG(),
      );
    }
    // Backend loss revokes and destroys its view. Never send a request or crash
    // gesture to that retired WebContents; independent renderer loss is not tested here.
    assert.equal(children.length, 1);
    const coreRenderer = core.getOSProcessId();
    assert.equal(children[0].child.kill("SIGKILL"), true);
    await until(
      () => children[0].closed && view.isDestroyed() && hosted().length === 0,
      "backend loss retires actual companion view",
    );
    assert.deepEqual(children[0].exit, { code: null, signal: "SIGKILL" });
    await until(
      () => js("document.querySelector('.auxiliary-panel')?.hidden === true"),
      "retired companion removed from core",
    );
    assert.equal(core.getOSProcessId(), coreRenderer);
    assert.equal(
      await js("!!document.querySelector('.terminal-surface canvas')"),
      true,
    );
    assert.equal(children.length, 1, "no automatic backend restart");
    checks.push("backend-loss-retires-companion-core-survives");
    await terminal("OMX_FILES_AFTER_BACKEND_LOSS");
    assert.equal(
      children.length,
      1,
      "no backend restart through terminal roundtrip",
    );
    await sameTerminal();
    // Explicit fresh admission, not automatic recovery, supplies a live backend
    // for the normal Disable retirement assertion below.
    const replacement = await openFiles();
    assert.notEqual(replacement, view);
    assert.equal(children.length, 2);
    assert.notEqual(children[0].pid, children[1].pid);
    checks.push("explicit-reopen-fresh-view-and-backend");
    assert.equal(
      await js(
        "window.__filesOriginalCanvas === document.querySelector('.terminal-surface canvas')",
      ),
      true,
    );
    menu("Settings");
    await until(
      () =>
        js(
          "!!document.querySelector('.settings-dialog') && !document.querySelector('.settings-dialog').closest('[hidden]')",
        ),
      "Settings return",
    );
    await panel(replacement, false, "core", false);
    await click(core, "Config File");
    await until(
      () => js("!!document.querySelector('.settings-config-file textarea')"),
      "retained draft",
    );
    await js(
      "window.__filesDraft = document.querySelector('.settings-config-file textarea'); window.__filesDraft.value += '\\n '; window.__filesDraft.dispatchEvent(new Event('input', {bubbles:true})); window.__filesDraftValue = window.__filesDraft.value",
    );
    await click(core, "Extensions");
    await until(
      () =>
        js(
          "![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "management admission",
    );
    await click(core, "Disable");
    await until(
      () =>
        replacement.isDestroyed() &&
        hosted().length === 0 &&
        children[1].closed,
      "disable actual view and backend settlement",
    );
    assert.deepEqual(children[1].exit, { code: 0, signal: null });
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('disabled') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "Disable management response settled",
    );
    await click(core, "Uninstall");
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('uninstalled')",
        ),
      "uninstall tombstone",
    );
    assert.equal(
      await js(
        "window.__filesDraft === document.querySelector('.settings-config-file textarea') && window.__filesDraft.value === window.__filesDraftValue",
      ),
      true,
    );
    await js("document.querySelector('.settings-close').click()");
    await until(
      () => js("!document.querySelector('.settings-dialog')"),
      "Settings closed after cleanup",
    );
    await terminal("OMX_FILES_AFTER");
    await sameTerminal();
    assert.equal(children.length, 2, "management never restarts the backend");
    checks.push("disable-uninstall-real-settlement-retained-draft-same-PTY");
    app.quit();
  } catch (error) {
    failed = true;
    process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
    await closeServer();
    app.quit();
  }
});
