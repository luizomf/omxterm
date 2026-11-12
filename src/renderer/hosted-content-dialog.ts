import { retainDismissalGesture } from "./about/about-dialog";
import type { HostedContentSlot } from "./hosted-content-presentation";
import type { RendererLanguage } from "./renderer-language";

export interface HostedDialog extends HostedContentSlot {
  // Shown means the dialog owns the native presenter; a hidden dialog keeps
  // its view alive until it is closed or retired.
  shown: boolean;
  closing: boolean;
  removed: boolean;
  show(): void;
  hide(): void;
  dispose(): void;
}

// The host-drawn frame around a dialog-presented extension view: a title,
// Close and the slot the native view fills. The view draws only its content.
export function createHostedDialogFrame(
  document: Document,
  options: {
    id: string;
    title: string;
    language: RendererLanguage;
    close(): void;
  },
): HostedDialog {
  const element = document.createElement("dialog");
  element.className = "ui-dialog hosted-content-dialog";
  const header = document.createElement("header");
  header.className = "ui-panel-header";
  const title = document.createElement("h2");
  title.id = `hosted-dialog-${options.id}`;
  title.textContent = options.title;
  element.setAttribute("aria-labelledby", title.id);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ui-icon-button";
  close.textContent = "×";
  const slot = document.createElement("div");
  slot.className = "hosted-content-dialog-slot";
  header.append(title, close);
  element.append(header, slot);
  const keyboard = retainDismissalGesture(document);
  const removeLanguage = options.language.bind((t) => {
    close.setAttribute("aria-label", t("hosted.close"));
    close.title = t("hosted.close");
  });
  close.addEventListener("click", () => options.close());
  element.addEventListener("keydown", (event) => keyboard.track(event, close));
  // Escape with focus in the frame; main dismisses it from the view.
  element.addEventListener("cancel", (event) => {
    event.preventDefault();
    options.close();
  });
  const dialog: HostedDialog = {
    id: options.id,
    slot,
    shown: false,
    closing: false,
    removed: false,
    show() {
      if (!element.isConnected) document.body.append(element);
      dialog.shown = true;
      if (!element.open) element.showModal();
    },
    hide() {
      if (element.open) element.close();
    },
    dispose() {
      dialog.removed = true;
      dialog.shown = false;
      removeLanguage();
      keyboard.dispose();
      dialog.hide();
      element.remove();
    },
  };
  return dialog;
}

// One hosted dialog per window. It floats over the selected tab and borrows
// the window's one native presenter while shown. Any other selection takes the
// presenter back and hides it (`yield`, then `settle` once that selection is
// acknowledged), keeping its view until Close, Escape, a newer dialog or
// retirement closes it.
export function createHostedDialogs(
  document: Document,
  options: {
    language: RendererLanguage;
    canOpen(): boolean;
    // Asks main to close a view; `closed` runs once it has retired.
    close(id: string, closed: () => void): void;
    forget(target: HostedDialog): void;
    // Gives the presenter to a dialog, or back to the selected tab.
    present(target: HostedDialog): void;
    restore(settled: () => void): void;
  },
) {
  let current: HostedDialog | undefined;
  const shown = (id?: string) =>
    !!current &&
    current.shown &&
    !current.removed &&
    !current.closing &&
    (id === undefined || current.id === id);
  const remove = (target: HostedDialog) => {
    target.dispose();
    options.forget(target);
    if (current === target) current = undefined;
  };
  const close = (target: HostedDialog) => {
    if (target.closing || target.removed) return;
    target.closing = true;
    options.close(target.id, () => retire(target.id));
  };
  function retire(id: string) {
    const target = current;
    if (!target || target.id !== id) return false;
    if (target.removed) return true;
    target.removed = true;
    const wasShown = target.shown;
    target.shown = false;
    if (wasShown) options.restore(() => remove(target));
    else remove(target);
    return true;
  }
  return {
    shown,
    open(id: string, title: string) {
      if (!options.canOpen()) {
        // Never over a modal or an empty window; the user asks again.
        options.close(id, () => {});
        return;
      }
      if (current?.id === id) return;
      if (current) {
        // The new dialog takes the presenter; the old one just goes away.
        const previous = current;
        const live = !previous.removed && !previous.closing;
        remove(previous);
        if (live) options.close(previous.id, () => {});
      }
      const target = createHostedDialogFrame(document, {
        id,
        title,
        language: options.language,
        close: () => close(target),
      });
      current = target;
      target.show();
      options.present(target);
    },
    // Escape in the view, routed through main.
    dismiss(id: string) {
      if (current?.id !== id) return false;
      if (shown(id)) close(current);
      return true;
    },
    retire,
    yield() {
      if (current) current.shown = false;
    },
    settle() {
      if (!current || current.shown) return;
      // A retired dialog whose own restore was superseded goes away here.
      if (current.removed) remove(current);
      else current.hide();
    },
    dispose() {
      if (current) remove(current);
    },
  };
}
