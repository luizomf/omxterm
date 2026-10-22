import type {
  HighlightContextDefinition,
  HighlightRuleDefinition,
  HighlightSettings,
} from "../../shared/highlight-settings";
import { colorSpecSgr } from "./highlight-colors";

export interface CompiledRule {
  readonly name: string;
  readonly expression: RegExp;
  // SGR parameters per capture group (index 0: whole match when no groups).
  readonly colors: readonly (string | undefined)[];
  readonly stop: boolean;
}

export interface CompiledRuleSet {
  readonly global: readonly CompiledRule[];
  // Rules for a command, undefined when the command is ignored.
  rulesFor(command: string | undefined): readonly CompiledRule[] | undefined;
}

export const MAX_PATTERN_LENGTH = 1_000;

// Rejects patterns that do not compile, match the empty string everywhere,
// or take too long on a pathological line. Built-in rules are trusted; this
// guards user rules, since JavaScript expressions cannot be interrupted.
export function checkPattern(
  pattern: string,
  now: () => number = () => performance.now(),
): "valid" | "invalid" | "unsafe" {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH)
    return "invalid";
  let expression: RegExp;
  try {
    expression = new RegExp(pattern, "gid");
  } catch {
    return "invalid";
  }
  // Nested unbounded quantifiers are the classic catastrophic shape.
  if (/\((?:[^()\\]|\\.)*[+*}]\)[+*{]/u.test(pattern)) return "unsafe";
  const started = now();
  for (const probe of [
    "a".repeat(1000),
    `${"a".repeat(30)}!`,
    " ".repeat(500),
  ]) {
    expression.lastIndex = 0;
    expression.test(probe);
    if (now() - started > 50) return "unsafe";
  }
  return "valid";
}

function compileRule(rule: HighlightRuleDefinition): CompiledRule | undefined {
  if (rule.enabled === false) return undefined;
  let expression: RegExp;
  try {
    expression = new RegExp(rule.pattern, "gid");
  } catch {
    return undefined;
  }
  const colors = rule.colors.map((color) =>
    color === null ? undefined : colorSpecSgr(color),
  );
  if (colors.every((color) => color === undefined)) return undefined;
  return { name: rule.name, expression, colors, stop: rule.action === "stop" };
}

export function compileRuleSet(
  contexts: readonly HighlightContextDefinition[],
  settings: HighlightSettings,
): CompiledRuleSet {
  const disabledRules = new Set(settings.disabledRules);
  const disabledContexts = new Set(settings.disabledContexts);
  const ignored = new Set(
    settings.ignoredCommands.map((command) => command.toLowerCase()),
  );
  const compileList = (
    context: string,
    rules: readonly HighlightRuleDefinition[],
  ) =>
    rules
      .filter((rule) => !disabledRules.has(`${context}/${rule.name}`))
      .map(compileRule)
      .filter((rule): rule is CompiledRule => rule !== undefined);

  const globalContext = contexts.find((context) => context.name === "global");
  const global = [
    ...(globalContext && !disabledContexts.has("global")
      ? compileList("global", globalContext.rules)
      : []),
    ...compileList("custom", settings.customRules),
  ];
  // Later contexts win shared triggers (AshyTerm's load order behaves alike).
  const byTrigger = new Map<string, readonly CompiledRule[]>();
  if (settings.contextAware)
    for (const context of contexts) {
      if (
        context.name === "global" ||
        context.enabled === false ||
        disabledContexts.has(context.name)
      )
        continue;
      const rules = compileList(context.name, context.rules);
      const combined = context.useGlobalRules ? [...global, ...rules] : rules;
      for (const trigger of context.triggers)
        byTrigger.set(trigger.toLowerCase(), combined);
    }
  return {
    global,
    rulesFor(command) {
      if (command === undefined) return global;
      if (ignored.has(command)) return undefined;
      return byTrigger.get(command) ?? global;
    },
  };
}

// Text after the last prompt terminator, as AshyTerm reads the command line.
const PROMPT_TERMINATOR = /[$#%>➜❯ᐅ❮›»▶λ∴⟩⟫⮞→➤➔⇒]\s?/gu;
const PREFIX_COMMANDS = new Set([
  "sudo",
  "time",
  "env",
  "nice",
  "nohup",
  "strace",
  "ltrace",
  "doas",
  "pkexec",
  "command",
  "builtin",
  "exec",
  "watch",
]);
const SHELL_KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "for",
  "case",
  "in",
  "!",
  "{",
  "(",
]);

// The program a command line runs: the last pipeline segment, skipping
// assignments, flags, prefix commands and keywords; "--help", "-h", "help"
// and "man" select the help context. Paths reduce to their basename.
export function commandName(
  line: string,
  fromPrompt = false,
): string | undefined {
  let command = line;
  if (!fromPrompt) {
    let last: RegExpExecArray | undefined;
    for (const match of line.matchAll(PROMPT_TERMINATOR)) last = match;
    if (!last) return undefined;
    command = line.slice(last.index + last[0].length);
  }
  const segment = command.split("|").at(-1)!.trim();
  const tokens = segment.split(/\s+/u).filter((token) => token.length > 0);
  if (tokens.includes("--help") || tokens.includes("-h")) return "help";
  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(token) || token.startsWith("-"))
      continue;
    const name = token.replace(/^.*[\\/]/u, "").toLowerCase();
    if (PREFIX_COMMANDS.has(name) || SHELL_KEYWORDS.has(name)) continue;
    if (name === "help" || name === "man") return "help";
    return name.length > 0 && name.length <= 64 ? name : undefined;
  }
  return undefined;
}
