import type { WebContents } from "electron";
import { waitFor } from "./window-chrome-exercise";

// Submission does not order renderer evaluation after Chromium's Tab default.
// Observe the real down/up pair before moving focus; never synthesize modality.
export async function focusThemeSeparator(
  contents: Pick<WebContents, "executeJavaScript" | "sendInputEvent" | "focus">,
  selector: string,
  keyboardStart = "#snippets-sidebar input",
) {
  // A hosted search lives in another WebContents. Establish keyboard modality
  // in the core with its real panel control, not a synthetic core search input.
  if (keyboardStart !== "#snippets-sidebar input") contents.focus();
  await contents.executeJavaScript(`(() => {
    if (globalThis.__themeKeyboardReceipt) throw new Error('Theme keyboard receipt already armed');
    const start = document.querySelector(${JSON.stringify(keyboardStart)});
    if (!start) throw new Error('Theme keyboard start is missing');
    start.focus();
    const receipt = globalThis.__themeKeyboardReceipt = {down: false, up: false};
    receipt.listener = (event) => {
      if (!event.isTrusted || event.key !== 'Tab' || !event.shiftKey ||
          event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (event.type === 'keydown') receipt.down = true;
      else if (receipt.down) receipt.up = true;
    };
    document.addEventListener('keydown', receipt.listener, true);
    document.addEventListener('keyup', receipt.listener, true);
  })()`);
  try {
    for (const type of ["keyDown", "keyUp"] as const)
      contents.sendInputEvent({ type, keyCode: "Tab", modifiers: ["shift"] });
    let focused = false;
    const element = `document.querySelector(${JSON.stringify(selector)})`;
    // Consumption and the original strict focus-visible oracle share one
    // unchanged waitFor budget, rather than adding another response deadline.
    await waitFor(async () => {
      if (!focused) {
        const consumed = (await contents.executeJavaScript(
          "globalThis.__themeKeyboardReceipt.down && globalThis.__themeKeyboardReceipt.up",
        )) as boolean;
        if (!consumed) return false;
        await contents.executeJavaScript(`${element}.focus()`);
        focused = true;
      }
      return contents.executeJavaScript(
        `${element}.matches(':focus-visible')`,
      ) as Promise<boolean>;
    }, "theme Shift-Tab consumption and separator focus-visible");
  } finally {
    await contents.executeJavaScript(`(() => {
      const receipt = globalThis.__themeKeyboardReceipt;
      document.removeEventListener('keydown', receipt.listener, true);
      document.removeEventListener('keyup', receipt.listener, true);
      delete globalThis.__themeKeyboardReceipt;
    })()`);
  }
}
