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
      startCommand: undefined,
      completionMarker: undefined,
      command: `${process.platform === "darwin" ? "shasum -a 256" : "sha256sum"} <<'__OMXTERM_PAYLOAD__'\n${payload}__OMXTERM_PAYLOAD__\nstty echo\n`,
      digest,
      length: payload.length,
    };

  const nodeExecutable = process.env["npm_node_execpath"];
  if (!nodeExecutable)
    throw new Error("Native paste fixture requires npm_node_execpath");
  // Keep the Windows argv below its native limit. The large payload must
  // traverse the PTY as stdin, not be embedded in a command-line argument.
  const program = `const c=require('node:crypto');let b=Buffer.alloc(0);process.stdin.setRawMode(true);process.stdin.on('data',chunk=>{b=Buffer.concat([b,chunk]);if(b.length>=${Buffer.byteLength(payload)}){process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write(c.createHash('sha256').update(b).digest('hex')+'  -\\n',()=>process.exit(0))}});process.stdout.write('__PASTE_RECEIVER_READY__\\n')`;
  const executable = `'${nodeExecutable.replaceAll("'", "''")}'`;
  const encodedProgram = Buffer.from(program).toString("base64");
  const completionMarker = "__PASTE_RECEIVER_EXITED__";
  const encodedCompletionMarker =
    Buffer.from(completionMarker).toString("base64");
  return {
    startCommand: `& ${executable} -e "eval(Buffer.from('${encodedProgram}','base64').toString())"; Write-Output ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedCompletionMarker}')))\r`,
    completionMarker,
    command: payload,
    digest,
    length: payload.length,
  };
}

export async function prepareLargePasteShell(
  options: {
    readonly write: (data: string) => void;
    readonly output: () => string;
    readonly waitFor: (
      predicate: () => boolean,
      label: string,
    ) => Promise<void>;
  },
  platform: NodeJS.Platform = process.platform,
) {
  if (platform === "win32") {
    const interruptStart = options.output().length;
    options.write("\u0003");
    await options.waitFor(
      () => /PS [^\r\n]*> /u.test(options.output().slice(interruptStart)),
      "owned PowerShell prompt after interrupt",
    );
    const marker = "__PASTE_SHELL_READY__";
    const encodedMarker = Buffer.from(marker).toString("base64");
    options.write(
      `Write-Output ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedMarker}')))\r`,
    );
    try {
      await options.waitFor(
        () => options.output().includes(marker),
        "owned PowerShell paste fixture readiness",
      );
    } catch (cause) {
      throw new Error("PowerShell paste fixture produced no readiness marker", {
        cause,
      });
    }
    return;
  }
  options.write("x\u0015");
  options.write("stty -echo; printf '__PASTE_ECHO_OFF__\\n'\r");
  await options.waitFor(
    () => options.output().includes("__PASTE_ECHO_OFF__"),
    "owned PTY echo disable",
  );
}

export async function exerciseLargePasteThroughPty(options: {
  readonly window: BrowserWindow;
  readonly write: (data: string) => void;
  readonly output: () => string;
  readonly waitFor: (predicate: () => boolean, label: string) => Promise<void>;
}) {
  const fixture = createLargePasteFixture();
  if (fixture.startCommand) {
    options.write(fixture.startCommand);
    try {
      await options.waitFor(
        () => options.output().includes("__PASTE_RECEIVER_READY__"),
        "owned raw paste receiver",
      );
    } catch (cause) {
      throw new Error("Raw paste receiver produced no readiness marker", {
        cause,
      });
    }
  }
  await dispatchDomPaste(options.window, fixture.command);
  await options.waitFor(
    () => options.output().includes(`${fixture.digest}  -`),
    "complete ordered large DOM paste through the owned PTY",
  );
  const { completionMarker } = fixture;
  if (completionMarker)
    await options.waitFor(
      () => options.output().includes(completionMarker),
      "owned raw paste receiver exit",
    );
  return fixture;
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
