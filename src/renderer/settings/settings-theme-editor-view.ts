import {
  TERMINAL_THEME_COLOR_KEYS,
  isTerminalThemeName,
  type TerminalTheme,
  type TerminalThemeColorKey,
} from "../../shared/terminal-theme";
import type { ThemeDocumentBase } from "../../shared/settings-theme-documents";
import type { MessageKey } from "../../shared/i18n";
import {
  createPageButton,
  setPageNotice,
  type NoticeSeverity,
} from "../application-page";
import type { Translate } from "../renderer-language";

export interface ThemeEditorNotice {
  readonly key: MessageKey;
  readonly severity: NoticeSeverity;
  readonly detail?: string;
  readonly newer?: boolean;
  readonly cleanup?: boolean;
  readonly recovery?: boolean;
}

interface ThemeEditorPresentation {
  readonly t: Translate;
  readonly active: boolean;
  readonly pending: boolean;
  readonly dirty: boolean;
  readonly theme: TerminalTheme;
  readonly base: ThemeDocumentBase | undefined;
  readonly notice: ThemeEditorNotice | undefined;
  readonly valid: boolean;
  readonly colorValid: boolean;
}

// Construction and painting only: document ownership, revisions and async
// generations stay in the editor, not in DOM rebuilding or label callbacks.
function buildThemeEditorView(
  document: Document,
  labels: ((t: Translate) => void)[],
) {
  const element = document.createElement("section");
  element.className = "settings-theme-authoring";
  const toolbar = document.createElement("div");
  toolbar.className = "settings-actions ui-actions";
  const create = createPageButton(document);
  const importButton = createPageButton(document);
  toolbar.append(create, importButton);
  const panel = document.createElement("section");
  panel.className = "settings-theme-editor";
  panel.hidden = true;
  const heading = document.createElement("h4");
  const source = document.createElement("p");
  source.className = "settings-path";
  const hint = document.createElement("p");
  hint.className = "ui-hint settings-hint";
  const appearance = document.createElement("p");
  appearance.className = "ui-hint settings-hint";
  const field = (input: HTMLElement) => {
    const row = document.createElement("label");
    row.className = "settings-row";
    const label = document.createElement("span");
    label.className = "settings-control-caption";
    row.append(label, input);
    input.classList.add("page-control");
    return { row, label };
  };
  const name = document.createElement("input");
  name.type = "text";
  name.spellcheck = false;
  const nameField = field(name);
  const role = document.createElement("select");
  for (const [key, keys] of [
    ["settings.author.surface", TERMINAL_THEME_COLOR_KEYS.slice(0, 5)],
    ["settings.author.ansi", TERMINAL_THEME_COLOR_KEYS.slice(5, 13)],
    ["settings.author.bright", TERMINAL_THEME_COLOR_KEYS.slice(13)],
  ] as const) {
    const group = document.createElement("optgroup");
    labels.push((t) => {
      group.label = t(key);
    });
    for (const value of keys) {
      const option = document.createElement("option");
      option.value = value;
      group.append(option);
      labels.push((t) => {
        option.textContent = t(`settings.author.color.${value}`);
      });
    }
    role.append(group);
  }
  const roleField = field(role);
  const colorControls = document.createElement("div");
  colorControls.className = "settings-theme-color-controls";
  const well = document.createElement("input");
  well.type = "color";
  well.className = "page-control";
  const hex = document.createElement("input");
  hex.type = "text";
  hex.className = "page-control settings-theme-hex";
  hex.spellcheck = false;
  hex.autocomplete = "off";
  const hexField = field(hex);
  colorControls.append(well, hexField.row);
  const invalid = document.createElement("p");
  invalid.className = "page-notice";
  invalid.setAttribute("role", "status");
  const previewTitle = document.createElement("h4");
  const specimen = document.createElement("div");
  specimen.className = "settings-theme-specimen";
  const line = document.createElement("div");
  line.textContent = "~ $ demo   ";
  const signals = (["green", "yellow", "red"] as const).map((key, index) => {
    const span = document.createElement("span");
    span.textContent = ["OK  ", "WARN  ", "ERROR"][index]!;
    line.append(span);
    return { key, span };
  });
  const selection = document.createElement("span");
  selection.className = "settings-theme-selection";
  const cursor = document.createElement("span");
  cursor.className = "settings-theme-cursor";
  cursor.textContent = " ";
  // Terminal-style text rows: each normal color sits directly above its bright
  // counterpart on the draft background, so contrast reads like real output.
  const ansiText = document.createElement("div");
  ansiText.className = "settings-theme-ansi-text";
  const ansiLines = [
    TERMINAL_THEME_COLOR_KEYS.slice(5, 13),
    TERMINAL_THEME_COLOR_KEYS.slice(13),
  ].flatMap((keys) =>
    keys.map((key, index) => {
      const span = document.createElement("span");
      span.textContent = TERMINAL_THEME_COLOR_KEYS[5 + index]!;
      ansiText.append(span);
      return { key, span };
    }),
  );
  const samplesHint = document.createElement("p");
  samplesHint.className = "ui-hint settings-hint";
  const samples = document.createElement("ul");
  samples.className = "settings-theme-ansi";
  // One row per color: normal and bright swatches side by side. Picking one
  // edits that role, the same as choosing it in the role list.
  const ansi = TERMINAL_THEME_COLOR_KEYS.slice(5, 13).flatMap(
    (normal, index) => {
      const pair = document.createElement("li");
      pair.className = "settings-theme-ansi-pair";
      const name = document.createElement("span");
      name.className = "settings-theme-ansi-name";
      pair.append(name);
      samples.append(pair);
      return [normal, TERMINAL_THEME_COLOR_KEYS[13 + index]!].map((key) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "settings-theme-swatch";
        swatch.dataset.role = key;
        swatch.addEventListener("click", () => {
          role.value = key;
          role.dispatchEvent(new Event("change"));
        });
        pair.append(swatch);
        return { key, name: key === normal ? name : undefined, swatch };
      });
    },
  );
  specimen.append(line, selection, cursor, ansiText);
  const filename = document.createElement("input");
  filename.type = "text";
  filename.spellcheck = false;
  filename.maxLength = 128;
  const filenameField = field(filename);
  const filenameHint = document.createElement("p");
  filenameHint.className = "ui-hint settings-hint";
  const copyFields = document.createElement("div");
  copyFields.className = "settings-theme-copy-fields";
  copyFields.append(filenameField.row, filenameHint);
  copyFields.hidden = true;
  const save = createPageButton(document, "primary");
  const copy = createPageButton(document);
  const exportButton = createPageButton(document);
  const cancel = createPageButton(document, "text");
  const reload = createPageButton(document, "text");
  reload.hidden = true;
  const actions = document.createElement("div");
  actions.className = "settings-actions ui-actions";
  actions.append(save, copy, exportButton, cancel, reload);
  const exportHint = document.createElement("p");
  exportHint.className = "ui-hint settings-hint";
  exportHint.id = "settings-theme-export-hint";
  exportButton.setAttribute("aria-describedby", exportHint.id);
  const use = createPageButton(document);
  const useRow = document.createElement("div");
  useRow.className = "settings-theme-use";
  useRow.append(use);
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  panel.append(
    heading,
    source,
    hint,
    nameField.row,
    roleField.row,
    colorControls,
    invalid,
    previewTitle,
    specimen,
    samplesHint,
    samples,
    appearance,
    copyFields,
    actions,
    exportHint,
    useRow,
  );
  element.append(toolbar, panel, message);
  return {
    element,
    panel,
    create,
    importButton,
    name,
    role,
    hex,
    well,
    filename,
    copyFields,
    save,
    copy,
    exportButton,
    cancel,
    reload,
    use,
    message,
    heading,
    source,
    hint,
    appearance,
    nameField,
    roleField,
    hexField,
    invalid,
    previewTitle,
    samplesHint,
    specimen,
    selection,
    cursor,
    signals,
    ansiLines,
    ansi,
    filenameField,
    filenameHint,
    exportHint,
  };
}

type ThemeEditorView = ReturnType<typeof buildThemeEditorView>;

function displayPath(path: string): string {
  return path.replace(/[\\\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu, (char) =>
    char === "\\" ? "\\\\" : `\\u{${char.codePointAt(0)!.toString(16)}}`,
  );
}

function paintSpecimen(
  view: ThemeEditorView,
  theme: TerminalTheme,
  t: Translate,
) {
  view.previewTitle.textContent = t("settings.author.preview");
  view.samplesHint.textContent = t("settings.author.samplesHint");
  view.selection.textContent = t("settings.author.selection");
  view.cursor.setAttribute("aria-label", t("settings.author.cursor"));
  view.specimen.style.backgroundColor = theme.colors.background;
  view.specimen.style.color = theme.colors.foreground;
  view.selection.style.backgroundColor = theme.colors.selectionBackground;
  view.selection.style.color = theme.colors.selectionForeground;
  view.cursor.style.backgroundColor = theme.colors.cursor;
  view.signals.forEach(({ key, span }) => {
    span.style.color = theme.colors[key];
  });
  view.ansiLines.forEach(({ key, span }) => {
    span.style.color = theme.colors[key];
  });
  const selected = view.role.value;
  view.ansi.forEach(({ key, name, swatch }) => {
    // Names stay in interface colors; only the samples show draft contrast.
    const label = t(`settings.author.color.${key}`);
    if (name) name.textContent = label;
    swatch.setAttribute("aria-label", label);
    swatch.title = `${label} ${theme.colors[key]}`;
    swatch.setAttribute("aria-pressed", String(key === selected));
    swatch.style.backgroundColor = theme.colors[key];
  });
}

function paintNotice(
  view: ThemeEditorView,
  notice: ThemeEditorNotice | undefined,
  t: Translate,
) {
  setPageNotice(view.message, {
    text: notice
      ? t(notice.key) +
        (notice.detail ? ` ${notice.detail}` : "") +
        (notice.newer ? ` ${t("settings.author.newer")}` : "") +
        (notice.cleanup ? ` ${t("settings.author.cleanupWarning")}` : "") +
        (notice.recovery ? ` ${t("settings.author.recovery")}` : "")
      : "",
    severity: notice?.severity ?? "info",
  });
}

function paintThemeEditor(
  view: ThemeEditorView,
  state: ThemeEditorPresentation,
  busyChanged: (busy: boolean) => void,
) {
  const { t, active, pending, base, theme, dirty, valid } = state;
  view.create.textContent = t("settings.author.new");
  view.importButton.textContent = t("settings.author.import");
  view.create.disabled = view.importButton.disabled = active || pending;
  busyChanged(active || pending);
  view.panel.hidden = !active;
  if (active && view.panel.parentElement !== view.element)
    view.element.insertBefore(view.panel, view.message);
  else if (!active) view.panel.remove();
  view.heading.textContent = t("settings.author.title");
  view.source.textContent = base
    ? displayPath(base.path)
    : t("settings.author.copySource");
  view.hint.textContent = t("settings.author.draftHint");
  view.appearance.hidden = theme.appearance === undefined;
  view.appearance.textContent = t("settings.author.appearance");
  view.nameField.label.textContent = t("settings.author.name");
  view.roleField.label.textContent = t("settings.author.role");
  const role = view.role.value as TerminalThemeColorKey;
  const color = t(`settings.author.color.${role || "background"}`);
  view.hexField.label.textContent = t("settings.author.hex", { color });
  view.well.setAttribute("aria-label", t("settings.author.well", { color }));
  view.name.setAttribute(
    "aria-invalid",
    String(active && !isTerminalThemeName(view.name.value)),
  );
  view.hex.setAttribute("aria-invalid", String(active && !state.colorValid));
  setPageNotice(view.invalid, {
    text: active && !valid ? t("settings.author.invalid") : "",
    severity: "warning",
  });
  paintSpecimen(view, theme, t);
  view.filenameField.label.textContent = t("settings.author.filename");
  view.filenameHint.textContent = t("settings.author.filenameHint");
  view.save.textContent = t("settings.save");
  view.copy.textContent = t("settings.author.copy");
  view.exportButton.textContent = t("settings.author.export");
  view.cancel.textContent = t("common.cancel");
  view.reload.textContent = t("settings.author.reload");
  view.save.disabled = pending || !base || !valid;
  view.copy.disabled = view.exportButton.disabled = pending || !valid;
  view.reload.disabled = pending;
  view.exportHint.textContent = t("settings.author.exportHint");
  view.use.textContent = t("settings.author.use");
  view.use.disabled = pending || dirty || !base || !valid;
  paintNotice(view, state.notice, t);
}

export function createSettingsThemeEditorView(
  document: Document,
  labels: ((t: Translate) => void)[],
  busyChanged: (busy: boolean) => void,
) {
  const view = buildThemeEditorView(document, labels);
  return {
    ...view,
    paint: (state: ThemeEditorPresentation) =>
      paintThemeEditor(view, state, busyChanged),
  };
}
