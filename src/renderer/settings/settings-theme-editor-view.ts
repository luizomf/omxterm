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
  /** The color the field edits. */
  readonly role: TerminalThemeColorKey;
  /** Colors whose typed text is not a color yet. */
  readonly invalidRoles: ReadonlySet<TerminalThemeColorKey>;
}

// Construction and painting only: document ownership, revisions and async
// generations stay in the editor, not in DOM rebuilding or label callbacks.
function buildThemeEditorView(document: Document) {
  const element = document.createElement("section");
  element.className = "settings-theme-authoring";
  // New and Import start a draft, so they sit with the list's heading.
  const toolbar = document.createElement("div");
  toolbar.className = "settings-actions ui-actions";
  const create = createPageButton(document);
  const importButton = createPageButton(document);
  toolbar.append(create, importButton);
  const panel = document.createElement("section");
  panel.className = "settings-theme-editor";
  panel.hidden = true;
  const header = document.createElement("div");
  header.className = "settings-theme-editor-header";
  const heading = document.createElement("h3");
  heading.id = "settings-theme-editor-title";
  panel.setAttribute("aria-labelledby", heading.id);
  const source = document.createElement("span");
  source.className = "ui-meta settings-path";
  header.append(heading, source);
  const field = (input: HTMLElement) => {
    const row = document.createElement("label");
    row.className = "settings-row ui-form-row";
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
  // Every color at once: the surface colors, then each normal ANSI color
  // directly above its bright variant. One radio group picks the color the
  // field beside it edits.
  const swatches = document.createElement("div");
  swatches.className = "ui-swatch-grid";
  swatches.setAttribute("role", "radiogroup");
  const roles = [
    TERMINAL_THEME_COLOR_KEYS.slice(0, 5),
    TERMINAL_THEME_COLOR_KEYS.slice(5, 13),
    TERMINAL_THEME_COLOR_KEYS.slice(13),
  ].flatMap((keys) => {
    const row = document.createElement("div");
    row.className = "ui-swatch-row";
    swatches.append(row);
    return keys.map((key) => {
      const swatch = document.createElement("label");
      swatch.className = "ui-swatch";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "settings-theme-role";
      radio.value = key;
      swatch.append(radio);
      row.append(swatch);
      return { key, swatch, radio };
    });
  });
  const color = document.createElement("div");
  color.className = "settings-theme-color";
  const colorName = document.createElement("label");
  const colorField = document.createElement("div");
  colorField.className = "ui-color-field";
  const well = document.createElement("input");
  well.type = "color";
  well.className = "page-control";
  const hex = document.createElement("input");
  hex.type = "text";
  hex.id = "settings-theme-hex";
  hex.className = "page-control settings-theme-hex";
  hex.spellcheck = false;
  hex.autocomplete = "off";
  colorName.htmlFor = hex.id;
  colorField.append(well, hex);
  color.append(colorName, colorField);
  const colors = document.createElement("div");
  colors.className = "settings-theme-colors";
  colors.append(swatches, color);
  const invalid = document.createElement("p");
  invalid.className = "page-notice";
  invalid.setAttribute("role", "status");
  const specimen = document.createElement("div");
  specimen.className = "settings-theme-specimen";
  specimen.setAttribute("role", "group");
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
  const use = createPageButton(document);
  const cancel = createPageButton(document, "text");
  const reload = createPageButton(document, "text");
  reload.hidden = true;
  const actions = document.createElement("div");
  actions.className = "settings-actions ui-actions";
  actions.append(save, copy, exportButton, use, cancel, reload);
  // Export's promise stays attached to its button without a second sentence
  // on the page: its description and its tooltip.
  const exportHint = document.createElement("span");
  exportHint.className = "ui-visually-hidden";
  exportHint.id = "settings-theme-export-hint";
  exportButton.setAttribute("aria-describedby", exportHint.id);
  const hint = document.createElement("p");
  hint.className = "ui-hint settings-hint";
  const message = document.createElement("p");
  message.setAttribute("role", "status");
  panel.append(
    header,
    nameField.row,
    colors,
    specimen,
    invalid,
    copyFields,
    actions,
    exportHint,
    hint,
  );
  element.append(panel, message);
  return {
    element,
    toolbar,
    panel,
    create,
    importButton,
    name,
    swatches,
    roles,
    colorName,
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
    nameField,
    invalid,
    specimen,
    selection,
    cursor,
    signals,
    ansiLines,
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
  view.specimen.setAttribute("aria-label", t("settings.author.preview"));
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
}

// A swatch always shows the last valid color; one whose typed text is not a
// color yet is marked, so the notice's "every color" can be found.
function paintSwatches(view: ThemeEditorView, state: ThemeEditorPresentation) {
  const { t, theme } = state;
  view.swatches.setAttribute("aria-label", t("settings.author.role"));
  view.roles.forEach(({ key, swatch, radio }) => {
    const label = t(`settings.author.color.${key}`);
    radio.setAttribute("aria-label", label);
    radio.checked = key === state.role;
    radio.setAttribute(
      "aria-invalid",
      String(state.active && state.invalidRoles.has(key)),
    );
    swatch.title = `${label} ${theme.colors[key]}`;
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
  view.hint.textContent =
    t("settings.author.draftHint") +
    (theme.appearance === undefined
      ? ""
      : ` ${t("settings.author.appearance")}`);
  view.nameField.label.textContent = t("settings.author.name");
  const color = t(`settings.author.color.${state.role}`);
  view.colorName.textContent = color;
  view.hex.setAttribute("aria-label", t("settings.author.hex", { color }));
  view.well.setAttribute("aria-label", t("settings.author.well", { color }));
  view.name.setAttribute(
    "aria-invalid",
    String(active && !isTerminalThemeName(view.name.value)),
  );
  view.hex.setAttribute(
    "aria-invalid",
    String(active && state.invalidRoles.has(state.role)),
  );
  setPageNotice(view.invalid, {
    text: active && !valid ? t("settings.author.invalid") : "",
    severity: "warning",
  });
  paintSwatches(view, state);
  paintSpecimen(view, theme, t);
  view.filenameField.label.textContent = t("settings.author.filename");
  view.filenameHint.textContent = t("settings.author.filenameHint");
  view.save.textContent = t("settings.save");
  view.copy.textContent = t("settings.author.copy");
  view.exportButton.textContent = t("settings.author.export");
  view.cancel.textContent = t("common.cancel");
  view.reload.textContent = t("settings.author.reload");
  // One main action: Save for a theme that has a file, Save copy for a draft
  // that has none yet (new, built-in or imported).
  view.save.hidden = view.use.hidden = !base;
  view.copy.classList.toggle("page-button-primary", !base);
  view.copy.classList.toggle("page-button-quiet", !!base);
  view.save.disabled = pending || !base || !valid;
  view.copy.disabled = view.exportButton.disabled = pending || !valid;
  view.reload.disabled = pending;
  view.exportHint.textContent = view.exportButton.title = t(
    "settings.author.exportHint",
  );
  view.use.textContent = t("settings.author.use");
  view.use.disabled = pending || dirty || !base || !valid;
  paintNotice(view, state.notice, t);
}

export function createSettingsThemeEditorView(
  document: Document,
  busyChanged: (busy: boolean) => void,
) {
  const view = buildThemeEditorView(document);
  return {
    ...view,
    paint: (state: ThemeEditorPresentation) =>
      paintThemeEditor(view, state, busyChanged),
  };
}
