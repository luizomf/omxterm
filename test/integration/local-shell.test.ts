import * as nodePty from "node-pty";
import type { IPty } from "node-pty";
import { userInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveDefaultShell } from "../../src/main/default-shell";
import {
  createLocalTerminalSession,
  TERMINAL_OUTPUT_PAUSE_BYTES,
} from "../../src/main/local-terminal-session";
import { isNativeTestArchitecture } from "../fixtures/native-architecture";

const supportedEnvironment =
  (process.platform === "darwin" || process.platform === "linux") &&
  isNativeTestArchitecture();

const windowsEnvironment =
  process.platform === "win32" && isNativeTestArchitecture();

describe.skipIf(!supportedEnvironment)("real local PTY", () => {
  it("starts the OS-configured interactive login shell in home and carries input/output", async () => {
    const account = userInfo();
    if (!account.shell)
      throw new Error("The operating system did not provide a Default Shell");
    const defaultShell = account.shell;

    let terminalPayload = "";
    let session: ReturnType<typeof createLocalTerminalSession> | undefined;
    const observed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Local shell check timed out")),
        10_000,
      );
      session = createLocalTerminalSession(nodePty.spawn, {
        shell: defaultShell,
        platform: process.platform,
        homeDirectory: account.homedir,
        applicationVersionProvider: { getVersion: () => "9.8.7-test" },
        environment: {
          ...process.env,
          OMXTERM_INHERITED_TEST: "inherited-value",
        },
        onOutput(data) {
          terminalPayload = (terminalPayload + data).slice(-16_384);
          if (
            terminalPayload.includes(
              `__OMXTERM_CWD__${account.homedir}__FLAGS__`,
            ) &&
            terminalPayload.includes("__OMXTERM_END__")
          ) {
            clearTimeout(timer);
            resolve();
          }
        },
        onExit(event) {
          if (
            !terminalPayload.includes(
              `__OMXTERM_CWD__${account.homedir}__FLAGS__`,
            )
          ) {
            clearTimeout(timer);
            reject(
              new Error(
                `Local shell exited before the check completed (${event.exitCode})`,
              ),
            );
          }
        },
      });

      session.write(
        'printf \'__OMXTERM_CWD__%s__FLAGS__%s__CAPS__%s|%s|%s|%s__INHERITED__%s__UNICODE__Olá🙂__OMXTERM_END__\\n\' "$PWD" "$-" "$TERM" "$COLORTERM" "$TERM_PROGRAM" "$TERM_PROGRAM_VERSION" "$OMXTERM_INHERITED_TEST"\r',
      );
    });
    try {
      await observed;
      expect(terminalPayload).toMatch(
        new RegExp(
          `__OMXTERM_CWD__${escapeRegExp(account.homedir)}__FLAGS__[^_]*i[^_]*__CAPS__xterm-256color\\|truecolor\\|OMXTerm\\|9\\.8\\.7-test__INHERITED__inherited-value__UNICODE__Olá🙂__OMXTERM_END__`,
        ),
      );
    } finally {
      session?.close();
      terminalPayload = "";
    }
  }, 15_000);

  it.skipIf(process.platform !== "darwin")(
    "bounds a stalled 2 MiB macOS PTY stream and preserves ordered exit tail",
    async () => {
      const lineCount = 65_536;
      const lineBytes = 32;
      const expectedPayloadBytes = lineCount * lineBytes;
      const endMarker = "__OMXTERM_OUTPUT_END__";
      const producer = `let i=0;const write=()=>{while(i<${lineCount}){const line=String(i).padStart(8,"0")+":"+"x".repeat(23);i++;if(!process.stdout.write(line)){process.stdout.once("drain",write);return}}process.stdout.write("${endMarker}")};write()`;
      let pauseCount = 0;
      let resumeCount = 0;
      const spawn = (...arguments_: Parameters<typeof nodePty.spawn>) => {
        const terminal = nodePty.spawn(...arguments_);
        const pause = terminal.pause.bind(terminal);
        const resume = terminal.resume.bind(terminal);
        terminal.pause = () => {
          pauseCount += 1;
          return pause();
        };
        terminal.resume = () => {
          resumeCount += 1;
          return resume();
        };
        return terminal as IPty;
      };
      let session: ReturnType<typeof createLocalTerminalSession> | undefined;
      let remainder = "";
      let nextLine = 0;
      let receivedBytes = 0;
      let acknowledgedBytes = 0;
      let maxPendingBytes = 0;
      let largestChunkBytes = 0;
      let markerSeen = false;
      let stallReleased = false;
      let exitEvent: { exitCode: number; signal: number } | undefined;
      const completed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Stalled output PTY check timed out")),
          20_000,
        );
        session = createLocalTerminalSession(spawn, {
          shell: "/bin/sh",
          launchRequest: {
            kind: "explicit-command",
            executable: process.execPath,
            arguments: ["-e", producer],
          },
          platform: process.platform,
          homeDirectory: process.cwd(),
          applicationVersionProvider: { getVersion: () => "output-test" },
          environment: process.env,
          onOutput(data) {
            const chunkBytes = Buffer.byteLength(data);
            receivedBytes += chunkBytes;
            largestChunkBytes = Math.max(largestChunkBytes, chunkBytes);
            maxPendingBytes = Math.max(
              maxPendingBytes,
              receivedBytes - acknowledgedBytes,
            );
            remainder += data;
            while (remainder.length >= lineBytes && nextLine < lineCount) {
              const line = remainder.slice(0, lineBytes);
              remainder = remainder.slice(lineBytes);
              const expected = `${String(nextLine).padStart(8, "0")}:${"x".repeat(23)}`;
              if (line !== expected) {
                reject(new Error(`Output order failed at record ${nextLine}`));
                return;
              }
              nextLine += 1;
            }
            if (nextLine === lineCount && remainder.includes(endMarker)) {
              markerSeen = true;
              remainder = remainder.replace(endMarker, "");
            }
            if (stallReleased && session?.acknowledgeOutput?.(chunkBytes))
              acknowledgedBytes += chunkBytes;
          },
          onExit(exit) {
            clearTimeout(timer);
            exitEvent = exit;
            resolve();
          },
        });
        session.resize({ cols: 101, rows: 37 });
        setTimeout(() => {
          session?.resize({ cols: 93, rows: 31 });
          const progress = receivedBytes - acknowledgedBytes;
          if (progress > 0 && session?.acknowledgeOutput?.(progress))
            acknowledgedBytes += progress;
          stallReleased = true;
        }, 300);
      });

      try {
        await completed;
        expect(nextLine).toBe(lineCount);
        expect(receivedBytes).toBe(expectedPayloadBytes + endMarker.length);
        expect(markerSeen).toBe(true);
        expect(remainder).toBe("");
        expect(exitEvent).toEqual({ exitCode: 0, signal: 0 });
        expect(pauseCount).toBeGreaterThan(0);
        expect(resumeCount).toBeGreaterThan(0);
        expect(maxPendingBytes).toBeLessThanOrEqual(
          TERMINAL_OUTPUT_PAUSE_BYTES + largestChunkBytes,
        );
      } finally {
        session?.close();
        remainder = "";
      }
    },
    25_000,
  );

  it.skipIf(process.platform !== "darwin")(
    "owns a disposable macOS PTY through startup, resize, and clean exit",
    async () => {
      const account = userInfo();
      if (!account.shell)
        throw new Error("The operating system did not provide a Default Shell");
      const defaultShell = account.shell;
      let terminalPayload = "";
      let exitEvent: { exitCode: number; signal: number } | undefined;
      let session: ReturnType<typeof createLocalTerminalSession> | undefined;
      const completed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Owned macOS PTY check timed out")),
          10_000,
        );
        session = createLocalTerminalSession(nodePty.spawn, {
          shell: defaultShell,
          platform: process.platform,
          homeDirectory: account.homedir,
          applicationVersionProvider: { getVersion: () => "pty-test" },
          environment: process.env,
          onOutput(data) {
            terminalPayload = (terminalPayload + data).slice(-16_384);
          },
          onExit(exit) {
            clearTimeout(timer);
            exitEvent = exit;
            resolve();
          },
        });
        session.resize({ cols: 101, rows: 37 });
        session.write(
          "printf '__OMXTERM_SIZE__'; stty size; printf '__OMXTERM_EXIT__\\n'; exit 0\r",
        );
      });

      try {
        await completed;
        expect(terminalPayload).toMatch(/__OMXTERM_SIZE__37 101/u);
        expect(terminalPayload).toContain("__OMXTERM_EXIT__");
        expect(exitEvent).toEqual({ exitCode: 0, signal: 0 });
      } finally {
        session?.close();
        terminalPayload = "";
      }
    },
    15_000,
  );
});

// ConPTY renders into an 80-column screen buffer and repaints with cursor
// and styling sequences, so a long single-line marker would be split. The
// Windows check emits one short marker per line and matches after stripping
// the rendering sequences (#61).
describe.skipIf(!windowsEnvironment)("real local ConPTY", () => {
  it("starts the Windows Default Shell in home and carries input/output", async () => {
    const account = userInfo();
    const defaultShell = resolveDefaultShell(
      process.platform,
      account.shell,
      process.env,
    );

    let terminalPayload = "";
    let session: ReturnType<typeof createLocalTerminalSession> | undefined;
    const cwdMarker = `__OMXTERM_CWD__${account.homedir}__END__`;
    const observed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Local shell check timed out")),
        25_000,
      );
      session = createLocalTerminalSession(nodePty.spawn, {
        shell: defaultShell,
        platform: process.platform,
        homeDirectory: account.homedir,
        applicationVersionProvider: { getVersion: () => "9.8.7-test" },
        environment: {
          ...process.env,
          OMXTERM_INHERITED_TEST: "inherited-value",
        },
        onOutput(data) {
          terminalPayload = (terminalPayload + data).slice(-65_536);
          const plain = stripConptyRendering(terminalPayload);
          // Both markers only exist expanded: the echoed command line shows
          // the unexpanded $(...) subexpressions instead.
          if (plain.includes(cwdMarker) && plain.includes("__OMXTERM_DONE__")) {
            clearTimeout(timer);
            resolve();
          }
        },
        onExit(event) {
          if (!stripConptyRendering(terminalPayload).includes(cwdMarker)) {
            clearTimeout(timer);
            reject(
              new Error(
                `Local shell exited before the check completed (${event.exitCode})`,
              ),
            );
          }
        },
      });

      session.write(
        '"__OMXTERM_CWD__$($PWD.Path)__END__"; ' +
          '"__CAPS__$env:TERM|$env:COLORTERM"; ' +
          '"__PROG__$env:TERM_PROGRAM|$env:TERM_PROGRAM_VERSION"; ' +
          '"__INH__${env:OMXTERM_INHERITED_TEST}__U__Olá🙂"; ' +
          "\"__OMXTERM_$('DONE')__\"\r",
      );
    });
    try {
      await observed;
      const plain = stripConptyRendering(terminalPayload);
      expect(plain).toContain(cwdMarker);
      expect(plain).toContain("__CAPS__xterm-256color|truecolor");
      expect(plain).toContain("__PROG__OMXTerm|9.8.7-test");
      expect(plain).toContain("__INH__inherited-value__U__Olá🙂");
    } finally {
      session?.close();
      terminalPayload = "";
    }
  }, 30_000);
  it.skipIf(!process.env.OMXTERM_WINDOWS_SHELL_TEST)(
    "starts a configured Git for Windows Bash through ConPTY",
    async () => {
      const account = userInfo();
      const configuredShell = process.env.OMXTERM_WINDOWS_SHELL_TEST!;
      const defaultShell = resolveDefaultShell(
        process.platform,
        account.shell,
        process.env,
        configuredShell,
      );

      let terminalPayload = "";
      let session: ReturnType<typeof createLocalTerminalSession> | undefined;
      const observed = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Configured Bash ConPTY check timed out")),
          25_000,
        );
        session = createLocalTerminalSession(nodePty.spawn, {
          shell: defaultShell,
          platform: process.platform,
          homeDirectory: account.homedir,
          applicationVersionProvider: { getVersion: () => "9.8.7-test" },
          environment: process.env,
          onOutput(data) {
            terminalPayload = (terminalPayload + data).slice(-65_536);
            if (
              stripConptyRendering(terminalPayload).includes(
                "__OMXTERM_CONFIGURED_BASH__xterm-256color|OMXTerm__",
              )
            ) {
              clearTimeout(timer);
              resolve();
            }
          },
          onExit(event) {
            clearTimeout(timer);
            reject(
              new Error(
                `Configured Bash exited before the check completed (${event.exitCode})`,
              ),
            );
          },
        });

        session.write(
          'printf \'__OMXTERM_CONFIGURED_BASH__%s|%s__\\n\' "$TERM" "$TERM_PROGRAM"\r',
        );
      });
      try {
        await observed;
        expect(defaultShell).toBe(configuredShell);
        expect(session?.fallbackTitle).toBe("bash.exe");
      } finally {
        session?.close();
        terminalPayload = "";
      }
    },
    30_000,
  );
});

// Removes OSC and CSI rendering sequences, remaining escapes, and line
// breaks so wrapped repaints compare as plain contiguous text. Control
// characters are built from char codes to keep this source printable.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

function stripConptyRendering(payload: string): string {
  const osc = new RegExp(`${ESC}\\][^]*?(?:${BEL}|${ESC}\\\\)`, "gu");
  const csi = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, "gu");
  const escape = new RegExp(`${ESC}[@-Z\\\\-_]`, "gu");
  return payload
    .replace(osc, "")
    .replace(csi, "")
    .replace(escape, "")
    .replace(/[\r\n]/gu, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
