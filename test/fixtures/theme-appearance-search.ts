import type { WebContents } from "electron";
import { waitFor } from "./window-chrome-exercise";

/** Observe the actual search document; the caller owns the native view identity. */
export function createThemeSearch(
  contents: Pick<WebContents, "executeJavaScript" | "focus" | "isFocused">,
  selector: string,
  available: () => boolean,
) {
  const input = `document.querySelector(${JSON.stringify(selector)})`;
  const focused = async () =>
    available() &&
    contents.isFocused() &&
    (await contents.executeJavaScript(
      `!!${input} && document.activeElement === ${input}`,
    )) === true;
  return {
    async focus() {
      if (!available()) throw new Error("Snippets search is unavailable");
      contents.focus();
      await contents.executeJavaScript(`(() => {
        const input = ${input};
        if (!input) throw new Error('Snippets search is missing');
        input.focus();
      })()`);
      await waitFor(focused, "actual Snippets search focus");
    },
    async retain() {
      if (!available()) throw new Error("Snippets search is unavailable");
      await contents.executeJavaScript(`(() => {
        const input = ${input};
        if (!input) throw new Error('Snippets search is missing');
        globalThis.appearanceInput = input;
        input.value = 'retained query';
        input.dispatchEvent(new Event('input', {bubbles: true}));
      })()`);
    },
    focused,
    async retained() {
      return (
        available() &&
        (await contents.executeJavaScript(
          `globalThis.appearanceInput === ${input} && appearanceInput.value === 'retained query'`,
        )) === true
      );
    },
  };
}
