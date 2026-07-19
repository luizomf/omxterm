// Persistent, non-blocking surface for user-file failures. It must never trap
// focus or overlay the Terminal Surface: the whole point of falling back to
// defaults is that the user can fix the reported file inside OMXTerm itself.
export function renderUserFileErrorBanner(
  banner: HTMLElement,
  messages: readonly string[],
): void {
  const document = banner.ownerDocument;
  banner.replaceChildren(
    ...messages.map((message) => {
      const entry = document.createElement("p");
      entry.textContent = message;
      return entry;
    }),
  );
  banner.hidden = messages.length === 0;
}
