import {
  isWholeLineAbsoluteImageReference,
  parseLocalImageReference,
} from "../shared/local-image-reference";

// This is the lowercase-only form of @xterm/addon-web-links 0.12.0's strict
// URL expression (xterm.js f447274f430fd22513f6adbf9862d19524471c04).
// Restty uses it only over core-proven visible text; the retained MIT notice is
// packaged even though xterm.js is no longer a runtime dependency.
const visibleUrlRegex =
  /(?:https?:[/]{2}|file:[/]{3}(?![/]))[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;

export interface VisibleLinkMatch {
  readonly url: string;
  readonly start: number;
  readonly end: number;
}

export function visibleLinkAtOffset(
  text: string,
  offset: number,
  clippedStart = false,
  clippedEnd = false,
): VisibleLinkMatch | undefined {
  if (!Number.isInteger(offset) || offset < 0 || offset >= text.length)
    return undefined;

  const isClipped = (start: number, end: number) =>
    (clippedStart && start === 0) || (clippedEnd && end === text.length);

  // A concealed continuation after literal spaces cannot become a first-token
  // fallback merely because the complete visible prefix ends in whitespace.
  if (
    (clippedStart || clippedEnd) &&
    isWholeLineAbsoluteImageReference(text.trimEnd())
  )
    return undefined;

  if (isWholeLineAbsoluteImageReference(text) && parseLocalImageReference(text))
    return clippedStart || clippedEnd
      ? undefined
      : { url: text, start: 0, end: text.length };

  const reference = referenceAtOffset(text, offset);
  if (reference) {
    if (isClipped(reference.start, reference.end)) return undefined;
    return reference;
  }

  let searched = 0;
  while (searched < text.length) {
    const match = visibleUrlRegex.exec(text.slice(searched));
    if (!match || match.index === undefined) return undefined;
    const start = searched + match.index;
    const end = start + match[0].length;
    if (offset >= start && offset < end) {
      if (isClipped(start, end)) return undefined;
      return { url: match[0], start, end };
    }
    searched = Math.max(end, start + 1);
  }
  return undefined;
}

function referenceAtOffset(
  text: string,
  offset: number,
): VisibleLinkMatch | undefined {
  let start = 0;
  while (start < text.length) {
    if (/\s/u.test(text[start]!)) {
      start++;
      continue;
    }
    let end = start;
    if (text[start] === "'" || text[start] === '"') {
      const close = text.indexOf(text[start]!, start + 1);
      if (close < 0) return undefined;
      end = close + 1;
    }
    while (end < text.length && !/\s/u.test(text[end]!)) end++;
    if (offset >= start && offset < end) {
      const value = text.slice(start, end);
      return parseLocalImageReference(value)
        ? { url: value, start, end }
        : undefined;
    }
    start = end;
  }
  return undefined;
}

const MAX_FILE_TOKEN_LENGTH = 4096;

// The inside of the quoted name ('My File.pdf') around an offset.
function quotedSpanAt(
  text: string,
  offset: number,
): { start: number; end: number } | undefined {
  for (const match of text.matchAll(/(['"])((?:(?!\1).)+)\1/gu)) {
    const from = match.index;
    const to = from + match[0].length;
    if (from > offset) return undefined;
    if (offset < to) return { start: from + 1, end: to - 1 };
  }
  return undefined;
}

// The run of non-blank text around an offset, without stray quotes, an
// `ls -F` type marker or trailing punctuation ("file.txt:", "a.png,").
function bareSpanAt(text: string, offset: number) {
  let start = offset;
  let end = offset + 1;
  while (start > 0 && !/\s/u.test(text[start - 1]!)) start--;
  while (end < text.length && !/\s/u.test(text[end]!)) end++;
  if (/['"]/u.test(text[start]!)) start++;
  if (end - start > 1 && /['"]/u.test(text[end - 1]!)) end--;
  if (end - start > 1 && /[*@=|/]/u.test(text[end - 1]!)) end--;
  while (end - start > 1 && /[:,;)\]]/u.test(text[end - 1]!)) end--;
  return { start, end };
}

const isFileToken = (token: string) =>
  token.length > 0 &&
  token.length <= MAX_FILE_TOKEN_LENGTH &&
  token !== "." &&
  token !== ".." &&
  !/[\p{Cc}\p{Cf}]/u.test(token) &&
  !/^[a-z][a-z0-9+.-]*:\/\//iu.test(token);

// The file name around an offset, as `ls` and most tools print it: a quoted
// name, else the run of non-blank text. This is a lexical guess; the caller
// checks that the file exists.
export function fileTokenAtOffset(
  text: string,
  offset: number,
): VisibleLinkMatch | undefined {
  if (!Number.isInteger(offset) || offset < 0 || offset >= text.length)
    return undefined;
  if (/\s/u.test(text[offset]!)) return undefined;
  const { start, end } = quotedSpanAt(text, offset) ?? bareSpanAt(text, offset);
  const token = text.slice(start, end);
  return isFileToken(token) ? { url: token, start, end } : undefined;
}
