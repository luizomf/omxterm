const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number",
]);

// A field where Cmd/Ctrl+Shift+Up/Down select text. The terminal's own input
// is not one; its scrollback search field is.
export function isTextEntry(element: Element | null): boolean {
  const view = element?.ownerDocument.defaultView;
  if (!element || !view) return false;
  if (
    element.closest(".restty-terminal-surface") &&
    !element.closest('[role="search"]')
  )
    return false;
  if (element instanceof view.HTMLTextAreaElement)
    return !element.readOnly && !element.disabled;
  if (element instanceof view.HTMLInputElement)
    return (
      TEXT_INPUT_TYPES.has(element.type) &&
      !element.readOnly &&
      !element.disabled
    );
  return (
    element instanceof view.HTMLElement && element.isContentEditable === true
  );
}

// Tells main whether a text field holds focus, so the prompt jumps leave its
// selection chords alone (#1027). Reports changes only.
export function reportTextEntryFocus(
  document: Document,
  report: (editing: boolean) => void,
): () => void {
  let editing = false;
  const update = () => {
    const next = isTextEntry(document.activeElement);
    if (next === editing) return;
    editing = next;
    report(next);
  };
  // Moving between fields fires focusout first, with nothing focused yet;
  // the focusin that follows reports the new field.
  const leave = (event: FocusEvent) => {
    if (!event.relatedTarget) update();
  };
  document.addEventListener("focusin", update);
  document.addEventListener("focusout", leave);
  return () => {
    document.removeEventListener("focusin", update);
    document.removeEventListener("focusout", leave);
  };
}
