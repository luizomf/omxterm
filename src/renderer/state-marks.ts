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
export const stateGlyphs = { mirror: "↔\uFE0E" } as const;
export type StateGlyph = keyof typeof stateGlyphs;

/** Literal text (never HTML), or a resolver for core strings. */
export type StateText = string | ((t: Translate) => string);

/** An ongoing state on one pane: a glyph whose label is its tooltip and name. */
export interface StateMark {
  readonly glyph: StateGlyph;
  readonly label: StateText;
}

const NOTICE_TIMEOUT = 4000;

/**
 * The window's one system for quiet state (ADR 0050). Idle or success shows
 * nothing; an ongoing state is a mark at the pane edge, repeated on its tab; a
 * surprise is a transient overlay; something that needs the user is a notice
 * they dismiss. None of them enters the layout flow, so the grid never changes.
 */
export function createStateMarks(
  document: Document,
  language: RendererLanguage,
  tabsChanged: () => void,
) {
  const page = document.defaultView!;
  const panes = new Map<TerminalPane, Map<string, StateMark>>();
  const text = (value: StateText, t: Translate = language.t) =>
    typeof value === "string" ? value : value(t);
  const glyph = (mark: StateMark, t: Translate) => {
    const element = document.createElement("span");
    element.className = "ui-mark";
    element.dataset.glyph = mark.glyph;
    element.textContent = stateGlyphs[mark.glyph];
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", text(mark.label, t));
    element.title = text(mark.label, t);
    return element;
  };
  const renderPane = (pane: TerminalPane, t: Translate = language.t) => {
    const marks = panes.get(pane);
    let row = pane.container.querySelector<HTMLElement>(
      ":scope > .state-marks",
    );
    if (!marks?.size) return row?.remove();
    if (!row) {
      row = document.createElement("span");
      row.className = "state-marks";
      pane.container.append(row);
    }
    row.replaceChildren(...[...marks.values()].map((mark) => glyph(mark, t)));
  };
  const unbind = language.bind((t) => {
    for (const pane of panes.keys()) renderPane(pane, t);
  });

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
    /** One glyph per owner for a tab button, labelled from its focused pane. */
    tab(tab: TerminalTab): HTMLElement[] {
      const owners = new Map<string, StateMark>();
      for (const pane of [tab.focused, ...tabPanes(tab)])
        for (const [owner, mark] of panes.get(pane) ?? [])
          if (!owners.has(owner)) owners.set(owner, mark);
      return [...owners.values()].map((mark) => glyph(mark, language.t));
    },
    /** A surprise: a one-sentence overlay that goes away by itself. */
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
      for (const pane of panes.keys())
        pane.container.querySelector(":scope > .state-marks")?.remove();
      panes.clear();
      notice.remove();
    },
  };
}

export type StateMarks = ReturnType<typeof createStateMarks>;
