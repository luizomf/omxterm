import * as nodePty from "node-pty";
import { userInfo } from "node:os";
import { describe, expect, it } from "vitest";

const supportedEnvironment =
  process.platform === "darwin" && process.arch === "arm64";

describe.skipIf(!supportedEnvironment)("real local PTY", () => {
  it("starts the OS-configured interactive login shell in home and carries input/output", async () => {
    const account = userInfo();
    if (!account.shell)
      throw new Error("The operating system did not provide a Default Shell");

    const terminal = nodePty.spawn(account.shell, ["-l"], {
      cwd: account.homedir,
      env: process.env,
      cols: 80,
      rows: 24,
    });

    let terminalPayload = "";
    const observed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Local shell check timed out")),
        10_000,
      );
      terminal.onData((data) => {
        terminalPayload = (terminalPayload + data).slice(-16_384);
        if (
          terminalPayload.includes(`__OMXTERM_CWD__${account.homedir}__FLAGS__`)
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
      terminal.onExit((event) => {
        if (!terminalPayload.includes("__OMXTERM_CWD__")) {
          clearTimeout(timer);
          reject(
            new Error(
              `Local shell exited before the check completed (${event.exitCode})`,
            ),
          );
        }
      });
    });

    terminal.write(
      'printf \'__OMXTERM_CWD__%s__FLAGS__%s__END__\\n\' "$PWD" "$-"\r',
    );
    await observed;
    expect(terminalPayload).toMatch(
      new RegExp(
        `__OMXTERM_CWD__${escapeRegExp(account.homedir)}__FLAGS__[^_]*i[^_]*__END__`,
      ),
    );
    terminal.kill();
    terminalPayload = "";
  }, 15_000);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
