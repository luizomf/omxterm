import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";
import { expect, it, vi } from "vitest";
import {
  defaultInputCommand,
  nativeFixturePlatform,
} from "../fixtures/restty-host-platform";
import { createResttyHostSessions } from "../fixtures/restty-host-sessions";

it("executes the typed Unicode command and returns the full acknowledgement", () => {
  const args =
    process.platform === "win32"
      ? [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); " +
            defaultInputCommand(),
        ]
      : ["-c", defaultInputCommand()];
  expect(
    execFileSync(nativeFixturePlatform.defaultShell, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5_000,
      killSignal: "SIGKILL",
    }).trim(),
  ).toBe("__DEFAULT_INPUT__Olá🙂");
}, 10_000);

it.skipIf(process.platform !== "win32")(
  "the exact owned PowerShell setup verifies process-local isolation without creating history",
  async () => {
    const home = mkdtempSync(path.join(tmpdir(), "omxterm-restty-shell-"));
    try {
      const app = Object.assign(new EventEmitter(), { exit: vi.fn() });
      const fixture = createResttyHostSessions({
        app,
        signals: new EventEmitter(),
        windows: () => [],
        reportError: (message) => {
          throw new Error(message);
        },
        spawn(file, args, options) {
          // Execute the factory's exact script without interactive ReadLine.
          // The host integration separately covers its real PTY/input route.
          const output = execFileSync(
            file,
            ["-NonInteractive", ...args.filter((arg) => arg !== "-NoExit")],
            {
              encoding: "utf8",
              cwd: home,
              env: { ...process.env, ...options.env },
              stdio: ["ignore", "pipe", "pipe"],
              timeout: 5_000,
              killSignal: "SIGKILL",
            },
          );
          expect(output).toContain("__OMXTERM_RESTTY_SHELL_ISOLATED__");
          // Replay only this completed subprocess's output/exit at the native
          // adapter seam; no real PTY, Electron app or window is created here.
          return {
            onData(listener) {
              listener(output);
              return { dispose() {} };
            },
            onExit(listener) {
              listener({ exitCode: 0 });
              return { dispose() {} };
            },
          } as IPty;
        },
      });
      fixture.createSession({
        shell: nativeFixturePlatform.defaultShell,
        platform: process.platform,
        homeDirectory: home,
        environment: { HOME: home },
        applicationVersionProvider: { getVersion: () => "0.16.0" },
        onOutput() {},
        onExit() {},
      });
      await fixture.waitFor(() => true, "native PowerShell setup");
      await fixture.complete(0);
      expect(app.exit).toHaveBeenCalledExactlyOnceWith(0);
      expect(existsSync(path.join(home, "restty-history.txt"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
  10_000,
);
