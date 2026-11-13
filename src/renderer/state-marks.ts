import { retainDismissalGesture } from "./about/about-dialog";
import type { RendererLanguage, Translate } from "./renderer-language";
import {
  tabPanes,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";

/**
 * Core owns the glyphs so every state looks the same whoever reports it. A
 * new state adds a glyph here; reporters never bring their own visuals.
 */
export const stateGlyphs = {
  mirror: "↔\uFE0E",
  // A program reports progress (OSC 9;4); static, never animated.
  working: "⋯",
  // A program asked for attention (BEL, OSC 9, OSC 777) and the pane has
  // not been seen since.
  attention: "●",
  // Something other than the user can act here: an agent grant (ADR 0052).
  // The only glyph in the accent tone.
  agent: "◆",
} as const;
export type StateGlyph = keyof typeof stateGlyphs;

/** Literal text (never HTML), or a resolver for core strings. */
export type StateText = string | ((t: Translate) => string);

/**
 * An ongoing state on one pane: a glyph whose label is its tooltip and name.
 * With an action, the pane's glyph becomes a button that runs it, and the
 * action's label follows the state's in the tooltip ("Click to stop.").
 */
export interface StateMark {
  readonly glyph: StateGlyph;
  readonly label: StateText;
  readonly action?: { readonly label: StateText; run(): void };
}

const NOTICE_TIMEOUT = 4000;

/**
 * Where window-scoped marks go: every pane (including later ones) and, when
 * the selected tab has no pane, the page's corner.
 */
export interface StateMarksWindow {
  panes(): readonly TerminalPane[];
  readonly corner: HTMLElement;
  /** True while neither a pane nor a tab button can carry the marks. */
  cornerShown(): boolean;
}

/**
 * The window's one system for quiet state (ADR 0050). Idle or success shows
 * nothing (an explicit action with no other visible result may flash); an
 * ongoing state is a mark at the pane edge, repeated on its tab; a
 * surprise is a transient overlay; something that needs the user is a notice
 * they dismiss. None of them enters the layout flow, so the grid never changes.
 */
export function createStateMarks(
  document: Document,
  language: RendererLanguage,
  tabsChanged: () => void,
  scope?: StateMarksWindow,
) {
  const page = document.defaultView!;
  const panes = new Map<TerminalPane, Map<string, StateMark>>();
  const windowMarks = new Map<string, StateMark>();
  let corner: HTMLElement | undefined;
  const text = (value: StateText, t: Translate = language.t) =>
    typeof value === "string" ? value : value(t);
  // Tabs are buttons already, so only a pane's glyph carries the action.
  const glyph = (mark: StateMark, t: Translate, actionable = false) => {
    const action = actionable ? mark.action : undefined;
    const element = document.createElement(action ? "button" : "span");
    const label = action
      ? `${text(mark.label, t)} ${text(action.label, t)}`
      : text(mark.label, t);
    element.className = action ? "ui-mark ui-icon-button" : "ui-mark";
    element.dataset.glyph = mark.glyph;
    element.textContent = stateGlyphs[mark.glyph];
    if (!action) element.setAttribute("role", "img");
    element.setAttribute("aria-label", label);
    // The native tooltip waits about a second; an actionable mark must be
    // easy to read once found, so it draws its own (see .ui-mark[data-tip]).
    if (action) element.dataset.tip = label;
    else element.title = label;
    if (action && element instanceof HTMLButtonElement) {
      element.type = "button";
      // Keep keyboard focus and pointer gestures with the terminal.
      element.addEventListener("pointerdown", (event) =>
        event.stopPropagation(),
      );
      element.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        action.run();
      });
    }
    return element;
  };
  // A pane's own marks, then the window's, which sit at the edge.
  const renderPane = (pane: TerminalPane, t: Translate = language.t) => {
    const marks = [
      ...(panes.get(pane)?.values() ?? []),
      ...windowMarks.values(),
    ];
    let row = pane.container.querySelector<HTMLElement>(
      ":scope > .state-marks",
    );
    if (!marks.length) return row?.remove();
    if (!row) {
      row = document.createElement("span");
      row.className = "state-marks";
      pane.container.append(row);
    }
    row.replaceChildren(...marks.map((mark) => glyph(mark, t, true)));
  };
  const renderCorner = (t: Translate = language.t) => {
    if (!scope) return;
    if (!windowMarks.size || !scope.cornerShown()) {
      corner?.remove();
      corner = undefined;
      return;
    }
    if (!corner) {
      corner = document.createElement("span");
      corner.className = "state-marks state-marks-corner";
      scope.corner.append(corner);
    }
    corner.replaceChildren(
      ...[...windowMarks.values()].map((mark) => glyph(mark, t, true)),
    );
  };
  const renderAll = (t: Translate = language.t) => {
    const all = new Set([...panes.keys(), ...(scope?.panes() ?? [])]);
    for (const pane of all) renderPane(pane, t);
    renderCorner(t);
  };
  const unbind = language.bind((t) => renderAll(t));

  const notice = document.createElement("p");
  notice.className = "state-notice ui-overlay";
  notice.setAttribute("role", "status");
  notice.hidden = true;
  const message = document.createElement("span");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "ui-icon-button";
  dismiss.textContent = "×";
  notice.append(message, dismiss);
  document.body.append(notice);
  const keyboard = retainDismissalGesture(document);
  // One slot: the latest sentence wins, except that a surprise never hides a
  // notice still waiting for the user.
  let current:
    { readonly text: StateText; readonly transient: boolean } | undefined;
  let timer: number | undefined;
  const clear = () => {
    if (timer !== undefined) page.clearTimeout(timer);
    timer = undefined;
    current = undefined;
    notice.hidden = true;
  };
  const show = (value: StateText, transient: boolean) => {
    if (transient && current && !current.transient) return () => {};
    if (timer !== undefined) page.clearTimeout(timer);
    const shown = { text: value, transient };
    current = shown;
    message.textContent = text(value);
    dismiss.hidden = transient;
    notice.classList.toggle("state-notice-transient", transient);
    notice.hidden = false;
    timer = transient ? page.setTimeout(clear, NOTICE_TIMEOUT) : undefined;
    // Clears this sentence only, never a newer one from another owner.
    return () => {
      if (current === shown) clear();
    };
  };
  const unbindNotice = language.bind((t) => {
    if (current) message.textContent = text(current.text, t);
    dismiss.setAttribute("aria-label", t("common.close"));
    dismiss.title = t("common.close");
  });
  dismiss.addEventListener("keydown", (event) =>
    keyboard.track(event, dismiss),
  );
  dismiss.addEventListener("click", clear);

  return {
    /** Show, replace or (with undefined) remove one owner's mark on a pane. */
    set(pane: TerminalPane, owner: string, mark: StateMark | undefined) {
      let marks = panes.get(pane);
      if (mark) {
        if (!marks) panes.set(pane, (marks = new Map<string, StateMark>()));
        marks.set(owner, mark);
      } else {
        marks?.delete(owner);
        if (marks?.size === 0) panes.delete(pane);
      }
      renderPane(pane);
      tabsChanged();
    },
    /**
     * Show, replace or (with undefined) remove one owner's mark on the whole
     * window: every pane, every tab, and the corner when no pane is shown.
     */
    setWindow(owner: string, mark: StateMark | undefined) {
      if (mark) windowMarks.set(owner, mark);
      else windowMarks.delete(owner);
      renderAll();
      tabsChanged();
    },
    /** A pane joined the window: give it the window's marks. */
    attach(pane: TerminalPane) {
      if (windowMarks.size) renderPane(pane);
    },
    /** The selected tab or the tab strip changed: re-check the corner. */
    refreshCorner() {
      renderCorner();
    },
    /**
     * One glyph per owner for a tab button, labelled from its focused pane,
     * then the window's. A tab without panes carries only the window's.
     */
    tab(tab: TerminalTab | undefined): HTMLElement[] {
      const owners = new Map<string, StateMark>();
      for (const pane of tab ? [tab.focused, ...tabPanes(tab)] : [])
        for (const [owner, mark] of panes.get(pane) ?? [])
          if (!owners.has(owner)) owners.set(owner, mark);
      for (const [owner, mark] of windowMarks) owners.set(owner, mark);
      return [...owners.values()].map((mark) => glyph(mark, language.t));
    },
    /**
     * A surprise, or the confirmation of an explicit action with no other
     * visible result: a one-sentence overlay that goes away by itself.
     */
    flash(value: StateText) {
      show(value, true);
    },
    /** Something needs the user: one sentence they dismiss. Returns a clear. */
    notify: (value: StateText) => show(value, false),
    dispose() {
      clear();
      unbind();
      unbindNotice();
      keyboard.dispose();
      for (const pane of new Set([...panes.keys(), ...(scope?.panes() ?? [])]))
        pane.container.querySelector(":scope > .state-marks")?.remove();
      panes.clear();
      windowMarks.clear();
      corner?.remove();
      notice.remove();
    },
  };
}

export type StateMarks = ReturnType<typeof createStateMarks>;
