import {
  commandName,
  type CompiledRule,
  type CompiledRuleSet,
} from "./highlight-rules";
import { createVtTokenizer, type VtToken } from "./vt-tokenizer";
import { createLineModel } from "./line-model";
import { createSgrState } from "./sgr-state";

export interface OutputHighlighter {
  // Returns the chunk with SGR inserted around matches in complete lines.
  // Bytes are never removed, reordered or held back.
  transform(chunk: string): string;
  // Keyboard input typed into the same pane; Enter selects command rules.
  userInput(text: string): void;
  // Text OMXTerm types for the user, such as a snippet or a Command Manager
  // command. Its echo arrives later, so a submitted command selects its
  // rules from the text itself.
  injected(text: string, submit: boolean): void;
}

export const MAX_HIGHLIGHT_LINE_LENGTH = 2_048;
export const LARGE_CHUNK_LENGTH = 4_096;
export const BURST_CHUNKS = 8;
export const SLOW_CHUNK_MS = 12;
export const SLOW_BACKOFF_MS = 1_000;
const MAX_SPANS = 128;
const RESET = "\u001b[0m";
// Control characters other than tab make a line's layout unpredictable.
const LAYOUT_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/u;

interface Span {
  readonly start: number;
  readonly end: number;
  readonly sgr: string;
}

// Controls that neither print nor move the cursor sideways, so text after
// them still starts at column 0: SGR, private mode switches, and every OSC
// except OSC 8 hyperlinks (titles, OSC 7 directories, OSC 133/633 prompt
// marks, systemd's OSC 3008 context markers, ...).
export function isNeutralControl(
  token: Extract<VtToken, { kind: "control" }>,
): boolean {
  const csi = token.csi;
  if (csi)
    return (
      csi.final === "m" ||
      (csi.prefix === "?" && (csi.final === "h" || csi.final === "l"))
    );
  const osc = /^\u001b\](\d+)[;\u0007\u001b]/u.exec(token.text);
  return osc !== null && osc[1] !== "8";
}

// One output line being assembled. Neutral controls and carriage returns
// before the first printable character form a raw prefix that is always
// emitted unchanged; only the content after it is ever colored.
interface LineRecord {
  raw: string;
  prefix: string;
  content: string;
  // Content started, or a control that moves the cursor appeared.
  dirty: boolean;
  // The line began at column 0 (a known line start).
  readonly eligible: boolean;
  colorable: boolean;
}

export function createOutputHighlighter(options: {
  readonly rules: () => CompiledRuleSet | undefined;
  readonly now?: () => number;
}): OutputHighlighter {
  const now = options.now ?? (() => performance.now());
  const tokenizer = createVtTokenizer();
  const screen = createLineModel();
  let alternateScreen = false;
  let bracketedPaste = false;
  const attributes = createSgrState();
  let atLineStart = true;
  let consecutiveLarge = 0;
  let backoffUntil = 0;
  let command: string | undefined;

  // Mode and attribute changes are tracked even while highlighting is off,
  // so turning it on mid-stream never colors inside a TUI or a colored run.
  const observe = (token: Extract<VtToken, { kind: "control" }>) => {
    const csi = token.csi;
    if (!csi) return;
    if (csi.final === "m") {
      attributes.apply(csi.parameters);
      return;
    }
    if (csi.prefix === "?" && (csi.final === "h" || csi.final === "l")) {
      const modes = csi.parameters.split(";");
      if (modes.some((mode) => ["1049", "1047", "47"].includes(mode)))
        alternateScreen = csi.final === "h";
      return;
    }
    if (csi.final === "~" && csi.parameters === "200") bracketedPaste = true;
    if (csi.final === "~" && csi.parameters === "201") bracketedPaste = false;
  };
  const plainState = () =>
    attributes.isDefault() && !alternateScreen && !bracketedPaste;
  const freshLine = (eligible: boolean): LineRecord => ({
    raw: "",
    prefix: "",
    content: "",
    dirty: false,
    eligible,
    colorable: eligible && plainState(),
  });

  const addControl = (
    line: LineRecord,
    token: Extract<VtToken, { kind: "control" }>,
  ) => {
    observe(token);
    screen.control(token);
    line.raw += token.text;
    if (!line.dirty && isNeutralControl(token)) {
      line.prefix += token.text;
      line.colorable &&= plainState();
      // An SGR reset makes a line that began in color colorable again.
      if (token.csi?.final === "m" && line.raw === line.prefix)
        line.colorable = line.eligible && plainState();
    } else {
      line.dirty = true;
      line.colorable = false;
    }
  };
  const addText = (line: LineRecord, part: string) => {
    screen.text(part);
    line.raw += part;
    if (line.dirty) {
      line.content += part;
      return;
    }
    const leading = /^\r*/u.exec(part)![0];
    line.prefix += leading;
    const rest = part.slice(leading.length);
    if (rest.length === 0) return;
    line.dirty = true;
    line.content += rest;
  };

  // Splits a chunk into lines and finishes each complete one.
  const process = (
    tokens: readonly VtToken[],
    finish: (line: LineRecord) => string,
  ): string => {
    let output = "";
    let line = freshLine(atLineStart);
    for (const token of tokens) {
      if (token.kind === "control") {
        addControl(line, token);
        continue;
      }
      const parts = token.text.split("\n");
      parts.forEach((part, index) => {
        addText(line, part);
        if (index === parts.length - 1) return;
        output += `${finish(line)}\n`;
        screen.text("\n");
        line = freshLine(true);
      });
    }
    atLineStart = !line.dirty && !tokenizer.inSequence();
    return output + line.raw;
  };

  return {
    transform(chunk) {
      const started = now();
      const tokens = tokenizer.tokenize(chunk);
      consecutiveLarge =
        chunk.length > LARGE_CHUNK_LENGTH ? consecutiveLarge + 1 : 0;
      const rules = options.rules()?.rulesFor(command);
      if (
        !rules ||
        rules.length === 0 ||
        consecutiveLarge > BURST_CHUNKS ||
        started < backoffUntil
      ) {
        process(tokens, (line) => line.raw);
        return chunk;
      }
      const output = process(tokens, (line) =>
        line.colorable
          ? (highlightLine(line.prefix, line.content, rules) ?? line.raw)
          : line.raw,
      );
      if (now() - started > SLOW_CHUNK_MS)
        backoffUntil = now() + SLOW_BACKOFF_MS;
      return output;
    },
    userInput(input) {
      if (input.includes("\r")) {
        command = screen.command(commandName);
        screen.commandSubmitted();
        return;
      }
      if (input === "\u0003") screen.commandSubmitted();
      else screen.typing();
    },
    injected(text, submit) {
      if (!submit) {
        screen.typing();
        return;
      }
      const lines = text.split(/\r?\n/u).filter((line) => line.trim());
      command = commandName(lines.at(-1) ?? "", true);
      screen.commandSubmitted();
    },
  };
}

// The colored line, or undefined to keep the raw bytes.
function highlightLine(
  prefix: string,
  text: string,
  rules: readonly CompiledRule[],
): string | undefined {
  // A CRLF ending keeps its carriage return outside the colored text.
  const ending = text.endsWith("\r") ? "\r" : "";
  const content = ending ? text.slice(0, -1) : text;
  if (
    content.length === 0 ||
    content.length > MAX_HIGHLIGHT_LINE_LENGTH ||
    LAYOUT_CONTROL.test(content)
  )
    return undefined;
  const spans = matchSpans(content, rules);
  if (spans.length === 0) return undefined;
  let result = prefix;
  let position = 0;
  for (const span of spans) {
    result += `${content.slice(position, span.start)}\u001b[${span.sgr}m${content.slice(span.start, span.end)}${RESET}`;
    position = span.end;
  }
  return `${result}${content.slice(position)}${ending}`;
}

// Capture group i takes colors[i - 1] (the last color repeats); a rule
// without groups colors its whole match. Earlier and longer spans win.
export function matchSpans(
  text: string,
  rules: readonly CompiledRule[],
): Span[] {
  const candidates: Span[] = [];
  for (const rule of rules) {
    let matched = false;
    for (const match of text.matchAll(rule.expression)) {
      if (match[0].length === 0) continue;
      matched = true;
      candidates.push(...matchRanges(match, rule));
      if (candidates.length > MAX_SPANS) break;
    }
    if (matched && rule.stop) break;
  }
  candidates.sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const spans: Span[] = [];
  let end = 0;
  for (const span of candidates) {
    if (span.start < end) continue;
    spans.push(span);
    end = span.end;
  }
  return spans;
}

function matchRanges(match: RegExpExecArray, rule: CompiledRule): Span[] {
  if (match.length === 1) {
    const sgr = rule.colors[0];
    return sgr
      ? [{ start: match.index, end: match.index + match[0].length, sgr }]
      : [];
  }
  const spans: Span[] = [];
  for (let group = 1; group < match.length; group += 1) {
    const range = match.indices?.[group];
    const sgr = rule.colors[Math.min(group - 1, rule.colors.length - 1)];
    if (range && sgr && range[1] > range[0])
      spans.push({ start: range[0], end: range[1], sgr });
  }
  return spans;
}
