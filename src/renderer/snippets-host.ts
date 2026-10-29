import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { AuxiliaryViewDefinition } from "./auxiliary-panel";
import { createSnippetPreview } from "./snippet-preview";
import { createSnippetsView } from "./snippets-sidebar";
import type { TerminalTabs } from "./terminal-tabs";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

// Snippets contributes a lazy view and its preview to the window-owned panel.
// Each action captures the selected live terminal, never a later selection.
export function createSnippetsTool(
  document: Document,
  load: () => Promise<TerminalSnippetsResponse>,
  options: {
    readonly tabs: TerminalTabs;
    readonly language?: RendererLanguage;
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
  const view: AuxiliaryViewDefinition = {
    id: "snippets",
    label: (t) => t("snippets.title"),
    create: (isInteractive) =>
      createSnippetsView(document, {
        language,
        loadSnippets: load,
        isInteractive,
        inject: (snippet) => {
          if (options.blocked() || preview.isActive()) return;
          tabs.captureSnippetTarget()?.deliver(snippet.body, snippet.execute);
          tabs.focusSelected();
        },
        preview: (snippet, returnFocus) => {
          const target = tabs.captureSnippetTarget();
          if (target) preview.open(snippet, target, returnFocus);
        },
      }),
  };
  return { view, preview };
}
