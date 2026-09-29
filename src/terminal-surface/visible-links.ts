import { parseLocalImageReference } from "../shared/local-image-reference";

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

  const reference = referenceAtOffset(text, offset);
  if (reference) {
    if (
      (clippedStart && reference.start === 0) ||
      (clippedEnd && reference.end === text.length)
    )
      return undefined;
    return reference;
  }

  let searched = 0;
  while (searched < text.length) {
    const match = visibleUrlRegex.exec(text.slice(searched));
    if (!match || match.index === undefined) return undefined;
    const start = searched + match.index;
    const end = start + match[0].length;
    if (offset >= start && offset < end) {
      if ((clippedStart && start === 0) || (clippedEnd && end === text.length))
        return undefined;
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
