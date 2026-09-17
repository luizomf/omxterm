import { createHash } from "node:crypto";
import type { BrowserWindow } from "electron";

export function createLargePasteFixture() {
  const payload =
    Array.from(
      { length: 100 },
      (_, index) =>
        `${index.toString().padStart(4, "0")}:${"0123456789abcdef".repeat(49)}`,
    ).join("\n") + "\n";
  return {
    command: `shasum -a 256 <<'__OMXTERM_PAYLOAD__'\n${payload}__OMXTERM_PAYLOAD__\nstty echo\n`,
    digest: createHash("sha256").update(payload).digest("hex"),
    length: payload.length,
  };
}

export async function dispatchDomPaste(window: BrowserWindow, text: string) {
  await window.webContents.executeJavaScript(
    `(() => {
      const text = ${JSON.stringify(text)};
      const target = document.querySelector('.restty-terminal-surface textarea');
      if (!target) throw new Error('Restty paste target is missing');
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: (type) => type === 'text/plain' ? text : '' } });
      target.dispatchEvent(event);
    })()`,
    true,
  );
}
