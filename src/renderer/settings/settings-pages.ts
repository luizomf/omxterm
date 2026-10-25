import { SETTINGS_FIELDS, type SettingsPath } from "../../shared/settings";
import type { MessageKey } from "../../shared/i18n";
import { englishLanguage, type Translate } from "../renderer-language";

type Caption = { readonly path: SettingsPath; readonly label: MessageKey };
export type Control = Caption &
  (
    | { readonly kind: "toggle" }
    | {
        readonly kind: "choice";
        readonly options: readonly (readonly [string, MessageKey])[];
      }
    | {
        readonly kind: "number";
        readonly min: number;
        readonly max: number;
        readonly step?: number;
      }
    | { readonly kind: "text"; readonly placeholder: MessageKey }
  );
export interface Page {
  readonly id: string;
  readonly label: MessageKey;
  readonly controls: readonly Control[];
}

export function pages(platform: string): readonly Page[] {
  return [
    {
      id: "general",
      label: "settings.page.general",
      controls: [
        {
          kind: "choice",
          path: "language",
          label: "settings.language",
          options: [
            ["en-US", "settings.english"],
            ["pt-BR", "settings.portuguese"],
          ],
        },
        {
          kind: "toggle",
          path: "confirmClose",
          label: "settings.confirmClose",
        },
        {
          kind: "choice",
          path: "logLevel",
          label: "settings.logLevel",
          options: [
            ["error", "settings.errors"],
            ["info", "settings.info"],
            ["debug", "settings.debug"],
          ],
        },
        ...(platform === "win32"
          ? [
              {
                kind: "text",
                path: "windowsShell",
                label: "settings.shell",
                placeholder: "settings.defaultShell",
              } as const,
            ]
          : []),
      ],
    },
    {
      id: "appearance",
      label: "settings.page.appearance",
      controls: [
        {
          kind: "text",
          path: "font.family",
          label: "settings.fontFamily",
          placeholder: "settings.bundledFont",
        },
        {
          kind: "number",
          path: "font.size",
          label: "settings.fontSize",
          min: 8,
          max: 72,
        },
        {
          kind: "number",
          path: "font.lineHeight",
          label: "settings.lineHeight",
          min: 1,
          max: 2,
          step: 0.05,
        },
        { kind: "toggle", path: "font.ligatures", label: "settings.ligatures" },
        {
          kind: "text",
          path: "theme.path",
          label: "settings.theme",
          placeholder: "settings.bundledTheme",
        },
      ],
    },
    {
      id: "terminal",
      label: "settings.page.terminal",
      controls: [
        {
          kind: "number",
          path: "scrollback.lines",
          label: "settings.scrollback",
          min: 0,
          max: 100_000,
          step: 1_000,
        },
        ...(["top", "right", "bottom", "left"] as const).map(
          (side) =>
            ({
              kind: "number",
              path: `terminal.padding.${side}`,
              label: `settings.padding.${side}`,
              min: 0,
              max: 128,
            }) as const,
        ),
        ...(platform === "darwin"
          ? [
              {
                kind: "choice",
                path: "keyboard.optionAsAlt",
                label: "settings.optionAlt",
                options: [
                  ["none", "settings.option.none"],
                  ["left", "settings.option.left"],
                  ["right", "settings.option.right"],
                  ["both", "settings.option.both"],
                ],
              } as const,
            ]
          : []),
      ],
    },
    {
      id: "window",
      label: "settings.page.window",
      controls: [
        {
          kind: "toggle",
          path: "window.showTitleBar",
          label: "settings.titleBar",
        },
        { kind: "toggle", path: "window.showTabBar", label: "settings.tabBar" },
        {
          kind: "toggle",
          path: "window.alwaysOnTop",
          label: "settings.alwaysOnTop",
        },
      ],
    },
  ];
}

export function renderControl(
  document: Document,
  control: Control,
  value: (path: SettingsPath) => unknown,
  change: (path: SettingsPath, value: unknown, settled: () => void) => void,
  syncs: (() => void)[],
  labels: ((t: Translate) => void)[],
): HTMLElement {
  const row = document.createElement("label");
  row.className = `settings-row settings-${control.kind}`;
  const caption = document.createElement("span");
  let t = englishLanguage.t;
  labels.push((translate) => {
    t = translate;
    caption.textContent = t(control.label);
  });
  let input: HTMLInputElement | HTMLSelectElement;
  let generation = 0;
  let dirty = false;
  const edited = () => {
    generation += 1;
    dirty = true;
  };
  const commit = (next: unknown) => {
    edited();
    const submitted = generation;
    change(control.path, next, () => {
      if (generation === submitted) dirty = false;
    });
  };
  if (control.kind === "choice") {
    const select = document.createElement("select");
    for (const [optionValue, label] of control.options) {
      const option = document.createElement("option");
      option.value = optionValue;
      labels.push((t) => {
        option.textContent = t(label);
      });
      select.append(option);
    }
    select.addEventListener("change", () => commit(select.value));
    syncs.push(() => {
      if (!dirty) select.value = String(value(control.path) ?? "");
    });
    input = select;
  } else {
    const field = document.createElement("input");
    if (control.kind === "toggle") {
      field.type = "checkbox";
      field.addEventListener("change", () => commit(field.checked));
      syncs.push(() => {
        if (!dirty) field.checked = value(control.path) === true;
      });
    } else {
      field.type = control.kind === "number" ? "number" : "text";
      field.spellcheck = false;
      if (control.kind === "number") {
        field.min = String(control.min);
        field.max = String(control.max);
        field.step = String(control.step ?? 1);
      } else
        labels.push((t) => {
          field.placeholder = t(control.placeholder);
        });
      field.addEventListener("input", edited);
      const sync = () => {
        if (dirty) return;
        const current = value(control.path);
        field.value = current === undefined ? "" : String(current);
      };
      field.addEventListener("change", () => {
        const text = field.value.trim();
        const next =
          text === "" ? null : control.kind === "number" ? Number(text) : text;
        if (next !== null && !SETTINGS_FIELDS[control.path].accepts(next)) {
          dirty = false;
          generation += 1;
          sync();
          field.setCustomValidity(t("settings.range"));
          field.reportValidity();
          field.setCustomValidity("");
          return;
        }
        commit(next);
      });
      syncs.push(sync);
    }
    input = field;
  }
  if (control.kind === "toggle") row.append(input, caption);
  else row.append(caption, input);
  return row;
}
