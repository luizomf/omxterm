import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import { createAuxiliaryPanel } from "./auxiliary-panel";
import { createSnippetPreview } from "./snippet-preview";
import { createSnippetsView } from "./snippets-sidebar";
import type { TerminalTabs } from "./terminal-tabs";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

// The window's Snippets panel and its preview. Each action captures the selected
// live terminal when the user acts, never a later selection.
export function mountSnippetsPanel(
  document: Document,
  snippets: {
    readonly element: HTMLElement;
    readonly load: () => Promise<TerminalSnippetsResponse>;
  },
  options: {
    readonly tabs: TerminalTabs;
    readonly language?: RendererLanguage;
    readonly clipboard?: TerminalClipboard | undefined;
    // Whether another overlay (About, Local Image Preview) owns input.
    readonly blocked: () => boolean;
    readonly onPreviewActivity: () => void;
  },
) {
  const { tabs } = options;
  const language = options.language ?? englishLanguage;
  const preview = createSnippetPreview(document, {
    language,
    canOpen: () => !options.blocked(),
    focusTerminal: tabs.focusSelected,
    onActivityChange: options.onPreviewActivity,
  });
  const panel = createAuxiliaryPanel(snippets.element, {
    language,
    content: snippets.element.parentElement!,
    focusTerminal: tabs.focusSelected,
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
              if (options.blocked() || preview.isActive()) return;
              tabs
                .captureSnippetTarget()
                ?.deliver(snippet.body, snippet.execute);
              tabs.focusSelected();
            },
            preview: (snippet, returnFocus) => {
              const target = tabs.captureSnippetTarget();
              if (target) preview.open(snippet, target, returnFocus);
            },
          }),
      },
    ],
  });
  return { panel, preview };
}
