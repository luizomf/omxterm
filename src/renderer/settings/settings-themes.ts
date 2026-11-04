import type { SettingsBridge, SettingsPath } from "../../shared/settings";
import type {
  SettingsTheme,
  SettingsThemesResult,
} from "../../shared/settings-themes";
import { DEFAULT_TERMINAL_THEME } from "../../shared/terminal-theme";
import { englishLanguage, type Translate } from "../renderer-language";
import { createPageButton } from "../application-page";

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
  const header = document.createElement("div");
  header.className = "settings-themes-header";
  const heading = document.createElement("h3");
  heading.id = "settings-themes-title";
  const refresh = createPageButton(document);
  const hint = document.createElement("p");
  hint.className = "settings-hint";
  const grid = document.createElement("div");
  grid.className = "settings-themes-grid";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-labelledby", heading.id);
  const message = document.createElement("p");
  message.className = "settings-hint settings-themes-message";
  message.setAttribute("role", "status");
  const invalid = document.createElement("div");
  invalid.className = "settings-themes-invalid";
  const invalidList = document.createElement("ul");
  invalid.append(invalidList);
  header.append(heading, refresh);
  section.append(header, hint, grid, message, invalid);

  const defaultTheme: SettingsTheme = {
    path: "",
    name: DEFAULT_TERMINAL_THEME.name,
    colors: DEFAULT_TERMINAL_THEME.colors,
  };
  const cleanPath = (path: string) =>
    path.replace(/[\\\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu, (char) =>
      char === "\\" ? "\\\\" : `\\u{${char.codePointAt(0)!.toString(16)}}`,
    );

  const updateSelection = () => {
    const selected =
      pendingChoice ?? (selectionFresh ? result?.selectedPath : undefined);
    const useDefault =
      pendingChoice === "" ||
      (pendingChoice === undefined &&
        selectionFresh &&
        result?.hasConfiguredTheme === false);
    for (const input of grid.querySelectorAll<HTMLInputElement>("input")) {
      input.checked =
        input.value === "" ? useDefault : input.value === selected;
      const badge = input.parentElement?.querySelector(
        ".settings-theme-selected",
      );
      if (badge)
        badge.textContent = t(
          pendingChoice !== undefined && input.value === pendingChoice
            ? "settings.themePending"
            : "settings.themeSelected",
        );
    }
  };

  const card = (theme: SettingsTheme): HTMLElement => {
    const label = document.createElement("label");
    label.className = "settings-theme-card";
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
      if (!input.checked || !options.live()) return;
      const request = ++selectionGeneration;
      pendingChoice = theme.path;
      updateSelection();
      options.change("theme.path", theme.path || null, () => {
        if (request === selectionGeneration) pendingChoice = undefined;
      });
    });
    const content = document.createElement("span");
    content.className = "settings-theme-content";
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
    const title = document.createElement("span");
    title.className = "settings-theme-title";
    const name = document.createElement("span");
    name.className = "settings-theme-name";
    name.textContent = theme.path ? theme.name : t("settings.bundledTheme");
    const selected = document.createElement("span");
    selected.className = "settings-theme-selected";
    selected.textContent = t("settings.themeSelected");
    title.append(name, selected);
    const path = document.createElement("span");
    path.className = "settings-theme-path";
    path.textContent = theme.path
      ? cleanPath(theme.path)
      : t("settings.themeDefaultDetail");
    content.append(preview, title, path);
    label.append(input, content);
    return label;
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
    refresh.textContent = t("settings.themeRefresh");
    hint.textContent = t("settings.themePickerHint");
    const themes = result?.themes ?? [];
    const next = JSON.stringify(themes);
    if (rendered !== next) {
      const focused = grid.contains(document.activeElement)
        ? (document.activeElement as HTMLInputElement).value
        : undefined;
      grid.replaceChildren(...[defaultTheme, ...themes].map(card));
      rendered = next;
      if (focused !== undefined && document.activeElement === document.body)
        [...grid.querySelectorAll<HTMLInputElement>("input")]
          .find((input) => input.value === focused)
          ?.focus({ preventScroll: true });
    }
    const defaultCard = grid.querySelector(".settings-theme-card");
    if (defaultCard) {
      defaultCard.querySelector(".settings-theme-name")!.textContent = t(
        "settings.bundledTheme",
      );
      defaultCard.querySelector(".settings-theme-path")!.textContent = t(
        "settings.themeDefaultDetail",
      );
    }
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
