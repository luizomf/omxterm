import * as nodePty from "node-pty";
import { userInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";

const supportedEnvironment =
  (process.platform === "darwin" || process.platform === "linux") &&
  process.arch === "arm64";

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
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
