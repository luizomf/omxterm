import { createPageButton } from "../application-page";
import type { MessageKey } from "../../shared/i18n";
import type { SettingsSnapshot } from "../../shared/settings";
import type {
  CapturedShortcut,
  KeybindChoice,
  KeybindState,
  SettingsKeybindChange,
} from "../../shared/settings-keybinds";
import {
  displayAccelerator,
  TERMINAL_ACTION_NAMES,
  type TerminalActionName,
} from "../../shared/terminal-keybinds";
import type { Translate } from "../renderer-language";

// Action names reuse the menu's own translations.
const MENU_KEYS: Readonly<
  Record<Exclude<TerminalActionName, `selectTab${number}`>, MessageKey>
> = {
  quit: "menu.quit",
  copy: "menu.copy",
  paste: "menu.paste",
  selectAll: "menu.selectAll",
  find: "menu.find",
  commandPalette: "action.commandPalette",
  newWindow: "menu.newWindow",
  closeWindow: "menu.closeWindow",
  newTab: "menu.newTab",
  closeTab: "menu.closeTab",
  nextTab: "menu.showNextTab",
  previousTab: "menu.showPreviousTab",
  splitRight: "menu.splitRight",
  splitDown: "menu.splitDown",
  closePane: "menu.closePane",
  focusNextPane: "menu.focusNextPane",
  focusPreviousPane: "menu.focusPreviousPane",
  focusPaneLeft: "menu.focusPaneLeft",
  focusPaneRight: "menu.focusPaneRight",
  focusPaneUp: "menu.focusPaneAbove",
  focusPaneDown: "menu.focusPaneBelow",
  equalizePanes: "menu.equalizePanes",
  zoomIn: "menu.zoomIn",
  zoomOut: "menu.zoomOut",
  actualSize: "menu.actualSize",
  toggleFullScreen: "menu.toggleFullScreen",
  toggleSnippets: "menu.toggleSnippets",
  toggleFiles: "menu.toggleFiles",
  toggleSshConnect: "menu.toggleSshConnect",
  toggleTabBar: "menu.toggleTabBar",
  toggleAuxiliaryPanel: "menu.toggleAuxiliaryPanel",
  toggleTitleBar: "menu.toggleTitleBar",
  reloadConfig: "menu.reloadConfiguration",
};

export function shortcutActionName(
  action: TerminalActionName,
  t: Translate,
): string {
  const position = /^selectTab([1-9])$/u.exec(action)?.[1];
  if (position) return `${t("menu.selectTab")} ${position}`;
  const key = MENU_KEYS[action as keyof typeof MENU_KEYS];
  return t(key, { name: "OMXTerm" });
}

const STATES: Readonly<Record<KeybindState, MessageKey>> = {
  inherit: "shortcuts.state.inherit",
  custom: "shortcuts.state.custom",
  unbound: "shortcuts.state.unbound",
};

// Shortcut controls adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT), for the nullable contract:
// each action inherits its default, has a custom binding or is unbound. A
// recorded key comes from main, so it never runs or reaches the terminal.
export function renderShortcuts(
  document: Document,
  context: {
    readonly snapshot: () => SettingsSnapshot | undefined;
    readonly platform: string;
    readonly live: () => boolean;
    readonly interactive: () => boolean;
    readonly report: (key?: MessageKey, error?: boolean) => void;
    readonly changeKeybind: (change: SettingsKeybindChange) => void;
    readonly captureShortcut: (
      listener: (shortcut: CapturedShortcut) => void,
    ) => () => void;
    readonly syncs: (() => void)[];
    readonly labels: ((t: Translate) => void)[];
  },
) {
  const panel = document.createElement("div");
  panel.className = "settings-panel settings-shortcuts";
  const hint = document.createElement("p");
  hint.className = "settings-hint";
  context.labels.push((t) => {
    hint.textContent = t("shortcuts.hint");
  });
  panel.append(hint);
  let recording: TerminalActionName | undefined;
  let stopCapture: (() => void) | undefined;
  let translate: Translate | undefined;
  const rows: ((t: Translate) => void)[] = [];
  const syncAll = () => {
    if (translate) for (const row of rows) row(translate);
  };
  // Ends any capture: on a new recording, cancel, page close or disposal.
  const release = () => {
    const wasRecording = recording !== undefined;
    recording = undefined;
    const stop = stopCapture;
    stopCapture = undefined;
    stop?.();
    syncAll();
    if (wasRecording && context.live()) context.report("shortcuts.cancelled");
  };
  const save = (action: TerminalActionName, choice: KeybindChoice) =>
    context.changeKeybind({ action, choice });
  const record = (action: TerminalActionName) => {
    if (!context.live() || !context.interactive()) return;
    const again = recording === action;
    release();
    if (again) return;
    recording = action;
    syncAll();
    context.report("shortcuts.prompt");
    stopCapture = context.captureShortcut((shortcut) => {
      if (!context.live() || !context.interactive() || recording !== action)
        return;
      if ("invalid" in shortcut) {
        context.report("shortcuts.invalid", true);
        return;
      }
      stopCapture = undefined;
      recording = undefined;
      syncAll();
      if ("cancelled" in shortcut) context.report("shortcuts.cancelled");
      else save(action, { state: "custom", accelerator: shortcut.accelerator });
    });
  };

  for (const action of TERMINAL_ACTION_NAMES) {
    const row = document.createElement("div");
    row.className = "settings-shortcut";
    row.dataset.action = action;
    const name = document.createElement("span");
    name.className = "settings-shortcut-name";
    const value = document.createElement("span");
    value.className = "settings-shortcut-value";
    const state = document.createElement("span");
    state.className = "settings-shortcut-state";
    const button = (className: string, onClick: () => void) => {
      const element = createPageButton(
        document,
        className === "settings-shortcut-record" ? "quiet" : "text",
      );
      element.classList.add(className);
      element.addEventListener("click", onClick);
      return element;
    };
    const recordButton = button("settings-shortcut-record", () =>
      record(action),
    );
    recordButton.addEventListener("blur", () => {
      if (recording === action) release();
    });
    const unbind = button("settings-shortcut-unbind", () => {
      release();
      save(action, { state: "unbound" });
    });
    const inherit = button("settings-shortcut-default", () => {
      release();
      save(action, { state: "inherit" });
    });
    rows.push((t) => {
      const keybind = context.snapshot()?.keybinds?.[action];
      row.classList.toggle("is-recording", recording === action);
      const actionName = shortcutActionName(action, t);
      name.textContent = actionName;
      value.textContent =
        recording === action
          ? t("shortcuts.pressing")
          : keybind?.effective == null
            ? t("shortcuts.none")
            : (displayAccelerator(keybind.effective, context.platform) ??
              keybind.effective);
      state.textContent = keybind ? t(STATES[keybind.state]) : "";
      recordButton.textContent = t(
        recording === action ? "common.cancel" : "shortcuts.record",
      );
      recordButton.setAttribute(
        "aria-label",
        t(
          recording === action
            ? "shortcuts.cancelLabel"
            : "shortcuts.recordLabel",
          { action: actionName },
        ),
      );
      unbind.textContent = t("shortcuts.unbind");
      unbind.setAttribute(
        "aria-label",
        t("shortcuts.unbindLabel", { action: actionName }),
      );
      inherit.textContent = t("shortcuts.default");
      inherit.setAttribute(
        "aria-label",
        t("shortcuts.defaultLabel", { action: actionName }),
      );
      unbind.disabled = keybind?.state === "unbound";
      inherit.disabled = keybind?.state === "inherit";
    });
    const binding = document.createElement("div");
    binding.className = "settings-shortcut-binding";
    binding.append(value, state);
    const actions = document.createElement("div");
    actions.className = "settings-shortcut-actions";
    actions.append(recordButton, unbind, inherit);
    row.append(name, binding, actions);
    panel.append(row);
  }
  context.labels.push((t) => {
    translate = t;
    syncAll();
  });
  context.syncs.push(syncAll);
  return { element: panel, release };
}
