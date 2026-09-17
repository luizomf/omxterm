import * as nodePty from "node-pty";
import { userInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveDefaultShell } from "../../src/main/default-shell";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";

const supportedEnvironment =
  (process.platform === "darwin" || process.platform === "linux") &&
  process.arch === "arm64";

const windowsEnvironment =
  process.platform === "win32" && process.arch === "arm64";

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
