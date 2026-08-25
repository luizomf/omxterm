import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultShellResolver,
  resolveDefaultShell,
} from "../../src/main/default-shell";

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

  it("uses a validated configured Windows shell as written", () => {
    const configured = "C:\\Program Files\\Git\\bin\\bash.exe";
    const exists = vi.fn(() => {
      throw new Error("built-in resolution must not run");
    });

    expect(resolveDefaultShell("win32", null, {}, configured, exists)).toBe(
      configured,
    );
    expect(exists).not.toHaveBeenCalled();
  });

  it("reads the current configured shell for every future resolution", () => {
    let configured = "C:\\initial\\shell.exe";
    const resolveCurrent = createDefaultShellResolver(
      null,
      () => configured,
      "win32",
      {},
    );

    expect(resolveCurrent()).toBe("C:\\initial\\shell.exe");
    configured = "C:\\reloaded\\shell.exe";
    expect(resolveCurrent()).toBe("C:\\reloaded\\shell.exe");
  });

  it("prefers Windows PowerShell on win32", () => {
    expect(
      resolveDefaultShell(
        "win32",
        null,
        { SystemRoot: "C:\\WINDOWS" },
        undefined,
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
        undefined,
        (candidate) => candidate.endsWith("cmd.exe"),
      ),
    ).toBe("C:\\WINDOWS\\System32\\cmd.exe");
    expect(() =>
      resolveDefaultShell("win32", null, {}, undefined, () => false),
    ).toThrow("The operating system did not provide a Default Shell");
  });
});
