// Internal DOM primitives, not an extension runtime. Callers retain their own
// lifecycle, navigation semantics, localization and operation ownership.
export function createApplicationPage(
  document: Document,
  parts: {
    readonly title?: HTMLElement;
    readonly actions?: HTMLElement;
    readonly navigation?: HTMLElement;
    readonly notice?: HTMLElement;
    readonly content: HTMLElement;
    readonly status?: HTMLElement;
  },
): HTMLElement {
  const page = document.createElement("div");
  page.className = "application-page";
  if (parts.title || parts.actions) {
    const header = document.createElement("header");
    header.className = "application-page-header";
    if (parts.title) header.append(parts.title);
    if (parts.actions) header.append(parts.actions);
    page.append(header);
  }
  for (const [slot, element] of [
    ["notice", parts.notice],
    ["navigation", parts.navigation],
    ["content", parts.content],
    ["status", parts.status],
  ] as const) {
    if (!element) continue;
    element.classList.add(`application-page-${slot}`);
    page.append(element);
  }
  page.classList.toggle("has-navigation", !!parts.navigation);
  return page;
}

export function createPageButton(
  document: Document,
  variant: "primary" | "quiet" | "text" = "quiet",
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `page-control page-button page-button-${variant}`;
  return button;
}

export type NoticeSeverity = "info" | "success" | "warning" | "error";

// Update retained live regions without replacing their identity or taking focus.
// Text and severity travel together, including during language changes.
export function setPageNotice(
  element: HTMLElement,
  message: { readonly text: string; readonly severity: NoticeSeverity },
) {
  element.classList.add("page-notice");
  element.dataset.severity = message.severity;
  element.classList.toggle("error", message.severity === "error");
  element.textContent = message.text;
  element.hidden = !message.text;
}
