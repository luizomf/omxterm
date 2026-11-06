import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ready = "\u001b[?2004lSNIPPETS_SHELL_READY\r\n";

async function shellMode(command: string, home: string): Promise<string> {
  const { spawn } = await import("node-pty");
  const terminal = spawn("/bin/sh", ["-i"], {
    cwd: home,
    env: {
      HOME: home,
      PATH: "/usr/bin:/bin",
      TERM: "xterm-256color",
      LANG: "C",
      ENV: path.join(home, ".snippets-prompt"),
      INPUTRC: path.join(home, ".snippets-bracketed-inputrc"),
    },
    cols: 80,
    rows: 24,
  });
  return new Promise((resolve, reject) => {
    let output = "";
    let observation = "";
    let phase = 0;
    let failure: Error | undefined;
    const timer = setTimeout(() => {
      failure = new Error(
        "Controlled shell did not settle within five seconds",
      );
      terminal.kill();
    }, 5000);
    const subscription = terminal.onData((chunk) => {
      output += chunk;
      if (output.length > 16_384) {
        failure = new Error("Controlled shell output exceeded the bound");
        terminal.kill();
        return;
      }
      const prompts = output.match(/MODE_PROBE> /g)?.length ?? 0;
      if (phase === 0 && prompts >= 1) {
        phase = 1;
        terminal.write(`${command}\r`);
      } else if (phase === 1 && output.includes(ready) && prompts >= 2) {
        phase = 2;
        terminal.write("\r");
      } else if (phase === 2 && prompts >= 3) {
        observation = output;
        phase = 3;
        terminal.write("exit\r");
      }
    });
    terminal.onExit(({ exitCode }) => {
      clearTimeout(timer);
      subscription.dispose();
      if (failure) reject(failure);
      else if (phase !== 3 || exitCode !== 0)
        reject(
          new Error(`Controlled shell exited before settling: ${exitCode}`),
        );
      else resolve(observation.match(/\u001b\[\?2004[hl]/g)?.at(-1) ?? "");
    });
  });
}

it.skipIf(process.platform !== "linux")(
  "keeps the fixture's controlled shell plain after interactive startup and another prompt",
  async () => {
    const { controlledPosixShellCommand } =
      require("../fixtures/snippets-scenario.cjs") as {
        controlledPosixShellCommand(configured: boolean): string;
      };
    const root = mkdtempSync(path.join(os.tmpdir(), "snippets-shell-mode-"));
    const home = path.join(root, "home");
    mkdirSync(home);
    try {
      writeFileSync(
        path.join(home, ".snippets-prompt"),
        "PS1='MODE_PROBE> '\n",
        {
          mode: 0o600,
        },
      );
      writeFileSync(
        path.join(home, ".snippets-bracketed-inputrc"),
        "set enable-bracketed-paste on\n",
        { mode: 0o600 },
      );
      writeFileSync(
        path.join(home, ".snippets-plain-inputrc"),
        "set enable-bracketed-paste off\n",
        { mode: 0o600 },
      );
      const ordinary = await shellMode(
        controlledPosixShellCommand(false),
        home,
      );
      const controlled = await shellMode(
        controlledPosixShellCommand(true),
        home,
      );
      if (realpathSync("/bin/sh").endsWith("/bash"))
        expect(ordinary).toBe("\u001b[?2004h");
      expect(controlled).toBe("\u001b[?2004l");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  15_000,
);
