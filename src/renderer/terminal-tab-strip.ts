import type {
  TerminalTab,
  TerminalTabsElements,
  TerminalTabsOptions,
} from "./terminal-tabs";

export function focusTerminalTab(
  tab: TerminalTab | undefined,
  options: TerminalTabsOptions,
  passive = false,
  unchangedFocus = false,
): void {
  if (
    options.canFocus?.() !== false &&
    (!passive || options.canAutoFocus?.(unchangedFocus) !== false)
  )
    tab?.surface?.focus();
}

// Presentation only; selection and lifetime remain with the tab owner.
export function renderTerminalTabStrip(
  elements: TerminalTabsElements,
  tabs: readonly TerminalTab[],
  selectedIndex: number,
  enabled: boolean,
  bindDragging: (button: HTMLButtonElement, tab: TerminalTab) => void,
  select: (tab: TerminalTab) => void,
): void {
  const document = elements.container.ownerDocument;
  const visible = enabled && tabs.length >= 2;
  elements.strip.hidden = !visible;
  document.body.classList.toggle("tabs-visible", visible);
  if (!visible) {
    elements.strip.replaceChildren();
    return;
  }
  elements.strip.replaceChildren(
    ...tabs.map((tab, index) => {
      const button = document.createElement("button");
      button.type = "button";
      bindDragging(button, tab);
      // Sanitized display title pushed by main (ADR 0010); the literal
      // position stands in until the first push lands.
      button.textContent = tab.label || String(index + 1);
      button.setAttribute("role", "tab");
      button.setAttribute(
        "aria-selected",
        index === selectedIndex ? "true" : "false",
      );
      button.addEventListener("click", () => select(tab));
      return button;
    }),
  );
}
