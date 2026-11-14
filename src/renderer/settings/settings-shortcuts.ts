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
import {
  matchesShortcutFilter,
  type ShortcutFilterRow,
} from "./shortcut-filter";

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
  swapPaneLeft: "menu.swapPaneLeft",
  swapPaneRight: "menu.swapPaneRight",
  swapPaneUp: "menu.swapPaneAbove",
  swapPaneDown: "menu.swapPaneBelow",
  equalizePanes: "menu.equalizePanes",
  zoomIn: "menu.zoomIn",
  zoomOut: "menu.zoomOut",
  actualSize: "menu.actualSize",
  toggleFullScreen: "menu.toggleFullScreen",
  toggleSnippets: "menu.toggleSnippets",
  toggleFiles: "menu.toggleFiles",
  toggleSshConnect: "menu.toggleSshConnect",
  toggleMirrorTyping: "mirrorTyping.title",
  toggleAgentAccess: "menu.allowAgents",
  saveLayout: "menu.saveLayout",
  toggleTabBar: "menu.toggleTabBar",
  togglePaneMarks: "menu.togglePaneMarks",
  toggleAuxiliaryPanel: "menu.toggleAuxiliaryPanel",
  moveAuxiliaryPanel: "menu.moveAuxiliaryPanel",
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
  // A menu's "…" promises a dialog; in a list of names it is only noise.
  return t(key, { name: "OMXTerm" }).replace(/…$/u, "");
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
  hint.className = "ui-hint settings-hint";
  context.labels.push((t) => {
    hint.textContent = t("shortcuts.hint");
  });
  const filter = document.createElement("input");
  filter.type = "search";
  filter.className = "settings-shortcut-filter page-control";
  filter.autocomplete = "off";
  filter.spellcheck = false;
  const empty = document.createElement("p");
  empty.className = "settings-shortcut-empty ui-hint";
  empty.setAttribute("role", "status");
  empty.hidden = true;
  panel.append(hint, filter);
  let recording: TerminalActionName | undefined;
  let stopCapture: (() => void) | undefined;
  let translate: Translate | undefined;
  const rows: ((t: Translate) => void)[] = [];
  const filtered: {
    readonly element: HTMLElement;
    readonly describe: (t: Translate) => ShortcutFilterRow;
  }[] = [];
  const syncAll = () => {
    if (translate) for (const row of rows) row(translate);
  };
  // Runs when the query or the language changes, never on a save: a row found
  // by its keys stays put while those keys are being changed.
  const applyFilter = () => {
    const t = translate;
    if (!t) return;
    let matches = 0;
    for (const row of filtered) {
      const match = matchesShortcutFilter(filter.value, row.describe(t));
      row.element.hidden = !match;
      if (match) matches += 1;
    }
    empty.hidden = matches > 0;
  };
  filter.addEventListener("input", applyFilter);
  filter.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || filter.value === "") return;
    event.preventDefault();
    filter.value = "";
    applyFilter();
  });
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
    context.report(
      context.platform === "darwin"
        ? "shortcuts.promptMac"
        : "shortcuts.prompt",
    );
    stopCapture = context.captureShortcut((shortcut) => {
      if (!context.live() || !context.interactive() || recording !== action)
        return;
      if ("invalid" in shortcut) {
        context.report(
          context.platform === "darwin"
            ? "shortcuts.invalidMac"
            : "shortcuts.invalid",
          true,
        );
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
    value.className = "settings-shortcut-value ui-chip";
    const state = document.createElement("span");
    state.className = "settings-shortcut-state";
    const button = (className: string, onClick: () => void) => {
      const element = createPageButton(
        document,
        className === "settings-shortcut-record" ? "quiet" : "text",
      );
      element.classList.add(className, "page-button-compact");
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
      // A binding without a mark is the default; only changes are labelled.
      state.textContent =
        keybind && keybind.state !== "inherit" ? t(STATES[keybind.state]) : "";
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
    filtered.push({
      element: row,
      describe: (t) => {
        const keybind = context.snapshot()?.keybinds?.[action];
        const text = [
          shortcutActionName(action, t),
          keybind && keybind.state !== "inherit"
            ? t(STATES[keybind.state])
            : "",
        ].join(" ");
        if (keybind?.effective == null) return { text };
        return {
          text,
          binding:
            displayAccelerator(keybind.effective, context.platform) ??
            keybind.effective,
        };
      },
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
  panel.append(empty);
  context.labels.push((t) => {
    translate = t;
    filter.placeholder = t("shortcuts.search");
    filter.setAttribute("aria-label", t("shortcuts.search"));
    empty.textContent = t("shortcuts.noMatch");
    syncAll();
    applyFilter();
  });
  context.syncs.push(syncAll);
  return { element: panel, release };
}
