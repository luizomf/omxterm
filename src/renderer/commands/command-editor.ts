import {
  templatePlaceholders,
  validateCommandDefinition,
  type CommandDefinition,
  type CommandField,
  type CommandFieldType,
} from "../../shared/commands";
import type { Translator } from "../../shared/i18n";
import {
  field,
  selectInput,
  textArea,
  textInput,
  type FormField,
} from "../ui/form";
import { openModal } from "../ui/modal";

const EDITOR_TYPES: readonly CommandFieldType[] = [
  "text",
  "number",
  "switch",
  "dropdown",
  "file_path",
  "directory_path",
];

// Creates or edits a custom command. Each {name} in the template becomes a
// field whose label and type can be set; duplicating a built-in keeps its
// field definitions. Resolves true after a successful save.
export async function editCommand(
  document: Document,
  context: {
    readonly translator: Translator;
    readonly save: (command: CommandDefinition) => Promise<unknown>;
  },
  existing?: CommandDefinition,
  duplicate = false,
): Promise<boolean> {
  const t = context.translator.t.bind(context.translator);
  const form = document.createElement("div");
  form.className = "omx-form command-editor";
  const name = field(
    document,
    t("common.name"),
    textInput(
      document,
      existing
        ? duplicate
          ? t("commands.duplicateName", { name: existing.name })
          : existing.name
        : "",
    ),
  );
  const description = field(
    document,
    t("common.description"),
    textInput(document, existing?.description ?? ""),
  );
  const category = field(
    document,
    t("commands.field.category"),
    textInput(document, existing?.category ?? t("commands.custom")),
  );
  const template = field(
    document,
    t("commands.field.template"),
    textArea(document, existing?.template ?? "", 3),
    t("commands.field.templateHint"),
  );
  const execution = field(
    document,
    t("commands.field.execution"),
    selectInput(
      document,
      [
        ["dialog", t("commands.execution.dialog")],
        ["insert", t("commands.execution.insert")],
        ["execute", t("commands.execution.execute")],
      ],
      existing?.execution ?? "dialog",
    ),
  );
  const fieldsSection = document.createElement("fieldset");
  fieldsSection.className = "omx-section";
  const legend = document.createElement("legend");
  legend.textContent = t("commands.field.placeholders");
  const hint = document.createElement("p");
  hint.className = "omx-field-hint";
  hint.textContent = t("commands.field.placeholdersHint");
  const rows = document.createElement("div");
  rows.className = "command-field-rows";
  fieldsSection.append(legend, hint, rows);
  form.append(
    name.element,
    description.element,
    category.element,
    template.element,
    execution.element,
    fieldsSection,
  );

  // Edited field definitions by id, kept when the template changes.
  const definitions = new Map<string, CommandField>(
    (existing?.fields ?? []).map((item) => [item.id, item]),
  );
  const readers = new Map<string, () => CommandField>();
  const typeLabel = (type: CommandFieldType) =>
    t(
      type === "file_path"
        ? "commands.type.file"
        : type === "directory_path"
          ? "commands.type.directory"
          : (`commands.type.${type}` as "commands.type.text"),
    );
  const renderRows = () => {
    for (const [id, read] of readers) definitions.set(id, read());
    readers.clear();
    const ids = templatePlaceholders(template.control.value);
    hint.hidden = ids.length > 0;
    rows.replaceChildren(
      ...ids.map((id) => {
        const current: CommandField = definitions.get(id) ?? {
          id,
          label: id,
          type: "text",
        };
        const row = document.createElement("div");
        row.className = "command-field-row";
        const label = field(
          document,
          `{${id}}`,
          textInput(document, current.label),
        );
        const types = EDITOR_TYPES.includes(current.type)
          ? EDITOR_TYPES
          : [...EDITOR_TYPES, current.type];
        const type = field(
          document,
          t("commands.field.type"),
          selectInput(
            document,
            types.map((item) => [item, typeLabel(item)] as const),
            current.type,
          ),
        );
        const flag = field(
          document,
          t("commands.field.flag"),
          textInput(document, current.flag ?? ""),
        );
        const options = field(
          document,
          t("commands.field.options"),
          textArea(
            document,
            (current.options ?? [])
              .map(([value, text]) => `${value}=${text}`)
              .join("\n"),
            2,
          ),
          t("commands.field.optionsHint"),
        );
        const sync = () => {
          flag.setVisible(type.control.value === "switch");
          options.setVisible(type.control.value === "dropdown");
        };
        type.control.addEventListener("change", sync);
        sync();
        row.append(label.element, type.element, flag.element, options.element);
        readers.set(id, () => readField(current, label, type, flag, options));
        return row;
      }),
    );
  };
  template.control.addEventListener("input", renderRows);
  renderRows();

  const result = await openModal(document, {
    title:
      existing && !duplicate ? t("commands.editTitle") : t("commands.newTitle"),
    body: form,
    className: "command-editor-dialog",
    initialFocus: name.control,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("common.save"), value: true, kind: "primary" },
    ],
    beforeResolve: async () => {
      name.setError(undefined);
      template.setError(undefined);
      const ids = templatePlaceholders(template.control.value);
      const candidate = {
        id:
          existing && !duplicate && !existing.builtin
            ? existing.id
            : `custom_${Math.random().toString(36).slice(2, 10)}`,
        name: name.control.value,
        description: description.control.value,
        category: category.control.value,
        template: template.control.value,
        execution: execution.control.value,
        fields: ids.map((id) => readers.get(id)!()),
      };
      try {
        await context.save(validateCommandDefinition(candidate));
        return true;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        if (candidate.name.trim() === "")
          name.setError(t("sessions.validation.name"));
        else template.setError(message);
        return false;
      }
    },
  });
  return result === true;
}

function readField(
  current: CommandField,
  label: FormField<HTMLInputElement>,
  type: FormField<HTMLSelectElement>,
  flag: FormField<HTMLInputElement>,
  options: FormField<HTMLTextAreaElement>,
): CommandField {
  const kind = type.control.value as CommandFieldType;
  const { flag: _flag, options: _options, ...rest } = current;
  const parsedOptions = options.control.value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): [string, string] => {
      const separator = line.indexOf("=");
      return separator < 0
        ? [line, line]
        : [
            line.slice(0, separator),
            line.slice(separator + 1) || line.slice(0, separator),
          ];
    });
  return {
    ...rest,
    label: label.control.value.trim() || current.id,
    type: kind,
    ...(kind === "switch" ? { flag: flag.control.value } : {}),
    ...(kind === "dropdown" ? { options: parsedOptions } : {}),
  };
}
