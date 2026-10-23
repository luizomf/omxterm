import type { Translator } from "../../shared/i18n";
import type {
  PreferencesFile,
  PreferencesSaveResult,
} from "../../shared/preferences";

export interface ConfigFileAccess {
  read(): Promise<PreferencesFile>;
  // Saves the whole text; the dialog applies the answer to the other pages.
  save(text: string): Promise<PreferencesSaveResult>;
  // Runs after any page saved, so a clean editor shows the current file.
  onSaved(listener: () => void): void;
}

const INDENT = "  ";

function button(document: Document, label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "omx-button omx-button-default";
  element.textContent = label;
  return element;
}

// The JSON problem in a text, or undefined when it parses to an object.
export function configurationTextProblem(text: string): string | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? undefined
      : "config.json must hold a JSON object";
  } catch (cause) {
    return cause instanceof Error ? cause.message : "Invalid JSON";
  }
}

// Edits config.json as text inside Preferences: every setting, including
// ones without a control. Saving validates exactly like a reload, keeps the
// previous file as config.json.bak and applies the result in every window.
export function configFilePage(
  document: Document,
  translator: Translator,
  access: ConfigFileAccess,
): HTMLElement {
  const t = translator.t.bind(translator);
  const element = document.createElement("div");
  element.className = "omx-form preferences-page preferences-config";
  const hint = document.createElement("p");
  hint.className = "omx-field-hint";
  hint.textContent = t("prefs.configFileHint");
  const location = document.createElement("code");
  location.className = "preferences-config-path";
  const editor = document.createElement("textarea");
  editor.className = "preferences-config-editor";
  editor.spellcheck = false;
  editor.wrap = "off";
  editor.rows = 14;
  editor.setAttribute("aria-label", t("prefs.configFile"));
  editor.setAttribute("autocapitalize", "off");
  editor.setAttribute("autocomplete", "off");
  const check = document.createElement("p");
  check.className = "preferences-config-check";
  check.setAttribute("role", "status");
  const toolbar = document.createElement("div");
  toolbar.className = "preferences-config-actions";
  const format = button(document, t("prefs.configFormat"));
  const reload = button(document, t("prefs.configReload"));
  // Not omx-button-primary: that class marks the dialog's own action.
  const save = button(document, t("prefs.configSave"));
  save.classList.add("preferences-config-save");
  toolbar.append(check, format, reload, save);
  element.append(hint, location, editor, toolbar);

  let saved = "";
  let busy = false;
  const dirty = () => editor.value !== saved;
  const validate = () => {
    const problem = configurationTextProblem(editor.value);
    check.textContent = problem
      ? t("prefs.configInvalid", { reason: problem })
      : dirty()
        ? t("prefs.configUnsaved")
        : t("prefs.configValid");
    check.classList.toggle("error", problem !== undefined);
    save.disabled = busy || problem !== undefined || !dirty();
    format.disabled = problem !== undefined;
  };
  const load = async () => {
    busy = true;
    try {
      const file = await access.read();
      location.textContent = file.path;
      saved = file.text;
      editor.value = file.text;
    } catch (cause) {
      check.textContent = String(cause);
    } finally {
      busy = false;
      validate();
    }
  };
  const store = async () => {
    if (busy || configurationTextProblem(editor.value)) return;
    busy = true;
    validate();
    const text = editor.value;
    try {
      const result = await access.save(text);
      if (result.ok) {
        // Main completed the file with every setting; show what it wrote.
        busy = false;
        await load();
        check.textContent = t("prefs.configSaved");
      } else {
        busy = false;
        validate();
        check.textContent = t("prefs.notSaved", { reason: result.error });
        check.classList.add("error");
      }
    } catch (cause) {
      busy = false;
      validate();
      check.textContent = String(cause);
      check.classList.add("error");
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  editor.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(validate, 250);
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      event.stopPropagation();
      void store();
      return;
    }
    if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey)
      return;
    // Tab indents inside the editor; Escape still closes the dialog.
    event.preventDefault();
    const { selectionStart, selectionEnd, value } = editor;
    editor.value = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`;
    editor.selectionStart = editor.selectionEnd =
      selectionStart + INDENT.length;
    editor.dispatchEvent(new Event("input"));
  });
  format.addEventListener("click", () => {
    if (configurationTextProblem(editor.value)) return;
    editor.value = `${JSON.stringify(JSON.parse(editor.value), null, 2)}\n`;
    validate();
  });
  reload.addEventListener("click", () => void load());
  save.addEventListener("click", () => void store());
  // Other pages write the file too; a clean editor follows them.
  access.onSaved(() => {
    if (!dirty() && !busy) void load();
  });
  void load();
  return element;
}
