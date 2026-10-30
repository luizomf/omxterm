import type { TerminalSnippet } from "../shared/terminal-snippets";
import { createSnippetPreview } from "./snippet-preview";
import type { SnippetTarget } from "./snippet-target";
import type { RendererLanguage } from "./renderer-language";

/** Core owns capture and delivery; callers supply intent, never a target. */
export function createSemanticInput(
  document: Document,
  options: {
    readonly capture: () => SnippetTarget | undefined;
    readonly blocked: () => boolean;
    readonly focusTerminal: () => void;
    readonly onPreviewActivity: () => void;
    readonly language?: RendererLanguage;
    readonly openOverlay?: (open: () => void) => void;
  },
) {
  let disposed = false;
  const dialog = createSnippetPreview(document, {
    ...(options.language ? { language: options.language } : {}),
    canOpen: () => !options.blocked(),
    focusTerminal: options.focusTerminal,
    onActivityChange: options.onPreviewActivity,
  });
  const preview = {
    ...dialog,
    dispose() {
      disposed = true;
      dialog.dispose();
    },
  };
  return {
    preview,
    request(
      snippet: TerminalSnippet,
      intent: "insert" | "run" | "preview",
      returnFocus: () => boolean = () => false,
      signal?: AbortSignal,
    ) {
      if (
        disposed ||
        signal?.aborted ||
        options.blocked() ||
        preview.isActive()
      )
        return;
      // Capture before overlay admission; never recapture in its continuation.
      const target = options.capture();
      if (intent !== "preview") {
        if (target?.live()) target.deliver(snippet.body, intent === "run");
        options.focusTerminal();
        return;
      }
      if (!target?.live()) return;
      const open = () => {
        if (!signal?.aborted)
          preview.open(snippet, target, returnFocus, signal);
      };
      if (options.openOverlay) options.openOverlay(open);
      else open();
    },
  };
}
