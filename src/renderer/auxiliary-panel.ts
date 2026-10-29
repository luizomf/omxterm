import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { TerminalClipboardAction } from "../shared/terminal-contract";
import { installAuxiliaryPanelInput } from "./auxiliary-panel-input";
import { createAuxiliaryPanelGeometry } from "./auxiliary-panel-geometry";
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
  register(view: AuxiliaryViewDefinition): void;
  remove(id: string): void;
  show(id: string): void;
  selected(): string | undefined;
  requested(): string | undefined;
  setSuspended(suspended: boolean): void;
  toggle(id: string): void;
  deactivate(): void;
  dismiss(): void;
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
    readonly select?: (id: string | undefined, activate: () => void) => void;
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
  const definitions = new Map(options.views.map((view) => [view.id, view]));
  const created = new Map<string, AuxiliaryView>();
  let suspended = false;
  let transition = 0;
  let current: string | undefined;
  let requested: string | undefined;
  let disposed = false;
  let blocked = false;
  let statusTimer: number | undefined;
  let narrowView: AuxiliaryViewDefinition | undefined;
  const { separator, title, close, body, status } = createPanelElements(root);
  const switcher = document.createElement("nav");
  switcher.className = "auxiliary-tools";
  body.before(switcher);
  const toolButtons = new Map<string, HTMLButtonElement>();
  const renderTools = () => {
    switcher.hidden = definitions.size < 2;
    for (const [id, button] of toolButtons) {
      if (!definitions.has(id)) {
        button.remove();
        toolButtons.delete(id);
      }
    }
    for (const definition of definitions.values()) {
      let button = toolButtons.get(definition.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.addEventListener("click", () => show(definition.id));
        toolButtons.set(definition.id, button);
        switcher.append(button);
      }
      button.textContent = labelOf(definition, language.t);
      button.setAttribute("aria-pressed", String(definition.id === current));
    }
  };
  const renderNarrowNotice = (t: Translate) => {
    if (narrowView)
      status.textContent = t("panel.tooNarrow", {
        view: labelOf(narrowView, t),
      });
  };
  const unbindLabels = language.bind((t) => {
    close.setAttribute("aria-label", t("panel.close"));
    const definition = definitions.get(current ?? "");
    if (definition) {
      title.textContent = labelOf(definition, t);
      root.setAttribute("aria-label", title.textContent);
    }
    renderNarrowNotice(t);
    renderTools();
  });
  const ownsFocus = () =>
    !disposed &&
    !suspended &&
    current !== undefined &&
    (root.contains(document.activeElement) ||
      document.activeElement === separator);
  const interactive = () =>
    !disposed && !blocked && !suspended && current !== undefined;

  const hideNow = () => {
    geometry.endDrag();
    if (current && !suspended) created.get(current)?.deactivate();
    current = undefined;
    input.invalidate();
    root.hidden = true;
    separator.hidden = true;
    renderTools();
  };
  const select = (id: string | undefined, activate: () => void) => {
    const captured = ++transition;
    requested = id;
    const commit = () => {
      if (!disposed && captured === transition) activate();
    };
    if (options.select) options.select(id, commit);
    else commit();
  };
  const hide = (restoreFocus: boolean) => {
    if (current === undefined && requested === undefined) return;
    select(undefined, () => {
      hideNow();
      if (restoreFocus && !blocked) options.focusTerminal();
    });
  };
  const geometry = createAuxiliaryPanelGeometry(root, separator, {
    content: options.content,
    language,
    interactive,
    tooNarrow: () => hide(true),
  });
  const input = installAuxiliaryPanelInput(root, separator, close, {
    interactive,
    ownsFocus,
    close: () => hide(true),
    blur: geometry.endDrag,
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
  });
  function show(id: string) {
    if (disposed || blocked || suspended) return;
    const definition = definitions.get(id);
    if (!definition) return;
    if (!geometry.measure()) {
      narrowView = definition;
      renderNarrowNotice(language.t);
      status.hidden = false;
      if (statusTimer !== undefined) page.clearTimeout(statusTimer);
      statusTimer = page.setTimeout(() => {
        status.hidden = true;
        narrowView = undefined;
      }, 4000);
      return;
    }
    select(id, () => {
      if (blocked || suspended || !definitions.has(id)) return;
      if (current === id) {
        created.get(id)?.focus();
        return;
      }
      hideNow();
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
      narrowView = undefined;
      view.activate();
      renderTools();
      view.focus();
    });
  }
  return {
    register(definition) {
      if (disposed || definitions.has(definition.id)) return;
      definitions.set(definition.id, definition);
      renderTools();
    },
    remove(id) {
      if (disposed) return;
      if (requested === id) {
        ++transition;
        requested = undefined;
      }
      if (current === id) hideNow();
      created.get(id)?.dispose();
      created.delete(id);
      definitions.delete(id);
      renderTools();
    },
    show,
    selected: () => current,
    requested: () => requested,
    setSuspended(value) {
      if (disposed || value === suspended) return;
      ++transition;
      requested = current;
      suspended = value;
      geometry.endDrag();
      input.invalidate();
      root.hidden = value || current === undefined;
      separator.hidden = root.hidden;
      if (current) {
        const view = created.get(current);
        if (value) view?.deactivate();
        else {
          geometry.measure();
          if (current) view?.activate();
        }
      }
    },
    deactivate: () => hide(false),
    dismiss: () => hide(true),
    toggle(id) {
      if (disposed || blocked || suspended) return;
      if (current === id) hide(true);
      else show(id);
    },
    setBlocked(value) {
      if (disposed || value === blocked) return;
      blocked = value;
      input.invalidate();
      root.inert = value;
      separator.inert = value;
      if (value) geometry.endDrag();
    },
    ownsFocus,
    clipboardAction: input.clipboardAction,
    dispose() {
      if (disposed) return;
      ++transition;
      hideNow();
      disposed = true;
      input.dispose();
      unbindLabels();
      if (statusTimer !== undefined) page.clearTimeout(statusTimer);
      geometry.dispose();
      for (const view of created.values()) view.dispose();
      created.clear();
      root.replaceChildren();
      separator.remove();
      status.remove();
    },
  };
}

function createPanelElements(root: HTMLElement) {
  const document = root.ownerDocument;
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
  const status = document.createElement("p");
  status.className = "auxiliary-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  document.body.append(status);
  return { separator, title, close, body, status };
}
