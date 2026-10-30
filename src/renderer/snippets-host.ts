import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type {
  AuxiliaryPanel,
  AuxiliaryViewDefinition,
} from "./auxiliary-panel";
import { createSemanticInput } from "./semantic-input";
import { createSnippetsView } from "./snippets-sidebar";
import type { TerminalTabs } from "./terminal-tabs";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

export interface WindowSnippetsSource {
  readonly load: () => Promise<TerminalSnippetsResponse>;
  readonly subscribeToToggle: (listener: () => void) => () => void;
}

// Register the optional tool, including its toggle and partial-setup cleanup.
export function mountWindowSnippets(
  document: Document,
  panel: AuxiliaryPanel | undefined,
  source: WindowSnippetsSource | undefined,
  options: Parameters<typeof createSnippetsTool>[2],
) {
  panel?.setBlocked(options.blocked());
  if (!panel || !source) return undefined;
  const tool = createSnippetsTool(document, source.load, options);
  try {
    panel.register(tool.view);
    const unsubscribe = source.subscribeToToggle(() => {
      if (options.tabs.isTerminalSelected()) panel.toggle(tool.view.id);
    });
    return { preview: tool.preview, unsubscribe };
  } catch (error) {
    panel.remove(tool.view.id);
    tool.preview.dispose();
    throw error;
  }
}

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
    readonly openOverlay?: (open: () => void) => void;
  },
) {
  const { tabs } = options;
  const language = options.language ?? englishLanguage;
  const input = createSemanticInput(document, {
    language,
    capture: tabs.captureSnippetTarget,
    blocked: options.blocked,
    focusTerminal: tabs.focusSelected,
    onPreviewActivity: options.onPreviewActivity,
    ...(options.openOverlay ? { openOverlay: options.openOverlay } : {}),
  });
  const { preview } = input;
  const view: AuxiliaryViewDefinition = {
    id: "snippets",
    label: (t) => t("snippets.title"),
    create: (isInteractive) =>
      createSnippetsView(document, {
        language,
        loadSnippets: load,
        isInteractive,
        inject: (snippet) => {
          input.request(snippet, snippet.execute ? "run" : "insert");
        },
        preview: (snippet, returnFocus) => {
          input.request(snippet, "preview", returnFocus);
        },
      }),
  };
  return { view, preview };
}
