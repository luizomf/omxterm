import bundled from "./highlight-rules/ashyterm-rules.json";

export interface HighlightRuleDefinition {
  readonly name: string;
  readonly pattern: string;
  // One SGR color specification per capture group; null leaves it uncolored.
  readonly colors: readonly (string | null)[];
  readonly enabled?: boolean;
  readonly description?: string;
  readonly action?: "next" | "stop";
}

export interface HighlightContextDefinition {
  readonly name: string;
  readonly triggers: readonly string[];
  readonly description?: string;
  readonly useGlobalRules?: boolean;
  readonly enabled?: boolean;
  readonly rules: readonly HighlightRuleDefinition[];
}

export interface HighlightSettings {
  readonly enabled: boolean;
  readonly contextAware: boolean;
  readonly ignoredCommands: readonly string[];
  readonly disabledContexts: readonly string[];
  // "<context>/<rule name>", for example "global/URL (HTTP/S)".
  readonly disabledRules: readonly string[];
  // User rules applied after the global rules.
  readonly customRules: readonly HighlightRuleDefinition[];
}

// AshyTerm's 51 rule sets (486 rules), imported by
// scripts/import-ashyterm-highlights.mjs under its MIT license.
export const BUILTIN_HIGHLIGHT_CONTEXTS = (
  bundled as { readonly contexts: readonly HighlightContextDefinition[] }
).contexts;

// Tools that color their own output or draw full-screen interfaces.
export const DEFAULT_IGNORED_COMMANDS: readonly string[] = [
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "rga",
  "awk",
  "sed",
  "sd",
  "bat",
  "ls",
  "git",
  "vim",
  "nano",
  "nvim",
  "emacs",
  "htop",
  "btop",
  "top",
  "less",
  "more",
  "man",
  "info",
  "diff",
  "colordiff",
  "delta",
  "jq",
  "yq",
  "grc",
  "tmux",
  "screen",
  "ssh",
];

// As in AshyTerm, highlighting is off until the user turns it on.
export const DEFAULT_HIGHLIGHT_SETTINGS: HighlightSettings = Object.freeze({
  enabled: false,
  contextAware: true,
  ignoredCommands: DEFAULT_IGNORED_COMMANDS,
  disabledContexts: [],
  disabledRules: [],
  customRules: [],
});

const MAX_LIST = 1_000;
const MAX_CUSTOM_RULES = 200;
const NAME = /^[^\p{Cc}]{1,128}$/u;

export function validateHighlightSettings(value: unknown): HighlightSettings {
  const record = requireRecord(value);
  const allowed = [
    "enabled",
    "contextAware",
    "ignoredCommands",
    "disabledContexts",
    "disabledRules",
    "customRules",
  ];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new TypeError(`highlights.${unknown} is unknown`);
  return {
    enabled: booleanOr(
      record.enabled,
      DEFAULT_HIGHLIGHT_SETTINGS.enabled,
      "enabled",
    ),
    contextAware: booleanOr(record.contextAware, true, "contextAware"),
    ignoredCommands: names(
      record.ignoredCommands ?? DEFAULT_IGNORED_COMMANDS,
      "ignoredCommands",
    ),
    disabledContexts: names(record.disabledContexts ?? [], "disabledContexts"),
    disabledRules: names(record.disabledRules ?? [], "disabledRules", 260),
    customRules: list(
      record.customRules ?? [],
      "customRules",
      MAX_CUSTOM_RULES,
    ).map((rule, index) =>
      validateHighlightRule(rule, `customRules[${index}]`),
    ),
  };
}

export function validateHighlightRule(
  value: unknown,
  location = "rule",
): HighlightRuleDefinition {
  const record = requireRecord(value, location);
  const allowed = [
    "name",
    "pattern",
    "colors",
    "enabled",
    "description",
    "action",
  ];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) throw new TypeError(`${location}.${unknown} is unknown`);
  if (typeof record.name !== "string" || !NAME.test(record.name))
    throw new TypeError(`${location}.name must be a name`);
  if (
    typeof record.pattern !== "string" ||
    record.pattern.length === 0 ||
    record.pattern.length > 1_000
  )
    throw new TypeError(`${location}.pattern must be a regular expression`);
  try {
    new RegExp(record.pattern, "gid");
  } catch {
    throw new TypeError(`${location}.pattern must be a regular expression`);
  }
  const colors = list(record.colors, `${location}.colors`, 32);
  if (
    colors.length === 0 ||
    !colors.every(
      (color) =>
        color === null ||
        (typeof color === "string" && /^[a-z_ ]{1,64}$/u.test(color)),
    )
  )
    throw new TypeError(`${location}.colors must list color names`);
  if (
    record.action !== undefined &&
    record.action !== "next" &&
    record.action !== "stop"
  )
    throw new TypeError(`${location}.action must be next or stop`);
  return {
    name: record.name,
    pattern: record.pattern,
    colors: colors as (string | null)[],
    ...(record.enabled === false ? { enabled: false } : {}),
    ...(typeof record.description === "string"
      ? { description: record.description.slice(0, 512) }
      : {}),
    ...(record.action === "stop" ? { action: "stop" as const } : {}),
  };
}

function requireRecord(
  value: unknown,
  location = "highlights",
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${location} must be an object`);
  return value as Record<string, unknown>;
}

function booleanOr(
  value: unknown,
  fallback: boolean,
  location: string,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    throw new TypeError(`${location} must be a boolean`);
  return value;
}

function list(
  value: unknown,
  location: string,
  max: number,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new TypeError(`${location} must be a list of at most ${max}`);
  return value;
}

function names(value: unknown, location: string, maxLength = 128): string[] {
  return list(value, location, MAX_LIST).map((item) => {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > maxLength
    )
      throw new TypeError(`${location} must list names`);
    return item;
  });
}
