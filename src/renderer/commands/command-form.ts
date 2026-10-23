import {
  buildCommand,
  CommandFieldError,
  type CommandDefinition,
  type CommandField,
  type CommandShell,
  type CommandValues,
} from "../../shared/commands";
import type { Translator } from "../../shared/i18n";
import type { SessionFileChoice } from "../../shared/session-ipc";
import {
  checkbox,
  field,
  pathInput,
  selectInput,
  textArea,
  textInput,
  type FormField,
} from "../ui/form";
import { openModal } from "../ui/modal";

export interface CommandRun {
  readonly text: string;
  readonly submit: boolean;
  // Run in the terminals the user checks, not only the focused one.
  readonly multiple?: boolean;
}

interface ValueControl {
  readonly field: FormField;
  value(): string | boolean | readonly string[];
}

// The form for a command: one control per field, a live preview of the exact
// command (editable once the user changes it) and explicit Insert or Run.
export async function openCommandForm(
  document: Document,
  context: {
    readonly translator: Translator;
    readonly shell: CommandShell;
    readonly missing: readonly string[];
    readonly chooseFile: (kind: SessionFileChoice) => Promise<string | null>;
  },
  command: CommandDefinition,
): Promise<CommandRun | undefined> {
  const t = context.translator.t.bind(context.translator);
  const form = document.createElement("div");
  form.className = "omx-form command-form";
  if (command.description) {
    const description = document.createElement("p");
    description.className = "command-description";
    description.textContent = command.description;
    form.append(description);
  }
  if (context.missing.length > 0) {
    const warning = document.createElement("p");
    warning.className = "command-warning";
    warning.setAttribute("role", "note");
    warning.textContent = t("commands.unavailable", {
      tools: context.missing.join(", "),
    });
    form.append(warning);
  }
  const controls = new Map(
    command.fields.map((definition) => [
      definition.id,
      createControl(document, definition, t, context.chooseFile),
    ]),
  );
  for (const control of controls.values()) form.append(control.field.element);
  const preview = textArea(document, "", 3);
  preview.className = "command-preview";
  const previewField = field(document, t("commands.preview"), preview);
  form.append(previewField.element);

  let edited = false;
  const values = (): CommandValues =>
    Object.fromEntries(
      [...controls].map(([id, control]) => [id, control.value()]),
    );
  // Errors appear once the user has interacted or tries to submit.
  let showErrors = false;
  const refresh = () => {
    for (const control of controls.values()) control.field.setError(undefined);
    if (edited) return true;
    try {
      preview.value = buildCommand(command, values(), context.shell);
      return true;
    } catch (cause) {
      if (cause instanceof CommandFieldError && showErrors) {
        const control = controls.get(cause.field);
        const label =
          command.fields.find((item) => item.id === cause.field)?.label ?? "";
        control?.field.setError(
          cause.message === "required"
            ? t("commands.requiredField", { field: label })
            : t("commands.invalidNumber"),
        );
      }
      return false;
    }
  };
  form.addEventListener("input", (event) => {
    if (event.target === preview) edited = true;
    else {
      showErrors = true;
      refresh();
    }
  });
  form.addEventListener("change", (event) => {
    if (event.target === preview) return;
    showErrors = true;
    refresh();
  });
  refresh();

  const result = await openModal(document, {
    title: command.name,
    body: form,
    className: "command-form-dialog",
    actions: [
      { label: t("common.cancel"), value: undefined },
      {
        label: t("commands.insert"),
        value: "insert" as const,
        kind: "primary",
      },
      { label: t("commands.run"), value: "run" as const, kind: "primary" },
      {
        label: t("commands.runMultiple"),
        value: "multiple" as const,
        kind: "primary",
      },
    ],
    beforeResolve: () => {
      // Validate typed values unless the user replaced the preview by hand.
      showErrors = true;
      const valid = edited || refresh();
      return valid && preview.value.trim().length > 0;
    },
  });
  if (result === undefined) return undefined;
  const text = preview.value.trim();
  return result === "multiple"
    ? { text, submit: true, multiple: true }
    : { text, submit: result === "run" };
}

function createControl(
  document: Document,
  definition: CommandField,
  t: Translator["t"],
  chooseFile: (kind: SessionFileChoice) => Promise<string | null>,
): ValueControl {
  const initial = definition.defaultValue;
  const labelled = (control: HTMLElement) =>
    field(document, definition.label, control, definition.hint);
  switch (definition.type) {
    case "switch": {
      const box = checkbox(document, definition.label, initial === true);
      const wrapper = field(document, "", box.element, definition.hint);
      wrapper.element.querySelector("label")?.remove();
      return { field: wrapper, value: () => box.input.checked };
    }
    case "dropdown":
    case "radio": {
      const select = selectInput(
        document,
        definition.options ?? [],
        typeof initial === "string"
          ? initial
          : (definition.options?.[0]?.[0] ?? ""),
      );
      return { field: labelled(select), value: () => select.value };
    }
    case "multi_select": {
      const group = document.createElement("div");
      group.className = "omx-checkbox-group";
      const boxes = (definition.options ?? []).map(([value, label]) => {
        const box = checkbox(document, label, false);
        box.input.value = value;
        group.append(box.element);
        return box.input;
      });
      return {
        field: labelled(group),
        value: () => boxes.filter((box) => box.checked).map((box) => box.value),
      };
    }
    case "file_path":
    case "directory_path": {
      const path = pathInput(
        document,
        typeof initial === "string" ? initial : "",
        t("sessions.browse"),
        () =>
          chooseFile(definition.type === "file_path" ? "program" : "directory"),
      );
      return { field: labelled(path.element), value: () => path.input.value };
    }
    case "text_area": {
      const area = textArea(
        document,
        typeof initial === "string" ? initial : "",
        3,
      );
      return { field: labelled(area), value: () => area.value };
    }
    default: {
      const input = textInput(
        document,
        typeof initial === "string" ? initial : "",
        {
          type:
            definition.type === "password"
              ? "password"
              : definition.type === "number"
                ? "number"
                : "text",
          ...(definition.placeholder
            ? { placeholder: definition.placeholder }
            : {}),
        },
      );
      if (definition.type === "number" && definition.min !== undefined)
        input.min = String(definition.min);
      return { field: labelled(input), value: () => input.value };
    }
  }
}
