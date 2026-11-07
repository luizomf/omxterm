import type { TerminalSnippet } from "../shared/terminal-snippets";
import { createSnippetPreview } from "./snippet-preview";
import type { SnippetTarget } from "./snippet-target";
import type { RendererLanguage } from "./renderer-language";

type InputSource = string | { source: string; target: SnippetTarget };
function focusArguments(
  source?: InputSource,
): [source?: string, drop?: boolean] {
  if (typeof source === "object") return [source.source, true];
  return source ? [source] : [];
}

/** Core owns capture and delivery; packages supply intent, never a target. */
export function createSemanticInput(
  document: Document,
  options: {
    readonly capture: () => SnippetTarget | undefined;
    readonly blocked: () => boolean;
    readonly focusTerminal: () => void;
    readonly focusCapturedTarget?: (
      target: SnippetTarget,
      source?: string,
      drop?: boolean,
    ) => void;
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
      waitForDelivery = false,
      source?: InputSource,
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
      const capturedDrop =
        typeof source === "object" ? source.target : undefined;
      const focusSource = focusArguments(source);
      const target = capturedDrop ?? options.capture();
      if (intent !== "preview") {
        if (!target?.live() || (capturedDrop && !target.isCurrent?.()))
          return Promise.resolve(false);
        if (waitForDelivery) {
          if (!target.deliverAndReport) return Promise.resolve(false);
          try {
            return target.deliverAndReport(snippet.body).then(
              (delivered) => {
                if (
                  delivered === true &&
                  !signal?.aborted &&
                  target.isCurrent?.()
                ) {
                  options.focusCapturedTarget?.(target, ...focusSource);
                }
                return delivered === true;
              },
              () => false,
            );
          } catch {
            return Promise.resolve(false);
          }
        }
        void target.deliver(snippet.body, intent === "run");
        options.focusTerminal();
        return Promise.resolve(true);
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
