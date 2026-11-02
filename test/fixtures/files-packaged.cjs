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
let publicObservation;
let currentRoot;
const processIdentity = require("./snippets-process-identity.cjs");
async function cleanup() {
  const observation = publicObservation;
  publicObservation = undefined;
  try {
    observation?.stop();
  } finally {
    await catalogTransport?.close();
  }
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

function extensionsIdle(document, publicCatalog) {
  // Other tools may be incompatible; their permanently disabled catalog actions
  // are not pending management. The selected Files action is checked separately.
  return ![...document.querySelectorAll(".extensions-panel button")].some(
    (button) =>
      button.disabled &&
      !(publicCatalog && button.closest(".extension-catalog-card")),
  );
}

function installPublicCatalog(document, action, version = "0.5.0") {
  const cards = [
    ...document.querySelectorAll(".extension-catalog-card"),
  ].filter(
    (card) =>
      card.querySelector("h4")?.textContent ===
      `Files — ARM64 preview · ${version}`,
  );
  if (cards.length !== 1) throw Error("exact Files catalog card unavailable");
  const button = [...cards[0].querySelectorAll("button")].find(
    (item) => item.textContent === action,
  );
  if (!button || button.disabled || button.closest("[hidden], [inert]"))
    throw Error("Files catalog action unavailable");
  button.click();
}

// Serialized into Settings: other extensions must not satisfy a Files state.
function filesPublicManagementState(
  document,
  generation,
  state,
  action,
  click,
  local = "dormant",
) {
  const rows = [
    ...document.querySelectorAll(".extensions-panel section"),
  ].filter((row) =>
    [...row.querySelectorAll(":scope > p")].some((paragraph) =>
      paragraph.textContent.startsWith("omxterm.files · generation "),
    ),
  );
  if (rows.length !== 1 || rows[0].closest("[hidden], [inert]")) return false;
  const row = rows[0];
  const text = [...row.querySelectorAll(":scope > p")].find((paragraph) =>
    paragraph.textContent.startsWith("omxterm.files · generation "),
  )?.textContent;
  if (
    text !==
      `omxterm.files · generation ${generation} · ${state} · local ${local} · other instances unknown` ||
    (state !== "uninstalled" &&
      row.querySelector(":scope > h3")?.textContent !==
        "Files — ARM64 preview · 0.6.0")
  )
    return false;
  if (!action) return !click;
  const buttons = [...row.querySelectorAll("button")].filter(
    (button) =>
      button.textContent === action &&
      !button.disabled &&
      !button.closest("[hidden], [inert]"),
  );
  if (buttons.length !== 1) return false;
  if (click) buttons[0].click();
  return true;
}

function verifyFilesConsent(prompt, options, approvals) {
  assert.equal(prompt.title, "Trust extension code?");
  assert.ok(
    prompt.detail.includes(options.archiveSha256),
    "trust must identify exact separate archive",
  );
  assert.match(prompt.detail, /network/);
  if (options.linuxExpectedIdentity) {
    assert.ok(options.extensionName && options.extensionVersion);
    assert.match(options.archiveSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      prompt.message,
      `Install ${options.extensionName} ${options.extensionVersion}?`,
      "expected Files name and version before consent",
    );
    assert.ok(
      prompt.detail.includes(
        `\n\nPackage: omxterm.files\nSHA-256: ${options.archiveSha256}\n`,
      ),
      "expected Files ID and exact digest before consent",
    );
  }
  if (options.publicCatalog)
    assert.ok(
      prompt.detail.includes(
        "Official means project-maintained, not sandboxed or harmless.",
      ),
      "catalog-bound Official trust required",
    );
  if (options.macosLifecycle || options.publicLink || options.publicCatalog) {
    assert.equal(
      prompt.message,
      `Install Files — ARM64 preview ${options.extensionVersion ?? "0.5.0"}?`,
      "new Files archive version shown before consent",
    );
    assert.ok(
      prompt.detail.includes("omxterm.files"),
      "manifest ID before consent",
    );
  }
  if (options.publicCatalog && options.extensionVersion === "0.6.0") {
    const generations = [0, 1, 5];
    assert.ok(Number.isInteger(approvals) && approvals >= 0 && approvals < 3);
    assert.equal(prompt.type, "warning");
    assert.equal(
      prompt.detail,
      `This is trusted local code, not a sandbox. It can read/change files, run programs and use the network with your user permissions. Third-party authors are responsible for their extensions. Only install packages you trust. Installation is dormant until you invoke its action.\n\nPackage: omxterm.files\nSHA-256: ${options.archiveSha256}\nCurrent generation: ${generations[approvals]}\n\nOfficial means project-maintained, not sandboxed or harmless. Extensions run trusted code with access to files, programs and networks. HTTPS and the catalog hash bind the selected bytes; they are not an independent publisher signature. Third-party authors remain responsible for their extensions.`,
      "exact Files catalog identity, digest and captured generation before consent",
    );
    assert.deepEqual(prompt.buttons, ["Cancel", "Trust and install"]);
    assert.equal(prompt.defaultId, 0);
    assert.equal(prompt.cancelId, 0);
  }
}

function checksCurrentFilesUi(options) {
  return !!(
    (options.macosLifecycle || options.linuxCurrentFilesUi) &&
    options.extensionVersion === "0.6.0"
  );
}

function focusLinuxFilesRow(document, expectedPath) {
  if (!document.hasFocus()) throw Error("Files tree focus unavailable");
  const rows = [
    ...document.querySelectorAll(
      '.entries[role="tree"] [role="treeitem"][data-path]',
    ),
  ].filter((row) => row.dataset.path === expectedPath);
  if (rows.length !== 1 || rows[0].closest("[hidden], [inert]"))
    throw Error("Files tree row unavailable");
  rows[0].focus();
  if (!document.hasFocus() || document.activeElement !== rows[0])
    throw Error("Files tree focus unavailable");
  return true;
}

function dispatchLinuxFilesShortcut(document, expectedPath) {
  const row = document.activeElement;
  if (
    !document.hasFocus() ||
    !document.defaultView.navigator.platform.startsWith("Linux") ||
    !row?.matches('[role="treeitem"][data-path]') ||
    row.dataset.path !== expectedPath ||
    row.closest("[hidden], [inert]")
  )
    throw Error("Files shortcut focus unavailable");
  const event = new document.defaultView.KeyboardEvent("keydown", {
    key: "h",
    code: "KeyH",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  row.dispatchEvent(event);
  if (
    !event.defaultPrevented ||
    !document.hasFocus() ||
    document.activeElement?.dataset.path !== expectedPath
  )
    throw Error("Files shortcut focus or delivery changed");
  return true;
}

async function run(options) {
  if (options.catalogMode === "public") {
    if (options.linuxHistoricalPublic) {
      assert.equal(options.version, "0.24.0-dev.11");
      assert.equal(options.extensionVersion, "0.4.0");
      assert.equal(options.extensionName, "Files — Linux ARM64 preview");
      assert.equal(
        options.archiveSha256,
        "384de7da4cc2fafe7e42cd4ccf19a455a2e634036069160c75e15b7371d2eb6e",
      );
      assert.ok(
        options.linuxExpectedIdentity &&
          !options.publicCatalog &&
          !options.publicLink,
      );
    } else {
      assert.ok(options.publicCatalog, "public catalog endpoint required");
      if (process.platform === "linux")
        assert.equal(
          options.linuxPublicCatalog,
          true,
          "Linux public observation required",
        );
    }
  }
  if (options.publicCatalog) {
    assert.equal(
      options.publicCatalog,
      options.linuxPublicCatalog
        ? "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json"
        : "https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json",
    );
    assert.equal(options.catalogMode, "public");
    assert.ok(!options.publicLink && !options.macosLifecycle);
  }
  if (options.linuxPublicCatalog) {
    assert.ok(options.publicCatalog);
    assert.equal(options.version, "0.24.0");
    assert.equal(options.extensionVersion, "0.6.0");
    assert.equal(options.extensionName, "Files — ARM64 preview");
    assert.equal(options.linuxCurrentFilesUi, false);
  }
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
  let currentFilesUi = false;
  let linuxFilesShortcut = false;
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
      const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => ${options.publicCatalog && selector === ".extension-catalog-card" ? `item.querySelector('h4')?.textContent === ${JSON.stringify(`Files — ARM64 preview · ${options.extensionVersion ?? "0.5.0"}`)}` : `item.textContent.includes(${JSON.stringify(text)})`});
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
  if (options.linuxPublicCatalog) {
    publicObservation =
      require("./public-catalog-observer.cjs").startFilesPublicObservation({
        ipcMain: require("electron").ipcMain,
        diagnostics: require("node:diagnostics_channel"),
        catalogSha256: options.catalogSha256,
        archiveSha256: options.archiveSha256,
        verifyTrust: (prompt, _digest, index) =>
          verifyFilesConsent(prompt, options, index),
      });
  }
  dialog.showOpenDialog = async () => {
    assert.ok(
      !options.publicLink &&
        !options.publicCatalog &&
        options.catalogMode !== "public",
      "public acquisition must not use local chooser",
    );
    return { canceled: false, filePaths: [options.archive] };
  };
  dialog.showMessageBox = async (_owner, prompt) => {
    verifyFilesConsent(prompt, options, approvals);
    publicObservation?.verifyTrust(prompt);
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
      const button = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.textContent === ${JSON.stringify(label)}) && !b.closest('[hidden]'));
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
      `!![...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') === ${JSON.stringify(label)} || b.textContent === ${JSON.stringify(label)}) && !b.closest('[hidden]'))`,
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
          `(${extensionsIdle.toString()})(document, ${!!options.publicCatalog})`,
        ),
      "Settings admission",
    );
  }
  async function state(text) {
    await until(
      () =>
        js(
          `document.querySelector('.extensions-panel').textContent.includes(${JSON.stringify(text)}) && (${extensionsIdle.toString()})(document, ${!!options.publicCatalog})`,
        ),
      text,
      options.linuxPublicCatalog ? 65000 : 15000,
    );
  }
  async function publicManagement(
    generation,
    state,
    action,
    click = false,
    local = "dormant",
  ) {
    if (!options.linuxPublicCatalog) return;
    const expression = `(${filesPublicManagementState.toString()})(document, ${generation}, ${JSON.stringify(state)}, ${JSON.stringify(action)}, ${click}, ${JSON.stringify(local)})`;
    if (click)
      assert.equal(await js(expression), true, "exact Files management action");
    else
      await until(
        () => js(expression),
        `Files generation ${generation} ${state}`,
      );
  }
  async function manageFiles(label, generation, state, local = "dormant") {
    if (options.linuxPublicCatalog) {
      await publicManagement(generation, state, label, false, local);
      await publicManagement(generation, state, label, true, local);
    } else await click(core, label);
  }
  const publicLinkInstalls = [];
  const publicCatalogInstalls = [];
  async function installArchive(action = "Install") {
    if (options.publicCatalog) {
      assert.ok(!options.publicLink && !options.macosLifecycle);
      await js(
        `(${installPublicCatalog.toString()})(document, ${JSON.stringify(action)}, ${JSON.stringify(options.extensionVersion ?? "0.5.0")})`,
      );
      publicCatalogInstalls.push(action);
    } else if (options.publicLink) {
      assert.ok(!options.catalogMode && !options.macosLifecycle);
      await js(
        `(${installPublicLink.toString()})(document, ${JSON.stringify(options.publicLink)})`,
      );
      publicLinkInstalls.push(options.publicLink);
    } else await click(core, "Install local .omxext…");
  }
  async function openFiles() {
    await js("document.querySelector('.settings-close')?.click()");
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
  async function closeFiles(view, action) {
    const native = window.contentView.children.find(
      (child) => child.webContents === view,
    );
    assert.ok(native);
    const oldId = view.id;
    const backend = children[0];
    await view.executeJavaScript(
      "document.querySelector('form.location input').value = 'discard-on-close';",
    );
    let destroyed = false;
    view.once("destroyed", () => {
      destroyed = true;
    });
    await action();
    await until(
      async () =>
        destroyed &&
        view.isDestroyed() &&
        !window.contentView.children.includes(native) &&
        hosted().length === 0 &&
        core.isFocused() &&
        (await js(
          "document.querySelector('.auxiliary-panel').hidden && ![...document.querySelectorAll('.auxiliary-tools button')].some(b => b.textContent === 'Files') && !!document.activeElement?.closest('.terminal-surface')",
        )),
      "Close destroys and detaches Files, removes opened membership and returns terminal focus",
    );
    assert.equal(shellStat()?.start, identity.start);
    const replacement = await openFiles();
    assert.notEqual(replacement, view);
    assert.notEqual(replacement.id, oldId);
    assert.equal(
      await replacement.executeJavaScript(
        "document.querySelector('form.location input').value === 'discard-on-close'",
      ),
      false,
    );
    assert.equal(children.length, 1);
    assert.equal(children[0], backend);
    assert.equal(backend.closed, false);
    assert.equal(backend.exit, null);
    return replacement;
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
  async function captureFilesOperation(view) {
    // Public checkpoints use the current auto-refreshing page. Local legacy and
    // macOS lifecycle campaigns retain their different final-state contract.
    if (options.publicLink || options.publicCatalog) {
      const ready = `(${listingReady(options.files)}) &&
        !!${entryQuery(options.files, "moved.txt")} &&
        !${entryQuery(options.files, "source.txt")} &&
        !document.querySelector('.operation-editor').inert &&
        document.querySelector('.operation-editor').hidden &&
        [...document.querySelectorAll('[role=status]')].some(notice => notice.textContent === 'Operation completed.')`;
      await until(
        () => view.executeJavaScript(ready),
        "completed Files move ready for capture",
      );
      // These are render opportunities, not compositor/pixel freshness proof.
      // The enclosing native supervisor still bounds an unavailable renderer.
      await view.executeJavaScript(`(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (!(${ready})) throw Error('Files operation changed before capture');
      })()`);
    }
    return view.capturePage();
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
    if (catalogTransport)
      assert.equal(
        catalogTransport.requests.length,
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
    await captureCatalog(
      "catalog.png",
      ".extension-catalog-card",
      options.publicCatalog
        ? `Files — ARM64 preview · ${options.extensionVersion ?? "0.5.0"}`
        : "Install",
    );
    if (options.publicCatalog) await installArchive();
    else await click(core, "Install");
  } else await installArchive();
  await state("generation 1");
  await publicManagement(1, "enabled", "Disable");
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
  if (!options.publicLink && !options.publicCatalog) {
    view = await closeFiles(view, () => menu("Files"));
    view = await closeFiles(view, () =>
      js("document.querySelector('.auxiliary-close').click()"),
    );
    await filesAction(view, "Use terminal directory");
    await until(
      () => view.executeJavaScript(listingReady(options.root)),
      "initial captured OSC 7 directory",
    );
    const initialDirectory = options.root;
    await view.executeJavaScript(
      "window.__filesDirectory = document.querySelector('form.location input'); window.__filesDirectory.value = 'unsaved-directory';",
    );
    await js("document.querySelector('.auxiliary-hide').click()");
    await panel(view, false, "core");
    menu("Toggle Auxiliary Panel");
    await panel(view, true, "child");
    assert.equal(
      await view.executeJavaScript(
        "window.__filesDirectory === document.querySelector('form.location input') && window.__filesDirectory.value === 'unsaved-directory'",
      ),
      true,
    );
    menu("Toggle Auxiliary Panel");
    await panel(view, false, "core");
    menu("Files");
    await panel(view, true, "child");
    checks.push(
      "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
    );
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
    // Hide before revealing to retain the legacy captured terminal context.
    await js("document.querySelector('.auxiliary-hide').click()");
    await panel(view, false, "core");
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
    // Selected-visible entry closes even after terminal switching/closing.
    view = await closeFiles(view, () => menu("Files"));
    assert.equal(children.length, 1, "fresh view never restarts backend");
    checks.push(
      "panel-outside-tabs-hide-reveal-settings-terminal-switch-selected-visible-close",
      "selected-visible-toggle-header-close-destroy-fresh-view-same-backend-PTY",
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
  if (checksCurrentFilesUi(options)) {
    assert.equal(
      await js("document.querySelector('.auxiliary-header h2')?.textContent"),
      "Files",
      "host owns the visible Files title",
    );
    const toolbar = await view.executeJavaScript(`(() => {
      const icons = ['home', 'up', 'refresh', 'new-folder', 'actions', 'go'];
      return {
        names: icons.map(icon => document.querySelector('[aria-describedby="files-toolbar-' + icon + '-tooltip"]')?.getAttribute('aria-label')),
        hasIcons: icons.every(icon => !!document.querySelector('[aria-describedby="files-toolbar-' + icon + '-tooltip"] svg')),
        childHeading: !!document.querySelector('h1'),
        regionName: document.querySelector('[role=region]')?.getAttribute('aria-label'),
      };
    })()`);
    assert.deepEqual(toolbar, {
      names: ["Home", "Up", "Refresh", "New folder", "Actions…", "Go"],
      hasIcons: true,
      childHeading: false,
      regionName: "Files",
    });
    const tooltip = await view.executeJavaScript(`(() => {
      const button = document.querySelector('[aria-describedby="files-toolbar-go-tooltip"]');
      button.focus();
      const tip = document.getElementById(button.getAttribute('aria-describedby'));
      return { hidden: tip.hidden, text: tip.textContent };
    })()`);
    assert.deepEqual(tooltip, {
      hidden: false,
      text: "Open the entered directory (Enter in the address field)",
    });
    await view.executeJavaScript(`(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (document.getElementById('files-toolbar-go-tooltip').hidden) throw Error('tooltip disappeared before capture');
    })()`);
    await writeFile(
      path.join(options.evidence, "files-toolbar.png"),
      (await view.capturePage()).toPNG(),
    );
    await writeFile(
      path.join(options.evidence, "files-host-header.png"),
      (await core.capturePage()).toPNG(),
    );
    assert.equal(
      await readFile(path.join(options.files, ".release-dotfile"), "utf8"),
      "dotfile",
    );
    const dotfile = `!![...document.querySelectorAll('[role=treeitem][data-path]')].find(row => row.dataset.path === ${JSON.stringify(path.join(options.files, ".release-dotfile"))})`;
    assert.equal(await view.executeJavaScript(dotfile), false);
    await view.executeJavaScript(`(() => {
      const input = document.querySelector('form.location input');
      input.value = 'unsubmitted address';
      input.focus();
      input.setSelectionRange(2, 8, 'backward');
    })()`);
    for (const shown of [true, false]) {
      await click(view, "Actions…");
      assert.equal(
        await view.executeJavaScript(
          "document.querySelector('[role=menuitemcheckbox]')?.getAttribute('aria-checked')",
        ),
        String(!shown),
      );
      await view.executeJavaScript(
        "document.querySelector('[role=menuitemcheckbox]').click()",
      );
      await until(
        () => view.executeJavaScript(`${dotfile} === ${shown}`),
        "dotfile visibility toggled",
      );
      assert.deepEqual(
        await view.executeJavaScript(`(() => {
          const input = document.querySelector('form.location input');
          return [input.value, input.selectionStart, input.selectionEnd, input.selectionDirection];
        })()`),
        ["unsubmitted address", 2, 8, "backward"],
      );
    }
    if (options.linuxCurrentFilesUi) {
      await panel(view, true, "child");
      const sourcePath = path.join(options.files, "source.txt");
      assert.equal(
        await view.executeJavaScript(
          `(${focusLinuxFilesRow.toString()})(document, ${JSON.stringify(sourcePath)})`,
        ),
        true,
        "owned Files tree row has child focus",
      );
      for (const shown of [true, false]) {
        assert.equal(
          await view.executeJavaScript(
            `(${dispatchLinuxFilesShortcut.toString()})(document, ${JSON.stringify(sourcePath)})`,
          ),
          true,
        );
        await until(
          () => view.executeJavaScript(`${dotfile} === ${shown}`),
          "Linux Ctrl+H dotfile visibility",
        );
        assert.deepEqual(
          await view.executeJavaScript(`(() => {
            const input = document.querySelector('form.location input');
            return [input.value, input.selectionStart, input.selectionEnd, input.selectionDirection];
          })()`),
          ["unsubmitted address", 2, 8, "backward"],
        );
        await panel(view, true, "child");
      }
      linuxFilesShortcut = true;
    }
    await view.executeJavaScript(
      `document.querySelector('form.location input').value = ${JSON.stringify(options.files)}`,
    );
    currentFilesUi = true;
  }
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
    await js("document.querySelector('.auxiliary-hide').click()");
    await panel(view, false, "core");
    menu("Toggle Auxiliary Panel");
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
    (await captureFilesOperation(view)).toPNG(),
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
      options.publicCatalog
        ? `Files — ARM64 preview · ${options.extensionVersion ?? "0.5.0"}`
        : "Reinstall",
    );
  if (options.publicCatalog) await installArchive("Reinstall");
  else if (options.catalogMode) await click(core, "Reinstall");
  else await installArchive();
  await state("generation 2");
  await until(
    () => hosted().length === 0 && children[0].closed,
    "replacement retired actual backend/view",
  );
  assertNormalBackendRetirement(children[0]);
  await publicManagement(2, "enabled", "Disable");
  assert.equal(children.length, 1, "replacement remains dormant");
  assert.equal(approvals, 2);
  checks.push("explicit-reinstall-actual-retirement-dormant");
  listeners("reinstalled-dormant");
  view = await openFiles();
  listeners("second-view-active");
  assert.equal(children.length, 2);
  assert.notEqual(children[0].pid, children[1].pid);
  await settings();
  await manageFiles("Disable", 2, "enabled", "active");
  await state("generation 3");
  await until(
    () => hosted().length === 0 && children[1].closed,
    "Disable retirement",
  );
  assertNormalBackendRetirement(children[1]);
  await publicManagement(3, "disabled", "Enable");
  if (options.macosLifecycle || options.publicLink || options.publicCatalog) {
    await manageFiles("Enable", 3, "disabled");
    await state("generation 4");
    await publicManagement(4, "enabled", "Uninstall");
    assert.equal(children.length, 2, "Enable remains dormant");
    assert.equal(hosted().length, 0);
  }
  await manageFiles(
    "Uninstall",
    options.publicCatalog ? 4 : 3,
    options.publicCatalog ? "enabled" : "disabled",
  );
  await state("uninstalled");
  await publicManagement(5, "uninstalled");
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
  if (options.macosLifecycle || options.publicLink || options.publicCatalog) {
    await settings();
    await installArchive();
    await state("generation 6");
    if (options.linuxPublicCatalog)
      await publicManagement(6, "enabled", "Disable");
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
  if (currentFilesUi) checks.push("current-Files-toolbar-dotfiles-draft");
  if (linuxFilesShortcut)
    checks.push("linux-Files-Ctrl-H-dotfiles-draft-focus");
  let publicBinding;
  if (publicObservation) {
    publicBinding = publicObservation.summary();
    assert.equal(publicBinding.catalogGeneration, 1);
    assert.equal(publicBinding.approvals, 3);
    assert.equal(publicBinding.installed, 3);
    assert.equal(publicBinding.attempts.length, 3);
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
    ...(publicBinding ? { publicBinding } : {}),
    archiveSha256: options.archiveSha256,
    ...(options.linuxExpectedIdentity
      ? {
          extensionVersion: options.extensionVersion,
          extensionName: options.extensionName,
        }
      : {}),
    ...(options.publicCatalog
      ? {
          publicCatalog: {
            url: options.publicCatalog,
            installs: publicCatalogInstalls,
          },
        }
      : {}),
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
    if (publicObservation) {
      assert.deepEqual(publicObservation.summary(), publicBinding);
      publicObservation.stop({ allowRemoved: true });
      publicObservation = undefined;
    }
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
  verifyFilesConsent,
  filesPublicManagementState,
  checksCurrentFilesUi,
  focusLinuxFilesRow,
  dispatchLinuxFilesShortcut,
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
