// Added tail only; ordinary SSH and combined lifecycle assertions stay intact.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, Menu, BrowserWindow } = require("electron");
const {
  observe,
  createInput,
  assertFresh,
  assertCaptureSaved,
  createTranscript,
  finishEvidence,
} = require("./companion-shortcut-input.cjs");
async function runShortcuts(s) {
  const {
    core,
    window,
    js,
    menu,
    until,
    hosted,
    settings,
    closeSettings,
    options,
    checks,
    children,
  } = s;
  assert.equal(
    BrowserWindow.getAllWindows().length,
    1,
    "single admitted native fixture window",
  );
  const readInput = () =>
    fs.readFileSync(path.join(options.root, "ssh-live-input.bin"), "utf8");
  const configPath = path.join(options.root, "config/omxterm/config.json");
  const binding = (action) =>
    JSON.parse(fs.readFileSync(configPath, "utf8")).keybinds?.[action];
  const normalize = (value) =>
    String(value).toLowerCase().replace(/ctrl/g, "control").replace(/\s/g, "");
  const transcript = createTranscript(readInput);
  const observer = observe({ app, core, hosted });
  const input = createInput({
    evidence: options.evidence,
    observer,
    until,
    readInput,
    core,
    transcript,
  });
  const results = [];
  const save = (group, data = {}) => {
    results.push({ group, ...data });
    fs.writeFileSync(
      path.join(options.evidence, "shortcuts-scenario.json"),
      JSON.stringify({ results, complete: false }, null, 2),
    );
    checks.push("shortcuts-" + group);
  };
  const spec = {
    files: {
      action: "toggleFiles",
      key: "F6",
      label: "Files",
      selector: "form.location input",
    },
    ssh: {
      action: "toggleSshConnect",
      key: "F7",
      label: "SSH Connect",
      selector: ".quick-connect input",
    },
  };
  const accelerator = (tool) => tool.accelerator || "Control+Shift+" + tool.key;
  const native = (view) =>
    window.contentView.children.find((v) => v.webContents === view);
  const ids = () =>
    hosted()
      .map((v) => v.id)
      .sort((a, b) => a - b);
  const visible = async (view) =>
    until(
      () => !view.isDestroyed() && native(view)?.getVisible() === true,
      "selected native child visible",
    );
  const terminal = async () =>
    until(
      async () =>
        core.isFocused() &&
        (await js(
          "document.querySelector('.auxiliary-panel').hidden && window.__sshLiveCanvas === document.activeElement?.closest('.terminal-surface')?.querySelector('canvas') && !document.querySelector('.terminal-exit-notice')",
        )),
      "same live raw terminal focused",
    );
  async function focus(view, tool) {
    await visible(view);
    await view.executeJavaScript(
      `document.querySelector(${JSON.stringify(tool.selector)}).focus()`,
    );
    view.focus();
    await until(
      async () =>
        view.isFocused() &&
        (await view.executeJavaScript(
          `document.activeElement === document.querySelector(${JSON.stringify(tool.selector)})`,
        )),
      "actual child field focus",
    );
  }
  const row = (tool) => `[data-action="${tool.action}"]`;
  async function shortcuts() {
    await settings();
    await js("document.querySelector('#settings-tab-shortcuts').click()");
    await until(
      () =>
        js(
          "!!document.querySelector('[data-action=toggleFiles] .settings-shortcut-record')",
        ),
      "Shortcuts rows",
    );
  }
  function menuEntries(tool) {
    const found = [];
    const collect = (entries) => {
      for (const item of entries) {
        if (item.label.replace(/…$/, "") === tool.label) found.push(item);
        if (item.submenu) collect(item.submenu.items);
      }
    };
    collect(Menu.getApplicationMenu().items);
    return found;
  }
  async function assertAvailable(tool, bound = true) {
    await until(() => {
      const items = menuEntries(tool);
      return (
        items.length === 1 &&
        items[0].enabled &&
        (bound
          ? normalize(items[0].accelerator) === normalize(accelerator(tool))
          : !items[0].accelerator)
      );
    }, "one live tool menu entry/effective accelerator");
  }
  async function record(tool, label) {
    transcript.unchanged();
    const beforeIds = ids(),
      before = transcript.expected();
    const selector = row(tool) + " .settings-shortcut-record";
    core.focus();
    await js(
      `(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b || b.disabled) throw Error('record unavailable'); b.focus(); b.click(); })()`,
    );
    await until(
      () =>
        js(
          `document.querySelector(${JSON.stringify(row(tool))}).classList.contains('is-recording')`,
        ),
      "Settings capture active",
    );
    const status = () =>
      js(
        "(() => { const s = document.querySelector('.settings-status'); return { text: s.textContent, error: s.classList.contains('error') }; })()",
      );
    const prompt = await status();
    assert.equal(prompt.text, "Press the new shortcut, or Escape to cancel.");
    const start = observer.events.length;
    await input.tap(tool.key, label, true, tool.modifiers);
    await until(
      () => normalize(binding(tool.action)) === normalize(accelerator(tool)),
      "actual config persisted",
    );
    await until(
      () =>
        js(
          `!document.querySelector(${JSON.stringify(row(tool))}).classList.contains('is-recording')`,
        ),
      "recording completed",
    );
    await until(async () => {
      const result = await status();
      return (
        result.text === "Saved." ||
        result.text === "Recording cancelled." ||
        result.error
      );
    }, "capture save result");
    const saved = await status();
    assertCaptureSaved(prompt, saved);
    const events = observer.events.slice(start);
    assert.ok(
      events.some(
        (e) =>
          e.id === core.id &&
          e.key === tool.key &&
          !e.repeat &&
          e.type === "keyDown" &&
          e.prevented,
      ),
      "active shortcut recorded/consumed",
    );
    assert.ok(
      events.filter((e) => e.key === tool.key).every((e) => e.prevented),
      "recorded gesture contained",
    );
    assert.deepEqual(
      ids(),
      beforeIds,
      "recording does not toggle or replace tools",
    );
    assert.equal(readInput(), before, "recording no PTY input");
    await assertAvailable(tool);
    const displayed = await js(
      `document.querySelector(${JSON.stringify(row(tool) + " .settings-shortcut-value")}).textContent`,
    );
    assert.equal(
      normalize(displayed),
      normalize(accelerator(tool)),
      "rendered effective remap",
    );
    return {
      value: binding(tool.action),
      displayed,
      prompt,
      saved,
      ids: beforeIds,
      events,
    };
  }
  async function openFresh(tool, label, oldId = -1) {
    transcript.unchanged();
    const previous = new Set(hosted()),
      start = observer.created.length,
      before = transcript.expected();
    await input.tap(tool.key, label, true, tool.modifiers);
    await until(
      () => hosted().some((v) => !previous.has(v)),
      "fresh shortcut opens child",
    );
    const fresh = hosted().filter((v) => !previous.has(v));
    assert.equal(fresh.length, 1);
    const view = fresh[0];
    await until(
      () =>
        view.executeJavaScript(
          `!!document.querySelector(${JSON.stringify(tool.selector)})`,
        ),
      "fresh tool ready",
    );
    await visible(view);
    const receipt = {
      oldId,
      newId: view.id,
      newViews: observer.created.length - start,
      inputBefore: before,
      inputAfter: readInput(),
      ready: true,
    };
    assertFresh(receipt);
    return view;
  }
  async function closeHeld(view, tool, label) {
    await focus(view, tool);
    const oldNative = native(view);
    const backendSnapshot = children.map((c) => ({
      pid: c.pid,
      closed: c.closed,
      exit: c.exit && { ...c.exit },
    }));
    const receipt = await input.heldClose({
      key: tool.key,
      modifiers: tool.modifiers,
      child: view,
      label,
      settled: async () => {
        await until(
          () =>
            view.isDestroyed() &&
            !window.contentView.children.includes(oldNative),
          "shortcut destroys/detaches child",
        );
        await terminal();
      },
    });
    assert.deepEqual(
      children.map((c) => ({
        pid: c.pid,
        closed: c.closed,
        exit: c.exit && { ...c.exit },
      })),
      backendSnapshot,
      "tool close does not create or retire backends",
    );
    return receipt;
  }
  async function headerClose(view) {
    await visible(view);
    await js("document.querySelector('.auxiliary-close').click()");
    await until(() => view.isDestroyed(), "header closes fresh control view");
    await terminal();
  }
  async function draft(view, tool, value) {
    await view.executeJavaScript(
      `document.querySelector(${JSON.stringify(tool.selector)}).value = ${JSON.stringify(value)}`,
    );
  }
  async function value(view, tool) {
    return view.executeJavaScript(
      `document.querySelector(${JSON.stringify(tool.selector)}).value`,
    );
  }
  let complete = false;
  const failures = [];
  try {
    // A: real native remap recording, persistence and active menu projection.
    assert.equal(hosted().length, 0);
    await terminal();
    await shortcuts();
    const a = await record(spec.files, "record-files");
    const b = await record(spec.ssh, "record-ssh");
    await closeSettings();
    await terminal();
    save("A-settings-remaps", { files: a, ssh: b });

    // B/C: Files initial core open, child held close, core autorepeat after
    // destruction and modifier release, exact PTY fence, fresh same chord.
    let files = await openFresh(spec.files, "files-core-open");
    await draft(files, spec.files, "shortcut-files-draft");
    const filesOld = files.id;
    await closeHeld(files, spec.files, "files-held-close");
    save("B-files-held-close", { retiredId: filesOld });
    files = await openFresh(spec.files, "files-fresh-reopen", filesOld);
    assert.notEqual(await value(files, spec.files), "shortcut-files-draft");
    await draft(files, spec.files, "retained-shortcut-files");
    save("C-files-fresh-same-chord", { freshId: files.id });

    // D: SSH from native Files child, hidden reveal keeps its draft; switching
    // both directions keeps identities. Then SSH held destruction-to-core.
    await focus(files, spec.files);
    let ssh = await openFresh(spec.ssh, "ssh-open-from-files");
    await draft(ssh, spec.ssh, "retained-shortcut-ssh");
    menu("Toggle Auxiliary Panel");
    await terminal();
    const beforeReveal = ids(),
      revealInput = transcript.expected();
    await input.tap("F7", "ssh-hidden-reveal");
    await visible(ssh);
    assert.deepEqual(ids(), beforeReveal);
    assert.equal(await value(ssh, spec.ssh), "retained-shortcut-ssh");
    await focus(ssh, spec.ssh);
    await input.tap("F6", "files-switch-from-ssh");
    await visible(files);
    assert.equal(await value(files, spec.files), "retained-shortcut-files");
    await focus(files, spec.files);
    await input.tap("F7", "ssh-switch-from-files");
    await visible(ssh);
    assert.deepEqual(ids(), beforeReveal);
    assert.equal(readInput(), revealInput);
    const sshOld = ssh.id;
    await closeHeld(ssh, spec.ssh, "ssh-held-close");
    ssh = await openFresh(spec.ssh, "ssh-fresh-reopen", sshOld);
    assert.notEqual(await value(ssh, spec.ssh), "retained-shortcut-ssh");
    save("D-ssh-held-fresh-cross-tool-reveal", {
      filesId: files.id,
      retiredSshId: sshOld,
      freshSshId: ssh.id,
    });

    // E: capture a chord that is already active, with two real retained tools.
    const retained = ids();
    await shortcuts();
    const captured = await record(spec.files, "record-active-files");
    await closeSettings();
    await visible(ssh);
    assert.deepEqual(ids(), retained);
    save("E-recording-priority", captured);
    await headerClose(ssh); // deterministic raw terminal for baseline/unavailable

    // F: collect exact unbound chord byte control, restore configuration, then
    // disable that installed tool. Terminal must receive the same bytes.
    await shortcuts();
    await js(
      `document.querySelector(${JSON.stringify(row(spec.ssh) + " .settings-shortcut-unbind")}).click()`,
    );
    await until(
      () => binding(spec.ssh.action) === null,
      "SSH unbound persisted",
    );
    await assertAvailable(spec.ssh, false);
    await closeSettings();
    await terminal();
    // Fence all earlier no-input operations before learning the deliberately
    // unbound key's platform-specific bytes. No observed leak can be rebased.
    await input.fence("before-unbound-control");
    const baseline = transcript.expected();
    const baselineEventStart = observer.events.length;
    await input.tap("F7", "unbound-ssh-control");
    await input.tap("x", "unbound-ssh-fence", false);
    await until(
      () => readInput().length > baseline.length && readInput().endsWith("x"),
      "unbound chord ordered raw fence",
    );
    const rawControl = readInput().slice(baseline.length);
    assert.ok(
      rawControl.length > 1,
      "native chord has observable raw control bytes",
    );
    transcript.accept(rawControl);
    assert.ok(
      observer.events
        .slice(baselineEventStart)
        .some(
          (e) =>
            e.id === core.id &&
            e.key === "F7" &&
            e.type === "keyDown" &&
            !e.prevented,
        ),
      "unbound chord not consumed",
    );
    await shortcuts();
    await record(spec.ssh, "restore-ssh-remap");
    // Switch to Extensions in the existing Settings window; do not select the
    // first global Disable button now that Files is also installed.
    await js("document.querySelector('#settings-tab-extensions').click()");
    await until(
      () =>
        js(
          "!![...document.querySelectorAll('.extensions-panel section')].find(e => e.querySelector('h3')?.textContent.startsWith('SSH Connect ·'))",
        ),
      "installed SSH section",
    );
    const activeBackend = children[children.length - 1];
    assert.ok(activeBackend && !activeBackend.closed);
    await js(
      "(() => { const s = [...document.querySelectorAll('.extensions-panel section')].find(e => e.querySelector('h3')?.textContent.startsWith('SSH Connect ·')); const b = [...s.querySelectorAll('button')].find(b => b.textContent === 'Disable'); if (!b || b.disabled) throw Error('SSH disable unavailable'); b.click(); })()",
    );
    await until(
      () => menuEntries(spec.ssh).length === 0 && activeBackend.closed,
      "SSH unavailable and backend joined",
    );
    assert.deepEqual(activeBackend.exit, { code: 0, signal: null });
    assert.equal(
      normalize(binding(spec.ssh.action)),
      normalize(accelerator(spec.ssh)),
    );
    await closeSettings();
    await terminal();
    const unavailableBefore = transcript.expected(),
      beforeIds = ids(),
      backendCount = children.length,
      eventStart = observer.events.length;
    await input.tap("F7", "unavailable-ssh");
    await input.tap("x", "unavailable-ssh-fence", false);
    await until(
      () => readInput().length >= unavailableBefore.length + rawControl.length,
      "unavailable chord raw fence",
    );
    transcript.accept(rawControl);
    assert.ok(
      observer.events
        .slice(eventStart)
        .some(
          (e) =>
            e.id === core.id &&
            e.key === "F7" &&
            e.type === "keyDown" &&
            !e.prevented,
        ),
      "unavailable configured chord not consumed",
    );
    assert.deepEqual(ids(), beforeIds);
    assert.equal(children.length, backendCount);
    assert.equal(menuEntries(spec.ssh).length, 0);
    const unavailable = {
      rawControl,
      config: binding(spec.ssh.action),
      events: observer.events.slice(eventStart),
    };

    // ROOT's e2e4206 F1 correction: a modified Escape must reach the shortcut
    // before child dismissal. F6/F7 cannot qualify this ordering boundary.
    await settings();
    await js(
      "(() => { const s = [...document.querySelectorAll('.extensions-panel section')].find(e => e.querySelector('h3')?.textContent.startsWith('SSH Connect ·')); const b = [...s.querySelectorAll('button')].find(b => b.textContent === 'Enable'); if (!b || b.disabled) throw Error('SSH enable unavailable'); b.click(); })()",
    );
    await assertAvailable(spec.ssh);
    await js("document.querySelector('#settings-tab-shortcuts').click()");
    const escapeSsh = {
      ...spec.ssh,
      key: "Escape",
      accelerator: "Control+Escape",
      modifiers: ["Control_L"],
    };
    await record(escapeSsh, "record-ssh-control-escape");
    await closeSettings();
    await terminal();
    let escaped = await openFresh(escapeSsh, "control-escape-open");
    await draft(escaped, escapeSsh, "escape-retained-draft");
    menu("Toggle Auxiliary Panel");
    await terminal();
    const escapeIds = ids(),
      escapeBefore = transcript.expected();
    await input.tap("Escape", "control-escape-reveal", true, ["Control_L"]);
    await visible(escaped);
    assert.deepEqual(ids(), escapeIds);
    assert.equal(await value(escaped, escapeSsh), "escape-retained-draft");
    assert.equal(readInput(), escapeBefore);
    const escapedOldId = escaped.id;
    await closeHeld(escaped, escapeSsh, "control-escape-held-close");
    escaped = await openFresh(escapeSsh, "control-escape-fresh", escapedOldId);
    assert.notEqual(await value(escaped, escapeSsh), "escape-retained-draft");
    // Plain Escape still hides the same native child, never toggles it closed.
    await focus(escaped, escapeSsh);
    const plainBefore = transcript.expected(),
      plainIds = ids();
    await input.tap("Escape", "plain-escape-still-hides", false);
    await terminal();
    assert.equal(escaped.isDestroyed(), false);
    assert.deepEqual(ids(), plainIds);
    assert.equal(readInput(), plainBefore);
    await input.fence("plain-escape-fence");
    save("F-unavailable-and-modified-Escape-correction", {
      unavailable,
      modifiedEscape: {
        retiredId: escapedOldId,
        freshId: escaped.id,
        config: binding(escapeSsh.action),
        plainEscapeRetained: true,
      },
    });
    assert.equal(fs.existsSync(input.marker), false);
    complete = true;
  } catch (error) {
    failures.push(error);
  } finally {
    finishEvidence(
      failures,
      [
        () => observer.stop(),
        () =>
          fs.writeFileSync(
            path.join(options.evidence, "shortcuts-scenario.json"),
            JSON.stringify(
              {
                complete: complete && failures.length === 0,
                failures: failures.map((e) => String(e.stack || e)),
                expectedInput: transcript.expected(),
                results,
                events: observer.events,
                createdIds: observer.created.map((v) => v.id),
              },
              null,
              2,
            ),
          ),
      ],
      "shortcut scenario and cleanup",
    );
  }
}
module.exports = { runShortcuts };
