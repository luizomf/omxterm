import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILinkHandler, Terminal } from "@xterm/xterm";

// This is the lowercase-only form of the provider's pinned 0.12.0 strict URL
// expression. The provider remains responsible for the complete visible span.
const visibleWebUrlRegex =
  /https?:[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;

export const ignoredOscLinkHandler: ILinkHandler = {
  activate() {},
};

export function registerVisibleWebLinks(
  terminal: Terminal,
  requestActivation: (url: string) => void,
): WebLinksAddon {
  const addon = new WebLinksAddon(
    (event, url) => {
      if (event.metaKey && event.button === 0) requestActivation(url);
    },
    { urlRegex: visibleWebUrlRegex },
  );
  terminal.loadAddon(addon);
  return addon;
}
