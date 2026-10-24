import {
  SETTINGS_FIELDS,
  type SettingsBridge,
  type SettingsPath,
  type SettingsResult,
  type SettingsSnapshot,
} from "../../shared/settings";
import type { TerminalClipboardAction } from "../../shared/terminal-contract";
import type { TerminalClipboard } from "../../terminal-surface/terminal-surface";
import { retainDismissalGesture } from "../about/about-dialog";
import { renderConfigFile } from "./settings-config-file";
import { pages, renderControl } from "./settings-pages";

const LIFETIME_NOTES = {
  live: "",
  "new-tabs": " New tabs use it.",
  "new-windows": " It applies to new windows.",
  restart: " New tabs use it; restart OMXTerm to apply it to open tabs.",
} as const;

// Describes what a result actually did, never more: saved is not applied.
export function describeSettingsResult(
  result: SettingsResult,
  path?: SettingsPath,
): { readonly text: string; readonly error: boolean } {
  if (result.status !== "saved") return { text: result.message, error: true };
  if (!result.application.applied)
    return {
      text: `Saved to config.json, but it could not be applied: ${result.application.notice}`,
      error: true,
    };
  const note = path ? LIFETIME_NOTES[SETTINGS_FIELDS[path].lifetime] : "";
  return { text: `Saved.${note}`, error: false };
}

// Save-on-change dialog and controls adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export function mountSettingsDialog(
  document: Document,
  bridge: SettingsBridge | undefined,
  canOpen: () => boolean,
  options: {
    readonly focusTerminal: () => void;
    readonly onActivityChange: (active: boolean) => void;
  },
) {
  if (!bridge) return undefined;
  const dialog = createSettingsDialog(document, bridge, options);
  const removeOpen = bridge.onOpen(() => {
    if (canOpen()) void dialog.open();
  });
  return {
    isActive: dialog.isActive,
    editClipboard: dialog.editClipboard,
    dispose() {
      removeOpen();
      dialog.dispose();
    },
  };
}

export function createSettingsDialog(
  document: Document,
  bridge: SettingsBridge,
  options: {
    readonly focusTerminal: () => void;
    readonly onActivityChange: (active: boolean) => void;
  },
) {
  let dialog: HTMLDialogElement | undefined;
  let disposed = false;
  const keyboard = retainDismissalGesture(document);
  const close = (restoreFocus: boolean) => {
    const previous = dialog;
    if (!previous) return;
    dialog = undefined;
    if (restoreFocus) previous.close();
    previous.remove();
    options.onActivityChange(false);
    if (restoreFocus) options.focusTerminal();
  };

  const open = async () => {
    if (disposed) return;
    if (dialog) {
      (
        dialog.querySelector<HTMLElement>(
          '[role="tab"][aria-selected="true"]',
        ) ?? dialog.querySelector<HTMLElement>(".settings-close")
      )?.focus();
      return;
    }
    const current = document.createElement("dialog");
    dialog = current;
    current.className = "settings-dialog";
    current.setAttribute("aria-labelledby", "settings-title");
    const live = () => dialog === current;
    const view = buildSettingsView(document, bridge, live);
    const done = document.createElement("button");
    done.type = "button";
    done.className = "settings-close";
    done.textContent = "Close";
    done.addEventListener("click", () => {
      if (live()) close(true);
    });
    current.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (live()) close(true);
    });
    current.addEventListener("keydown", (event) => {
      keyboard.track(event, done);
      event.stopPropagation();
    });
    current.append(view.element, done);
    document.body.append(current);
    options.onActivityChange(true);
    current.showModal();
    done.focus();
    await view.load();
  };

  return {
    isActive: () => dialog !== undefined,
    open,
    // App Copy/Paste/Select All edit the focused text field and never reach
    // the terminal while Settings owns input.
    editClipboard(
      action: TerminalClipboardAction,
      clipboard: Pick<TerminalClipboard, "readText" | "writeText"> | undefined,
    ) {
      const field = dialog?.contains(document.activeElement)
        ? document.activeElement
        : undefined;
      if (
        !(field instanceof HTMLInputElement) &&
        !(field instanceof HTMLTextAreaElement)
      )
        return;
      void editField(field, action, clipboard);
    },
    dispose() {
      disposed = true;
      keyboard.dispose();
      close(false);
    },
  };
}

async function editField(
  field: HTMLInputElement | HTMLTextAreaElement,
  action: TerminalClipboardAction,
  clipboard: Pick<TerminalClipboard, "readText" | "writeText"> | undefined,
) {
  const start = field.selectionStart;
  const end = field.selectionEnd;
  if (action === "select-all") {
    field.select();
    return;
  }
  if (action === "copy") {
    const text =
      start === null || end === null
        ? field.value
        : field.value.slice(start, end);
    if (text) await clipboard?.writeText(text).catch(() => undefined);
    return;
  }
  const text = await clipboard?.readText().catch(() => "");
  if (!text || field.ownerDocument.activeElement !== field) return;
  if (start === null || end === null) field.value = text;
  else field.setRangeText(text, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function buildSettingsView(
  document: Document,
  bridge: SettingsBridge,
  live: () => boolean,
) {
  let snapshot: SettingsSnapshot | undefined;
  const syncs: (() => void)[] = [];
  const element = document.createElement("div");
  element.className = "settings-body";
  const title = document.createElement("h2");
  title.id = "settings-title";
  title.textContent = "Settings";
  const status = document.createElement("p");
  status.className = "settings-status";
  status.setAttribute("role", "status");
  const problem = document.createElement("p");
  problem.className = "settings-problem";
  problem.setAttribute("role", "alert");
  problem.hidden = true;
  const tabs = document.createElement("div");
  tabs.className = "settings-tabs";
  tabs.setAttribute("role", "tablist");
  const panels = document.createElement("div");
  panels.className = "settings-panels";

  const report = (text: string, error: boolean) => {
    status.textContent = text;
    status.classList.toggle("error", error);
  };
  const adopt = (next: SettingsSnapshot) => {
    snapshot = next;
    problem.textContent = next.problem
      ? `${next.problem}. Graphical changes are checked against the whole file; fix it here or in the Config File page.`
      : "";
    problem.hidden = next.problem === undefined;
    for (const sync of syncs) sync();
  };
  let queue = Promise.resolve();
  const change = (path: SettingsPath, value: unknown) => {
    report("Saving…", false);
    queue = queue
      .then(() => bridge.change({ path, value }))
      .then(
        (result) => {
          if (!live()) return;
          adopt(result.snapshot);
          const message = describeSettingsResult(result, path);
          report(message.text, message.error);
        },
        () => {
          if (!live()) return;
          report("Not saved: the request failed.", true);
          for (const sync of syncs) sync();
        },
      );
  };
  const value = (path: SettingsPath) => snapshot?.values[path];

  const tabButtons: HTMLButtonElement[] = [];
  const select = (index: number) => {
    tabButtons.forEach((button, position) => {
      const selected = position === index;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels.children[position]!.toggleAttribute("hidden", !selected);
    });
  };
  const addPage = (id: string, label: string, panel: HTMLElement) => {
    const index = tabButtons.length;
    const button = document.createElement("button");
    button.type = "button";
    button.id = `settings-tab-${id}`;
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `settings-panel-${id}`);
    button.addEventListener("click", () => select(index));
    button.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp" || event.key === "ArrowLeft"
            ? -1
            : 0;
      if (!step) return;
      event.preventDefault();
      const next = (index + step + tabButtons.length) % tabButtons.length;
      select(next);
      tabButtons[next]!.focus();
    });
    panel.id = `settings-panel-${id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    tabButtons.push(button);
    tabs.append(button);
    panels.append(panel);
  };

  // Pages depend on the main-reported platform, so they are built with the
  // first snapshot; until then the dialog shows a loading status.
  const build = (platform: string) => {
    for (const page of pages(platform)) {
      const panel = document.createElement("div");
      panel.className = "settings-panel";
      for (const control of page.controls)
        panel.append(renderControl(document, control, value, change, syncs));
      addPage(page.id, page.label, panel);
    }
    addPage(
      "config-file",
      "Config File",
      renderConfigFile(document, bridge, () => snapshot, live, adopt, syncs),
    );
    select(0);
  };
  element.append(title, problem, tabs, panels, status);
  report("Loading settings…", false);

  return {
    element,
    async load() {
      try {
        const loaded = await bridge.snapshot();
        if (!live()) return;
        build(loaded.platform);
        adopt(loaded);
        report("", false);
        tabButtons[0]?.focus();
      } catch {
        if (live()) report("Settings could not be loaded.", true);
      }
    },
  };
}
