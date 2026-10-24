import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { TerminalClipboardAction } from "../shared/terminal-contract";
import { installAuxiliaryPanelInput } from "./auxiliary-panel-input";
import {
  englishLanguage,
  type RendererLanguage,
  type Translate,
} from "./renderer-language";

export interface AuxiliaryView {
  readonly element: HTMLElement;
  activate(): void;
  deactivate(): void;
  focus(): void;
  dispose(): void;
}
export interface AuxiliaryViewDefinition {
  readonly id: string;
  // A fixed label, or one that follows the window language.
  readonly label: string | ((t: Translate) => string);
  readonly create: (isInteractive: () => boolean) => AuxiliaryView;
}
export interface AuxiliaryPanel {
  toggle(id: string): void;
  setBlocked(blocked: boolean): void;
  ownsFocus(): boolean;
  clipboardAction(action: TerminalClipboardAction): boolean;
  dispose(): void;
}

// Lazy exclusive views and visible dismissal informed by ruscher/omxterm's
// workspace-sidebar.ts; separator interactions by pane-view.ts, both at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT). This owner additionally
// controls deactivation, bounded geometry, capture and asynchronous edit lifetime.
export function createAuxiliaryPanel(
  root: HTMLElement,
  options: {
    readonly content: HTMLElement;
    readonly views: readonly AuxiliaryViewDefinition[];
    readonly focusTerminal: () => void;
    readonly clipboard?: TerminalClipboard;
    readonly language?: RendererLanguage;
  },
): AuxiliaryPanel {
  const language = options.language ?? englishLanguage;
  const labelOf = (definition: AuxiliaryViewDefinition, t: Translate) =>
    typeof definition.label === "string"
      ? definition.label
      : definition.label(t);
  const document = root.ownerDocument;
  const page = document.defaultView!;
  const created = new Map<string, AuxiliaryView>();
  let current: string | undefined;
  let disposed = false;
  let blocked = false;
  let preferred = 280;
  let maximum = 560;
  let effective = 280;
  let drag: { id: number; x: number; width: number } | undefined;
  let frame: number | undefined;
  let statusTimer: number | undefined;
  root.hidden = true;
  root.classList.add("auxiliary-panel");
  const separator = document.createElement("div");
  separator.className = "auxiliary-separator";
  separator.tabIndex = 0;
  separator.hidden = true;
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-orientation", "vertical");
  const header = document.createElement("header");
  header.className = "auxiliary-header";
  const title = document.createElement("h2");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  header.append(title, close);
  const body = document.createElement("div");
  body.className = "auxiliary-body";
  root.replaceChildren(header, body);
  root.before(separator);
  const unbindLabels = language.bind((t) => {
    separator.setAttribute("aria-label", t("panel.resize"));
    close.setAttribute("aria-label", t("panel.close"));
    const definition = options.views.find((view) => view.id === current);
    if (definition) {
      title.textContent = labelOf(definition, t);
      root.setAttribute("aria-label", title.textContent);
    }
  });
  const status = document.createElement("p");
  status.className = "auxiliary-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  document.body.append(status);
  const ownsFocus = () =>
    !disposed &&
    current !== undefined &&
    (root.contains(document.activeElement) ||
      document.activeElement === separator);
  const interactive = () => !disposed && !blocked && current !== undefined;
  const paint = () => {
    effective = Math.max(220, Math.min(preferred, maximum));
    root.style.width = `${effective}px`;
    separator.setAttribute("aria-valuemin", "220");
    separator.setAttribute("aria-valuemax", String(maximum));
    separator.setAttribute("aria-valuenow", String(effective));
    separator.setAttribute("aria-valuetext", `${effective} pixels wide`);
  };
  const endDrag = () => {
    const previous = drag;
    drag = undefined;
    if (frame !== undefined) page.cancelAnimationFrame(frame);
    frame = undefined;
    if (previous) {
      separator.classList.remove("dragging");
      if (separator.hasPointerCapture?.(previous.id))
        separator.releasePointerCapture(previous.id);
      paint();
    }
  };
  const hide = (restoreFocus: boolean) => {
    if (current === undefined) return;
    endDrag();
    created.get(current)?.deactivate();
    current = undefined;
    input.invalidate();
    root.hidden = true;
    separator.hidden = true;
    if (restoreFocus && !blocked) options.focusTerminal();
  };
  const measure = () => {
    if (disposed) return;
    maximum = Math.min(
      560,
      options.content.getBoundingClientRect().width - 186,
    );
    if (maximum < 220) hide(true);
    else paint();
  };
  const resize = (width: number) => {
    preferred = Math.max(220, Math.min(width, maximum));
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!interactive() || event.button !== 0 || !event.isPrimary || drag)
      return;
    event.preventDefault();
    separator.focus();
    drag = { id: event.pointerId, x: event.clientX, width: effective };
    separator.setPointerCapture(event.pointerId);
    separator.classList.add("dragging");
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    resize(drag.width + drag.x - event.clientX);
    if (frame === undefined)
      frame = page.requestAnimationFrame(() => {
        frame = undefined;
        if (drag && interactive()) paint();
      });
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) endDrag();
  };
  const onResizeKey = (event: KeyboardEvent) => {
    if (!interactive()) return;
    let width: number;
    switch (event.key) {
      case "ArrowLeft":
        width = effective + 10;
        break;
      case "ArrowRight":
        width = effective - 10;
        break;
      case "Home":
        width = 220;
        break;
      case "End":
        width = maximum;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    endDrag();
    resize(width);
    paint();
  };
  const input = installAuxiliaryPanelInput(root, separator, close, {
    interactive,
    ownsFocus,
    close: () => hide(true),
    blur: endDrag,
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
  });
  separator.addEventListener("keydown", onResizeKey);
  separator.addEventListener("pointerdown", onPointerDown);
  separator.addEventListener("pointermove", onPointerMove);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    separator.addEventListener(type, onPointerEnd as EventListener);
  page.addEventListener("resize", measure);
  const observer =
    typeof page.ResizeObserver === "function"
      ? new page.ResizeObserver(measure)
      : undefined;
  observer?.observe(options.content);
  return {
    toggle(id) {
      if (disposed || blocked) return;
      if (current === id) {
        hide(true);
        return;
      }
      const definition = options.views.find((view) => view.id === id);
      if (!definition) return;
      measure();
      if (maximum < 220) {
        status.textContent = language.t("panel.tooNarrow", {
          view: labelOf(definition, language.t),
        });
        status.hidden = false;
        if (statusTimer !== undefined) page.clearTimeout(statusTimer);
        statusTimer = page.setTimeout(() => {
          status.hidden = true;
        }, 4000);
        return;
      }
      hide(false);
      let view = created.get(id);
      if (!view) {
        view = definition.create(() => interactive() && current === id);
        created.set(id, view);
        body.append(view.element);
      }
      current = id;
      for (const [key, candidate] of created)
        candidate.element.hidden = key !== id;
      title.textContent = labelOf(definition, language.t);
      root.setAttribute("aria-label", title.textContent);
      root.hidden = false;
      separator.hidden = false;
      status.hidden = true;
      view.activate();
      view.focus();
    },
    setBlocked(value) {
      if (disposed || value === blocked) return;
      blocked = value;
      input.invalidate();
      root.inert = value;
      separator.inert = value;
      if (value) endDrag();
    },
    ownsFocus,
    clipboardAction: input.clipboardAction,
    dispose() {
      if (disposed) return;
      hide(false);
      disposed = true;
      input.dispose();
      unbindLabels();
      if (statusTimer !== undefined) page.clearTimeout(statusTimer);
      observer?.disconnect();
      page.removeEventListener("resize", measure);
      separator.removeEventListener("keydown", onResizeKey);
      separator.removeEventListener("pointerdown", onPointerDown);
      separator.removeEventListener("pointermove", onPointerMove);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
        separator.removeEventListener(type, onPointerEnd as EventListener);
      for (const view of created.values()) view.dispose();
      created.clear();
      root.replaceChildren();
      separator.remove();
      status.remove();
    },
  };
}
