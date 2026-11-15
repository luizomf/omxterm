import type { SettingsBridge, SettingsPath } from "../../shared/settings";
import {
  SETTINGS_THEME_COLOR_KEYS,
  type SettingsTheme,
  type SettingsThemesResult,
} from "../../shared/settings-themes";
import { DEFAULT_TERMINAL_THEME } from "../../shared/terminal-theme";
import { setIcon } from "../../shared/ui-icons";
import { englishLanguage, type Translate } from "../renderer-language";
import { createSettingsThemeEditor } from "./settings-theme-editor";

const problemLabels = {
  size: "settings.themeErrorSize",
  type: "settings.themeErrorType",
  changed: "settings.themeErrorChanged",
  read: "settings.themeErrorRead",
  invalid: "settings.themeErrorInvalid",
  unknown: "settings.themeErrorUnknown",
} as const;

// The terminal-like palette cards adapt the scheme presentation in
// ruscher/omxterm PR #622 (MIT), with local files instead of a built-in catalog.
export function renderSettingsThemes(
  document: Document,
  bridge: SettingsBridge,
  options: {
    readonly live: () => boolean;
    readonly value: (path: SettingsPath) => unknown;
    readonly change: (
      path: SettingsPath,
      value: unknown,
      settled: () => void,
    ) => void;
    readonly syncs: (() => void)[];
    readonly labels: ((t: Translate) => void)[];
  },
): HTMLElement {
  let t = englishLanguage.t;
  let result: SettingsThemesResult | undefined;
  let loading = false;
  let generation = 0;
  let rescan = false;
  let selectionFresh = false;
  let pendingChoice: string | undefined;
  let selectionGeneration = 0;
  let lastValue: unknown = Symbol("initial");
  let rendered = "";
  const section = document.createElement("section");
  section.className = "settings-themes";
  // The list and the editor share one place: opening a theme swaps them.
  const list = document.createElement("div");
  list.className = "settings-themes-list";
  const header = document.createElement("div");
  header.className = "settings-themes-header";
  const heading = document.createElement("h3");
  heading.id = "settings-themes-title";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "ui-icon-button";
  setIcon(refresh, "refresh-cw");
  const grid = document.createElement("div");
  grid.className = "settings-themes-grid";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-labelledby", heading.id);
  const message = document.createElement("p");
  message.className = "ui-hint settings-hint settings-themes-message";
  message.setAttribute("role", "status");
  const invalid = document.createElement("div");
  invalid.className = "settings-themes-invalid";
  const invalidList = document.createElement("ul");
  invalid.append(invalidList);
  header.append(heading, refresh);
  list.append(header, grid, message, invalid);
  section.append(list);
  const editControl = (path: string) =>
    [...grid.querySelectorAll<HTMLInputElement>("input")]
      .find((input) => input.value === path)
      ?.closest(".settings-theme-entry")
      ?.querySelector<HTMLButtonElement>("button") ?? undefined;
  const editor = bridge.themeDocuments
    ? createSettingsThemeEditor(document, bridge.themeDocuments, {
        live: options.live,
        labels: options.labels,
        saved: () => scan(),
        busyChanged: (busy) => {
          for (const button of grid.querySelectorAll("button"))
            button.disabled = busy;
        },
        opened: (open) => {
          list.hidden = open;
          section.classList.toggle("is-editing", open);
          // The editor is shorter than a long list: start at its top.
          if (open) section.scrollIntoView?.({ block: "start" });
        },
        editControl,
        use: (path, settled) => options.change("theme.path", path, settled),
      })
    : undefined;
  if (editor) {
    header.append(editor.toolbar);
    section.append(editor.element);
  }

  const defaultTheme: SettingsTheme = {
    path: "",
    name: DEFAULT_TERMINAL_THEME.name,
    colors: DEFAULT_TERMINAL_THEME.colors,
  };
  const updateSelection = () => {
    const selected =
      pendingChoice ?? (selectionFresh ? result?.selectedPath : undefined);
    const useDefault =
      pendingChoice === "" ||
      (pendingChoice === undefined &&
        selectionFresh &&
        result?.hasConfiguredTheme === false);
    // A file that is the built-in theme (the copy first run writes) stands
    // for it: one card, unless the built-in itself is what is in use.
    const twin = (result?.themes ?? []).some((theme) =>
      sameLook(theme, defaultTheme),
    );
    for (const input of grid.querySelectorAll<HTMLInputElement>("input")) {
      input.checked =
        input.value === "" ? useDefault : input.value === selected;
      const pending =
        pendingChoice !== undefined && input.value === pendingChoice;
      const card = input.parentElement!;
      // The border is the selection; a choice still being saved is quieter
      // and says so to assistive technology.
      if (pending) card.setAttribute("aria-busy", "true");
      else card.removeAttribute("aria-busy");
      card.querySelector(".settings-theme-pending")!.textContent = pending
        ? t("settings.themePending")
        : "";
      if (input.value === "")
        card.closest<HTMLElement>(".settings-theme-entry")!.hidden =
          twin && !useDefault;
    }
    showSharedNames(grid);
  };

  const choose = (path: string) => {
    if (!options.live()) return;
    const request = ++selectionGeneration;
    pendingChoice = path;
    updateSelection();
    options.change("theme.path", path || null, () => {
      if (request === selectionGeneration) pendingChoice = undefined;
    });
  };

  const renderNotice = () => {
    const notices: string[] = [];
    if (loading) notices.push(t("settings.themeLoading"));
    else if (result?.status === "missing")
      notices.push(t("settings.themeMissing"));
    else if (result?.status === "unavailable")
      notices.push(t("settings.themeUnavailable"));
    else if (
      result?.status === "ok" &&
      !result.themes.length &&
      !result.invalid.length &&
      !result.truncated
    )
      notices.push(t("settings.themeEmpty"));
    if (result?.invalid.length) notices.push(t("settings.themeInvalid"));
    if (result?.truncated) notices.push(t("settings.themeTruncated"));
    if (result?.hasConfiguredTheme && !result.selectedPath)
      notices.push(t("settings.themeCustom"));
    message.textContent = notices.join(" ");
    invalid.hidden = !result?.invalid.length;
    invalidList.replaceChildren(
      ...(result?.invalid ?? []).map((entry) => {
        const item = document.createElement("li");
        item.textContent = `${cleanPath(entry.path)}: ${t(problemLabels[entry.reason])}${entry.detail ? ` ${entry.detail}` : ""}`;
        return item;
      }),
    );
  };

  const render = () => {
    heading.textContent = t("settings.themePicker");
    refresh.title = t("settings.themeRefresh");
    refresh.setAttribute("aria-label", refresh.title);
    const themes = result?.themes ?? [];
    const next = JSON.stringify(themes);
    if (rendered !== next) {
      const focused = focusedThemeControl(grid);
      grid.replaceChildren(
        ...[defaultTheme, ...themes].map((theme) =>
          createThemeCard(document, theme, choose, editor),
        ),
      );
      rendered = next;
      if (focused !== undefined && document.activeElement === document.body) {
        const radio = [
          ...grid.querySelectorAll<HTMLInputElement>("input"),
        ].find((input) => input.value === focused.path);
        const control =
          focused.kind === "edit"
            ? radio
                ?.closest(".settings-theme-entry")
                ?.querySelector<HTMLButtonElement>("button")
            : radio;
        control?.focus({ preventScroll: true });
      }
    }
    labelCards(grid, [defaultTheme, ...themes], t, editor?.busy() ?? false);
    updateSelection();
    renderNotice();
  };

  const launchScan = () => {
    const request = generation;
    loading = true;
    render();
    void bridge
      .themes()
      .then(
        (next) => {
          if (!options.live() || request !== generation) return;
          result = next;
          selectionFresh = true;
        },
        () => {
          if (!options.live() || request !== generation) return;
          result = {
            status: "unavailable",
            themes: [],
            invalid: [],
            truncated: false,
          };
          selectionFresh = true;
        },
      )
      .finally(() => {
        if (!options.live()) return;
        if (rescan) {
          rescan = false;
          launchScan();
        } else {
          loading = false;
          render();
        }
      });
  };
  const scan = () => {
    generation += 1;
    if (loading) rescan = true;
    else launchScan();
  };
  refresh.addEventListener("click", scan);
  options.syncs.push(() => {
    const current = options.value("theme.path");
    if (current !== lastValue) {
      lastValue = current;
      selectionFresh = false;
      scan();
    } else updateSelection();
  });
  options.labels.push((translate) => {
    t = translate;
    render();
  });
  return section;
}

// Edit buttons have no theme value of their own. Preserve the entry identity
// and action kind rather than treating every focused control as a radio.
function focusedThemeControl(grid: HTMLElement) {
  const active = grid.ownerDocument.activeElement;
  if (!active || !grid.contains(active)) return undefined;
  const kind = active.matches("button") ? "edit" : "radio";
  const radio =
    kind === "edit"
      ? active
          .closest(".settings-theme-entry")
          ?.querySelector<HTMLInputElement>("input")
      : active.matches('input[type="radio"]')
        ? (active as HTMLInputElement)
        : undefined;
  return radio ? { path: radio.value, kind } : undefined;
}

function cleanPath(path: string): string {
  return path.replace(/[\\\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu, (char) =>
    char === "\\" ? "\\\\" : `\\u{${char.codePointAt(0)!.toString(16)}}`,
  );
}

// Names tell themes apart; the file only shows when two cards on screen
// share a name.
function showSharedNames(grid: HTMLElement) {
  const names = [
    ...grid.querySelectorAll<HTMLElement>(
      ".settings-theme-entry:not([hidden]) .settings-theme-name",
    ),
  ];
  for (const name of names)
    name.parentElement!.querySelector<HTMLElement>(
      ".settings-theme-path",
    )!.hidden =
      names.filter((other) => other.textContent === name.textContent).length <
      2;
}

function labelCards(
  grid: HTMLElement,
  themes: readonly SettingsTheme[],
  t: Translate,
  busy: boolean,
) {
  grid
    .querySelectorAll<HTMLElement>(".settings-theme-entry")
    .forEach((entry, index) => {
      const theme = themes[index]!;
      const detail = theme.path
        ? cleanPath(theme.path)
        : t("settings.themeDefaultDetail");
      entry.querySelector(".settings-theme-path")!.textContent = detail;
      entry.querySelector<HTMLElement>(".settings-theme-card")!.title = detail;
      const edit = entry.querySelector("button");
      if (!edit) return;
      edit.disabled = busy;
      edit.title = t("settings.author.edit", { name: theme.name });
      edit.setAttribute(
        "aria-label",
        t("settings.author.edit", { name: `${theme.name} (${detail})` }),
      );
    });
}

// The picker only has the eight summary colors, so "the same theme" means
// the same name and the same card.
function sameLook(a: SettingsTheme, b: SettingsTheme): boolean {
  return (
    a.name === b.name &&
    SETTINGS_THEME_COLOR_KEYS.every((key) => a.colors[key] === b.colors[key])
  );
}

function createThemeCard(
  document: Document,
  theme: SettingsTheme,
  choose: (path: string) => void,
  editor?: ReturnType<typeof createSettingsThemeEditor>,
): HTMLElement {
  const entry = document.createElement("div");
  entry.className = "settings-theme-entry ui-choice";
  const label = document.createElement("label");
  label.className = "settings-theme-card ui-choice-card";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "settings-theme";
  input.value = theme.path;
  input.addEventListener("focus", () => {
    // The visually hidden radio is smaller than its card; native focus
    // scrolling alone can leave the choice and focus ring clipped.
    label.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  });
  input.addEventListener("change", () => {
    if (input.checked) choose(theme.path);
  });
  const content = document.createElement("span");
  content.className = "settings-theme-content ui-choice-body";
  const preview = document.createElement("span");
  preview.className = "settings-theme-preview";
  preview.setAttribute("aria-hidden", "true");
  preview.style.backgroundColor = theme.colors.background;
  preview.style.color = theme.colors.foreground;
  const sample = document.createElement("span");
  sample.textContent = "~ $ ls";
  const dots = document.createElement("span");
  dots.className = "settings-theme-dots";
  for (const color of [
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
  ] as const) {
    const dot = document.createElement("span");
    dot.style.backgroundColor = theme.colors[color];
    dots.append(dot);
  }
  preview.append(sample, dots);
  const name = document.createElement("span");
  name.className = "settings-theme-name";
  name.textContent = theme.name;
  const pending = document.createElement("span");
  pending.className = "settings-theme-pending ui-visually-hidden";
  const path = document.createElement("span");
  path.className = "settings-theme-path ui-meta";
  path.hidden = true;
  content.append(preview, name, pending, path);
  label.append(input, content);
  entry.append(label);
  if (!editor) return entry;
  // A sibling of the label, drawn over the card's corner: a button inside a
  // label would also pick the theme.
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "ui-icon-button ui-choice-action ui-reveal";
  setIcon(edit, "pencil");
  edit.addEventListener("click", () =>
    theme.path ? editor.edit(theme.path, edit) : editor.editBundled(edit),
  );
  entry.append(edit);
  return entry;
}
