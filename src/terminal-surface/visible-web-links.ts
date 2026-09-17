import { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

// This is the lowercase-only form of the provider's pinned 0.12.0 strict URL
// expression. The provider remains responsible for the complete visible span.
const visibleWebUrlRegex =
  /https?:[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;

export interface VisibleWebLinkMatch {
  readonly url: string;
  readonly start: number;
  readonly end: number;
}

export function visibleWebLinkAtOffset(
  text: string,
  offset: number,
  clippedStart = false,
  clippedEnd = false,
): VisibleWebLinkMatch | undefined {
  if (!Number.isInteger(offset) || offset < 0 || offset >= text.length)
    return undefined;
  let searched = 0;
  while (searched < text.length) {
    const match = visibleWebUrlRegex.exec(text.slice(searched));
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

export function ignoreOscLinks(terminal: Terminal): { dispose(): void } {
  return terminal.parser.registerOscHandler(8, () => true);
}

export function registerVisibleWebLinks(
  terminal: Terminal,
  requestActivation: (url: string) => void,
  platform: string = navigator.platform,
): WebLinksAddon {
  const addon = new WebLinksAddon(
    (event, url) => {
      const modifier = platform.startsWith("Mac")
        ? event.metaKey
        : event.ctrlKey;
      if (modifier && event.button === 0) requestActivation(url);
    },
    { urlRegex: visibleWebUrlRegex },
  );
  terminal.loadAddon(addon);
  return addon;
}
