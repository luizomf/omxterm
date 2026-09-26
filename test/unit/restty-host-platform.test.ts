import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import {
  defaultInputCommand,
  nativeFixturePlatform,
} from "../fixtures/restty-host-platform";

it.each(["win32", "darwin", "linux"] as const)(
  "%s Unicode execution acknowledgement cannot be satisfied by command echo",
  (platform) => {
    const typed = defaultInputCommand(platform);
    expect(typed).toContain("Olá🙂");
    expect(typed).not.toContain("__DEFAULT_INPUT__Olá🙂");
  },
);

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
    }).trim(),
  ).toBe("__DEFAULT_INPUT__Olá🙂");
});
