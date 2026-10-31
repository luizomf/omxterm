// Bounded tail of the production SSH scenario. Its already-live raw client is
// the input oracle; normal Quit remains owned by the parent scenario.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { heldGesture } = require("./companion-native-input.cjs");
async function runCombined(s) {
  const {
    core,
    window,
    js,
    menu,
    until,
    hosted,
    settings,
    closeSettings,
    click,
    children,
    options,
    checks,
    dialog,
  } = s;
  const archive = options.filesArchive;
  assert.equal(
    createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
    options.filesArchiveSha256,
  );
  await settings();
  // The prior scenario deliberately disabled SSH. Re-enable the installed
  // generation, never reinstall or fabricate its registration.
  await js(
    `(() => { const section = [...document.querySelectorAll('.extensions-panel section')].find(e => e.querySelector('h3')?.textContent.startsWith('SSH Connect ·')); const button = [...section.querySelectorAll('button')].find(e => e.textContent === 'Enable'); if (!button || button.disabled) throw Error('SSH Enable unavailable'); button.click(); })()`,
  );
  await until(
    () =>
      js(
        "![...document.querySelectorAll('.extensions-panel button')].some(b => b.textContent === 'Enable')",
      ),
    "SSH enabled",
  );
  const open = dialog.showOpenDialog,
    message = dialog.showMessageBox;
  let approvals = 0;
  try {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [archive],
    });
    dialog.showMessageBox = async (_owner, prompt) => {
      assert.equal(prompt.title, "Trust extension code?");
      assert.ok(prompt.detail.includes(options.filesArchiveSha256));
      approvals++;
      return { response: 1, checkboxChecked: false };
    };
    await click(core, "Install local .omxext…");
    await until(
      () =>
        js(
          `!![...document.querySelectorAll('.extensions-panel section h3')].find(h => h.textContent === ${JSON.stringify(options.filesTitle)})`,
        ),
      "Files installed through production Settings",
    );
    assert.equal(approvals, 1);
  } finally {
    dialog.showOpenDialog = open;
    dialog.showMessageBox = message;
  }
  await closeSettings();
  const native = (view) =>
    window.contentView.children.find((v) => v.webContents === view);
  async function visible(view, shown) {
    await until(
      () => !view.isDestroyed() && native(view)?.getVisible() === shown,
      "native visibility",
    );
  }
  async function openTool(label, ready) {
    const previous = new Set(hosted());
    menu(label);
    await until(
      () => hosted().some((v) => !previous.has(v) && !v.isDestroyed()),
      "new tool WebContents",
    );
    const view = hosted().find((v) => !previous.has(v));
    await until(() => view.executeJavaScript(ready), `${label} ready`);
    await visible(view, true);
    return view;
  }
  const a = await openTool(
    "Files",
    "!!document.querySelector('form.location input')",
  );
  await a.executeJavaScript(
    "window.__combinedDraft = document.querySelector('form.location input'); window.__combinedDraft.value = 'retained-A';",
  );
  const b = await openTool(
    "SSH Connect",
    "!!document.querySelector('.quick-connect input') && !document.querySelector('.quick-connect button').disabled",
  );
  fs.writeFileSync(
    path.join(options.evidence, "combined-core.png"),
    (await core.capturePage()).toPNG(),
  );
  fs.writeFileSync(
    path.join(options.evidence, "combined-ssh.png"),
    (await b.capturePage()).toPNG(),
  );
  assert.equal(
    children.length,
    3,
    "one retired SSH backend plus Files and re-enabled SSH",
  );
  const backendSnapshot = [...children];
  const assertBackends = () => {
    assert.equal(children.length, backendSnapshot.length);
    children.forEach((record, index) =>
      assert.equal(record, backendSnapshot[index]),
    );
    assert.ok(children.slice(-2).every((c) => !c.closed && c.exit === null));
  };
  await visible(a, false);
  await b.executeJavaScript(
    "document.querySelector('.quick-connect input').value = 'retained-B';",
  );
  // Selecting the already-selected switcher entry must NOT toggle closed.
  for (const label of ["SSH Connect", "Files", "SSH Connect", "SSH Connect"]) {
    await js(
      `(() => { const button = [...document.querySelectorAll('.auxiliary-tools button')].find(b => b.textContent === ${JSON.stringify(label)}); if (!button) throw Error('missing opened tool'); button.click(); })()`,
    );
    await visible(label === "Files" ? a : b, true);
    assert.equal(hosted().length, 2);
  }
  await settings();
  await visible(a, false);
  await visible(b, false);
  await closeSettings();
  await visible(b, true);
  const readInput = () =>
    fs.readFileSync(path.join(options.root, "ssh-live-input.bin"), "utf8");
  const terminal = async () =>
    until(
      async () =>
        core.isFocused() &&
        (await js(
          "document.querySelector('.auxiliary-panel').hidden && window.__sshLiveCanvas === document.activeElement?.closest('.terminal-surface')?.querySelector('canvas') && !document.querySelector('.terminal-exit-notice')",
        )),
      "acknowledged hidden panel and terminal focus",
    );
  const gesture = (key, target, label, settled) =>
    heldGesture({
      core,
      child: b,
      key,
      target,
      label,
      settled,
      until,
      readInput,
      evidence: options.evidence,
    });
  b.focus();
  await until(() => b.isFocused(), "native child Escape owner");
  await gesture("Escape", "child", "combined-escape-hide", async () => {
    await terminal();
    await visible(b, false);
  });
  assert.equal(b.isDestroyed(), false);
  menu("Toggle Auxiliary Panel");
  await visible(b, true);
  assert.equal(
    await b.executeJavaScript(
      "document.querySelector('.quick-connect input').value",
    ),
    "retained-B",
  );
  async function focusHeader(selector) {
    core.focus();
    await js(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await until(
      async () =>
        core.isFocused() &&
        (await js(
          `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
        )),
      "native header focus",
    );
  }
  await focusHeader(".auxiliary-hide");
  await gesture("Enter", "core", "combined-header-hide", async () => {
    await terminal();
    await visible(b, false);
  });
  assert.equal(b.isDestroyed(), false);
  menu("Toggle Auxiliary Panel");
  await visible(b, true);
  const oldNative = native(b);
  let destroyed = false;
  b.once("destroyed", () => {
    destroyed = true;
  });
  await focusHeader(".auxiliary-close");
  await gesture("Enter", "core", "combined-header-close", async () => {
    await terminal();
    await until(
      () =>
        destroyed &&
        b.isDestroyed() &&
        !window.contentView.children.includes(oldNative),
      "B destroyed and detached",
    );
  });
  assert.equal(a.isDestroyed(), false);
  await visible(a, false);
  assert.equal(hosted().length, 1);
  assert.equal(hosted()[0], a);
  assert.equal(
    await js(
      "![...document.querySelectorAll('.auxiliary-tools button')].some(b => b.textContent === 'SSH Connect')",
    ),
    true,
  );
  assertBackends();
  // No successor became visible; this separate menu delivery restores A.
  menu("Toggle Auxiliary Panel");
  await visible(a, true);
  assert.equal(
    await a.executeJavaScript(
      "window.__combinedDraft === document.querySelector('form.location input') && window.__combinedDraft.value === 'retained-A'",
    ),
    true,
  );
  fs.writeFileSync(
    path.join(options.evidence, "combined-survivor-files.png"),
    (await a.capturePage()).toPNG(),
  );
  await js("document.querySelector('.auxiliary-close').click()");
  await terminal();
  await until(
    () => a.isDestroyed() && hosted().length === 0,
    "last tool closed",
  );
  await js(
    "window.__combinedReveal = false; window.__combinedUnsubscribe = window.omxterm.terminal.onAuxiliaryPanelToggle(() => { window.__combinedReveal = true; }); void 0;",
  );
  menu("Toggle Auxiliary Panel");
  await until(
    () => js("window.__combinedReveal"),
    "empty reveal action delivered",
  );
  await js("window.__combinedUnsubscribe(); void 0;");
  assert.equal(
    await js("document.querySelector('.auxiliary-panel').hidden"),
    true,
  );
  assert.equal(hosted().length, 0);
  assertBackends();
  checks.push(
    "combined-switcher-select-survivor-no-successor-independent-fallback-empty-reveal",
  );
  checks.push(
    "native-child-Escape-header-Hide-Close-held-repeat-release-exact-raw-client-fresh-control",
  );
  await require("./companion-shortcuts.cjs").runShortcuts(s);
}
module.exports = { runCombined };
