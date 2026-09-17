// This is the lowercase-only form of the previously pinned xterm provider's
// strict URL expression. Restty uses it only over core-proven visible text.
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
