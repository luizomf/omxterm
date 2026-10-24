import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import { createAuxiliaryPanel, type AuxiliaryPanel } from "./auxiliary-panel";
import type { RendererLanguage } from "./renderer-language";
import { createSnippetsView } from "./snippets-sidebar";
import type { TerminalTabs } from "./terminal-tabs";

// The auxiliary host with Snippets as its first view (#635, #652).
export function createSnippetsPanel(
  document: Document,
  snippets: {
    readonly element: HTMLElement;
    readonly load: () => Promise<TerminalSnippetsResponse>;
  },
  options: {
    readonly tabs: TerminalTabs;
    readonly language: RendererLanguage;
    readonly blocked: () => boolean;
    readonly clipboard?: TerminalClipboard | undefined;
  },
): AuxiliaryPanel {
  const { tabs, language } = options;
  const panel = createAuxiliaryPanel(snippets.element, {
    content: snippets.element.parentElement!,
    focusTerminal: tabs.focusSelected,
    language,
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
    views: [
      {
        id: "snippets",
        label: (t) => t("snippets.title"),
        create: (isInteractive) =>
          createSnippetsView(document, {
            language,
            loadSnippets: snippets.load,
            isInteractive,
            inject: (snippet) => {
              if (options.blocked()) return;
              tabs.injectSnippet(snippet.body, { submit: snippet.execute });
              tabs.focusSelected();
            },
          }),
      },
    ],
  });
  panel.setBlocked(options.blocked());
  return panel;
}
