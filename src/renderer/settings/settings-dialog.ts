import {
  type SettingsBridge,
  type SettingsPath,
  type SettingsResult,
  type SettingsSnapshot,
} from "../../shared/settings";
import type { TerminalClipboardAction } from "../../shared/terminal-contract";
import type { TerminalClipboard } from "../../terminal-surface/terminal-surface";
import { retainDismissalGesture } from "../about/about-dialog";
import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
} from "../application-page";
import { renderConfigFile } from "./settings-config-file";
import { pages, renderControl } from "./settings-pages";
import {
  englishLanguage,
  type RendererLanguage,
  type Translate,
} from "../renderer-language";
import type { MessageKey } from "../../shared/i18n";
import { settingsMessageText } from "../../shared/settings-messages";
import { describeSettingsResult } from "./settings-results";
export { describeSettingsResult } from "./settings-results";
import { renderShortcuts } from "./settings-shortcuts";
import { extensionsPage, extensionsNavigation } from "./settings-extensions";
import type { SettingsKeybindChange } from "../../shared/settings-keybinds";

export type SettingsDestination = { page: "extensions"; reason: "snippets" };

// Retained graphical editor and save-on-change controls adapted from ruscher/omxterm PR #622 at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export function createSettingsView(
  document: Document,
  bridge: SettingsBridge,
  options: {
    readonly focusTerminal?: () => void;
    readonly onActivityChange?: (active: boolean) => void;
    readonly language?: RendererLanguage;
    readonly container?: HTMLElement;
    readonly onClose?: () => void;
    readonly keyboard?: ReturnType<typeof retainDismissalGesture>;
  },
) {
  const language = options.language ?? englishLanguage;
  let unbindView: (() => void) | undefined;
  let navigateView: ((destination: SettingsDestination) => void) | undefined;
  let dialog: HTMLElement | undefined;
  let selected = true;
  let blocked = false;
  let interaction = 0;
  let lastFocus: HTMLElement | undefined;
  const interactive = () => !disposed && selected && !blocked && !!dialog;
  const invalidate = () => {
    interaction += 1;
  };
  const onBlur = () => {
    invalidate();
    releaseView?.();
  };
  const onFocusOut = () => invalidate();
  document.defaultView?.addEventListener("blur", onBlur);
  document.addEventListener("focusout", onFocusOut);
  let disposed = false;
  // Ends the open view's shortcut capture so main returns the keyboard.
  let releaseView: (() => void) | undefined;
  const keyboard = options.keyboard ?? retainDismissalGesture(document);
  const close = (restoreFocus: boolean) => {
    const previous = dialog;
    if (!previous) return;
    dialog = undefined;
    unbindView?.();
    unbindView = undefined;
    navigateView = undefined;
    releaseView?.();
    releaseView = undefined;
    invalidate();
    previous.remove();
    options.onActivityChange?.(false);
    if (restoreFocus) {
      options.onClose?.();
      options.focusTerminal?.();
    }
  };

  const open = async (destination?: SettingsDestination) => {
    if (disposed) return;
    if (dialog) {
      if (destination && interactive()) navigateView?.(destination);
      return;
    }
    const current = document.createElement("section");
    dialog = current;
    current.className = "settings-dialog";
    current.setAttribute("aria-labelledby", "settings-title");
    // Remember focus while Settings owns it, before pointer focus or ancestor
    // inertness moves it away. Clipboard invalidation remains independent.
    current.addEventListener("focusin", (event) => {
      if (interactive() && event.target instanceof HTMLElement)
        lastFocus = event.target;
    });
    const live = () => dialog === current;
    const done = createPageButton(document);
    const view = buildSettingsView(
      document,
      bridge,
      live,
      language,
      done,
      interactive,
    );
    unbindView = view.dispose;
    navigateView = view.navigate;
    if (destination) view.navigate(destination);
    releaseView = view.release;
    done.type = "button";
    done.classList.add("settings-close");
    done.addEventListener("click", () => {
      if (live()) close(true);
    });
    current.addEventListener("keydown", (event) => {
      // Escape belongs to capture, not to ordinary application-tab closure.
      if (event.key === "Enter") keyboard.track(event, done);
      event.stopPropagation();
    });
    current.append(view.element);
    (options.container ?? document.body).append(current);
    current.hidden = !selected;
    current.inert = blocked || !selected;
    options.onActivityChange?.(interactive());
    if (interactive()) done.focus();
    await view.load();
  };

  return {
    isActive: interactive,
    open,
    navigate(destination: SettingsDestination) {
      if (interactive()) navigateView?.(destination);
    },
    setSelected(value: boolean) {
      if (selected === value) return;
      selected = value;
      invalidate();
      if (!value) releaseView?.();
      if (dialog) {
        dialog.hidden = !value;
        dialog.inert = blocked || !value;
      }
    },
    setBlocked(value: boolean) {
      if (blocked === value) return;
      blocked = value;
      invalidate();
      if (value) releaseView?.();
      if (dialog) dialog.inert = blocked || !selected;
    },
    focus() {
      if (!interactive() || dialog?.contains(document.activeElement)) return;
      const target =
        lastFocus?.isConnected && !lastFocus.closest("[hidden]")
          ? lastFocus
          : (dialog?.querySelector<HTMLElement>(
              '.settings-tabs [aria-selected="true"]',
            ) ?? dialog?.querySelector<HTMLElement>(".settings-close"));
      target?.focus({ preventScroll: true });
    },
    // App Copy/Paste/Select All edit the focused text field and never reach
    // the terminal while Settings owns input.
    editClipboard(
      action: TerminalClipboardAction,
      clipboard: Pick<TerminalClipboard, "readText" | "writeText"> | undefined,
    ) {
      if (!interactive()) return;
      const generation = interaction;
      const field = dialog?.contains(document.activeElement)
        ? document.activeElement
        : undefined;
      if (
        !(field instanceof HTMLInputElement) &&
        !(field instanceof HTMLTextAreaElement)
      )
        return;
      void editField(
        field,
        action,
        clipboard,
        () => interactive() && generation === interaction,
      );
    },
    dispose() {
      disposed = true;
      invalidate();
      document.defaultView?.removeEventListener("blur", onBlur);
      document.removeEventListener("focusout", onFocusOut);
      if (!options.keyboard) keyboard.dispose();
      close(false);
    },
  };
}

async function editField(
  field: HTMLInputElement | HTMLTextAreaElement,
  action: TerminalClipboardAction,
  clipboard: Pick<TerminalClipboard, "readText" | "writeText"> | undefined,
  interactive: () => boolean,
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
  const previous = field.value;
  const text = await clipboard?.readText().catch(() => "");
  if (
    !text ||
    !interactive() ||
    !field.isConnected ||
    field.ownerDocument.activeElement !== field ||
    field.value !== previous ||
    field.selectionStart !== start ||
    field.selectionEnd !== end
  )
    return;
  if (start === null || end === null) field.value = text;
  else field.setRangeText(text, start, end, "end");
  field.dispatchEvent(new Event("input", { bubbles: true }));
  // Programmatic application Paste does not produce a native change event.
  // Graphical controls commit deliberately here; raw JSON remains explicit Save.
  if (field instanceof HTMLInputElement)
    field.dispatchEvent(new Event("change", { bubbles: true }));
}

function renderSettingsProblem(
  problem: HTMLElement,
  issue: SettingsSnapshot["problem"],
  t: Translate,
) {
  const detail = issue === undefined ? "" : settingsMessageText(issue, t);
  const external = typeof issue !== "string" && issue?.kind === "symlink";
  setPageNotice(problem, {
    text:
      issue === undefined
        ? ""
        : external
          ? detail
          : `${detail}\n${t("settings.fileGuidance")}`,
    severity: "error",
  });
}

function buildSettingsView(
  document: Document,
  bridge: SettingsBridge,
  live: () => boolean,
  language: RendererLanguage,
  done: HTMLButtonElement,
  interactive: () => boolean,
) {
  let snapshot: SettingsSnapshot | undefined;
  const syncs: (() => void)[] = [];
  const labels: ((t: Translate) => void)[] = [];
  let pending = 0;
  let statusMessage:
    | { key: MessageKey; error: boolean }
    | { result: SettingsResult }
    | undefined;
  const title = document.createElement("h2");
  title.id = "settings-title";
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

  const renderStatus = (t: Translate) => {
    const message = !statusMessage
      ? { text: "", error: false }
      : "result" in statusMessage
        ? describeSettingsResult(statusMessage.result, t)
        : { text: t(statusMessage.key), error: statusMessage.error };
    setPageNotice(status, {
      text:
        pending > 0
          ? t("settings.saving") + (message.error ? ` ${message.text}` : "")
          : message.text,
      severity: message.error
        ? "error"
        : pending > 0
          ? "info"
          : statusMessage && "result" in statusMessage
            ? describeSettingsResult(statusMessage.result, t).severity
            : "info",
    });
  };
  const renderProblem = (t: Translate) =>
    renderSettingsProblem(problem, snapshot?.problem, t);
  const report = (key?: MessageKey, error = false) => {
    statusMessage = key ? { key, error } : undefined;
    renderStatus(language.t);
  };
  const adopt = (next: SettingsSnapshot) => {
    snapshot = next;
    renderProblem(language.t);
    for (const sync of syncs) sync();
  };
  const change = (path: SettingsPath, value: unknown, settled: () => void) => {
    pending += 1;
    report();
    // Main already serializes saves and reads. Submit deliberate changes now,
    // so a reopened view's snapshot cannot overtake work held by a removed view.
    void bridge.change({ path, value }).then(
      (result) => {
        if (!live()) return;
        settled();
        adopt(result.snapshot);
        pending -= 1;
        statusMessage = { result };
        renderStatus(language.t);
      },
      () => {
        if (!live()) return;
        settled();
        pending -= 1;
        report("settings.requestError", true);
        for (const sync of syncs) sync();
      },
    );
  };
  // A shortcut change reports like any other graphical change.
  const changeKeybind = (next: SettingsKeybindChange) => {
    pending += 1;
    report();
    void bridge.changeKeybind(next).then(
      (result) => {
        if (!live()) return;
        adopt(result.snapshot);
        pending -= 1;
        statusMessage = { result };
        renderStatus(language.t);
      },
      () => {
        if (!live()) return;
        pending -= 1;
        report("settings.requestError", true);
        for (const sync of syncs) sync();
      },
    );
  };
  const value = (path: SettingsPath) => snapshot?.values[path];

  const tabButtons: HTMLButtonElement[] = [];
  let showSnippetsNotice: (() => void) | undefined;
  const navigation = extensionsNavigation(
    tabButtons,
    (index) => {
      showSnippetsNotice?.();
      select(index);
    },
    interactive,
  );
  const select = (index: number) => {
    if (shortcuts && panels.children[index] !== shortcuts.element)
      shortcuts.release();
    tabButtons.forEach((button, position) => {
      const selected = position === index;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      panels.children[position]!.toggleAttribute("hidden", !selected);
    });
  };
  const addPage = (id: string, label: MessageKey, panel: HTMLElement) => {
    const index = tabButtons.length;
    const button = createPageButton(document, "text");
    button.type = "button";
    button.id = `settings-tab-${id}`;
    labels.push((t) => {
      button.textContent = t(label);
    });
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

  const disposers: (() => void)[] = [];
  let shortcuts: ReturnType<typeof renderShortcuts> | undefined;
  // Pages depend on the main-reported platform, so they are built with the
  // first snapshot; until then the retained editor shows a loading status.
  const build = (platform: string) => {
    for (const page of pages(platform)) {
      const panel = document.createElement("div");
      panel.className = "settings-panel";
      for (const control of page.controls)
        panel.append(
          renderControl(document, control, value, change, syncs, labels),
        );
      addPage(page.id, page.label, panel);
    }
    shortcuts = renderShortcuts(document, {
      snapshot: () => snapshot,
      platform,
      live,
      interactive,
      report,
      changeKeybind,
      captureShortcut: (listener) => bridge.captureShortcut(listener),
      syncs,
      labels,
    });
    addPage("shortcuts", "settings.page.shortcuts", shortcuts.element);
    const extensions = document.defaultView?.omxterm?.extensions;
    if (extensions) {
      const page = extensionsPage(
        document,
        extensions,
        live,
        labels,
        disposers,
      );
      showSnippetsNotice = page.showSnippetsNotice;
      addPage("extensions", "settings.page.extensions", page.element);
    }
    addPage(
      "config-file",
      "settings.page.file",
      renderConfigFile(document, bridge, {
        snapshot: () => snapshot,
        live,
        adopt,
        syncs,
        labels,
        language,
      }),
    );
    select(0);
    navigation.restore();
  };
  const element = createApplicationPage(document, {
    title,
    actions: done,
    notice: problem,
    navigation: tabs,
    content: panels,
    status,
  });
  element.classList.add("settings-body");
  report("settings.loading");
  const relabel = (t: Translate) => {
    title.textContent = t("settings.title");
    done.textContent = t("common.close");
    for (const label of labels) label(t);
    renderProblem(t);
    renderStatus(t);
  };
  const unbind = language.bind(relabel);

  return {
    element,
    navigate: navigation.navigate,
    dispose() {
      unbind();
      for (const dispose of disposers) dispose();
    },
    release: () => shortcuts?.release(),
    async load() {
      try {
        const loaded = await bridge.snapshot();
        if (!live()) return;
        build(loaded.platform);
        relabel(language.t);
        adopt(loaded);
        report();
        if (interactive() && document.activeElement === done)
          tabButtons
            .find((button) => button.getAttribute("aria-selected") === "true")
            ?.focus();
      } catch {
        if (live()) report("settings.loadError", true);
      }
    },
  };
}
