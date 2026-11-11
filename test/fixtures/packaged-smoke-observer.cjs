// Loaded into a packaged OMXTerm main process through its loopback inspector.
// Drives the real UI: install an extension from a local archive through
// Settings, then exercise Files, SSH Connect or Snippets against the real
// terminal.
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { BrowserWindow, Menu, app, dialog, webContents } = require("electron");

async function until(check, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
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
  item.click(item, BrowserWindow.getAllWindows()[0], {});
}

function click(contents, label) {
  return contents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => (b.textContent === ${JSON.stringify(label)} || b.getAttribute('aria-label') === ${JSON.stringify(label)}) && !b.closest('[hidden]'));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
}

const extensionView = () =>
  webContents
    .getAllWebContents()
    .find(
      (view) =>
        !view.isDestroyed() && view.getURL().startsWith("omx-extension://"),
    );

const shellQuote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";

// Waits for a working shell, then installs `archive` through Settings.
async function install(archive, id, marker) {
  const window = BrowserWindow.getAllWindows()[0];
  assert.ok(window, "application window");
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const consents = [];
  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [archive],
  });
  dialog.showMessageBox = async (...args) => {
    const prompt = args.at(-1);
    consents.push(prompt.message);
    // The trust dialog's second button installs.
    return { response: 1, checkboxChecked: false };
  };

  async function type(text, enter) {
    core.focus();
    await js("document.querySelector('.terminal-surface')?.focus()");
    await core.insertText(text);
    if (enter) {
      core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    }
  }
  const read = (file) => readFile(file, "utf8").catch(() => undefined);

  await until(
    () => js("!!document.querySelector('.terminal-surface canvas')"),
    "terminal surface",
  );
  // Prove the shell is reading input before the real check.
  const ready = marker + ".ready";
  await type(`printf ok > ${shellQuote(ready)}`, true);
  await until(async () => (await read(ready)) === "ok", "shell reads input");

  menu("Settings");
  await until(
    () => js("!!document.querySelector('#settings-tab-extensions')"),
    "Settings",
  );
  await js("document.querySelector('#settings-tab-extensions').click()");
  await until(() => click(core, "Install local .omxext…"), "install button");
  await until(
    () =>
      js(
        `document.querySelector('.extensions-panel')?.textContent.includes(${JSON.stringify(`${id} · generation 1`)})`,
      ),
    "extension installed",
  );
  assert.equal(consents.length, 1, "one trust prompt");
  await js("document.querySelector('.settings-close')?.click()");
  await until(
    () => js("!document.querySelector('.settings-dialog')"),
    "Settings closed",
  );

  return { core, type, read, consents };
}

async function files({ archive, directory, fileName, marker }) {
  const { type, read, consents } = await install(
    archive,
    "omxterm.files",
    marker,
  );
  menu("Files");
  await until(() => !!extensionView(), "Files view");
  const view = extensionView();
  const listed = path.join(directory, fileName);
  await until(
    () =>
      view.executeJavaScript(
        "document.querySelector('.entries')?.getAttribute('aria-busy') === 'false'",
      ),
    "initial listing",
  );
  await view.executeJavaScript(`(() => {
    const input = document.querySelector('form.location input');
    input.value = ${JSON.stringify(directory)};
    document.querySelector('form.location').requestSubmit();
  })()`);
  const rowQuery = `[...document.querySelectorAll('.file-row[role=treeitem]')].find(row => row.dataset.path === ${JSON.stringify(listed)})`;
  await until(() => view.executeJavaScript(`!!${rowQuery}`), "listed file row");
  const rows = await view.executeJavaScript(
    "[...document.querySelectorAll('.file-row[role=treeitem]')].map(row => row.dataset.path)",
  );

  // Start a command, insert the path at the prompt, then finish the command.
  await type("printf '%s' ", false);
  await view.executeJavaScript(`(() => {
    const row = ${rowQuery};
    row.click();
    row.focus();
  })()`);
  // Watch the notices from before the keypress: the insertion always shows
  // one (pending, or a refusal), even if it clears between two polls.
  await view.executeJavaScript(`(() => {
    const notices = [...document.querySelectorAll('[role=status], [role=alert]')];
    let answered = false;
    const observer = new MutationObserver(() => {
      if (notices.some(n => !n.hidden)) answered = true;
    });
    for (const notice of notices)
      observer.observe(notice, { subtree: true, childList: true, characterData: true, attributes: true });
    window.__insertionSettled = () =>
      answered && !notices.some(n => !n.hidden && n.textContent.startsWith('Inserting path'));
  })()`);
  view.focus();
  view.sendInputEvent({
    type: "keyDown",
    keyCode: "Enter",
    modifiers: ["shift"],
  });
  view.sendInputEvent({
    type: "keyUp",
    keyCode: "Enter",
    modifiers: ["shift"],
  });
  // Settled: the insertion started and its pending status cleared, or it was
  // refused up front with a notice.
  await until(
    () => view.executeJavaScript("window.__insertionSettled()"),
    "insertion settled",
  );
  const notices = await view.executeJavaScript(
    "[...document.querySelectorAll('[role=status], [role=alert]')].filter(n => !n.hidden).map(n => n.textContent)",
  );
  await type(` > ${shellQuote(marker)}`, true);
  await until(
    async () => (await read(marker)) !== undefined,
    "marker",
    10000,
  ).catch(() => {});
  return { consents, rows, notices, inserted: await read(marker) };
}

async function ssh({ archive, alias, marker }) {
  const { read, consents } = await install(archive, "omxterm.ssh", marker);
  menu("SSH Connect");
  await until(() => !!extensionView(), "SSH view");
  const view = extensionView();
  const row = `document.querySelector(${JSON.stringify(`.alias-row[data-alias="${alias}"]`)})`;
  await until(() => view.executeJavaScript(`!!${row}`), "alias row");
  await view.executeJavaScript(`${row}.click()`);
  // The fake ssh client on PATH writes its argv, one per line.
  await until(
    async () => (await read(marker)) !== undefined,
    "ssh launch",
    10000,
  ).catch(() => {});
  const notices = await view.executeJavaScript(
    "[...document.querySelectorAll('[role=status], [role=alert]')].filter(n => !n.hidden).map(n => n.textContent)",
  );
  return {
    consents,
    notices,
    argv: (await read(marker))?.trimEnd().split("\n"),
  };
}

// `insert` and `run` name two snippets whose bodies write `marker` and
// `marker + ".run"`.
async function snippets({ archive, insert, run, marker }) {
  const { type, read, consents } = await install(
    archive,
    "omxterm.snippets",
    marker,
  );
  menu("Toggle Snippets");
  await until(() => !!extensionView(), "Snippets view");
  const view = extensionView();
  const row = (name) =>
    `[...document.querySelectorAll('.snippet-activate')].find(row => row.querySelector('.snippet-name')?.textContent === ${JSON.stringify(name)})`;
  await until(() => view.executeJavaScript(`!!${row(insert)}`), "snippet rows");
  const written = (file) =>
    until(async () => (await read(file)) !== undefined, file, 10000).catch(
      () => {},
    );

  // Insert types the body at the prompt; Enter is ours to press.
  await view.executeJavaScript(`${row(insert)}.click()`);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await type("", true);
  await written(marker);
  // Run types the body and presses Enter itself.
  await view.executeJavaScript(`${row(run)}.click()`);
  await written(marker + ".run");
  const notices = await view.executeJavaScript(
    "[...document.querySelectorAll('[role=status], [role=alert]')].filter(n => !n.hidden).map(n => n.textContent)",
  );
  return {
    consents,
    notices,
    inserted: await read(marker),
    ran: await read(marker + ".run"),
  };
}

function quit() {
  setImmediate(() => app.quit());
  return true;
}

const windows = () => BrowserWindow.getAllWindows().length;

module.exports = { files, ssh, snippets, quit, windows };
