import assert from "node:assert/strict";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  webContents,
  WebContentsView,
  type WebContents,
} from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MIRROR_CHECKS,
  MIRROR_RESULT,
  type MirrorReceipt,
} from "./mirror-native-contract";
import type { MirrorInputs } from "./mirror-production-build";
import {
  click,
  focus,
  input,
  isolateRestorationProfile,
  menu,
  observeRestorationProduction,
  quote,
  selectPane,
  until,
} from "./restoration-production-support";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  await readFile(path.join(root, "fixture.json"), "utf8"),
) as MirrorInputs;
await isolateRestorationProfile(root);
const { ptys, children } = observeRestorationProduction(fixture.source);
const checks: string[] = [];
const fences: MirrorReceipt["fences"] = [];
let failed = false;
let quitting = false;
let approvals = 0;
let semanticStopBeforeWrite = false;
function fail(error: unknown) {
  if (failed) return;
  failed = true;
  process.exitCode = 1;
  process.stderr.write(
    `${error instanceof Error ? error.stack : "Mirror fixture failure"}\n`,
  );
  app.quit();
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
// Synthetic native chooser/trust decisions, not native widget qualification.
dialog.showOpenDialog = (async () => ({
  canceled: false,
  filePaths: [path.join(root, "mirror.omxext")],
})) as typeof dialog.showOpenDialog;
dialog.showMessageBox = (async (
  _window: BrowserWindow,
  options: Electron.MessageBoxOptions,
) => {
  assert.equal(options.title, "Trust extension code?");
  assert.ok(options.detail?.includes(fixture.archiveSha256));
  approvals++;
  return { response: 1, checkboxChecked: false };
}) as typeof dialog.showMessageBox;
dialog.showErrorBox = () => {
  throw new Error("Unexpected production error dialog");
};
app.once("will-quit", () => {
  const joined =
    ptys.length === 3 &&
    ptys.every((p) => p.exited) &&
    children.length === 1 &&
    children.every((p) => p.closed);
  failed ||= !quitting || !joined;
  if (failed) process.exitCode = 1;
  const receipt: MirrorReceipt = {
    failed,
    checks,
    approvals,
    quit: joined ? "joined" : "unsettled",
    ptys: ptys.map(({ pid, exited }) => ({ pid, exited })),
    backends: children.map(({ pid, closed }) => ({ pid, closed })),
    fences,
    semanticStopBeforeWrite,
  };
  writeFileSync(
    path.join(fixture.evidence, "scenario.json"),
    JSON.stringify(receipt, null, 2),
  );
  process.stdout.write(MIRROR_RESULT + JSON.stringify(receipt) + "\n");
});
const hosted = () =>
  webContents
    .getAllWebContents()
    .filter(
      (c) => !c.isDestroyed() && c.getURL().startsWith("omx-extension://"),
    );
async function settings(window: BrowserWindow) {
  await focus(window);
  menu(window, "Settings");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "!!document.querySelector('#settings-tab-extensions')",
      ),
    "Settings tab",
  );
  await click(window.webContents, "Extensions");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "!!document.querySelector('.extensions-panel') && !document.querySelector('.extensions-panel').closest('[hidden]')",
      ),
    "Extensions panel",
  );
}
async function closeSettings(window: BrowserWindow) {
  await window.webContents.executeJavaScript(
    "document.querySelector('.settings-close').click()",
  );
  await until(
    () =>
      window.webContents.executeJavaScript(
        "!document.querySelector('.settings-dialog') || !!document.querySelector('.settings-dialog').closest('[hidden]')",
      ),
    "Settings departure",
  );
}
async function screenshot(contents: WebContents, name: string) {
  await contents.executeJavaScript(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
  );
  await writeFile(
    path.join(fixture.evidence, name),
    (await contents.capturePage()).toPNG(),
  );
}
async function status(window: BrowserWindow, text: string) {
  await until(
    () =>
      window.webContents.executeJavaScript(
        `document.querySelector('.mirror-typing-status [role=status]')?.textContent === ${JSON.stringify(text)}`,
      ),
    text,
  );
}
async function start(window: BrowserWindow, capture = false) {
  await selectPane(window, 0, 0);
  menu(window, "Mirror Typing");
  await until(
    async () =>
      hosted().length === 1 &&
      Boolean(
        await hosted()[0]!.executeJavaScript(
          "document.querySelectorAll('.mirror-targets input').length === 3 && !document.querySelector('[data-action=start]').disabled",
        ),
      ),
    "actual setup ready",
  );
  const page = hosted()[0]!;
  await page.executeJavaScript(`(() => {
    const inputs = [...document.querySelectorAll('.mirror-targets input')];
    if (!inputs[0].disabled || !inputs[0].checked || inputs[2].disabled) throw Error('original pane mismatch');
    inputs[2].click();
    if (inputs.filter(i => i.checked).length !== 2) throw Error('fixed pair mismatch');
  })()`);
  if (capture) await screenshot(page, "setup.png");
  await click(page, "Start mirroring");
  await status(window, "Mirroring typing · 2 panes");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.hasFocus() && document.activeElement?.closest('.terminal-surface') === document.querySelector('.terminal-surface')",
      ),
    "original source focus handoff",
  );
  const nativeView = window.contentView.children.find(
    (v) => v instanceof WebContentsView && v.webContents === page,
  );
  assert.ok(nativeView, "real hosted native view retained");
  assert.equal(
    nativeView.getVisible(),
    false,
    "native setup hidden before active input",
  );
  return page;
}
// Chromium dispatch, not insertText, DOM KeyboardEvent or mirror IPC. The char
// event is Chromium's text phase of the same synthetic keyboard gesture.
function key(contents: WebContents, value: string) {
  contents.sendInputEvent({ type: "keyDown", keyCode: value });
  contents.sendInputEvent({ type: "char", keyCode: value });
  contents.sendInputEvent({ type: "keyUp", keyCode: value });
}
async function run(window: BrowserWindow) {
  window.setSize(1100, 760);
  await until(
    () => ptys.length === 1 && ptys[0]!.output.includes("OMX_LAYOUT_READY"),
    "initial shell",
  );
  await settings(window);
  await click(window.webContents, "Install local .omxext…");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('.extensions-panel')?.textContent.includes('local dormant') && [...document.querySelectorAll('.extensions-panel button')].some(b => b.textContent === 'Disable' && !b.disabled)",
      ),
    "installed enabled dormant",
  );
  assert.equal(children.length, 0);
  // Exercise an explicit dormant Enable, not merely the install default.
  await click(window.webContents, "Disable");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "[...document.querySelectorAll('.extensions-panel button')].some(b => b.textContent === 'Enable' && !b.disabled)",
      ),
    "disabled snapshot",
  );
  await click(window.webContents, "Enable");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('.extensions-panel')?.textContent.includes('local dormant') && [...document.querySelectorAll('.extensions-panel button')].some(b => b.textContent === 'Disable' && !b.disabled)",
      ),
    "enabled dormant snapshot",
  );
  assert.equal(children.length, 0);
  assert.equal(hosted().length, 0);
  checks.push(MIRROR_CHECKS[0]);
  await closeSettings(window);
  await selectPane(window, 0, 0);
  menu(window, "Split Right");
  await until(() => ptys.length === 2, "second PTY");
  await selectPane(window, 0, 1);
  menu(window, "Split Right");
  await until(
    () =>
      ptys.length === 3 &&
      ptys.every((p) => p.output.includes("OMX_LAYOUT_READY")),
    "three shells",
  );
  const ordered: typeof ptys = [];
  for (let pane = 0; pane < 3; pane++) {
    await selectPane(window, 0, pane);
    const ready = `OMX_MIRROR_RAW_${pane}`;
    // Actual kernel raw byte receiver. Synthetic data only. Each byte has an
    // acknowledged hex record; no shell echo is accepted as a delivery oracle.
    const program = `import os,tty\ntty.setraw(0)\nos.write(1,b'${ready}\\n')\nwhile True:\n b=os.read(0,1)\n if not b: break\n os.write(1,b'OMX_BYTE_'+b.hex().encode()+b'\\n')`;
    await input(window.webContents, `python3 -u -c ${quote(program)}`);
    await until(
      () => ptys.some((p) => p.output.includes(`${ready}\n`)),
      "raw receiver readiness",
    );
    const record = ptys.find((p) => p.output.includes(`${ready}\n`))!;
    assert.ok(!ordered.includes(record), "distinct pane to PTY mapping");
    ordered.push(record);
  }
  const outputOffsets = ordered.map((p) => p.output.length);
  const writeOffsets = ordered.map((p) => p.writes.length);
  const expected = ["", "", ""];
  const received = () =>
    ordered.map((p, i) =>
      [
        ...p.output
          .slice(outputOffsets[i])
          .matchAll(/OMX_BYTE_([a-f0-9]{2})\n/g),
      ]
        .map((m) => String.fromCharCode(parseInt(m[1]!, 16)))
        .join(""),
    );
  async function delivery(additions: string[]) {
    additions.forEach((value, i) => {
      expected[i] += value;
    });
    await until(
      () => received().every((value, i) => value === expected[i]),
      "expected positive raw PTY acknowledgements",
    );
  }
  async function fence(label: string) {
    // Acknowledged positive progress on EVERY real peer. Direct writes here are
    // explicit observation fences, never evidence of mirrored keyboard input.
    // Called after routed/local output ack: main's synchronous fanout has finished.
    for (const pty of ordered) pty.terminal.write("|");
    await delivery(["|", "|", "|"]);
    const actual = received();
    assert.deepEqual(
      ordered.map((p, i) => p.writes.slice(writeOffsets[i])),
      expected,
      "exact native writes, including independent fences",
    );
    fences.push({ label, expected: [...expected], received: actual });
  }
  await window.webContents.executeJavaScript(
    "window.__mirrorCanvases = [...document.querySelectorAll('.terminal-tab canvas')]",
  );
  await start(window, true);
  checks.push(MIRROR_CHECKS[1]);
  key(window.webContents, "a");
  await delivery(["a", "a", ""]);
  await fence("first-source");
  await selectPane(window, 0, 1);
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelectorAll('.terminal-surface')[1]?.querySelector('.mirror-typing-marker')?.textContent.includes('Mirror typing source')",
      ),
    "second selected source marker",
  );
  key(window.webContents, "b");
  await delivery(["b", "b", ""]);
  await fence("second-source");
  checks.push(MIRROR_CHECKS[2]);
  menu(window, "Toggle Tab Bar");
  menu(window, "Toggle Title Bar");
  await status(window, "Mirroring typing · 2 panes");
  await until(
    () =>
      window.webContents.executeJavaScript(
        "document.querySelector('#tab-strip')?.hidden && document.querySelector('.window-title-bar')?.hidden",
      ),
    "both chrome rows hidden",
  );
  await screenshot(window.webContents, "active-hidden-chrome.png");
  await window.webContents.executeJavaScript(`(() => {
    const row = document.querySelector('.mirror-typing-status');
    const button = row.querySelector('button');
    const content = document.querySelector('#terminal-window-content');
    if (row.hidden || button.hidden || button.getBoundingClientRect().height <= 0 || row.getBoundingClientRect().bottom > content.getBoundingClientRect().top) throw Error('Stop/status does not reserve visible content space');
    button.click();
  })()`);
  await status(window, "Mirroring stopped");
  key(window.webContents, "c");
  await delivery(["", "c", ""]);
  await fence("stopped");
  checks.push(MIRROR_CHECKS[3]);
  await start(window);
  let observedSemanticStop = false;
  // Passive listener registered AFTER production: its stop handler has run
  // before this observation. Never sends IPC or substitutes route authority.
  const observeStop = (event: Electron.IpcMainEvent, value: unknown) => {
    if (
      event.sender === window.webContents &&
      value &&
      typeof value === "object" &&
      "reason" in value &&
      value.reason === "semantic-input"
    )
      observedSemanticStop = true;
  };
  ipcMain.on("terminal:mirror-stop", observeStop);
  const sourcePty = ordered[0]!;
  const originalWrite = sourcePty.terminal.write.bind(sourcePty.terminal);
  sourcePty.terminal.write = (data) => {
    if (data.includes("paste-local")) {
      assert.equal(
        observedSemanticStop,
        true,
        "production stop precedes local semantic write",
      );
      semanticStopBeforeWrite = true;
    }
    originalWrite(data);
  };
  clipboard.writeText("paste-local");
  menu(window, "Paste");
  await status(window, "Mirroring stopped — paste/insertion goes to one pane.");
  await delivery(["paste-local", "", ""]);
  // A later real key must also stay local: no automatic resume after Paste.
  key(window.webContents, "d");
  await delivery(["d", "", ""]);
  await fence("paste");
  ipcMain.removeListener("terminal:mirror-stop", observeStop);
  assert.equal(semanticStopBeforeWrite, true);
  checks.push(MIRROR_CHECKS[4]);
  const retiringPage = await start(window);
  assert.equal(children.length, 1);
  assert.equal(children[0]!.child.kill("SIGTERM"), true);
  await status(window, "Mirroring stopped");
  await until(
    () =>
      children[0]!.closed &&
      retiringPage.isDestroyed() &&
      hosted().length === 0,
    "actual backend and native view retirement",
  );
  assert.equal(ptys.length, 3);
  assert.ok(ptys.every((p) => !p.exited));
  assert.equal(
    await window.webContents.executeJavaScript(
      "window.__mirrorCanvases.length === document.querySelectorAll('.terminal-tab canvas').length && window.__mirrorCanvases.every((c,i) => c === document.querySelectorAll('.terminal-tab canvas')[i])",
    ),
    true,
  );
  await selectPane(window, 0, 0);
  key(window.webContents, "e");
  await delivery(["e", "", ""]);
  await fence("retired");
  checks.push(MIRROR_CHECKS[5]);
  quitting = true;
  app.quit();
}
const ready = new Promise<BrowserWindow>((resolve) =>
  app.once("browser-window-created", (_event, window) =>
    window.once("ready-to-show", () => resolve(window)),
  ),
);
await import(
  pathToFileURL(path.join(fixture.source, "dist/main/index.js")).href
);
void ready.then(run).catch(fail);
