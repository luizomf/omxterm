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
    return { unsubscribe };
  } catch (error) {
    panel.remove(tool.view.id);
    throw error;
  }
}

// Snippets contributes a lazy view to the window-owned panel.
// Each action captures the selected live terminal, never a later selection.
export function createSnippetsTool(
  document: Document,
  load: () => Promise<TerminalSnippetsResponse>,
  options: {
    readonly tabs: TerminalTabs;
    readonly language?: RendererLanguage;
    // Whether another overlay (About, Local Image Preview) owns input.
    readonly blocked: () => boolean;
    readonly input?: ReturnType<typeof createSemanticInput>;
  },
) {
  const { tabs } = options;
  const language = options.language ?? englishLanguage;
  const input =
    options.input ??
    createSemanticInput({
      capture: tabs.captureSnippetTarget,
      blocked: options.blocked,
      focusTerminal: tabs.focusSelected,
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
          void input.request(snippet, snippet.execute ? "run" : "insert");
        },
      }),
  };
  return { view };
}
