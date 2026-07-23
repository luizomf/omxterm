import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDefaultShell } from "../../src/main/default-shell";

const windowsPowerShell = path.join(
  "C:\\WINDOWS",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

describe("Default Shell resolution", () => {
  it("uses the account shell on POSIX and refuses a missing one", () => {
    expect(resolveDefaultShell("darwin", "/bin/zsh", {})).toBe("/bin/zsh");
    expect(() => resolveDefaultShell("linux", null, {})).toThrow(
      "The operating system did not provide a Default Shell",
    );
  });

  it("prefers Windows PowerShell on win32", () => {
    expect(
      resolveDefaultShell(
        "win32",
        null,
        { SystemRoot: "C:\\WINDOWS" },
        (candidate) => candidate === windowsPowerShell,
      ),
    ).toBe(windowsPowerShell);
  });

  it("falls back to ComSpec and then refuses on win32", () => {
    expect(
      resolveDefaultShell(
        "win32",
        null,
        {
          SystemRoot: "C:\\WINDOWS",
          ComSpec: "C:\\WINDOWS\\System32\\cmd.exe",
        },
        (candidate) => candidate.endsWith("cmd.exe"),
      ),
    ).toBe("C:\\WINDOWS\\System32\\cmd.exe");
    expect(() => resolveDefaultShell("win32", null, {}, () => false)).toThrow(
      "The operating system did not provide a Default Shell",
    );
  });
});
