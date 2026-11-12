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

const extensionViews = () =>
  webContents
    .getAllWebContents()
    .filter(
      (view) =>
        !view.isDestroyed() && view.getURL().startsWith("omx-extension://"),
    );
// A view that is being replaced may never answer; don't wait on it.
const evaluate = (view, code) =>
  Promise.race([
    view.executeJavaScript(code).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);

const shellQuote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
const psQuote = (text) => "'" + text.replaceAll("'", "''") + "'";

// Commands typed into the shell under test: PowerShell, the Windows Default
// Shell, or a POSIX shell elsewhere. On Windows `reportFolder` is the one-line
// form of the prompt in docs/saved-layout.md, so the smoke checks it too; macOS
// and Linux need no setup because OMXTerm reads the shell's own folder.
const commands =
  process.platform === "win32"
    ? {
        write: (text, file) =>
          `Set-Content -NoNewline -LiteralPath ${psQuote(file)} -Value ${psQuote(text)}`,
        reportFolder: String.raw`function prompt { $location = $ExecutionContext.SessionState.Path.CurrentLocation; if ($location.Provider.Name -eq 'FileSystem') { $path = $location.ProviderPath -replace '\\', '/'; [Console]::Write("$([char]27)]7;file://$([System.Net.Dns]::GetHostName())/$path$([char]27)\") }; "PS $location> " }`,
        cd: (folder) => `Set-Location -LiteralPath ${psQuote(folder)}`,
        // UTF-8 without BOM; Windows PowerShell's Set-Content writes ANSI.
        pwd: (file) =>
          `[IO.File]::WriteAllText(${psQuote(file)}, (Get-Location).ProviderPath)`,
      }
    : {
        write: (text, file) =>
          `printf %s ${shellQuote(text)} > ${shellQuote(file)}`,
        reportFolder: undefined,
        cd: (folder) => `cd ${shellQuote(folder)}`,
        pwd: (file) => `printf %s "$PWD" > ${shellQuote(file)}`,
      };
// Mirror Typing commands follow the same shells as `commands` above.
const onWindows = process.platform === "win32";

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

async function files({ archive, directory, fileName, marker, rename, trash }) {
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
  await type(
    onWindows
      ? `Set-Content -NoNewline -LiteralPath ${psQuote(marker)} -Value `
      : "printf '%s' ",
    false,
  );
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
  await type(onWindows ? "" : ` > ${shellQuote(marker)}`, true);
  await until(
    async () => (await read(marker)) !== undefined,
    "marker",
    10000,
  ).catch(() => {});
  // Rename and trash go through the backend and the host's native services.
  const request = (value) =>
    view.executeJavaScript(
      `omxHostedContent.request(${JSON.stringify(value)})`,
    );
  const renamed = await request({
    operation: "move",
    path: listed,
    destination: path.join(directory, rename),
  });
  const trashed = await request({
    operation: "trash",
    path: path.join(directory, trash),
  });
  return {
    consents,
    rows,
    notices,
    inserted: await read(marker),
    renamed,
    trashed,
  };
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
// a home tab; tab 1 stays selected with the split focused.
async function arrangeLayout({ archive, folder, marker }) {
  const installed = await install(archive, "omxterm.restoration", marker);
  const { core, type, read } = installed;
  const js = (code) => core.executeJavaScript(code);
  const surfaces = (count) =>
    until(
      () =>
        js(
          `document.querySelectorAll('.terminal-surface canvas').length === ${count}`,
        ),
      `${count} terminal surfaces`,
    );
  // On Windows, report the folder from the prompt as the user guide shows;
  // the prompt after the cd reports it.
  if (commands.reportFolder) await type(commands.reportFolder, true);
  await type(
    `${commands.cd(folder)}; ${commands.write("ok", marker + ".cd")}`,
    true,
  );
  await until(async () => (await read(marker + ".cd")) === "ok", "cd");
  // Let the prompt that follows arrive.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  menu("New Tab");
  await surfaces(2);
  menu("Show Previous Tab");
  menu("Split Right");
  await surfaces(3);
  return installed;
}

// Save that window from the Saved Layout page.
async function layoutSave(options) {
  const { consents } = await arrangeLayout(options);
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
  // The restored shell may still be starting; askFolder retries.
  const pwd = await askFolder(restored, marker + ".pwd");
  return { notices, windows: windows(), tabs, panes, pwd };
}

// Reopening, first launch: arrange one window, open a second one, and give
// the host time to remember both.
async function layoutRemember(options) {
  await arrangeLayout(options);
  menu("New Window");
  await until(() => windows() === 2, "second window");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  return { windows: windows() };
}

// Reopening, second launch: count each reopened window's panes, then check
// the arranged window's tabs and ask its focused pane where it started.
async function layoutReopened({ marker }) {
  const panes = [];
  let arranged;
  for (const window of BrowserWindow.getAllWindows()) {
    const js = (code) => window.webContents.executeJavaScript(code);
    await until(
      () => js("!!document.querySelector('.terminal-surface canvas')"),
      "reopened surfaces",
    ).catch(() => {});
    const count = await js(
      "document.querySelectorAll('.terminal-surface').length",
    );
    panes.push(count);
    if (count === 3) arranged = window;
  }
  panes.sort();
  if (!arranged) return { panes };
  return {
    panes,
    // The tab strip only shows tabs when there are two or more.
    tabs: await arranged.webContents.executeJavaScript(
      "document.querySelectorAll('.ui-tab').length",
    ),
    pwd: await askFolder(arranged, marker + ".reopened"),
  };
}

// Types a command that writes the focused pane's folder, until the shell reads it.
async function askFolder(window, file) {
  const contents = window.webContents;
  window.focus();
  contents.focus();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  for (let attempt = 0; attempt < 10; attempt++) {
    await contents.insertText(commands.pwd(file));
    contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    const done = await until(
      async () => (await readFile(file, "utf8").catch(() => "")) !== "",
      "folder",
      3000,
    ).then(
      () => true,
      () => false,
    );
    if (done) break;
  }
  return readFile(file, "utf8").catch(() => undefined);
}

// Two panes, one Start, then typing, Stop, paste, a native file drop and
// (with a Snippets archive) a snippet Insert.
async function mirror({ archive, snippetsArchive, marker, dropped }) {
  // Appends this shell's process id to `file`.
  const line = (file) =>
    onWindows
      ? `Add-Content -LiteralPath ${psQuote(file)} $PID`
      : `echo $$ >> ${shellQuote(file)}`;
  const { core, type, read, consents } = await install(
    archive,
    "omxterm.mirror-typing",
    marker,
  );
  const js = (code) => core.executeJavaScript(code);
  const lines = async (file) =>
    ((await read(file)) ?? "").split(/\r?\n/).filter(Boolean);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 1500));
  // Real key events into whichever pane has focus, like a person typing.
  const keys = async (text, enter = true) => {
    for (const keyCode of text) {
      core.sendInputEvent({ type: "keyDown", keyCode });
      core.sendInputEvent({ type: "char", keyCode });
      core.sendInputEvent({ type: "keyUp", keyCode });
    }
    if (enter) {
      core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      core.sendInputEvent({ type: "char", keyCode: "\r" });
      core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    }
  };
  const status = () =>
    js(
      "(() => { const row = document.querySelector('.mirror-typing-status'); return row && !row.hidden ? row.querySelector('[role=status]').textContent : ''; })()",
    );
  if (snippetsArchive) {
    menu("Settings");
    await until(
      () => js("!!document.querySelector('#settings-tab-extensions')"),
      "Settings",
    );
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [snippetsArchive],
    });
    await js("document.querySelector('#settings-tab-extensions').click()");
    await until(() => click(core, "Install local .omxext…"), "install button");
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel')?.textContent.includes('omxterm.snippets · generation 1')",
        ),
      "Snippets installed",
    );
    await js("document.querySelector('.settings-close')?.click()");
    await until(
      () => js("!document.querySelector('.settings-dialog')"),
      "Settings closed",
    );
  }

  // The action is findable from the Command Palette.
  menu("Command Palette");
  await until(
    () => js("!!document.querySelector('.command-palette [role=combobox]')"),
    "Command Palette",
  );
  await js(
    "document.querySelector('.command-palette [role=combobox]').focus()",
  );
  await core.insertText("mirror");
  await settle();
  const palette = await js(
    "[...document.querySelectorAll('.command-palette [role=option]')].map(o => o.textContent)",
  );
  core.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  core.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await until(
    () => js("!document.querySelector('.command-palette')"),
    "palette closed",
  );

  menu("Split Right");
  await until(
    () =>
      js("document.querySelectorAll('.terminal-surface canvas').length === 2"),
    "two panes",
  );
  core.focus();
  const ready = marker + ".split";
  await settle();
  await keys(line(ready));
  await until(async () => (await lines(ready)).length === 1, "split shell");

  const result = { consents, palette, steps: {} };
  const start = async (opener = "menu") => {
    if (opener === "palette") {
      menu("Command Palette");
      await until(
        () =>
          js("!!document.querySelector('.command-palette [role=combobox]')"),
        "Command Palette",
      );
      await js(
        "document.querySelector('.command-palette [role=combobox]').focus()",
      );
      await core.insertText("mirror");
      await settle();
      core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    } else menu("Mirror Typing");
    // A new action may replace the previous setup view; wait for a live one
    // whose Start has focus.
    let view;
    await until(async () => {
      for (const candidate of extensionViews())
        if (
          await evaluate(
            candidate,
            "document.activeElement?.dataset.action === 'start' && !document.activeElement.disabled",
          )
        ) {
          view = candidate;
          return true;
        }
      return false;
    }, "Start focused").catch(async (error) => {
      const views = await Promise.all(
        extensionViews().map(async (candidate) => ({
          loading: candidate.isLoading(),
          crashed: candidate.isCrashed(),
          state: await evaluate(
            candidate,
            "[document.visibilityState, document.querySelector('[role=status]')?.textContent, document.activeElement?.outerHTML].join(' | ')",
          ),
        })),
      );
      throw new Error(`${error.message}: ${JSON.stringify(views)}`);
    });
    const panes = await view.executeJavaScript(
      "[...document.querySelectorAll('.mirror-targets label')].map(l => l.textContent)",
    );
    view.focus();
    if (opener === "palette") {
      // A release or a held repeat that didn't start on Start must not start.
      view.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      view.sendInputEvent({
        type: "keyDown",
        keyCode: "Enter",
        modifiers: ["isAutoRepeat"],
      });
      view.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      await settle();
      result.strayKeysStarted = (await status()).startsWith("Mirroring typing");
    }
    // Enter on the focused Start, as a person would.
    view.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    view.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      async () => (await status()).startsWith("Mirroring typing"),
      "mirroring active",
    ).catch(async (error) => {
      const notice = await view
        .executeJavaScript(
          "[document.querySelector('[role=status]')?.textContent, document.activeElement?.outerHTML].join(' | ')",
        )
        .catch(() => "view gone");
      throw new Error(`${error.message}: ${await status()} | ${notice}`);
    });
    core.focus();
    await settle();
    return panes;
  };

  const focusedPoint = () =>
    js(
      "(() => { const pane = document.querySelector('.terminal-surface.pane-focused') ?? document.querySelector('.terminal-surface'); const r = pane.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()",
    );
  // After a stop, Enter in the other pane runs whatever reached it.
  const enterInOtherPane = async () => {
    menu("Focus Next Pane");
    await settle();
    await keys("", true);
    await settle();
    menu("Focus Next Pane");
    await settle();
  };
  // 1. Typing reaches both shells. This start comes from the palette.
  const typed = marker + ".typed";
  result.panes = await start("palette");
  result.active = await status();
  await keys(line(typed));
  await until(async () => (await lines(typed)).length >= 2, "mirrored typing");
  await settle();
  result.steps.typing = await lines(typed);

  // 2. Stop: the next command runs in one shell only.
  await js("document.querySelector('.mirror-typing-status button').click()");
  result.steps.stopStatus = await status();
  core.focus();
  const stopped = marker + ".stopped";
  await keys(line(stopped));
  await until(async () => (await lines(stopped)).length >= 1, "after Stop");
  await settle();
  result.steps.stopped = await lines(stopped);

  // 3. Every paste route stops mirroring first and goes to the focused pane
  // only: the menu, the platform shortcut and, on Linux, a middle click.
  const shortcut =
    process.platform === "darwin" ? ["meta"] : ["control", "shift"];
  const routes = {
    menu: () => menu("Paste"),
    shortcut: () => {
      core.sendInputEvent({
        type: "keyDown",
        keyCode: "V",
        modifiers: shortcut,
      });
      core.sendInputEvent({ type: "keyUp", keyCode: "V", modifiers: shortcut });
    },
    // Linux pastes the primary selection on a middle click.
    ...(process.platform === "linux"
      ? {
          middleClick: async () => {
            const { x, y } = await focusedPoint();
            for (const type of ["mouseDown", "mouseUp"])
              core.sendInputEvent({
                type,
                x,
                y,
                button: "middle",
                clickCount: 1,
              });
          },
        }
      : {}),
  };
  result.paste = {};
  for (const [route, paste] of Object.entries(routes)) {
    await start();
    const pasted = `${marker}.pasted-${route}`;
    const { clipboard } = require("electron");
    clipboard.writeText(line(pasted));
    if (process.platform === "linux")
      clipboard.writeText(line(pasted), "selection");
    await paste();
    await until(
      async () => !(await status()).startsWith("Mirroring typing"),
      `${route} paste stop`,
    );
    const pasteStatus = await status();
    await keys("", true);
    await until(
      async () => (await lines(pasted)).length >= 1,
      `${route} pasted command`,
    );
    await settle();
    await enterInOtherPane();
    result.paste[route] = { status: pasteStatus, lines: await lines(pasted) };
  }

  // 4. A native file drop stops mirroring first; only the focused pane gets
  // the path. The command before it is typed while mirroring, into both.
  await start();
  const drop = marker + ".dropped";
  await keys(
    onWindows
      ? `Add-Content -LiteralPath ${psQuote(drop)} -Value `
      : `echo >> ${shellQuote(drop)} `,
    false,
  );
  await settle();
  const point = await focusedPoint();
  core.debugger.attach("1.3");
  try {
    const data = { items: [], files: [dropped], dragOperationsMask: 1 };
    for (const type of ["dragEnter", "dragOver", "drop"])
      await core.debugger.sendCommand("Input.dispatchDragEvent", {
        type,
        ...point,
        data,
      });
  } finally {
    core.debugger.detach();
  }
  await until(
    async () => !(await status()).startsWith("Mirroring typing"),
    "drop stop",
  );
  result.steps.dropStatus = await status();
  core.focus();
  await keys("", true);
  await until(async () => (await lines(drop)).length >= 1, "dropped path");
  await settle();
  await enterInOtherPane();
  result.steps.dropped = await lines(drop);
  // On sh the other pane's "echo >> file" adds an empty line: proof that
  // enterInOtherPane reached it.
  result.otherPaneReached = (await read(drop)).endsWith("\n\n");

  // 5. A snippet Insert stops mirroring first.
  if (snippetsArchive) {
    await start();
    menu("Toggle Snippets");
    const row = `[...document.querySelectorAll('.snippet-activate')].find(row => row.querySelector('.snippet-name')?.textContent === 'Mirror smoke')`;
    let view;
    await until(async () => {
      for (const candidate of webContents.getAllWebContents()) {
        if (
          candidate.isDestroyed() ||
          !candidate.getURL().startsWith("omx-extension://")
        )
          continue;
        if (await candidate.executeJavaScript(`!!${row}`).catch(() => false)) {
          view = candidate;
          return true;
        }
      }
      return false;
    }, "snippet row");
    await view.executeJavaScript(`${row}.click()`);
    await until(
      async () => !(await status()).startsWith("Mirroring typing"),
      "snippet stop",
    );
    result.steps.snippetStatus = await status();
    core.focus();
    await keys("", true);
    const snippet = marker + ".snippet";
    await until(
      async () => (await lines(snippet)).length >= 1,
      "snippet command",
    );
    await settle();
    await enterInOtherPane();
    result.steps.snippet = await lines(snippet);
  }
  return result;
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
  layoutRemember,
  layoutReopened,
  mirror,
  quit,
  windows,
};
