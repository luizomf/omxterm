import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
  type NoticeSeverity,
} from "../../src/renderer/application-page.js";
import type { SupportedLanguage } from "../../src/shared/i18n.js";
import type { StateDocument } from "./document.js";
import { restorationMessages, type RestorationMessages } from "./messages.js";

export type PageView = {
  /** Undefined until the saved state has been read (or after a failed read). */
  state?: StateDocument | undefined;
  available: boolean;
  /** The host reopens the last windows at startup. */
  reopens?: boolean;
  /** The last read failed; offer Try again instead of the other actions. */
  failed: boolean;
  pending: boolean;
  visible: boolean;
};
export type PageNotice = {
  text: (messages: RestorationMessages) => string;
  severity: NoticeSeverity;
};

/** One sentence of guidance, the saved snapshot and its actions. */
export function createRestorationPage(document: Document) {
  let language: SupportedLanguage = "en-US";
  let view: PageView = {
    available: false,
    failed: false,
    pending: true,
    visible: false,
  };
  let notice: PageNotice | undefined;
  let docs = false;
  let onLearnMore = () => {};

  const hint = document.createElement("p");
  hint.className = "ui-hint";
  const hintText = document.createTextNode("");
  const learnMore = document.createElement("button");
  learnMore.type = "button";
  learnMore.className = "ui-link";
  learnMore.addEventListener("click", () => onLearnMore());
  hint.append(hintText, " ", learnMore);
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const card = document.createElement("section");
  card.className = "snapshot ui-card";
  const cardTitle = document.createElement("h3");
  const cardDetail = document.createElement("p");
  cardDetail.className = "ui-meta";
  const cardNote = document.createElement("p");
  cardNote.className = "ui-meta";
  card.append(cardTitle, cardDetail, cardNote);
  const actions = document.createElement("div");
  actions.className = "layout-actions ui-actions";
  const buttons = {
    open: createPageButton(document, "primary"),
    save: createPageButton(document),
    forget: createPageButton(document, "text"),
    retry: createPageButton(document),
  };
  for (const [action, button] of Object.entries(buttons)) {
    button.dataset.action = action;
    actions.append(button);
  }
  const content = document.createElement("section");
  content.append(hint, card, actions);
  const page = createApplicationPage(document, {
    notice: status,
    content,
  });
  document.body.append(page);

  function render() {
    const m = restorationMessages(language);
    document.documentElement.lang = language;
    hintText.textContent = view.reopens ? m.reopenHint : m.hint;
    learnMore.textContent = m.learnMore;
    learnMore.hidden = !docs;
    const { state, available, failed, pending, visible } = view;
    const saved = state?.status === "saved" ? state.value : null;
    cardDetail.textContent = cardNote.textContent = "";
    if (saved) {
      const panes = saved.tabs.flatMap((tab) => tab.panes);
      cardTitle.textContent = m.summary(saved.tabs.length, panes.length);
      cardDetail.textContent = m.saved(
        new Date(saved.savedAt).toLocaleString(language, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      );
      if (!panes.some((pane) => pane.kind === "reported-local"))
        cardNote.textContent = m.unreported;
    } else if (state?.status === "invalid") {
      cardTitle.textContent = m.invalid;
      cardDetail.textContent = m.invalidDetail;
    } else
      cardTitle.textContent = state
        ? m.empty
        : failed
          ? m.readFailed
          : m.loading;
    cardDetail.hidden = !cardDetail.textContent;
    cardNote.hidden = !cardNote.textContent;

    const busy = pending || !visible;
    buttons.open.textContent = m.open;
    buttons.open.hidden = !saved || !available;
    buttons.save.textContent = state?.status === "empty" ? m.save : m.replace;
    buttons.save.hidden = !state || !available;
    // One primary action: Open when there is something to open, else Save.
    buttons.save.className = `page-control page-button page-button-${buttons.open.hidden ? "primary" : "quiet"}`;
    buttons.forget.textContent = m.forget;
    buttons.forget.hidden = !state || state.status === "empty";
    buttons.retry.textContent = m.retry;
    buttons.retry.hidden = !failed;
    for (const button of Object.values(buttons)) button.disabled = busy;
    setPageNotice(status, {
      text: notice?.text(m) ?? "",
      severity: notice?.severity ?? "info",
    });
  }
  render();
  return {
    page,
    buttons,
    update(next: Partial<PageView>) {
      view = { ...view, ...next };
      render();
    },
    notify(next?: PageNotice) {
      notice = next;
      render();
    },
    language(next: SupportedLanguage) {
      language = next;
      render();
    },
    learnMore(open: () => void) {
      docs = true;
      onLearnMore = open;
      render();
    },
  };
}
