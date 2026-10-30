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
    readonly openOverlay?: (open: () => void, refused?: () => void) => void;
  },
) {
  let disposed = false;
  let finish: ((available: boolean) => void) | undefined;
  const dialog = createSnippetPreview(document, {
    ...(options.language ? { language: options.language } : {}),
    canOpen: () => !options.blocked(),
    focusTerminal: options.focusTerminal,
    onActivityChange(active) {
      if (!active) finish?.(true);
      options.onPreviewActivity();
    },
  });
  const preview = {
    ...dialog,
    dispose() {
      disposed = true;
      finish?.(false);
      dialog.dispose();
    },
  };
  return {
    preview,
    // Resolves when this interaction ends, not when Surface-owned paste ends.
    // A successful preview interaction may have been cancelled by its user.
    request(
      snippet: TerminalSnippet,
      intent: "insert" | "run" | "preview",
      returnFocus: () => boolean = () => false,
      signal?: AbortSignal,
    ): Promise<boolean> {
      if (
        disposed ||
        signal?.aborted ||
        options.blocked() ||
        finish ||
        preview.isActive()
      )
        return Promise.resolve(false);
      // Capture before overlay admission; never recapture in its continuation.
      const target = options.capture();
      if (intent !== "preview") {
        const available = target?.live() === true;
        if (available) target!.deliver(snippet.body, intent === "run");
        options.focusTerminal();
        return Promise.resolve(available);
      }
      if (!target?.live()) return Promise.resolve(false);
      return new Promise((resolve) => {
        let settled = false;
        const done = (available: boolean) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", revoked);
          if (finish === done) finish = undefined;
          resolve(available);
        };
        const revoked = () => done(false);
        finish = done;
        signal?.addEventListener("abort", revoked, { once: true });
        const open = () => {
          if (settled || disposed || signal?.aborted) return done(false);
          preview.open(snippet, target, returnFocus, signal);
          if (!preview.isActive()) done(false);
        };
        try {
          if (options.openOverlay) options.openOverlay(open, () => done(false));
          else open();
        } catch {
          done(false);
        }
      });
    },
  };
}
