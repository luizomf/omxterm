import {
  BUILTIN_HIGHLIGHT_CONTEXTS,
  validateHighlightSettings,
  type HighlightRuleDefinition,
  type HighlightSettings,
} from "../../shared/highlight-settings";
import type { Translator } from "../../shared/i18n";
import type { HighlightsBridge } from "../../shared/terminal-bridge";
import {
  checkbox,
  field,
  section,
  selectInput,
  textArea,
  textInput,
  type FormField,
} from "../ui/form";
import { openModal } from "../ui/modal";
import { HIGHLIGHT_COLOR_NAMES } from "./highlight-colors";
import { checkPattern } from "./highlight-rules";

interface RuleRow {
  readonly element: HTMLElement;
  readonly name: FormField<HTMLInputElement>;
  readonly pattern: FormField<HTMLInputElement>;
  readonly color: FormField<HTMLSelectElement>;
  readonly bold: HTMLInputElement;
}

// Highlighting preferences: on/off, command-aware rule sets, commands left
// untouched, and custom rules. Saving validates in the renderer and again in
// main; every window applies the result at once.
export async function openHighlightEditor(
  document: Document,
  context: {
    readonly translator: Translator;
    readonly bridge: HighlightsBridge;
  },
): Promise<boolean> {
  const t = context.translator.t.bind(context.translator);
  const settings = await context.bridge.get();
  const form = document.createElement("div");
  form.className = "omx-form highlight-editor";

  const enabled = checkbox(document, t("highlight.enabled"), settings.enabled);
  const contextAware = checkbox(
    document,
    t("highlight.contextAware"),
    settings.contextAware,
  );
  const ignored = field(
    document,
    t("highlight.ignored"),
    textArea(document, settings.ignoredCommands.join("\n"), 4),
    t("highlight.ignoredHint"),
  );

  const sets = section(document, t("highlight.ruleSets"));
  sets.classList.add("highlight-rule-sets");
  const disabled = new Set(settings.disabledContexts);
  const contextBoxes = BUILTIN_HIGHLIGHT_CONTEXTS.map((definition) => {
    const box = checkbox(
      document,
      definition.name,
      !disabled.has(definition.name),
    );
    if (definition.description) box.element.title = definition.description;
    sets.append(box.element);
    return { name: definition.name, input: box.input };
  });

  const custom = section(document, t("highlight.rules"));
  const rows = document.createElement("div");
  rows.className = "highlight-custom-rules";
  const emptyRules = document.createElement("p");
  emptyRules.className = "omx-field-hint";
  emptyRules.textContent = t("highlight.noCustomRules");
  const addRule = document.createElement("button");
  addRule.type = "button";
  addRule.className = "omx-button";
  addRule.textContent = t("highlight.addRule");
  custom.append(rows, emptyRules, addRule);
  const ruleRows: RuleRow[] = [];
  const syncEmpty = () => {
    emptyRules.hidden = ruleRows.length > 0;
  };
  const appendRule = (rule?: HighlightRuleDefinition) => {
    const row = ruleRow(document, t, rule, () => {
      ruleRows.splice(ruleRows.indexOf(row), 1);
      row.element.remove();
      syncEmpty();
    });
    ruleRows.push(row);
    rows.append(row.element);
    syncEmpty();
    return row;
  };
  settings.customRules.forEach((rule) => appendRule(rule));
  addRule.addEventListener("click", () => appendRule().name.control.focus());
  syncEmpty();

  form.append(
    enabled.element,
    contextAware.element,
    ignored.element,
    sets,
    custom,
  );

  const result = await openModal(document, {
    title: t("highlight.editorTitle"),
    body: form,
    className: "highlight-editor-dialog",
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("common.save"), value: true, kind: "primary" },
    ],
    beforeResolve: async () => {
      const rules = readRules(ruleRows, t);
      if (!rules) return false;
      ignored.setError(undefined);
      let next: HighlightSettings;
      try {
        next = validateHighlightSettings({
          ...settings,
          enabled: enabled.input.checked,
          contextAware: contextAware.input.checked,
          ignoredCommands: ignored.control.value
            .split(/\s+/u)
            .filter((command) => command.length > 0),
          disabledContexts: contextBoxes
            .filter((box) => !box.input.checked)
            .map((box) => box.name),
          customRules: rules,
        });
      } catch (cause) {
        ignored.setError(
          cause instanceof Error ? cause.message : String(cause),
        );
        return false;
      }
      await context.bridge.save(next);
      return true;
    },
  });
  return result === true;
}

function ruleRow(
  document: Document,
  t: Translator["t"],
  rule: HighlightRuleDefinition | undefined,
  remove: () => void,
): RuleRow {
  const element = document.createElement("div");
  element.className = "highlight-custom-rule";
  const spec = rule?.colors[0] ?? "red";
  const tokens = spec.split(/\s+/u);
  const name = field(
    document,
    t("highlight.ruleName"),
    textInput(document, rule?.name ?? ""),
  );
  const pattern = field(
    document,
    t("highlight.pattern"),
    textInput(document, rule?.pattern ?? ""),
  );
  const color = field(
    document,
    t("highlight.color"),
    selectInput(
      document,
      HIGHLIGHT_COLOR_NAMES.map((value) => [value, value] as const),
      HIGHLIGHT_COLOR_NAMES.find((value) => tokens.includes(value)) ?? "red",
    ),
  );
  const bold = checkbox(document, t("highlight.bold"), tokens.includes("bold"));
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "omx-icon-button";
  removeButton.textContent = "×";
  removeButton.title = t("highlight.removeRule");
  removeButton.setAttribute("aria-label", t("highlight.removeRule"));
  removeButton.addEventListener("click", remove);
  element.append(
    name.element,
    pattern.element,
    color.element,
    bold.element,
    removeButton,
  );
  return { element, name, pattern, color, bold: bold.input };
}

// The rules as definitions, or undefined after marking the fields in error.
function readRules(
  rows: readonly RuleRow[],
  t: Translator["t"],
): HighlightRuleDefinition[] | undefined {
  let valid = true;
  const rules = rows.map((row) => {
    row.name.setError(undefined);
    row.pattern.setError(undefined);
    const name = row.name.control.value.trim();
    const pattern = row.pattern.control.value;
    if (name.length === 0) {
      row.name.setError(t("sessions.validation.name"));
      valid = false;
    }
    const check = checkPattern(pattern);
    if (check !== "valid") {
      row.pattern.setError(
        check === "unsafe"
          ? t("highlight.unsafePattern")
          : t("highlight.invalidPattern"),
      );
      valid = false;
    }
    return {
      name,
      pattern,
      colors: [`${row.bold.checked ? "bold " : ""}${row.color.control.value}`],
    };
  });
  return valid ? rules : undefined;
}
