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
const psQuote = (text) => "'" + text.replaceAll("'", "''") + "'";

// Commands typed into the shell under test: PowerShell, the Windows Default
// Shell, or a POSIX shell elsewhere. `reportFolder` is the one-line form of the
// startup lines in docs/saved-layout.md, so the smoke checks them too.
const shell = path.basename(require("node:os").userInfo().shell ?? "");
const commands =
  process.platform === "win32"
    ? {
        write: (text, file) =>
          `Set-Content -NoNewline -LiteralPath ${psQuote(file)} -Value ${psQuote(text)}`,
        reportFolder: String.raw`function prompt { $location = $ExecutionContext.SessionState.Path.CurrentLocation; if ($location.Provider.Name -eq 'FileSystem') { $path = $location.ProviderPath -replace '\\', '/'; [Console]::Write("$([char]27)]7;file://$([System.Net.Dns]::GetHostName())/$path$([char]27)\") }; "PS $location> " }`,
        cd: (folder) => `Set-Location -LiteralPath ${psQuote(folder)}`,
        pwd: (file) =>
          `Set-Content -NoNewline -LiteralPath ${psQuote(file)} -Value (Get-Location).ProviderPath`,
      }
    : {
        write: (text, file) =>
          `printf %s ${shellQuote(text)} > ${shellQuote(file)}`,
        reportFolder:
          shell === "zsh"
            ? '_report_folder() { printf \'\\033]7;file://%s%s\\033\\\\\' "$HOST" "$PWD"; }; autoload -Uz add-zsh-hook; add-zsh-hook precmd _report_folder'
            : '_report_folder() { printf \'\\033]7;file://%s%s\\033\\\\\' "$HOSTNAME" "$PWD"; }; PROMPT_COMMAND="_report_folder${PROMPT_COMMAND:+;$PROMPT_COMMAND}"',
        cd: (folder) => `cd ${shellQuote(folder)}`,
        pwd: (file) => `printf %s "$PWD" > ${shellQuote(file)}`,
      };

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
  await type(commands.write("ok", ready), true);
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

// Saved Layout, first launch: a reported folder, a split that inherits it and
// a home tab; tab 1 stays selected with the split focused. Save the window.
async function layoutSave({ archive, folder, marker }) {
  const { core, type, read, consents } = await install(
    archive,
    "omxterm.restoration",
    marker,
  );
  const js = (code) => core.executeJavaScript(code);
  const surfaces = (count) =>
    until(
      () =>
        js(
          `document.querySelectorAll('.terminal-surface canvas').length === ${count}`,
        ),
      `${count} terminal surfaces`,
    );
  // Report the folder from the prompt as the user guide shows, then change to
  // it; the next prompt reports it.
  await type(commands.reportFolder, true);
  await type(
    `${commands.cd(folder)}; ${commands.write("ok", marker + ".cd")}`,
    true,
  );
  await until(async () => (await read(marker + ".cd")) === "ok", "cd");
  // The prompt that follows carries the report.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  menu("New Tab");
  await surfaces(2);
  menu("Show Previous Tab");
  menu("Split Right");
  await surfaces(3);
  menu("Saved Layout");
  await until(() => !!extensionView(), "Saved Layout view");
  const view = extensionView();
  await until(() => click(view, "Save this window"), "Save button");
  const summary = () =>
    view.executeJavaScript(
      "document.querySelector('.snapshot')?.textContent ?? ''",
    );
  await until(
    async () => /2 tabs · 3 panes/.test(await summary()),
    "saved snapshot",
  ).catch(() => {});
  const notices = await view.executeJavaScript(
    "[...document.querySelectorAll('[role=status], [role=alert]')].filter(n => !n.hidden).map(n => n.textContent)",
  );
  return { consents, notices, summary: await summary() };
}

// Saved Layout, second launch: open the saved layout and ask the focused
// restored pane where it started.
async function layoutOpen({ marker }) {
  const [first] = BrowserWindow.getAllWindows();
  await until(
    () =>
      first.webContents.executeJavaScript(
        "!!document.querySelector('.terminal-surface canvas')",
      ),
    "terminal surface",
  );
  menu("Saved Layout");
  await until(() => !!extensionView(), "Saved Layout view");
  const view = extensionView();
  await until(() => click(view, "Open in a new window"), "Open button");
  await until(() => windows() === 2, "restored window").catch(() => {});
  const notices = await view.executeJavaScript(
    "[...document.querySelectorAll('[role=status], [role=alert]')].filter(n => !n.hidden).map(n => n.textContent)",
  );
  const restored = BrowserWindow.getAllWindows().find((w) => w !== first);
  if (!restored) return { notices, windows: windows() };
  const contents = restored.webContents;
  const js = (code) => contents.executeJavaScript(code);
  await until(
    () =>
      js("document.querySelectorAll('.terminal-surface canvas').length === 3"),
    "restored surfaces",
  ).catch(() => {});
  const tabs = await js("document.querySelectorAll('.ui-tab').length");
  const panes = await js(
    "document.querySelectorAll('.terminal-surface').length",
  );
  restored.focus();
  contents.focus();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const active = await js(
    "!!document.activeElement?.closest('.terminal-surface')",
  );
  // The restored shell may still be starting; type once it reads input.
  const file = marker + ".pwd";
  for (let attempt = 0; attempt < 10; attempt++) {
    await contents.insertText(commands.pwd(file));
    contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    const done = await until(
      async () => (await readFile(file, "utf8").catch(() => "")) !== "",
      "restored pwd",
      3000,
    ).then(
      () => true,
      () => false,
    );
    if (done) break;
  }
  return {
    notices,
    windows: windows(),
    tabs,
    panes,
    active,
    pwd: await readFile(file, "utf8").catch(() => undefined),
  };
}

function quit() {
  setImmediate(() => app.quit());
  return true;
}

const windows = () => BrowserWindow.getAllWindows().length;

module.exports = {
  files,
  ssh,
  snippets,
  layoutSave,
  layoutOpen,
  quit,
  windows,
};
