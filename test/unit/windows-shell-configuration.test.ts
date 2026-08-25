import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  validateUserConfiguration,
} from "../../src/main/user-configuration";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";

const configPath = "/isolated/config/omxterm/config.json";
const windowsShell = "C:\\Program Files\\Git\\bin\\bash.exe";

const getInstalledFontFamilyMetrics = vi.fn(async () => undefined);

function encodedConfiguration(document: object) {
  return vi.fn(async () =>
    new TextEncoder().encode(JSON.stringify(document)),
  ) as never;
}

describe("windowsShell User Configuration", () => {
  it.each(["darwin", "linux", "win32"])(
    "accepts a structurally valid value on %s",
    (platform) => {
      const configuration = validateUserConfiguration(
        { version: 1, windowsShell },
        configPath,
        new Set(),
        DEFAULT_TERMINAL_KEYBINDS,
        platform,
      );

      expect(configuration.windowsShell).toBe(windowsShell);
    },
  );

  it.each(["darwin", "linux", "win32"])(
    "rejects empty and NUL-containing values on %s",
    (platform) => {
      for (const invalid of ["", "C:\\bad\0shell.exe"]) {
        expect(() =>
          validateUserConfiguration(
            { version: 1, windowsShell: invalid },
            configPath,
            new Set(),
            DEFAULT_TERMINAL_KEYBINDS,
            platform,
          ),
        ).toThrow(expect.objectContaining({ location: "windowsShell" }));
      }
    },
  );

  it("rejects a relative value only on Windows", () => {
    expect(() =>
      validateUserConfiguration(
        { version: 1, windowsShell: ".\\bash.exe" },
        configPath,
        new Set(),
        DEFAULT_TERMINAL_KEYBINDS,
        "win32",
      ),
    ).toThrow(
      expect.objectContaining({
        location: "windowsShell",
        reason: "must be an absolute Windows filesystem path",
      }),
    );
    expect(
      validateUserConfiguration(
        { version: 1, windowsShell: ".\\bash.exe" },
        configPath,
        new Set(),
        DEFAULT_TERMINAL_KEYBINDS,
        "linux",
      ).windowsShell,
    ).toBe(".\\bash.exe");
  });

  it.each(["darwin", "linux"])(
    "loads the value on %s without filesystem inspection, warning, or effect",
    async (platform) => {
      const inspectWindowsShell = vi.fn(async () => {
        throw new Error("must not inspect on POSIX");
      });
      const load = await loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: "/isolated" },
        homeDirectory: "/home/tester",
        platform,
        read: encodedConfiguration({ version: 1, windowsShell }),
        inspectWindowsShell,
        getInstalledFontFamilyMetrics,
      });

      expect(load.fallback).toBeUndefined();
      expect(load.warnings).toBeUndefined();
      expect(load.configuration.windowsShell).toBe(windowsShell);
      expect(inspectWindowsShell).not.toHaveBeenCalled();
    },
  );

  it("uses complete startup defaults for a relative Windows value without inspecting it", async () => {
    const inspectWindowsShell = vi.fn();
    const load = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: "C:\\Users\\tester\\.config" },
      homeDirectory: "C:\\Users\\tester",
      platform: "win32",
      read: encodedConfiguration({
        version: 1,
        confirmClose: false,
        windowsShell: ".\\bash.exe",
      }),
      inspectWindowsShell: inspectWindowsShell as never,
      getInstalledFontFamilyMetrics,
    });

    expect(load.configuration).toEqual({
      ...DEFAULT_USER_CONFIGURATION,
      keybinds: terminalDefaultKeybinds("win32"),
    });
    expect(load.fallback).toMatchObject({
      surface: "configuration",
      error: {
        location: "windowsShell",
        reason: "must be an absolute Windows filesystem path",
      },
    });
    expect(inspectWindowsShell).not.toHaveBeenCalled();
  });

  it("keeps the path as written when inspection follows its final target to a regular file", async () => {
    const inspectWindowsShell = vi.fn(async () => ({ isFile: () => true }));
    const load = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: "C:\\Users\\tester\\.config" },
      homeDirectory: "C:\\Users\\tester",
      platform: "win32",
      read: encodedConfiguration({ version: 1, windowsShell }),
      inspectWindowsShell: inspectWindowsShell as never,
      getInstalledFontFamilyMetrics,
    });

    expect(load.fallback).toBeUndefined();
    expect(load.configuration.windowsShell).toBe(windowsShell);
    expect(inspectWindowsShell).toHaveBeenCalledExactlyOnceWith(windowsShell);
  });

  it.each([
    [
      "missing or inaccessible",
      vi.fn(async () => Promise.reject(new Error("unavailable"))),
      "the final target could not be inspected",
    ],
    [
      "not a regular file",
      vi.fn(async () => ({ isFile: () => false })),
      "the final target must be an existing regular file",
    ],
  ])(
    "uses complete defaults when the Windows target is %s",
    async (_kind, inspectWindowsShell, reason) => {
      const load = await loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: "C:\\Users\\tester\\.config" },
        homeDirectory: "C:\\Users\\tester",
        platform: "win32",
        read: encodedConfiguration({
          version: 1,
          confirmClose: false,
          windowsShell: "C:\\selected\\shell.exe",
        }),
        inspectWindowsShell: inspectWindowsShell as never,
        getInstalledFontFamilyMetrics,
      });

      expect(load.configuration).toEqual({
        ...DEFAULT_USER_CONFIGURATION,
        keybinds: terminalDefaultKeybinds("win32"),
      });
      expect(load.fallback).toMatchObject({
        surface: "configuration",
        error: { location: "windowsShell", reason },
      });
    },
  );
});
