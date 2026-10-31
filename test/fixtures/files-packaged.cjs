// Test-only observer injected through the main inspector after the untouched
// packaged application starts. Native dialog responses and input are controlled.
const { app, BrowserWindow, Menu, dialog, webContents } = require("electron");
const assert = require("node:assert/strict");
const { syncBuiltinESMExports } = require("node:module");
const { readFile, writeFile, stat, lstat } = require("node:fs/promises");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let catalogTransport;
let currentRoot;
const processIdentity = require("./snippets-process-identity.cjs");
async function cleanup() {
  await catalogTransport?.close();
}

// Runtime.evaluate has no dynamic-import callback. Load this ordinary CommonJS
// observer through Node's createRequire, without replacing the application entry.
function inspect(options) {
  assert.equal(app.isPackaged, true);
  assert.equal(app.getVersion(), options.version);
  assert.equal(app.getAppPath(), options.asar);
  assert.equal(process.execPath, options.executable);
  return {
    packaged: app.isPackaged,
    version: app.getVersion(),
    appPath: app.getAppPath(),
    executable: process.execPath,
    observer: "CommonJS",
    runType: typeof run,
  };
}

// Failure-only observation: no navigation, refresh, paths or native error text.
async function diagnoseListing(root) {
  const views = webContents
    .getAllWebContents()
    .filter(
      (view) =>
        !view.isDestroyed() && view.getURL().startsWith("omx-extension://"),
    );
  const ownedDirectories = [
    root,
    path.join(root, "home"),
    path.join(root, "owned-files"),
  ];
  return {
    hostedCount: views.length,
    views: await Promise.all(
      views.slice(0, 8).map(async (view) => {
        try {
          return await view.executeJavaScript(`(() => {
          const entries = document.querySelector('.entries');
          const summary = document.querySelector('.summary')?.textContent ?? '';
          const directory = document.querySelector('form.location input')?.value;
          return {
            locationPresent: !!document.querySelector('form.location'),
            role: entries?.getAttribute('role')?.slice(0, 32) ?? null,
            busy: entries?.getAttribute('aria-busy')?.slice(0, 8) ?? null,
            summary: /[/\\\\]/.test(summary) ? '[redacted]' : summary.slice(0, 256),
            rowCount: entries?.querySelectorAll('.file-row').length ?? 0,
            ownedDirectory: ${JSON.stringify(ownedDirectories)}.includes(directory)
          };
        })()`);
        } catch {
          return { snapshotError: "view-unavailable" };
        }
      }),
    ),
  };
}

function assertNormalBackendRetirement(child) {
  assert.ok(
    child.closed && child.exit !== null,
    "backend exit and close joined",
  );
  assert.equal(
    child.exit.code,
    0,
    "ordinary backend retirement must exit zero",
  );
  assert.equal(
    child.exit.signal,
    null,
    "ordinary backend retirement must not be signaled",
  );
}

function deleteConfirmationReady(document) {
  const editor = document.querySelector(".operation-editor");
  if (!editor || editor.closest("[hidden], [inert]")) return false;
  return (
    editor.textContent.includes("cannot be undone") &&
    [...editor.querySelectorAll("button")].some(
      (button) =>
        button.textContent === "Delete permanently" &&
        !button.disabled &&
        !button.closest("[hidden], [inert]"),
    )
  );
}

function installPublicLink(document, url) {
  const input = document.querySelector('.extensions-panel input[type="url"]');
  const button = [
    ...document.querySelectorAll(".extensions-panel button"),
  ].find((item) => item.textContent === "Install from link");
  if (
    !input ||
    !button ||
    input.disabled ||
    button.disabled ||
    input.closest("[hidden], [inert]") ||
    button.closest("[hidden], [inert]")
  )
    throw Error("public link controls unavailable");
  input.value = url;
  button.click();
}

function verifyFilesConsent(prompt, options) {
  assert.equal(prompt.title, "Trust extension code?");
  assert.ok(
    prompt.detail.includes(options.archiveSha256),
    "trust must identify exact separate archive",
  );
  assert.match(prompt.detail, /network/);
  if (options.macosLifecycle || options.publicLink) {
    assert.equal(
      prompt.message,
      "Install Files — ARM64 preview 0.5.0?",
      "new Files archive version shown before consent",
    );
    assert.ok(
      prompt.detail.includes("omxterm.files"),
      "manifest ID before consent",
    );
  }
}

async function run(options) {
  inspect(options);
  currentRoot = options.root;
  const window = BrowserWindow.getAllWindows()[0];
  assert.ok(window);
  const core = window.webContents;
  const js = async (code) => {
    try {
      return await core.executeJavaScript(code);
    } catch (cause) {
      throw new Error(`Core renderer expression failed: ${code}`, { cause });
    }
  };
  const checks = [];
  const renderedCatalog = [];
  const destroyedListeners = [];
  function listeners(phase) {
    destroyedListeners.push({
      phase,
      listeners: core
        .rawListeners("destroyed")
        .map((listener) => (listener.listener ?? listener).name || "anonymous"),
    });
  }
  listeners("initial");
  async function captureCatalog(name, selector, text) {
    const geometry = await js(`(async () => {
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.includes(${JSON.stringify(text)}));
      if (!element) throw Error('catalog capture target missing');
      element.scrollIntoView({ block: 'center' });
      element.querySelector('button')?.focus({ preventScroll: true });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      return { text: element.textContent, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: innerHeight, width: innerWidth };
    })()`);
    assert.ok(
      geometry.top >= 0 &&
        geometry.bottom <= geometry.height &&
        geometry.left >= 0 &&
        geometry.right <= geometry.width,
      "catalog target fully inside viewport",
    );
    renderedCatalog.push({ name, ...geometry });
    await writeFile(
      path.join(options.evidence, name),
      (await core.capturePage()).toPNG(),
    );
  }
  const children = [];
  const childProcess = require("node:child_process");
  const originalFork = childProcess.fork;
  childProcess.fork = (...args) => {
    const child = originalFork(...args);
    if (String(args[0]).endsWith("extension-runtime/bootstrap.mjs")) {
      assert.equal(
        args[0],
        path.join(options.asar, "dist/extension-runtime/bootstrap.mjs"),
      );
      assert.equal(args[2].execPath, options.executable);
      const record = { pid: child.pid, closed: false, exit: null };
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
  let approvals = 0;
  globalThis.__omxtermPackagedState = {
    checks,
    children,
    get approvals() {
      return approvals;
    },
  };
  dialog.showOpenDialog = async () => {
    assert.ok(
      !options.publicLink,
      "public acquisition must not use local chooser",
    );
    return { canceled: false, filePaths: [options.archive] };
  };
  dialog.showMessageBox = async (_owner, prompt) => {
    verifyFilesConsent(prompt, options);
    approvals++;
    return { response: 1, checkboxChecked: false };
  };
  async function until(check, label, timeout = 15000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${label}`);
  }
  function menu(label) {
    const find = (items) => {
      for (const item of items) {
        if (item.label.replace(/…$/, "") === label) return item;
        const nested = item.submenu && find(item.submenu.items);
        if (nested) return nested;
      }
    };
    const item = find(Menu.getApplicationMenu().items);
    assert.ok(item, `menu ${label}`);
    item.click(item, window, {});
  }
  function click(contents, label) {
    return contents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.closest('[hidden]'));
      if (!button || button.disabled || button.closest('[inert]')) throw Error('control unavailable');
      button.click();
    })()`);
  }
  const hosted = () =>
    webContents
      .getAllWebContents()
      .filter(
        (view) =>
          !view.isDestroyed() && view.getURL().startsWith("omx-extension://"),
      );
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
  async function select(view, name) {
    if (await view.executeJavaScript("!!document.querySelector('.operations')"))
      await click(view, "Refresh");
    const query = entryQuery(options.files, name);
    await until(() => view.executeJavaScript(`!!${query}`), "exact entry");
    await view.executeJavaScript(`${query}.click()`);
  }
  const tabCount = () =>
    js(
      "Math.max(1, document.querySelectorAll('#tab-strip [role=tab]').length)",
    );
  async function panel(view, visible, focus) {
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
    }, `retained panel visible=${visible} native focus=${focus}`);
    assert.equal(hosted().length, 1, "one retained native tool");
    assert.equal(hosted()[0], view, "same native WebContents identity");
  }
  const shell = JSON.parse(await readFile(options.readiness, "utf8"));
  const shellStat = () => processIdentity.identity(shell.probePid);
  let identity = shellStat();
  const initialShell = { ...shell, start: identity?.start };
  let sourceExited = false;
  assert.ok(identity);
  const quote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
  async function terminal(marker) {
    // A single terminal deliberately has no tab-strip button.
    await js("document.querySelector('#tab-strip [role=tab]')?.click()");
    await until(
      () => js("!!document.activeElement?.closest('.terminal-surface')"),
      "terminal focus",
    );
    assert.equal(shellStat()?.start, identity.start);
    const file = path.join(options.root, marker);
    await core.insertText(
      `printf '\\033]7;%s\\007' ${quote(pathToFileURL(options.root).href)}; printf '%s' "$$" > ${quote(file)}`,
    );
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      async () =>
        (await readFile(file, "utf8").catch(() => "")) ===
        String(shell.probePid),
      "same shell executed input",
    );
  }
  async function settings() {
    menu("Settings");
    await until(
      () => js("!!document.querySelector('#settings-tab-extensions')"),
      "Settings",
    );
    if (hosted().length === 1) await panel(hosted()[0], false, "core");
    await click(core, "Extensions");
    await until(
      () =>
        js(
          "![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "Settings admission",
    );
  }
  async function state(text) {
    await until(
      () =>
        js(
          `document.querySelector('.extensions-panel').textContent.includes(${JSON.stringify(text)}) && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)`,
        ),
      text,
    );
  }
  const publicLinkInstalls = [];
  async function installArchive() {
    if (options.publicLink) {
      assert.ok(!options.catalogMode && !options.macosLifecycle);
      await js(
        `(${installPublicLink.toString()})(document, ${JSON.stringify(options.publicLink)})`,
      );
      publicLinkInstalls.push(options.publicLink);
    } else await click(core, "Install local .omxext…");
  }
  async function openFiles() {
    await js("document.querySelector('.settings-close').click()");
    await until(
      () => js("!document.querySelector('.settings-dialog')"),
      "Settings closed",
    );
    menu("Files");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(listingReady())),
      "Files panel initial listing complete",
    );
    await panel(hosted()[0], true, "child");
    assert.equal(await tabCount(), 1, "Files is outside Application Tabs");
    assert.equal(
      await js(
        "window.__packagedCanvas === document.querySelector('.terminal-surface canvas')",
      ),
      true,
    );
    assert.equal(shellStat()?.start, identity.start);
    return hosted()[0];
  }
  async function apply(view, value, outcome = "success") {
    await view.executeJavaScript(
      `document.querySelector('.operation-editor input').value = ${JSON.stringify(value)}; document.querySelector('.operation-editor').requestSubmit()`,
    );
    await until(
      () =>
        view.executeJavaScript(
          `!document.querySelector('.operation-editor').inert && [...document.querySelectorAll('[role=status]')].some(notice => ${outcome === "conflict" ? "notice.textContent.startsWith('Operation not completed: conflict.')" : "notice.textContent === 'Operation completed.' || notice.textContent === 'Operation completed. Refresh to see the current directory.'"})`,
        ),
      "mutation settled",
    );
  }
  window.focus();
  await until(
    () => js("!!document.querySelector('.terminal-surface canvas')"),
    "Surface",
  );
  let terminalEntry;
  if (options.terminalOnly) {
    terminalEntry = await js(`(() => {
      const strip = document.querySelector('#tab-strip');
      const snapshot = { hidden: strip.hidden, tabs: strip.querySelectorAll('[role=tab]').length };
      try {
        document.querySelector('#tab-strip [role=tab]').click();
        return { ...snapshot, originalRejected: false };
      } catch (error) {
        return { ...snapshot, originalRejected: true, name: error.name, message: error.message };
      }
    })()`);
    globalThis.__omxtermPackagedState.terminalEntry = terminalEntry;
    // Discriminate the original null dereference, not just any renderer error.
    assert.equal(terminalEntry.hidden, true);
    assert.equal(terminalEntry.tabs, 0);
    assert.equal(terminalEntry.originalRejected, true);
    assert.equal(terminalEntry.name, "TypeError");
    assert.match(terminalEntry.message, /null.*click/);
  }
  await terminal("before");
  if (options.terminalOnly) {
    return {
      check: "terminal-entry-only",
      original: terminalEntry,
      correctedSameShell: true,
      shellPid: shell.probePid,
      shellStart: identity.start,
      approvals,
      children: children.length,
    };
  }
  await js(
    "window.__packagedCanvas = document.querySelector('.terminal-surface canvas')",
  );
  if (options.catalogMode === "controlled") {
    catalogTransport = await require("./files-catalog-transport.cjs").start(
      options,
    );
  }
  await settings();
  if (options.catalogMode) {
    assert.equal(
      catalogTransport?.requests.length ?? 0,
      0,
      "Settings must not fetch the catalog",
    );
    await click(core, "Browse official extensions");
    if (catalogTransport) {
      await state("Catalog unavailable.");
      assert.equal(approvals, 0);
      catalogTransport.available(true);
      await click(core, "Retry catalog");
    }
    await state("Catalog loaded.");
    if (catalogTransport) {
      catalogTransport.available(false);
      await click(core, "Refresh catalog");
      await state("last successful snapshot");
      await click(core, "Install");
      await state("do not match the selected catalog release");
      assert.equal(approvals, 0, "wrong bytes never reach consent");
      assert.equal(children.length, 0);
      listeners("wrong-archive-rejected");
      await captureCatalog(
        "catalog-error.png",
        '[role="status"]',
        "do not match the selected catalog release",
      );
      catalogTransport.validArchive(true);
    }
    await captureCatalog("catalog.png", ".extension-catalog-card", "Install");
    await click(core, "Install");
  } else await installArchive();
  await state("generation 1");
  assert.equal(approvals, 1);
  assert.equal(children.length, 0);
  assert.equal(hosted().length, 0);
  checks.push("exact-archive-trust-dormant-install");
  listeners("installed-dormant");
  if (catalogTransport) {
    // Render an offered update without pretending these bytes implement it.
    // Restore the actual release before any further installation.
    catalogTransport.available(true);
    const requestsBeforePreview = catalogTransport.requests.length;
    catalogTransport.previewUpdate();
    try {
      await click(core, "Retry catalog");
      await state("Catalog loaded.");
      await captureCatalog(
        "catalog-update.png",
        ".extension-catalog-card",
        "Update",
      );
      assert.equal(approvals, 1, "synthetic offer never reaches consent");
      assert.deepEqual(
        catalogTransport.requests.slice(requestsBeforePreview),
        ["/catalog"],
        "synthetic offer never requests archive bytes",
      );
    } finally {
      catalogTransport.restoreRelease();
    }
    await click(core, "Refresh catalog");
    await state("Reinstall");
  }
  let view = await openFiles();
  listeners("first-view-active");
  assert.equal(children.length, 1);
  if (!options.publicLink) {
    await filesAction(view, "Use terminal directory");
    await until(
      () => view.executeJavaScript(listingReady(options.root)),
      "initial captured OSC 7 directory",
    );
    const initialDirectory = options.root;
    // Already-visible pixels cannot acknowledge asynchronous repeated admission.
    // Observe its delivered open before testing the following Close gesture.
    await js(`(() => {
    window.__filesReopened = false;
    window.__removeFilesReopen = window.omxterm.terminal.hostedContent.onOpen(() => {
      window.__filesReopened = true;
    });
  })()`);
    try {
      menu("Files");
      await until(
        () => js("window.__filesReopened"),
        "repeated Files admission",
      );
    } finally {
      await js("window.__removeFilesReopen(); void 0;");
    }
    await panel(view, true, "child");
    await js("document.querySelector('.auxiliary-header button').click()");
    await panel(view, false, "core");
    menu("Files");
    await panel(view, true, "child");
    await settings();
    await js("document.querySelector('.settings-close').click()");
    await panel(view, true, "core");
    menu("New Tab");
    await until(
      async () => (await tabCount()) === 2,
      "second terminal selected",
    );
    await panel(view, true, "core");
    // Change the new terminal's directory, then prove the old package still uses
    // its captured initial directory rather than silently acquiring live context.
    const receipt = path.join(options.root, "second-shell");
    await until(
      () => js("!!document.activeElement?.closest('.terminal-surface')"),
      "new terminal DOM focus",
    );
    await core.insertText(
      `cd ${quote(options.files)}; printf '\\033]7;%s\\007' ${quote(pathToFileURL(options.files).href)}; printf '%s' "$$" > ${quote(receipt)}`,
    );
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      async () => /^\d+$/.test(await readFile(receipt, "utf8").catch(() => "")),
      "new shell receipt",
    );
    const secondPid = Number(await readFile(receipt, "utf8"));
    assert.notEqual(secondPid, shell.probePid);
    const secondIdentity = processIdentity.identity(secondPid);
    assert.ok(secondIdentity && processIdentity.alive(secondIdentity));
    menu("Files");
    await panel(view, true, "child");
    await view.executeJavaScript(
      `document.querySelector('[aria-label=Directory]').value = ${JSON.stringify(options.files)}; document.querySelector('form.location').requestSubmit()`,
    );
    await until(
      () =>
        view.executeJavaScript(`!!${entryQuery(options.files, "source.txt")}`),
      "second directory listing",
    );
    await filesAction(view, "Use terminal directory");
    await until(
      () => view.executeJavaScript(listingReady(initialDirectory)),
      "legacy captured initial directory",
    );
    // Selecting the second tab must return actual native input to core without
    // hiding the retained tool. Do not call core.focus() to repair production.
    await js("document.querySelectorAll('#tab-strip [role=tab]')[0].click()");
    await panel(view, true, "core");
    await js("document.querySelectorAll('#tab-strip [role=tab]')[1].click()");
    await panel(view, true, "core");
    if (options.macosLifecycle)
      await js("document.querySelectorAll('#tab-strip [role=tab]')[0].click()");
    const closingIdentity = options.macosLifecycle ? identity : secondIdentity;
    menu("Close Tab");
    await until(
      async () => (await tabCount()) === 1,
      "selected terminal closed",
    );
    await until(
      () => !processIdentity.alive(closingIdentity),
      "closed shell kernel exit",
    );
    if (options.macosLifecycle) {
      sourceExited = true;
      shell.probePid = secondPid;
      identity = secondIdentity;
      assert.ok(processIdentity.alive(identity));
      await js(
        "window.__packagedCanvas = document.querySelector('.terminal-surface canvas')",
      );
      checks.push(
        "source-terminal-closed-same-companion-distinct-surviving-PTY",
      );
    }
    await panel(view, true, "core");
    menu("Files");
    await panel(view, true, "child");
    assert.equal(children.length, 1, "reopen never restarts backend");
    checks.push(
      "panel-outside-tabs-native-focus-reopen-close-settings-terminal-switch",
      "legacy-captured-initial-directory",
    );
  }
  await view.executeJavaScript(
    `document.querySelector('[aria-label=Directory]').value = ${JSON.stringify(options.files)}; document.querySelector('form.location').requestSubmit()`,
  );
  await until(
    () =>
      view.executeJavaScript(`!!${entryQuery(options.files, "source.txt")}`),
    "owned directory list",
  );
  await filesAction(view, "New file");
  await apply(view, "created.txt");
  assert.equal(
    (await stat(path.join(options.files, "created.txt"))).isFile(),
    true,
  );
  await select(view, "source.txt");
  await filesAction(view, "Rename / move");
  await apply(view, path.join(options.files, "conflict.txt"), "conflict");
  assert.equal(
    await readFile(path.join(options.files, "source.txt"), "utf8"),
    "source",
  );
  assert.equal(
    await readFile(path.join(options.files, "conflict.txt"), "utf8"),
    "preserved",
  );
  await filesAction(view, "Rename / move");
  await apply(view, path.join(options.files, "moved.txt"));
  assert.equal(
    await readFile(path.join(options.files, "moved.txt"), "utf8"),
    "source",
  );
  await assert.rejects(lstat(path.join(options.files, "source.txt")), {
    code: "ENOENT",
  });
  checks.push("packaged-backend-create-move-conflict");
  if (options.macosLifecycle) {
    await filesAction(view, "New folder");
    await apply(view, "created-folder");
    assert.ok(
      (await stat(path.join(options.files, "created-folder"))).isDirectory(),
    );
    await select(view, "created.txt");
    await filesAction(view, "Delete permanently…");
    await until(
      () =>
        view.executeJavaScript(
          `(${deleteConfirmationReady.toString()})(document)`,
        ),
      "delete confirmation",
    );
    await click(view, "Cancel");
    assert.ok((await stat(path.join(options.files, "created.txt"))).isFile());
    await filesAction(view, "Delete permanently…");
    await until(
      () =>
        view.executeJavaScript(
          `(${deleteConfirmationReady.toString()})(document)`,
        ),
      "fresh delete confirmation",
    );
    assert.ok((await stat(path.join(options.files, "created.txt"))).isFile());
    await click(view, "Delete permanently");
    await until(
      () =>
        view.executeJavaScript(
          "document.querySelector('[role=status]')?.textContent === 'Operation completed.'",
        ),
      "confirmed deletion success",
    );
    await assert.rejects(stat(path.join(options.files, "created.txt")), {
      code: "ENOENT",
    });
    const recovery = require("./files-trash-recovery.cjs");
    const entry = await recovery.prepare({
      files: options.files,
      evidence: options.evidence,
      lookup: options.trashLookup,
    });
    await click(view, "Refresh");
    await select(view, path.basename(entry.source));
    await filesAction(view, "Move to Trash");
    await until(
      () =>
        view.executeJavaScript(
          "document.querySelector('[role=status]')?.textContent === 'Operation completed.'",
        ),
      "real backend trash success",
    );
    await until(
      () =>
        view.executeJavaScript(
          `(${listingReady(options.files)}) && !${entryQuery(options.files, path.basename(entry.source))}`,
        ),
      "trashed row removed",
    );
    // Only test recovery uses the addon directly; the trash operation above
    // must traverse the real page, installed backend and production service.
    const native = require(
      path.join(options.asar, "dist/extension-runtime/files-move.node"),
    );
    await recovery.recover(entry, options.evidence, native.moveNoReplace);
    checks.push("folder-confirm-cancel-delete-real-backend-trash-recovered");
    await filesAction(view, "New file");
    const draft = "retained draft.txt";
    await view.executeJavaScript(
      `(() => { const input = document.querySelector('.operation-editor input'); window.__filesDraft = input; input.value = ${JSON.stringify(draft)}; input.focus(); input.setSelectionRange(3, 8); })()`,
    );
    await js("document.querySelector('.auxiliary-header button').click()");
    await panel(view, false, "core");
    menu("Files");
    await panel(view, true, "child");
    assert.equal(
      await view.executeJavaScript(
        `(() => { const input = document.querySelector('.operation-editor input'); return input === window.__filesDraft && input.value === ${JSON.stringify(draft)} && input.selectionStart === 3 && input.selectionEnd === 8; })()`,
      ),
      true,
    );
    assert.equal(children.length, 1);
    await click(view, "Cancel");
    checks.push("retained-operation-draft-caret-same-view-backend");
  }
  await writeFile(
    path.join(options.evidence, "files.png"),
    (await view.capturePage()).toPNG(),
  );
  const requestsBeforeReopen = catalogTransport?.requests.length;
  await settings();
  if (catalogTransport)
    assert.equal(
      catalogTransport.requests.length,
      requestsBeforeReopen,
      "reopening Settings must not fetch",
    );
  if (options.catalogMode)
    await captureCatalog(
      "catalog-reinstall.png",
      ".extension-catalog-card",
      "Reinstall",
    );
  if (options.catalogMode) await click(core, "Reinstall");
  else await installArchive();
  await state("generation 2");
  await until(
    () => hosted().length === 0 && children[0].closed,
    "replacement retired actual backend/view",
  );
  assertNormalBackendRetirement(children[0]);
  assert.equal(children.length, 1, "replacement remains dormant");
  assert.equal(approvals, 2);
  checks.push("explicit-reinstall-actual-retirement-dormant");
  listeners("reinstalled-dormant");
  view = await openFiles();
  listeners("second-view-active");
  assert.equal(children.length, 2);
  assert.notEqual(children[0].pid, children[1].pid);
  await settings();
  await click(core, "Disable");
  await state("generation 3");
  await until(
    () => hosted().length === 0 && children[1].closed,
    "Disable retirement",
  );
  assertNormalBackendRetirement(children[1]);
  if (options.macosLifecycle || options.publicLink) {
    await click(core, "Enable");
    await state("generation 4");
    assert.equal(children.length, 2, "Enable remains dormant");
    assert.equal(hosted().length, 0);
  }
  await click(core, "Uninstall");
  await state("uninstalled");
  checks.push("fresh-activation-disable-uninstall");
  listeners("uninstalled");
  await js("document.querySelector('.settings-close').click()");
  await until(
    () => js("!document.querySelector('.settings-dialog')"),
    "Settings closed before terminal capture",
  );
  await terminal("after");
  assert.equal(
    await js(
      "window.__packagedCanvas === document.querySelector('.terminal-surface canvas')",
    ),
    true,
  );
  assert.equal(shellStat()?.start, identity.start);
  checks.push(
    options.macosLifecycle
      ? "surviving-PTY-and-Surface"
      : "same-PTY-and-Surface",
  );
  assert.equal(
    await js(
      "(() => { const surface = document.activeElement?.closest('.terminal-surface'); const rect = surface?.getBoundingClientRect(); return !!rect && rect.width > 0 && rect.height > 0 && !surface.closest('[hidden], [inert]') && !document.querySelector('.settings-dialog'); })()",
    ),
    true,
  );
  await writeFile(
    path.join(options.evidence, "terminal-after.png"),
    (await core.capturePage()).toPNG(),
  );
  if (options.macosLifecycle || options.publicLink) {
    await settings();
    await installArchive();
    await state("generation 6");
    assert.equal(approvals, 3);
    assert.equal(children.length, 2, "third install remains dormant");
    view = await openFiles();
    assert.equal(children.length, 3);
    assert.equal(children[2].exit, null);
    assert.equal(children[2].closed, false);
    assert.equal(view.isDestroyed(), false);
    checks.push("third-consent-active-Files-at-Quit");
  }
  if (catalogTransport) {
    assert.deepEqual(catalogTransport.requests, [
      "/catalog",
      "/catalog",
      "/catalog",
      "/archive",
      "/archive",
      "/catalog",
      "/catalog",
      "/archive",
    ]);
    await cleanup();
  }
  const result = {
    renderedCatalog,
    destroyedListeners,
    catalog: options.catalogMode
      ? {
          mode: options.catalogMode,
          requests: catalogTransport?.requests ?? null,
          transportClosed: catalogTransport ? true : null,
        }
      : null,
    checks,
    approvals,
    archiveSha256: options.archiveSha256,
    ...(options.publicLink
      ? {
          publicLink: { url: options.publicLink, installs: publicLinkInstalls },
        }
      : {}),
    children,
    shell: { ...shell, start: identity.start },
    ...(options.macosLifecycle ? { initialShell, sourceExited } : {}),
    host: app.getVersion(),
    executable: process.execPath,
    appPath: app.getAppPath(),
    input: "synthetic Chromium; native consent controlled; inspector observer",
  };
  app.once("will-quit", () => {
    const remaining = shellStat();
    assert.ok(
      !remaining ||
        remaining.start !== identity.start ||
        /^[ZXx]/.test(remaining.state),
      "shell kernel exit before will-quit",
    );
    children.forEach(assertNormalBackendRetirement);
    writeFileSync(
      path.join(options.evidence, "quit.json"),
      JSON.stringify(
        {
          ...result,
          quit: "joined",
          joined: true,
          baselineExited: !processIdentity.alive({
            pid: initialShell.probePid,
            start: initialShell.start,
          }),
          shellAtQuit: remaining,
        },
        null,
        2,
      ),
    );
  });
  return result;
}

module.exports = {
  inspect,
  run,
  cleanup,
  assertNormalBackendRetirement,
  diagnoseListing,
  diagnose: () => diagnoseListing(currentRoot),
  abort: async () => {
    await cleanup();
    app.quit();
  },
  quit: () => app.quit(),
};
