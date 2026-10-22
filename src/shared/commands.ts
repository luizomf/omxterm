// Command Manager: reusable command templates with form fields. Values typed
// into a form are quoted for the target shell before substitution, and the
// generated command is always shown before it is inserted or run.
export type CommandFieldType =
  | "text"
  | "text_area"
  | "password"
  | "number"
  | "switch"
  | "dropdown"
  | "radio"
  | "multi_select"
  | "file_path"
  | "directory_path";

export type CommandPlatform = "linux" | "darwin" | "win32";
export type CommandShell = "posix" | "powershell";
export type CommandExecution = "insert" | "execute" | "dialog";

export interface CommandField {
  readonly id: string;
  readonly label: string;
  readonly type: CommandFieldType;
  readonly defaultValue?: string | boolean;
  readonly placeholder?: string;
  readonly hint?: string;
  readonly required?: boolean;
  // switch: text inserted when on / off.
  readonly flag?: string;
  readonly offValue?: string;
  // dropdown, radio, multi_select: [value, label] pairs. Values are inserted
  // verbatim, so they are authored, never typed by the user.
  readonly options?: readonly (readonly [string, string])[];
  // text-like fields: text placed before / after a non-empty quoted value.
  readonly prefix?: string;
  readonly suffix?: string;
  // text_area: each non-empty line becomes its own quoted argument.
  readonly perLine?: boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface CommandDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  // "{field id}" placeholders; text after expansion has spaces collapsed.
  readonly template: string;
  readonly execution: CommandExecution;
  readonly fields: readonly CommandField[];
  readonly platforms?: readonly CommandPlatform[];
  readonly requires?: readonly string[];
  readonly builtin?: boolean;
}

export interface CommandLibraryDocument {
  readonly custom: readonly CommandDefinition[];
  readonly favorites: readonly string[];
  readonly hidden: readonly string[];
}

export type CommandValues = Readonly<
  Record<string, string | boolean | readonly string[]>
>;

const QUOTED_TYPES = new Set<CommandFieldType>([
  "text",
  "text_area",
  "password",
  "file_path",
  "directory_path",
]);

export function shellForPlatform(platform: string): CommandShell {
  return platform === "win32" ? "powershell" : "posix";
}

// Single-quote a value for the shell. POSIX closes and reopens the quote
// around an escaped quote; PowerShell doubles it. Simple words stay bare.
export function quoteForShell(value: string, shell: CommandShell): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value)) return value;
  return shell === "powershell"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export class CommandFieldError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "CommandFieldError";
    this.field = field;
  }
}

// Expands a template with form values. Free text is quoted; option values
// are authored and inserted verbatim; numbers must be finite and in range.
export function buildCommand(
  definition: Pick<CommandDefinition, "template" | "fields">,
  values: CommandValues,
  shell: CommandShell,
): string {
  let command = definition.template;
  for (const field of definition.fields) {
    const value = values[field.id] ?? field.defaultValue ?? "";
    const replacement = fieldText(field, value, shell);
    if (field.required && replacement.trim() === "")
      throw new CommandFieldError(field.id, "required");
    command = command.replaceAll(`{${field.id}}`, replacement);
  }
  return command.replace(/[ \t]+/gu, " ").trim();
}

function fieldText(
  field: CommandField,
  value: string | boolean | readonly string[],
  shell: CommandShell,
): string {
  if (field.type === "switch")
    return value === true || value === "true"
      ? (field.flag ?? "")
      : (field.offValue ?? "");
  if (
    field.type === "multi_select" ||
    field.type === "dropdown" ||
    field.type === "radio"
  )
    return choiceText(field, value);
  const text = String(value);
  if (text === "") return "";
  if (field.type === "number") return numberText(field, text);
  if (!QUOTED_TYPES.has(field.type)) return text;
  const quoted = field.perLine
    ? text
        .split(/\r?\n/u)
        .filter((line) => line.trim() !== "")
        .map((line) => quoteForShell(line.trim(), shell))
        .join(" ")
    : quoteForShell(text, shell);
  if (quoted === "") return "";
  return `${field.prefix ?? ""}${quoted}${field.suffix ?? ""}`;
}

// Only authored option values are ever inserted verbatim.
function choiceText(
  field: CommandField,
  value: string | boolean | readonly string[],
): string {
  const options = (field.options ?? []).map(([option]) => option);
  if (field.type === "multi_select") {
    const chosen = Array.isArray(value) ? value : [];
    return options.filter((option) => chosen.includes(option)).join(" ");
  }
  const text = String(value);
  return options.includes(text) ? text : "";
}

function numberText(field: CommandField, text: string): string {
  const number = Number(text);
  if (!Number.isFinite(number) || !/^-?\d+(?:\.\d+)?$/u.test(text.trim()))
    throw new CommandFieldError(field.id, "number");
  if (
    (field.min !== undefined && number < field.min) ||
    (field.max !== undefined && number > field.max)
  )
    throw new CommandFieldError(field.id, "range");
  return `${field.prefix ?? ""}${text.trim()}`;
}

// Placeholders used by a template, in order, for the custom command editor.
export function templatePlaceholders(template: string): string[] {
  return [
    ...new Set(
      [...template.matchAll(/\{([A-Za-z][A-Za-z0-9_]{0,31})\}/gu)].map(
        (match) => match[1]!,
      ),
    ),
  ];
}

const ID = /^[A-Za-z0-9_-]{1,64}$/u;
const FIELD_TYPES = new Set<CommandFieldType>([
  "text",
  "text_area",
  "password",
  "number",
  "switch",
  "dropdown",
  "radio",
  "multi_select",
  "file_path",
  "directory_path",
]);

export function validateCommandDefinition(
  value: unknown,
  location = "command",
): CommandDefinition {
  const record = requireRecord(value, location);
  const text = (key: string, max: number, required = true) => {
    const item = record[key];
    if (item === undefined && !required) return undefined;
    if (
      typeof item !== "string" ||
      item.length > max ||
      (required && item.trim() === "")
    )
      throw new TypeError(`${location}.${key} must be text`);
    return item;
  };
  const id = text("id", 64)!;
  if (!ID.test(id)) throw new TypeError(`${location}.id must be an identifier`);
  const execution = record.execution;
  if (
    execution !== "insert" &&
    execution !== "execute" &&
    execution !== "dialog"
  )
    throw new TypeError(
      `${location}.execution must be insert, execute or dialog`,
    );
  if (!Array.isArray(record.fields) || record.fields.length > 32)
    throw new TypeError(`${location}.fields must be a list`);
  return {
    id,
    name: text("name", 128)!.trim(),
    description: text("description", 1024, false) ?? "",
    category: (text("category", 64, false) ?? "").trim() || "Custom",
    template: text("template", 8192)!,
    execution,
    fields: record.fields.map((field, index) =>
      validateField(field, `${location}.fields[${index}]`),
    ),
  };
}

function validateField(value: unknown, location: string): CommandField {
  const record = requireRecord(value, location);
  if (
    typeof record.id !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]{0,31}$/u.test(record.id)
  )
    throw new TypeError(`${location}.id must be an identifier`);
  if (
    typeof record.label !== "string" ||
    record.label.trim() === "" ||
    record.label.length > 128
  )
    throw new TypeError(`${location}.label must be text`);
  if (!FIELD_TYPES.has(record.type as CommandFieldType))
    throw new TypeError(`${location}.type is unknown`);
  const options = record.options;
  if (
    options !== undefined &&
    !(
      Array.isArray(options) &&
      options.length <= 64 &&
      options.every(
        (pair) =>
          Array.isArray(pair) &&
          pair.length === 2 &&
          pair.every((part) => typeof part === "string" && part.length <= 256),
      )
    )
  )
    throw new TypeError(`${location}.options must be value/label pairs`);
  const optional = (key: string) =>
    typeof record[key] === "string" && (record[key] as string).length <= 256
      ? { [key]: record[key] as string }
      : {};
  return {
    id: record.id,
    label: record.label.trim(),
    type: record.type as CommandFieldType,
    ...(typeof record.defaultValue === "string" ||
    typeof record.defaultValue === "boolean"
      ? { defaultValue: record.defaultValue }
      : {}),
    ...optional("placeholder"),
    ...optional("hint"),
    ...optional("flag"),
    ...optional("offValue"),
    ...optional("prefix"),
    ...optional("suffix"),
    ...(record.perLine === true ? { perLine: true } : {}),
    ...(record.required === true ? { required: true } : {}),
    ...(options ? { options: options as [string, string][] } : {}),
    ...(typeof record.min === "number" ? { min: record.min } : {}),
    ...(typeof record.max === "number" ? { max: record.max } : {}),
  };
}

export function validateCommandLibrary(value: unknown): CommandLibraryDocument {
  const record = requireRecord(value, "commands");
  const ids = (key: string) => {
    const list = record[key] ?? [];
    if (
      !Array.isArray(list) ||
      list.length > 1000 ||
      !list.every((item) => typeof item === "string" && ID.test(item))
    )
      throw new TypeError(`commands.${key} must list identifiers`);
    return list as string[];
  };
  const custom = record.custom ?? [];
  if (!Array.isArray(custom) || custom.length > 500)
    throw new TypeError("commands.custom must be a list");
  const commands = custom.map((item, index) =>
    validateCommandDefinition(item, `commands.custom[${index}]`),
  );
  if (new Set(commands.map((command) => command.id)).size !== commands.length)
    throw new TypeError("commands.custom contains duplicate ids");
  return {
    custom: commands,
    favorites: ids("favorites"),
    hidden: ids("hidden"),
  };
}

function requireRecord(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${location} must be an object`);
  return value as Record<string, unknown>;
}
