import { WebLinksAddon } from "@xterm/addon-web-links";
import type { Terminal } from "@xterm/xterm";

// This is the lowercase-only form of the provider's pinned 0.12.0 strict URL
// expression. The provider remains responsible for the complete visible span.
const visibleWebUrlRegex =
  /https?:[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;

export function ignoreOscLinks(terminal: Terminal): { dispose(): void } {
  return terminal.parser.registerOscHandler(8, () => true);
}

export function registerVisibleWebLinks(
  terminal: Terminal,
  requestActivation: (url: string) => void,
): WebLinksAddon {
  const addon = new WebLinksAddon(
    (event, url) => {
      if ((event.metaKey || event.ctrlKey) && event.button === 0)
        requestActivation(url);
    },
    { urlRegex: visibleWebUrlRegex },
  );
  terminal.loadAddon(addon);
  return addon;
}
