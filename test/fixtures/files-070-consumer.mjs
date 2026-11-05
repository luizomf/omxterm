// Selected production-host consumer. Reuses the Files production fixture's
// real install, companion, PTY and supervisor; no service/input workaround.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, lstat } from "node:fs/promises";
import path from "node:path";

export async function runFiles070Consumer(context) {
  const {
    view,
    core,
    files,
    checks,
    children,
    hosted,
    js,
    menu,
    click,
    until,
    panel,
    terminal,
    sameTerminal,
    closeFiles,
    listingReady,
    evidence,
  } = context;
  const evaluate = (code) => view.executeJavaScript(code);
  const source = path.join(files, "project");
  const destination = path.join(files, "destination");
  const conflict = path.join(files, "conflict");
  for (const folder of [
    source,
    destination,
    path.join(conflict, "project"),
    path.join(files, "collapsed"),
  ])
    await mkdir(folder, { recursive: true });
  await writeFile(path.join(source, "needle.txt"), "owned-source");
  await writeFile(path.join(source, "other.txt"), "owned-other");
  await writeFile(
    path.join(conflict, "project", "witness.txt"),
    "owned-destination",
  );
  await writeFile(
    path.join(files, "collapsed", "needle-unloaded.txt"),
    "not-loaded",
  );
  const row = (target) =>
    `[...document.querySelectorAll('[role=treeitem][data-path]')].find(row => row.dataset.path === ${JSON.stringify(target)})`;
  const ready = () => evaluate(listingReady(files));
  const key = (keyCode, modifiers) => {
    view.sendInputEvent({
      type: "keyDown",
      keyCode,
      ...(modifiers ? { modifiers } : {}),
    });
    view.sendInputEvent({
      type: "keyUp",
      keyCode,
      ...(modifiers ? { modifiers } : {}),
    });
  };
  const focusRow = async (target) => {
    await until(() => evaluate(`!!${row(target)}`), "owned row available");
    await evaluate(`${row(target)}.focus()`);
    await until(
      () =>
        evaluate(
          `document.activeElement === ${row(target)} && ${row(target)}.getAttribute('aria-selected') === 'true'`,
        ),
      "focused row is explicit selection",
    );
  };
  const query = async (value) => {
    await evaluate(
      "document.querySelector('.entry-filter').focus(); document.querySelector('.entry-filter').select()",
    );
    // insertText drives Chromium editing and its real input event, not a mock request.
    if (value) await view.insertText(value);
    else key("Backspace");
    await until(
      () =>
        evaluate(
          `document.querySelector('.entry-filter').value === ${JSON.stringify(value)}`,
        ),
      "filter editing receipt",
    );
  };
  await evaluate(
    `document.querySelector('form.location input').value = ${JSON.stringify(files)}; document.querySelector('form.location').requestSubmit()`,
  );
  await until(
    async () => (await ready()) && (await evaluate(`!!${row(source)}`)),
    "owned listing loaded",
  );
  await focusRow(source);
  key("Right");
  await until(
    async () =>
      (await ready()) &&
      (await evaluate(`!!${row(path.join(source, "needle.txt"))}`)),
    "expanded child loaded",
  );
  await focusRow(path.join(files, "source.txt"));
  await query("needle");
  assert.equal(
    await evaluate(
      `!!${row(source)} && !!${row(path.join(source, "needle.txt"))} && !${row(path.join(source, "other.txt"))} && !${row(path.join(files, "collapsed"))} && !${row(path.join(files, "collapsed", "needle-unloaded.txt"))} && !document.querySelector('[aria-selected=true]') && document.activeElement.matches('.entry-filter')`,
    ),
    true,
  );
  checks.push(
    "loaded-filter-retains-ancestor-clears-selection-no-recursive-search",
  );
  // Native focus routing is exercised with Chromium synthetic keys, not hardware HID.
  key("Tab");
  await until(
    () => evaluate("document.activeElement.matches('[role=treeitem]')"),
    "Tab enters tree",
  );
  key("End");
  await until(
    () =>
      evaluate(
        `document.activeElement === ${row(path.join(source, "needle.txt"))}`,
      ),
    "End selects loaded child",
  );
  key("F2");
  await until(
    () =>
      evaluate(
        "!document.querySelector('.operation-editor').hidden && document.activeElement.matches('.operation-editor input')",
      ),
    "F2 editor focus",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('.operation-editor').textContent.includes(${JSON.stringify(path.join(source, "needle.txt"))})`,
    ),
    true,
  );
  await click(view, "Cancel");
  await until(
    () =>
      evaluate(
        `document.activeElement === ${row(path.join(source, "needle.txt"))}`,
      ),
    "Cancel restores row focus",
  );
  await query("needle");
  await js("document.querySelector('.auxiliary-hide').click()");
  await panel(view, false, "core");
  menu("Files");
  await panel(view, true, "child");
  await until(
    () =>
      evaluate(
        "document.activeElement.matches('.entry-filter') && document.querySelector('.entry-filter').value === 'needle'",
      ),
    "reopen search intent retains query",
  );
  await query("");
  await until(
    () => evaluate(`!!${row(path.join(source, "other.txt"))}`),
    "clearing filter restores loaded child",
  );
  checks.push("Chromium-Tab-End-F2-Cancel-focus-hide-reveal-query-retained");

  async function prepareMove(folder) {
    await focusRow(source);
    key("F10", ["shift"]);
    await until(
      () => evaluate("!document.querySelector('.file-menu').hidden"),
      "Shift+F10 menu",
    );
    await click(view, "Move to folder…");
    await until(
      () =>
        evaluate("document.activeElement.matches('.operation-editor input')"),
      "move folder input focus",
    );
    await evaluate(
      "document.querySelector('.operation-editor input').select()",
    );
    await view.insertText(folder);
    key("Enter");
    await until(
      () =>
        evaluate(
          `!document.querySelector('.operation-editor').hidden && !document.querySelector('.operation-editor').inert && [...document.querySelectorAll('.operation-editor button')].some(b => b.textContent === 'Move') && document.querySelector('.operation-editor').textContent.includes(${JSON.stringify(source)}) && document.querySelector('.operation-editor').textContent.includes(${JSON.stringify(folder)})`,
        ),
      "fixed move confirmation",
    );
    assert.equal(
      await evaluate("document.activeElement.textContent === 'Cancel'"),
      true,
      "safe initial confirmation focus",
    );
    assert.equal(
      (await lstat(source)).isDirectory(),
      true,
      "source still present before explicit Move",
    );
    assert.equal(
      await readFile(path.join(source, "needle.txt"), "utf8"),
      "owned-source",
    );
  }
  const original = await lstat(source);
  const existing = await lstat(path.join(conflict, "project"));
  await prepareMove(conflict);
  await click(view, "Move");
  await until(
    () =>
      evaluate(
        "document.querySelector('.operation-editor').hidden && document.querySelector('[role=status]').textContent.includes('already exists')",
      ),
    "conflict consumes confirmation",
  );
  assert.equal((await lstat(source)).ino, original.ino);
  assert.equal((await lstat(path.join(conflict, "project"))).ino, existing.ino);
  assert.equal(
    await readFile(path.join(conflict, "project", "witness.txt"), "utf8"),
    "owned-destination",
  );
  assert.equal(
    await readFile(path.join(source, "needle.txt"), "utf8"),
    "owned-source",
  );
  checks.push(
    "confirmed-directory-conflict-no-clobber-source-destination-preserved",
  );
  await prepareMove(destination);
  // Explicitly fence the unconfirmed state; this path did not exist at setup.
  await assert.rejects(lstat(path.join(destination, "project")), {
    code: "ENOENT",
  });
  await click(view, "Move");
  await until(
    () =>
      evaluate(
        "document.querySelector('.operation-editor').hidden && document.querySelector('[role=status]').textContent === 'Operation completed.'",
      ),
    "confirmed move completion",
  );
  await assert.rejects(lstat(source), { code: "ENOENT" });
  const moved = path.join(destination, "project");
  const movedStat = await lstat(moved);
  assert.equal(movedStat.dev, original.dev);
  assert.equal(movedStat.ino, original.ino);
  assert.equal(
    await readFile(path.join(destination, "project", "needle.txt"), "utf8"),
    "owned-source",
  );
  assert.equal(
    await readFile(path.join(destination, "project", "other.txt"), "utf8"),
    "owned-other",
  );
  await until(
    async () => (await ready()) && (await evaluate(`!${row(source)}`)),
    "successful move refreshed current root",
  );
  await focusRow(destination);
  key("Right");
  const completedMove = `(${listingReady(files)}) && !${row(source)} && !!${row(moved)} && document.querySelector('.operation-editor').hidden && !document.querySelector('.operation-editor').inert && document.querySelector('[role=status]').textContent === 'Operation completed.'`;
  await until(() => evaluate(completedMove), "completed move visible in tree");
  checks.push("one-explicit-confirmed-directory-move-same-inode-and-bytes");
  if (evidence) {
    // Match the existing public consumer's ordering, not a fresh-pixel guarantee.
    await evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
    assert.equal(await evaluate(completedMove), true, "capture state retained");
    await writeFile(
      path.join(evidence, "consumer-files.png"),
      (await view.capturePage()).toPNG(),
    );
    await writeFile(
      path.join(evidence, "consumer-window.png"),
      (await core.capturePage()).toPNG(),
    );
  }
  await query("needle");
  const replacement = await closeFiles(view, () => menu("Files"));
  assert.equal(
    await replacement.executeJavaScript(
      "document.querySelector('.entry-filter').value",
    ),
    "",
    "Close resets query in fresh view",
  );
  const backend = children[0];
  assert.equal(children.length, 1);
  menu("Settings");
  await until(
    () => js("!!document.querySelector('#settings-tab-extensions')"),
    "Settings for normal retirement",
  );
  await click(core, "Extensions");
  await until(
    () =>
      js(
        "![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
      ),
    "management idle",
  );
  await click(core, "Disable");
  await until(
    () => replacement.isDestroyed() && hosted().length === 0 && backend.closed,
    "Disable joins backend and view",
  );
  assert.deepEqual(backend.exit, { code: 0, signal: null });
  await until(
    () =>
      js(
        "document.querySelector('.extensions-panel').textContent.includes('disabled') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
      ),
    "Disable settled",
  );
  await click(core, "Uninstall");
  await until(
    () =>
      js(
        "document.querySelector('.extensions-panel').textContent.includes('uninstalled')",
      ),
    "Uninstall tombstone",
  );
  await js("document.querySelector('.settings-close').click()");
  await until(
    () => js("!document.querySelector('.settings-dialog')"),
    "Settings closed",
  );
  await terminal("OMX_FILES_070_AFTER");
  await sameTerminal();
  assert.equal(children.length, 1, "no automatic backend restart");
  checks.push("Close-reset-Disable-Uninstall-normal-backend-exit-same-PTY");
}
