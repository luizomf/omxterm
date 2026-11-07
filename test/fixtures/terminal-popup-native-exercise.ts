import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BrowserWindow,
  clipboard,
  nativeImage,
  screen,
  type Menu,
} from "electron";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { UserConfiguration } from "../../src/shared/user-configuration";
import type { popupPtyObservation } from "./terminal-popup-native-pty";
import { waitFor } from "./window-chrome-exercise";
import { POPUP_INPUT_ADMISSION_MS } from "./terminal-popup-input-admission";
import { translatorFor } from "../../src/shared/i18n";
import { popupClosePaneIndex } from "./terminal-popup-native-actions";

export interface NativePopup {
  readonly window: BrowserWindow;
  readonly menu: Menu;
  readonly activate: (index: number) => void;
  shown: boolean;
  closed: boolean;
}
interface PopupOptions {
  readonly window: BrowserWindow;
  readonly windows: readonly BrowserWindow[];
  readonly application: TerminalApplication<BrowserWindow>;
  readonly popups: readonly NativePopup[];
  readonly children: ReadonlyArray<{
    terminal: LocalTerminalSession;
    observation: ReturnType<typeof popupPtyObservation>;
    exited: boolean;
  }>;
  readonly activationWindows: readonly (number | null)[];
  readonly clipboardReads: readonly number[];
  readonly confirmations: () => number;
  readonly resolveClose: (confirmed: boolean) => void;
  readonly configure: (next: Partial<UserConfiguration>) => void;
  readonly configuration: () => UserConfiguration;
  readonly capture: boolean;
  readonly admitNativeInput: () => Promise<void>;
}
const execute = promisify(execFile);

export async function submitPopupCalibrationKey(
  key: "F5" | "F6",
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  // Standard X11/evdev keycodes bypass libxdo's named-key modifier map.
  // The actual owned, unmodified F6 receipt still verifies this assumption.
  const keycode = key === "F5" ? "71" : "72";
  async function submit(action: "key" | "keyup", commandSignal?: AbortSignal) {
    const operation = execute("/usr/bin/xdotool", [action, keycode], {
      timeout: POPUP_INPUT_ADMISSION_MS,
      maxBuffer: 1024,
      ...(commandSignal ? { signal: commandSignal } : {}),
    });
    // Abort/error is not process settlement. Keep the observer's suppression
    // until the actual command and its streams close, including cleanup.
    const closed = new Promise<void>((resolve) => {
      operation.child.once("close", () => resolve());
    });
    try {
      await operation;
    } finally {
      await closed;
    }
  }
  let failure: { error: unknown } | undefined;
  try {
    await submit("key", signal);
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    // An interrupted key command can leave its key down even after close.
    // Release only the attempted calibration key, independently of its abort.
    try {
      await submit("keyup");
    } catch (error) {
      if (failure)
        throw new AggregateError(
          [failure.error, error],
          "Native popup calibration submission and key release failed",
          { cause: failure.error },
        );
      throw error;
    }
  }
}
const panes = ".terminal-tab:not([hidden]) .terminal-surface";
const evaluate = <T>(window: BrowserWindow, script: string) =>
  window.webContents.executeJavaScript(script, true) as Promise<T>;
async function focus(window: BrowserWindow) {
  window.focus();
  await waitFor(
    () => BrowserWindow.getFocusedWindow() === window,
    "actual native window focus",
  );
}
async function paneCount(window: BrowserWindow) {
  return evaluate<number>(
    window,
    `document.querySelectorAll('${panes}').length`,
  );
}
async function open(
  options: PopupOptions,
  window: BrowserWindow,
  pane: number,
) {
  await focus(window);
  const before = options.popups.length;
  await evaluate(
    window,
    `document.querySelectorAll('${panes}')[${pane}].dispatchEvent(new MouseEvent('contextmenu', {bubbles:true,cancelable:true}))`,
  );
  await waitFor(
    () =>
      options.popups.length === before + 1 && !!options.popups.at(-1)?.shown,
    "real native popup shown after Surface/preload routing",
  );
  return options.popups.at(-1)!;
}
async function dismiss(popup: NativePopup) {
  popup.menu.closePopup(popup.window);
  await waitFor(() => popup.closed, "native popup dismissal");
}
function activate(popup: NativePopup, index: number) {
  popup.activate(index);
}
async function type(window: BrowserWindow, text: string) {
  await evaluate(
    window,
    `(() => {
    const input = document.querySelector('${panes} textarea');
    input.focus();
    input.dispatchEvent(new InputEvent('input', { data:${JSON.stringify(text)},inputType:'insertText',bubbles:true }));
  })()`,
  );
}
async function capturePopup(window: BrowserWindow) {
  const directory = process.env.OMXTERM_POPUP_EVIDENCE_DIR;
  if (!directory) return false;
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, "desktop-temporary.png");
  try {
    // KDE's native screenshot includes the OS popup; capturePage does not.
    await execute(
      "/usr/bin/spectacle",
      ["--background", "--nonotify", "--output", temporary],
      { timeout: 10_000 },
    );
    const image = nativeImage.createFromBuffer(await readFile(temporary));
    const display = screen.getPrimaryDisplay();
    const bounds = window.getBounds();
    const scale = image.getSize().width / display.bounds.width;
    const synthetic = image.crop({
      x: Math.round(bounds.x * scale),
      y: Math.round(bounds.y * scale),
      width: Math.round(bounds.width * scale),
      height: Math.round(bounds.height * scale),
    });
    await writeFile(
      path.join(directory, "native-popup-synthetic.png"),
      synthetic.toPNG(),
    );
    return true;
  } finally {
    await rm(temporary, { force: true });
  }
}

// A deliberately small runtime tracer: real menu activation/focus, real Busy
// serialization, real clipboard delivery, and actual child exit/window identity.
// Broad lifetime combinatorics remain in the production headless regressions.
export async function exerciseTerminalPopup(options: PopupOptions) {
  const { window, application, children } = options;
  const closePaneIndex = (popup: NativePopup) =>
    popupClosePaneIndex(
      popup.menu.items,
      translatorFor(options.configuration().language).t,
    );
  await evaluate(window, "globalThis.__windowChromeHostReady()");
  await focus(window);
  await waitFor(
    () => children[0]?.observation.ready() ?? false,
    "first native PTY ready",
  );
  await evaluate(
    window,
    `globalThis.popupFirstCanvas = document.querySelector('${panes} canvas')`,
  );
  application.splitSelectedPane("right");
  await waitFor(
    async () =>
      children.length === 2 &&
      children[1]!.observation.ready() &&
      (await paneCount(window)) === 2,
    "two actual split Surfaces and native children",
  );
  assert.equal(
    children[1]!.terminal.hasForegroundChildProcess(),
    true,
    "explicit child must be genuinely Busy",
  );

  await options.admitNativeInput();
  assert.ok(
    children[0]!.observation.input() === "",
    "Calibration must not enter the first child",
  );
  assert.ok(
    children[1]!.observation.input() === "",
    "Calibration must not enter the second child",
  );

  // Real native menu keyboard activation, not a copied callback expression.
  clipboard.writeText("native-paste");
  const current = await open(options, window, 1);
  const currentClose = current.menu.items[closePaneIndex(current)]!;
  assert.equal(
    currentClose.label,
    translatorFor(options.configuration().language).t("menu.closePane"),
  );
  assert.equal(
    currentClose.accelerator,
    options.configuration().keybinds.closePane,
  );
  const captured = options.capture && (await capturePopup(window));
  await execute(
    "/usr/bin/xdotool",
    ["key", "--clearmodifiers", "Home", "Down", "Return"],
    { timeout: 5_000 },
  );
  const expectedPaste = "\u001b[200~native-paste\u001b[201~";
  await waitFor(
    () => children[1]!.observation.input().length >= expectedPaste.length,
    "actual native popup callback pastes into clicked child",
  );
  assert.equal(
    options.activationWindows.at(-1),
    window.id,
    "Menu.popup activation must preserve production getFocusedWindow ownership",
  );
  assert.equal(children[0]!.observation.input(), "");
  assert.ok(
    children[1]!.observation.input() === expectedPaste,
    "Only the exact native popup Paste may reach the clicked child",
  );

  const select = await open(options, window, 1);
  activate(select, 3);
  await dismiss(select);
  const copy = await open(options, window, 1);
  activate(copy, 0);
  await dismiss(copy);
  await waitFor(
    () => clipboard.readText().includes("synthetic-popup-selection"),
    "actual Surface selection reaches native clipboard",
  );

  // Nullable/remapped accelerator and localization use effective main snapshots.
  const keybinds = options.configuration().keybinds;
  options.configure({
    language: "pt-BR",
    keybinds: { ...keybinds, closePane: null },
  });
  const nullable = await open(options, window, 1);
  const nullableClose = nullable.menu.items[closePaneIndex(nullable)]!;
  assert.equal(nullableClose.label, "Fechar Painel");
  // Electron's constructed MenuItem exposes an unset accelerator as null.
  assert.equal(nullableClose.accelerator, null);
  await dismiss(nullable);
  options.configure({
    language: "en-US",
    keybinds: { ...keybinds, closePane: "Control+Alt+K" },
  });
  const remapped = await open(options, window, 1);
  assert.equal(
    remapped.menu.items[closePaneIndex(remapped)]!.accelerator,
    "Control+Alt+K",
  );
  await dismiss(remapped);

  const denied = await open(options, window, 1);
  await dismiss(denied);
  activate(denied, closePaneIndex(denied));
  assert.equal(options.confirmations(), 1);
  const shared = application.closeSelectedTab();
  application.focusSelectedPane("previous");
  options.resolveClose(false);
  await shared;
  assert.equal(children[1]!.exited, false);
  assert.equal(await paneCount(window), 2);

  // Same local session id in another actual window is not authorization.
  await application.newWindow();
  const other = options.windows[1]!;
  await evaluate(other, "globalThis.__windowChromeHostReady()");
  await waitFor(
    () => children[2]?.observation.ready() ?? false,
    "other native window/PTY ready",
  );
  const approved = await open(options, window, 1);
  await dismiss(approved);
  activate(approved, closePaneIndex(approved));
  assert.equal(options.confirmations(), 2);
  const pending = application.closeSelectedPane();
  await focus(other);
  options.resolveClose(true);
  await pending;
  await waitFor(
    async () => children[1]!.exited && (await paneCount(window)) === 1,
    "approved captured child actually exits, survivor remains",
  );
  assert.equal(children[0]!.exited, false);
  assert.equal(children[2]!.exited, false);
  assert.equal(
    await evaluate(
      window,
      `globalThis.popupFirstCanvas === document.querySelector('${panes} canvas')`,
    ),
    true,
  );

  const wrongWindow = await open(options, window, 0);
  assert.equal(
    wrongWindow.menu.items.some(
      (item) =>
        item.label ===
        translatorFor(options.configuration().language).t("menu.closePane"),
    ),
    false,
  );
  await dismiss(wrongWindow);
  await focus(other);
  const readsBeforeWindow = options.clipboardReads.length;
  activate(wrongWindow, 1);
  await type(other, "window-fence");
  await waitFor(
    () => children[2]!.observation.input().includes("window-fence"),
    "other native child input fence",
  );
  assert.equal(
    options.clipboardReads.length,
    readsBeforeWindow,
    "source popup must not read clipboard after selected-window change",
  );
  assert.equal(children[0]!.exited, false);

  await focus(window);
  application.splitSelectedPane("right");
  await waitFor(
    async () =>
      children.length === 4 &&
      children[3]!.observation.ready() &&
      (await paneCount(window)) === 2,
    "replacement split for ordinary native exit",
  );
  const stale = await open(options, window, 1);
  await dismiss(stale);
  const readsBeforeExit = options.clipboardReads.length;
  const confirmationsBeforeExit = options.confirmations();
  clipboard.writeText("must-not-reach-survivor");
  children[3]!.terminal.write("\u0004");
  await waitFor(
    async () => children[3]!.exited && (await paneCount(window)) === 1,
    "source child exits ordinarily before retained callback activation",
  );
  activate(stale, closePaneIndex(stale));
  assert.equal(
    options.confirmations(),
    confirmationsBeforeExit,
    "stale Close Pane must not inspect/confirm the surviving Busy child",
  );
  activate(stale, 1);
  await type(window, "survivor-fence");
  await waitFor(
    () => children[0]!.observation.input().includes("survivor-fence"),
    "surviving actual PTY still acknowledges input",
  );
  assert.equal(
    options.clipboardReads.length,
    readsBeforeExit,
    "stale clipboard callback must not read for the survivor",
  );
  assert.equal(children[0]!.observation.input(), "survivor-fence");
  assert.equal(children[0]!.exited, false);
  assert.equal(children[2]!.observation.input(), "window-fence");
  return {
    realNativePopup: true,
    nativeActivationFocusedWindow: true,
    clickedChildPaste: true,
    nativeClipboardSelection: true,
    nullableRemappedLocalized: true,
    busySharedSlot: true,
    ordinaryExitStaleInert: true,
    selectedWindowChangeInert: true,
    survivorCanvasRetained: true,
    childCount: 4,
    screenshot: captured,
    syntheticInput: true,
    physicalInput: false,
    confirmationAnswers:
      "fixture-controlled; native dialog widgets not exercised",
  };
}
