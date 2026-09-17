import { createHash } from "node:crypto";
import type { BrowserWindow } from "electron";

export function createLargePasteFixture() {
  const payload =
    Array.from(
      { length: 100 },
      (_, index) =>
        `${index.toString().padStart(4, "0")}:${"0123456789abcdef".repeat(49)}`,
    ).join("\n") + "\n";
  const digest = createHash("sha256").update(payload).digest("hex");
  if (process.platform !== "win32")
    return {
      command: `${process.platform === "darwin" ? "shasum -a 256" : "sha256sum"} <<'__OMXTERM_PAYLOAD__'\n${payload}__OMXTERM_PAYLOAD__\nstty echo\n`,
      digest,
      length: payload.length,
    };

  const encoded = Buffer.from(payload).toString("base64");
  const program = `const c=require('node:crypto');const b=Buffer.from('${encoded}','base64');process.stdout.write(c.createHash('sha256').update(b).digest('hex')+'  -\\n')`;
  const executable = `'${process.execPath.replaceAll("'", "''")}'`;
  return {
    command: `& ${executable} -e ${JSON.stringify(program)}\n`,
    digest,
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
