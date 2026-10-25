import type { TerminalSnippet } from "../shared/terminal-snippets";
import { retainDismissalGesture } from "./about/about-dialog";
import type { SnippetTarget } from "./snippet-target";
import {
  englishLanguage,
  type RendererLanguage,
  type Translate,
} from "./renderer-language";

export type SnippetPreview = ReturnType<typeof createSnippetPreview>;

// A temporary, read-only view of one snippet's exact body. Its Insert or Run
// choice is final regardless of the snippet's default, accepted once, and
// delivered only to the terminal captured when the preview opened.
export function createSnippetPreview(
  document: Document,
  options: {
    // Another overlay owns input; competing opens are ignored, not queued.
    readonly canOpen: () => boolean;
    readonly language?: RendererLanguage;
    readonly onActivityChange: (active: boolean) => void;
    readonly focusTerminal: () => void;
  },
) {
  const language = options.language ?? englishLanguage;
  let relabel: ((t: Translate) => void) | undefined;
  const unbindLabels = language.bind((t) => relabel?.(t));
  let dialog: HTMLDialogElement | undefined;
  let disposed = false;
  let stopWatching: (() => void) | undefined;
  const keyboard = retainDismissalGesture(document);

  const close = () => {
    const previous = dialog;
    if (!previous) return false;
    dialog = undefined;
    relabel = undefined;
    stopWatching?.();
    stopWatching = undefined;
    previous.close();
    previous.remove();
    options.onActivityChange(false);
    return true;
  };

  return {
    isActive: () => dialog !== undefined,
    // returnFocus restores the control that opened the preview when it can
    // still take focus, and reports false so the terminal gets focus instead.
    open(
      snippet: TerminalSnippet,
      target: SnippetTarget,
      returnFocus: () => boolean,
    ) {
      if (disposed || dialog || !options.canOpen() || !target.live()) return;
      const current = document.createElement("dialog");
      dialog = current;
      current.className = "snippet-preview";
      current.setAttribute("aria-labelledby", "snippet-preview-title");
      const title = document.createElement("h2");
      title.id = "snippet-preview-title";
      title.textContent = snippet.name;
      const description = document.createElement("p");
      description.className = "snippet-preview-description";
      description.textContent = snippet.description ?? "";
      description.hidden = !snippet.description;
      // The stored string as-is: never trimmed, normalized or read back.
      const body = document.createElement("pre");
      body.className = "snippet-preview-body";
      body.textContent = snippet.body;
      body.tabIndex = 0;
      const closed = document.createElement("p");
      closed.className = "snippet-preview-closed";
      closed.setAttribute("role", "status");
      const actions = document.createElement("div");
      actions.className = "snippet-preview-actions";
      const button = (text: string, className: string) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = className;
        element.textContent = text;
        actions.append(element);
        return element;
      };
      const cancel = button("", "snippet-preview-cancel");
      const insert = button("", "snippet-preview-insert");
      const run = button("", "snippet-preview-run");
      let unavailable = false;
      relabel = (t) => {
        body.setAttribute("aria-label", t("snippetPreview.body"));
        cancel.textContent = t("common.cancel");
        insert.textContent = t("snippetPreview.insert");
        run.textContent = t("snippetPreview.run");
        closed.textContent = unavailable ? t("snippetPreview.unavailable") : "";
      };
      relabel(language.t);

      const cancelPreview = () => {
        if (dialog !== current || !close()) return;
        if (!returnFocus()) options.focusTerminal();
      };
      const accept = (submit: boolean) => {
        if (dialog !== current || !target.live()) return;
        close();
        target.deliver(snippet.body, submit);
        options.focusTerminal();
      };
      const refresh = () => {
        if (dialog !== current || target.live()) return;
        insert.disabled = true;
        run.disabled = true;
        unavailable = true;
        relabel?.(language.t);
      };
      stopWatching = target.onUnavailable(refresh);

      cancel.addEventListener("click", cancelPreview);
      insert.addEventListener("click", () => accept(false));
      run.addEventListener("click", () => accept(true));
      current.addEventListener("cancel", (event) => {
        event.preventDefault();
        cancelPreview();
      });
      current.addEventListener("keydown", (event) => {
        if (event.target instanceof HTMLButtonElement)
          keyboard.track(event, event.target);
        else if (event.key === "Escape") keyboard.track(event, cancel);
        event.stopPropagation();
      });
      current.append(title, description, body, closed, actions);
      document.body.append(current);
      options.onActivityChange(true);
      current.showModal();
      (snippet.execute ? run : insert).focus();
    },
    // Owner disposal removes the preview without delivering or moving focus.
    dispose() {
      disposed = true;
      unbindLabels();
      keyboard.dispose();
      close();
    },
  };
}
