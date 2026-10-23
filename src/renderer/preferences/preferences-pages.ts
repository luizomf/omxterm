import type { MessageKey, Translator } from "../../shared/i18n";
import {
  LOG_LEVELS,
  type CapturedKeyPress,
  OPTION_KEY_MODES,
  type PreferencesPatch,
  type PreferencesScheme,
  type PreferencesSnapshot,
  type PreferencesValues,
} from "../../shared/preferences";
import {
  TERMINAL_ACTION_NAMES,
  type TerminalActionName,
} from "../../shared/terminal-keybinds";
import {
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MAX_WINDOW_CORNER_RADIUS,
  MIN_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LINE_HEIGHT,
} from "../../shared/user-configuration";
import { checkbox, field, selectInput, textInput } from "../ui/form";
import {
  acceleratorFromKeyEvent,
  displayAccelerator,
} from "./shortcut-recorder";

export interface PreferencesContext {
  readonly document: Document;
  readonly t: Translator["t"];
  snapshot(): PreferencesSnapshot;
  save(patch: PreferencesPatch): void;
  // Runs with the saved values after every save, so controls show what is
  // actually in effect (a rejected change snaps back).
  onSync(sync: (values: PreferencesValues) => void): void;
  readonly openHighlightRules?: () => void;
  // Sends every key press to the listener until the returned stop runs.
  captureKeys(listener: (key: CapturedKeyPress) => void): () => void;
}

type BooleanKey = {
  [Key in keyof PreferencesValues]: PreferencesValues[Key] extends boolean
    ? Key
    : never;
}[keyof PreferencesValues];

// Enter commits a field instead of closing the dialog.
function commitOnEnter(input: HTMLInputElement): void {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    input.dispatchEvent(new Event("change"));
  });
}

function page(context: PreferencesContext, ...children: HTMLElement[]) {
  const element = context.document.createElement("div");
  element.className = "omx-form preferences-page";
  element.append(...children);
  return element;
}

function heading(context: PreferencesContext, key: MessageKey) {
  const element = context.document.createElement("h3");
  element.className = "preferences-heading";
  element.textContent = context.t(key);
  return element;
}

function toggle(
  context: PreferencesContext,
  key: BooleanKey,
  label: MessageKey,
): HTMLElement {
  const control = checkbox(
    context.document,
    context.t(label),
    context.snapshot().values[key],
  );
  control.input.addEventListener("change", () =>
    context.save({ [key]: control.input.checked }),
  );
  context.onSync((values) => {
    control.input.checked = values[key];
  });
  return control.element;
}

function numberField(
  context: PreferencesContext,
  label: MessageKey,
  read: (values: PreferencesValues) => number,
  patch: (value: number) => PreferencesPatch,
  range: { min: number; max: number; step: number },
  hint?: MessageKey,
): HTMLElement {
  const input = textInput(
    context.document,
    String(read(context.snapshot().values)),
    {
      type: "number",
    },
  );
  commitOnEnter(input);
  input.min = String(range.min);
  input.max = String(range.max);
  input.step = String(range.step);
  const wrapper = field(
    context.document,
    context.t(label),
    input,
    hint ? context.t(hint) : undefined,
  );
  input.addEventListener("change", () => {
    const value = Number(input.value);
    if (
      input.value === "" ||
      !Number.isFinite(value) ||
      value < range.min ||
      value > range.max
    ) {
      wrapper.setError(
        context.t("prefs.range", { min: range.min, max: range.max }),
      );
      return;
    }
    wrapper.setError(undefined);
    context.save(patch(range.step < 1 ? value : Math.round(value)));
  });
  context.onSync((values) => {
    input.value = String(read(values));
  });
  return wrapper.element;
}

function choice<Key extends "optionKeyMode" | "logLevel">(
  context: PreferencesContext,
  key: Key,
  label: MessageKey,
  options: ReadonlyArray<readonly [PreferencesValues[Key], MessageKey]>,
): HTMLElement {
  const select = selectInput(
    context.document,
    options.map(([value, text]) => [value, context.t(text)] as const),
    context.snapshot().values[key],
  );
  select.addEventListener("change", () =>
    context.save({ [key]: select.value } as PreferencesPatch),
  );
  context.onSync((values) => {
    select.value = values[key];
  });
  return field(context.document, context.t(label), select).element;
}

function schemeCard(
  context: PreferencesContext,
  scheme: PreferencesScheme,
): HTMLButtonElement {
  const { document } = context;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "preferences-scheme";
  card.setAttribute("role", "radio");
  card.dataset.scheme = scheme.id;
  const preview = document.createElement("span");
  preview.className = "preferences-scheme-preview";
  preview.style.background = scheme.background;
  preview.style.color = scheme.foreground;
  preview.textContent = "~$ ls";
  const dots = document.createElement("span");
  dots.className = "preferences-scheme-dots";
  for (const color of scheme.palette) {
    const dot = document.createElement("i");
    dot.style.background = color;
    dots.append(dot);
  }
  preview.append(dots);
  const name = document.createElement("span");
  name.className = "preferences-scheme-name";
  name.textContent = scheme.builtIn
    ? scheme.name
    : `${scheme.name} (${scheme.id.slice(5)})`;
  card.append(preview, name);
  card.addEventListener("click", () => context.save({ scheme: scheme.id }));
  return card;
}

export function appearancePage(context: PreferencesContext): HTMLElement {
  const { document } = context;
  const snapshot = context.snapshot();
  const schemes = document.createElement("div");
  schemes.className = "preferences-schemes";
  schemes.setAttribute("role", "radiogroup");
  schemes.setAttribute("aria-label", context.t("prefs.colorScheme"));
  const cards = snapshot.schemes.map((scheme) => schemeCard(context, scheme));
  schemes.append(...cards);
  context.onSync((values) => {
    for (const card of cards)
      card.setAttribute(
        "aria-checked",
        String(card.dataset.scheme === values.scheme),
      );
  });

  const family = textInput(document, snapshot.values.fontFamily, {
    placeholder: context.t("prefs.bundledFont"),
  });
  const list = document.createElement("datalist");
  list.id = "preferences-font-families";
  for (const name of snapshot.fontFamilies) {
    const option = document.createElement("option");
    option.value = name;
    list.append(option);
  }
  family.setAttribute("list", list.id);
  commitOnEnter(family);
  family.addEventListener("change", () =>
    context.save({ fontFamily: family.value.trim() }),
  );
  context.onSync((values) => {
    family.value = values.fontFamily;
  });
  const familyField = field(
    document,
    context.t("prefs.fontFamily"),
    family,
    context.t("prefs.fontFamilyHint"),
  );
  familyField.element.append(list);

  const transparency = document.createElement("input");
  transparency.type = "range";
  transparency.min = "0";
  transparency.max = "100";
  transparency.step = "5";
  const percent = document.createElement("output");
  const showTransparency = (value: number) => {
    transparency.value = String(Math.round(value * 100));
    percent.textContent = `${transparency.value}%`;
  };
  showTransparency(snapshot.values.transparency);
  transparency.addEventListener("input", () => {
    percent.textContent = `${transparency.value}%`;
  });
  transparency.addEventListener("change", () =>
    context.save({ transparency: Number(transparency.value) / 100 }),
  );
  context.onSync((values) => showTransparency(values.transparency));
  const transparencyRow = document.createElement("div");
  transparencyRow.className = "omx-inline";
  transparencyRow.append(transparency, percent);

  const padding = document.createElement("div");
  padding.className = "preferences-padding";
  for (const side of ["top", "right", "bottom", "left"] as const)
    padding.append(
      numberField(
        context,
        `prefs.padding.${side}`,
        (values) => values.padding[side],
        (value) => ({ padding: { [side]: value } }),
        { min: 0, max: MAX_TERMINAL_PADDING, step: 1 },
      ),
    );

  return page(
    context,
    heading(context, "prefs.colorScheme"),
    schemes,
    heading(context, "prefs.font"),
    familyField.element,
    numberField(
      context,
      "prefs.fontSize",
      (values) => values.fontSize,
      (value) => ({ fontSize: value }),
      { min: MIN_TERMINAL_FONT_SIZE, max: MAX_TERMINAL_FONT_SIZE, step: 1 },
    ),
    numberField(
      context,
      "prefs.lineHeight",
      (values) => values.fontLineHeight,
      (value) => ({ fontLineHeight: value }),
      {
        min: MIN_TERMINAL_LINE_HEIGHT,
        max: MAX_TERMINAL_LINE_HEIGHT,
        step: 0.05,
      },
      "prefs.newTabsHint",
    ),
    toggle(context, "fontLigatures", "prefs.ligatures"),
    heading(context, "prefs.window"),
    field(document, context.t("prefs.transparency"), transparencyRow).element,
    toggle(context, "blur", "prefs.blur"),
    numberField(
      context,
      "prefs.cornerRadius",
      (values) => values.cornerRadius,
      (value) => ({ cornerRadius: value }),
      { min: 0, max: MAX_WINDOW_CORNER_RADIUS, step: 1 },
      "prefs.cornerRadiusHint",
    ),
    heading(context, "prefs.padding"),
    padding,
  );
}

export function terminalPage(context: PreferencesContext): HTMLElement {
  const rules = context.document.createElement("button");
  rules.type = "button";
  rules.className = "omx-button omx-button-default";
  rules.textContent = context.t("menu.highlightRules");
  rules.addEventListener("click", () => context.openHighlightRules?.());
  rules.hidden = context.openHighlightRules === undefined;
  return page(
    context,
    heading(context, "prefs.scrolling"),
    numberField(
      context,
      "prefs.scrollback",
      (values) => values.scrollbackLines,
      (value) => ({ scrollbackLines: value }),
      { min: 0, max: MAX_SCROLLBACK_LINES, step: 1000 },
      "prefs.scrollbackHint",
    ),
    ...(context.snapshot().platform === "darwin"
      ? [
          heading(context, "prefs.keyboard"),
          choice(context, "optionKeyMode", "prefs.optionAsAlt", [
            [OPTION_KEY_MODES[0], "prefs.optionNone"],
            [OPTION_KEY_MODES[1], "prefs.optionLeft"],
            [OPTION_KEY_MODES[2], "prefs.optionRight"],
            [OPTION_KEY_MODES[3], "prefs.optionBoth"],
          ]),
        ]
      : []),
    heading(context, "prefs.highlighting"),
    toggle(context, "highlightOutput", "menu.highlightOutput"),
    rules,
    heading(context, "prefs.filePreview"),
    toggle(context, "filePreview", "prefs.filePreviewToggle"),
    hint(context, "prefs.filePreviewHint"),
  );
}

export function windowPage(context: PreferencesContext): HTMLElement {
  return page(
    context,
    heading(context, "prefs.newWindows"),
    toggle(context, "showTitleBar", "prefs.showTitleBar"),
    toggle(context, "autoHideTitleBar", "prefs.autoHideTitleBar"),
    toggle(context, "showTabBar", "prefs.showTabBar"),
    toggle(context, "alwaysOnTop", "menu.alwaysOnTop"),
    heading(context, "prefs.behavior"),
    toggle(context, "confirmClose", "prefs.confirmClose"),
    toggle(context, "restoreWindows", "menu.restoreWindows"),
  );
}

function shortcutRow(
  context: PreferencesContext,
  action: TerminalActionName,
): HTMLElement {
  const { document } = context;
  const platform = context.snapshot().platform;
  const row = document.createElement("div");
  row.className = "preferences-shortcut";
  const name = document.createElement("span");
  name.textContent = context.t(
    action.startsWith("selectTab")
      ? "prefs.selectTab"
      : (`action.${action}` as MessageKey),
    { position: action.slice(9) },
  );
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preferences-accelerator";
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "omx-icon-button";
  reset.textContent = "↺";
  reset.title = context.t("prefs.resetShortcut");
  reset.setAttribute(
    "aria-label",
    `${context.t("prefs.resetShortcut")}: ${name.textContent}`,
  );
  let recording = false;
  const show = (values: PreferencesValues) => {
    const accelerator = values.keybinds[action];
    button.textContent = recording
      ? context.t("prefs.pressKeys")
      : displayAccelerator(accelerator, platform);
    button.setAttribute(
      "aria-label",
      `${name.textContent}: ${displayAccelerator(accelerator, platform)}`,
    );
    reset.hidden = accelerator === context.snapshot().defaults.keybinds[action];
  };
  let stopCapture: (() => void) | undefined;
  const stop = () => {
    stopCapture?.();
    stopCapture = undefined;
    recording = false;
    button.classList.remove("recording");
    show(context.snapshot().values);
  };
  // Keys arrive from main while recording, so bound shortcuts can be
  // pressed without running them.
  button.addEventListener("click", () => {
    if (recording) return;
    recording = true;
    button.classList.add("recording");
    show(context.snapshot().values);
    stopCapture = context.captureKeys((key) => {
      if (key.key === "Escape") {
        stop();
        return;
      }
      const accelerator = acceleratorFromKeyEvent(
        {
          key: key.key,
          code: key.code,
          ctrlKey: key.control,
          altKey: key.alt,
          shiftKey: key.shift,
          metaKey: key.meta,
        },
        platform,
      );
      if (!accelerator) return;
      stop();
      context.save({ keybinds: { [action]: accelerator } });
    });
  });
  button.addEventListener("blur", () => {
    if (recording) stop();
  });
  reset.addEventListener("click", () =>
    context.save({
      keybinds: { [action]: context.snapshot().defaults.keybinds[action] },
    }),
  );
  context.onSync(show);
  row.append(name, button, reset);
  return row;
}

export function shortcutsPage(context: PreferencesContext): HTMLElement {
  const hint = context.document.createElement("p");
  hint.className = "omx-field-hint";
  hint.textContent = context.t("prefs.shortcutsHint");
  const list = context.document.createElement("div");
  list.className = "preferences-shortcuts";
  list.append(
    ...TERMINAL_ACTION_NAMES.map((action) => shortcutRow(context, action)),
  );
  return page(context, hint, list);
}

function hint(context: PreferencesContext, key: MessageKey): HTMLElement {
  const element = context.document.createElement("p");
  element.className = "omx-field-hint";
  element.textContent = context.t(key);
  return element;
}

// Windows only: the program new local terminals start.
function windowsShellField(context: PreferencesContext): HTMLElement {
  const input = textInput(
    context.document,
    context.snapshot().values.windowsShell,
    {
      placeholder:
        "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    },
  );
  commitOnEnter(input);
  input.addEventListener("change", () =>
    context.save({ windowsShell: input.value.trim() }),
  );
  context.onSync((values) => {
    input.value = values.windowsShell;
  });
  return field(
    context.document,
    context.t("prefs.windowsShell"),
    input,
    context.t("prefs.windowsShellHint"),
  ).element;
}

export function advancedPage(context: PreferencesContext): HTMLElement {
  return page(
    context,
    ...(context.snapshot().platform === "win32"
      ? [heading(context, "prefs.shell"), windowsShellField(context)]
      : []),
    heading(context, "prefs.diagnostics"),
    choice(context, "logLevel", "prefs.logLevel", [
      [LOG_LEVELS[0], "prefs.logError"],
      [LOG_LEVELS[1], "prefs.logInfo"],
      [LOG_LEVELS[2], "prefs.logDebug"],
    ]),
  );
}
