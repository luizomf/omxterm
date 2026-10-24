import { SETTINGS_FIELDS, type SettingsPath } from "../../shared/settings";

export type Control =
  | {
      readonly kind: "toggle";
      readonly path: SettingsPath;
      readonly label: string;
    }
  | {
      readonly kind: "choice";
      readonly path: SettingsPath;
      readonly label: string;
      readonly options: readonly (readonly [string, string])[];
    }
  | {
      readonly kind: "number";
      readonly path: SettingsPath;
      readonly label: string;
      readonly min: number;
      readonly max: number;
      readonly step?: number;
    }
  | {
      readonly kind: "text";
      readonly path: SettingsPath;
      readonly label: string;
      // Shown when empty: the field then inherits this default.
      readonly placeholder: string;
    };

export interface Page {
  readonly id: string;
  readonly label: string;
  readonly controls: readonly Control[];
}

export function pages(platform: string): readonly Page[] {
  return [
    {
      id: "general",
      label: "General",
      controls: [
        {
          kind: "toggle",
          path: "confirmClose",
          label: "Confirm before closing busy sessions",
        },
        {
          kind: "choice",
          path: "logLevel",
          label: "Log level",
          options: [
            ["error", "Errors only"],
            ["info", "Information"],
            ["debug", "Debug"],
          ],
        },
        ...(platform === "win32"
          ? [
              {
                kind: "text",
                path: "windowsShell",
                label: "Shell executable",
                placeholder: "Windows PowerShell",
              } as const,
            ]
          : []),
      ],
    },
    {
      id: "appearance",
      label: "Appearance",
      controls: [
        {
          kind: "text",
          path: "font.family",
          label: "Font family",
          placeholder: "Bundled FiraCode Nerd Font Mono",
        },
        {
          kind: "number",
          path: "font.size",
          label: "Font size",
          min: 8,
          max: 72,
        },
        {
          kind: "number",
          path: "font.lineHeight",
          label: "Line height",
          min: 1,
          max: 2,
          step: 0.05,
        },
        {
          kind: "toggle",
          path: "font.ligatures",
          label: "Programming ligatures",
        },
        {
          kind: "text",
          path: "theme.path",
          label: "Theme file",
          placeholder: "Bundled omtheme",
        },
      ],
    },
    {
      id: "terminal",
      label: "Terminal",
      controls: [
        {
          kind: "number",
          path: "scrollback.lines",
          label: "Scrollback lines",
          min: 0,
          max: 100_000,
          step: 1_000,
        },
        ...(["top", "right", "bottom", "left"] as const).map(
          (side) =>
            ({
              kind: "number",
              path: `terminal.padding.${side}`,
              label: `Padding ${side}`,
              min: 0,
              max: 128,
            }) as const,
        ),
        ...(platform === "darwin"
          ? [
              {
                kind: "choice",
                path: "keyboard.optionAsAlt",
                label: "Option key acts as Alt",
                options: [
                  ["none", "Neither"],
                  ["left", "Left Option"],
                  ["right", "Right Option"],
                  ["both", "Both"],
                ],
              } as const,
            ]
          : []),
      ],
    },
    {
      id: "window",
      label: "New Windows",
      controls: [
        {
          kind: "toggle",
          path: "window.showTitleBar",
          label: "Show title bar",
        },
        { kind: "toggle", path: "window.showTabBar", label: "Show tab bar" },
        { kind: "toggle", path: "window.alwaysOnTop", label: "Always on top" },
      ],
    },
  ];
}

export function renderControl(
  document: Document,
  control: Control,
  value: (path: SettingsPath) => unknown,
  change: (path: SettingsPath, value: unknown) => void,
  syncs: (() => void)[],
): HTMLElement {
  const row = document.createElement("label");
  row.className = `settings-row settings-${control.kind}`;
  const caption = document.createElement("span");
  caption.textContent = control.label;
  let input: HTMLInputElement | HTMLSelectElement;
  if (control.kind === "choice") {
    const select = document.createElement("select");
    for (const [optionValue, label] of control.options) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = label;
      select.append(option);
    }
    select.addEventListener("change", () => change(control.path, select.value));
    syncs.push(() => {
      select.value = String(value(control.path) ?? "");
    });
    input = select;
  } else {
    const field = document.createElement("input");
    if (control.kind === "toggle") {
      field.type = "checkbox";
      field.addEventListener("change", () =>
        change(control.path, field.checked),
      );
      syncs.push(() => {
        field.checked = value(control.path) === true;
      });
    } else {
      field.type = control.kind === "number" ? "number" : "text";
      field.spellcheck = false;
      if (control.kind === "number") {
        field.min = String(control.min);
        field.max = String(control.max);
        field.step = String(control.step ?? 1);
      } else field.placeholder = control.placeholder;
      const sync = () => {
        const current = value(control.path);
        field.value = current === undefined ? "" : String(current);
      };
      field.addEventListener("change", () => {
        const text = field.value.trim();
        const next =
          text === "" ? null : control.kind === "number" ? Number(text) : text;
        if (next !== null && !SETTINGS_FIELDS[control.path].accepts(next)) {
          sync();
          field.setCustomValidity("Out of range");
          field.reportValidity();
          field.setCustomValidity("");
          return;
        }
        change(control.path, next);
      });
      syncs.push(sync);
    }
    input = field;
  }
  if (control.kind === "toggle") row.append(input, caption);
  else row.append(caption, input);
  return row;
}
