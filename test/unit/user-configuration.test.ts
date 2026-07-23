import {
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startWithUserConfiguration } from "../../src/main/configured-startup";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  resolveUserConfigurationPath,
  UserConfigurationError,
  userConfigurationFallbackNotice,
  validateUserConfiguration,
  type UserConfigurationLoad,
} from "../../src/main/user-configuration";

const configPath = "/isolated/config/omxterm/config.json";
const installedFonts = new Set(["SF Mono", "Exact Family"]);
const commonFontMetrics = Object.freeze({ cellWidth: 8, cellHeight: 16 });

function externalTheme(background = "#1e1e2e") {
  return {
    version: 1,
    name: "external-theme",
    colors: { ...DEFAULT_TERMINAL_THEME.colors, background },
  };
}

async function getInstalledFontFamilyMetrics(family: string) {
  return installedFonts.has(family) ? commonFontMetrics : undefined;
}

describe("strict version 1 User Configuration", () => {
  it("resolves non-empty XDG_CONFIG_HOME exactly and falls back for unset or empty values", () => {
    expect(
      resolveUserConfigurationPath(
        { XDG_CONFIG_HOME: "/xdg-root" },
        "/home/tester",
      ),
    ).toBe("/xdg-root/omxterm/config.json");
    expect(
      resolveUserConfigurationPath({ XDG_CONFIG_HOME: "" }, "/home/tester"),
    ).toBe("/home/tester/.config/omxterm/config.json");
    expect(resolveUserConfigurationPath({}, "/home/tester")).toBe(
      "/home/tester/.config/omxterm/config.json",
    );
  });

  it("uses all documented defaults when only version is present", () => {
    const configuration = validateUserConfiguration(
      { version: 1 },
      configPath,
      new Set(),
    );
    expect(configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(configuration.fontLineHeight).toBe(1);
    expect(configuration.terminalPadding).toEqual({
      top: 0,
      right: 8,
      bottom: 8,
      left: 8,
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.terminalPadding)).toBe(true);
  });

  it("accepts every preference and preserves exact values for every consumer", () => {
    expect(
      validateUserConfiguration(
        {
          version: 1,
          confirmClose: false,
          logLevel: "debug",
          font: { family: "Exact Family", size: 23, lineHeight: 1.15 },
          terminal: {
            padding: { top: 0, right: 12, bottom: 8, left: 16 },
          },
          scrollback: { lines: 0 },
          keyboard: { optionAsAlt: "left" },
          window: { alwaysOnTop: true },
          keybinds: { newWindow: "CommandOrControl+G" },
        },
        configPath,
        installedFonts,
      ),
    ).toEqual({
      version: 1,
      confirmClose: false,
      logLevel: "debug",
      fontFamily: "Exact Family",
      fontSize: 23,
      fontLineHeight: 1.15,
      terminalPadding: { top: 0, right: 12, bottom: 8, left: 16 },
      scrollbackLines: 0,
      optionKeyMode: "left",
      alwaysOnTop: true,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      keybinds: {
        ...DEFAULT_TERMINAL_KEYBINDS,
        newWindow: "CommandOrControl+G",
      },
    });
  });

  it.each([
    [1, true],
    [1.15, true],
    [2, true],
    [0.99, false],
    [2.01, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
  ])(
    "validates font.lineHeight %s at the schema boundary",
    (lineHeight, accepted) => {
      const action = () =>
        validateUserConfiguration(
          { version: 1, font: { lineHeight } },
          configPath,
          installedFonts,
        );
      if (accepted) expect(action().fontLineHeight).toBe(lineHeight);
      else
        expect(action).toThrow(
          expect.objectContaining({ location: "font.lineHeight" }),
        );
    },
  );

  it.each([0, 128])(
    "accepts terminal.padding boundary %s on every side",
    (padding) => {
      expect(
        validateUserConfiguration(
          {
            version: 1,
            terminal: {
              padding: {
                top: padding,
                right: padding,
                bottom: padding,
                left: padding,
              },
            },
          },
          configPath,
          installedFonts,
        ).terminalPadding,
      ).toEqual({
        top: padding,
        right: padding,
        bottom: padding,
        left: padding,
      });
    },
  );

  it.each(
    ["top", "right", "bottom", "left"].flatMap((side) =>
      [-1, 1.5, 129].map((value) => [side, value] as const),
    ),
  )("rejects terminal.padding.%s value %s", (side, value) => {
    expect(() =>
      validateUserConfiguration(
        { version: 1, terminal: { padding: { [side]: value } } },
        configPath,
        installedFonts,
      ),
    ).toThrow(
      expect.objectContaining({ location: `terminal.padding.${side}` }),
    );
  });

  it.each([
    [MIN_TERMINAL_FONT_SIZE, true],
    [MAX_TERMINAL_FONT_SIZE, true],
    [MIN_TERMINAL_FONT_SIZE - 1, false],
    [MAX_TERMINAL_FONT_SIZE + 1, false],
    [0, false],
    [12.5, false],
    [Number.POSITIVE_INFINITY, false],
  ])("validates font.size %s at the schema boundary", (size, accepted) => {
    const action = () =>
      validateUserConfiguration(
        { version: 1, font: { size } },
        configPath,
        installedFonts,
      );
    if (accepted) expect(action().fontSize).toBe(size);
    else expect(action).toThrow(UserConfigurationError);
  });

  it.each([0, 100_000])("accepts scrollback.lines boundary %s", (lines) => {
    expect(
      validateUserConfiguration(
        { version: 1, scrollback: { lines } },
        configPath,
        installedFonts,
      ).scrollbackLines,
    ).toBe(lines);
  });

  it.each([-1, 100_001, 1.5, Number.NaN])(
    "rejects invalid scrollback.lines %s",
    (lines) => {
      expect(() =>
        validateUserConfiguration(
          { version: 1, scrollback: { lines } },
          configPath,
          installedFonts,
        ),
      ).toThrow(UserConfigurationError);
    },
  );

  it.each(["none", "left", "right", "both"])(
    "accepts Option Key Mode %s",
    (optionAsAlt) => {
      expect(
        validateUserConfiguration(
          { version: 1, keyboard: { optionAsAlt } },
          configPath,
          installedFonts,
        ).optionKeyMode,
      ).toBe(optionAsAlt);
    },
  );

  it.each([
    [{}, "version"],
    [{ version: 2 }, "version"],
    [{ version: 1, extra: true }, "$.extra"],
    [{ version: 1, font: { weight: 400 } }, "font.weight"],
    [{ version: 1, terminal: { gap: 8 } }, "terminal.gap"],
    [
      { version: 1, terminal: { padding: { horizontal: 8 } } },
      "terminal.padding.horizontal",
    ],
    [{ version: 1, scrollback: { extra: 1 } }, "scrollback.extra"],
    [{ version: 1, keyboard: { extra: 1 } }, "keyboard.extra"],
    [{ version: 1, window: { extra: 1 } }, "window.extra"],
    [{ version: 1, theme: {} }, "theme.path"],
    [{ version: 1, theme: { path: "" } }, "theme.path"],
    [{ version: 1, theme: { path: 42 } }, "theme.path"],
    [{ version: 1, theme: { path: "bad\0path" } }, "theme.path"],
    [{ version: 1, theme: { path: "theme.json", extra: true } }, "theme.extra"],
    [{ version: 1, confirmClose: 1 }, "confirmClose"],
    [{ version: 1, logLevel: "warn" }, "logLevel"],
    [{ version: 1, keyboard: { optionAsAlt: "alt" } }, "keyboard.optionAsAlt"],
  ])("rejects the complete strict schema at %s", (document, location) => {
    expect(() =>
      validateUserConfiguration(document, configPath, installedFonts),
    ).toThrow(expect.objectContaining({ location }));
  });

  it("applies keybind remaps to the effective map while unmapped actions keep their defaults", () => {
    const configuration = validateUserConfiguration(
      { version: 1, keybinds: { newWindow: "CommandOrControl+G" } },
      configPath,
      installedFonts,
    );
    expect(configuration.keybinds.newWindow).toBe("CommandOrControl+G");
    expect(configuration.keybinds.closeWindow).toBe("CommandOrControl+Shift+W");
    expect(configuration.keybinds.quit).toBe(DEFAULT_TERMINAL_KEYBINDS.quit);
    expect(Object.isFrozen(configuration.keybinds)).toBe(true);
  });

  it("applies Linux remaps over Linux defaults", () => {
    const configuration = validateUserConfiguration(
      { version: 1, keybinds: { newWindow: "Alt+N" } },
      configPath,
      installedFonts,
      terminalDefaultKeybinds("linux"),
    );
    expect(configuration.keybinds.newWindow).toBe("Alt+N");
    expect(configuration.keybinds.copy).toBe("Control+Shift+C");
    expect(configuration.keybinds.closeWindow).toBe("Control+Shift+Q");
    expect(() =>
      validateUserConfiguration(
        {
          version: 1,
          keybinds: { newWindow: "CommandOrControl+Shift+C" },
        },
        configPath,
        installedFonts,
        terminalDefaultKeybinds("linux"),
        "linux",
      ),
    ).toThrow('conflicts with the "copy" keybind');
  });

  it.each([
    [{ quitt: "CommandOrControl+Q" }, "keybinds.quitt", "is unknown"],
    [
      { resetSelectedWindowZoom: "Cmd+0" },
      "keybinds.resetSelectedWindowZoom",
      "is unknown",
    ],
    [{ quit: "Q" }, "keybinds.quit", "non-Shift modifier"],
    [{ quit: "Shift+Q" }, "keybinds.quit", "non-Shift modifier"],
    [{ quit: "NotAModifier+Q" }, "keybinds.quit", "non-Shift modifier"],
    [{ quit: 5 }, "keybinds.quit", "non-Shift modifier"],
    [{ quit: "" }, "keybinds.quit", "non-Shift modifier"],
  ])(
    "rejects the keybind entry %j at its exact location",
    (keybinds, location, reasonFragment) => {
      let failure: unknown;
      try {
        validateUserConfiguration(
          { version: 1, keybinds },
          configPath,
          installedFonts,
        );
      } catch (cause) {
        failure = cause;
      }
      expect(failure).toBeInstanceOf(UserConfigurationError);
      expect(failure).toMatchObject({ location });
      expect((failure as UserConfigurationError).reason).toContain(
        reasonFragment,
      );
    },
  );

  it("rejects two explicit keybinds that collide, naming both actions and no accelerator contents", () => {
    let failure: unknown;
    try {
      validateUserConfiguration(
        {
          version: 1,
          keybinds: { newWindow: "Cmd+G", zoomIn: "CommandOrControl+G" },
        },
        configPath,
        installedFonts,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(UserConfigurationError);
    expect(failure).toMatchObject({
      location: "keybinds.zoomIn",
      reason: 'conflicts with the "newWindow" keybind',
    });
    expect((failure as Error).message).not.toContain("Cmd+G");
    expect((failure as Error).message).not.toContain("CommandOrControl+G");
  });

  it("judges duplicates on the effective map: a remap colliding with a remaining default is an error", () => {
    for (const accelerator of ["CommandOrControl+W", "Cmd+W"]) {
      expect(() =>
        validateUserConfiguration(
          { version: 1, keybinds: { newWindow: accelerator } },
          configPath,
          installedFonts,
        ),
      ).toThrow(
        expect.objectContaining({
          location: "keybinds.newWindow",
          reason: 'conflicts with the "closeTab" keybind',
        }),
      );
    }
  });

  it("accepts swapping two defaults through explicit remaps", () => {
    const configuration = validateUserConfiguration(
      {
        version: 1,
        keybinds: {
          newWindow: "CommandOrControl+T",
          newTab: "CommandOrControl+N",
        },
      },
      configPath,
      installedFonts,
    );
    expect(configuration.keybinds.newWindow).toBe("CommandOrControl+T");
    expect(configuration.keybinds.newTab).toBe("CommandOrControl+N");
  });

  it("requires a non-empty exact installed family without trimming or aliases", () => {
    expect(
      validateUserConfiguration(
        { version: 1, font: { family: "SF Mono" } },
        configPath,
        installedFonts,
      ).fontFamily,
    ).toBe("SF Mono");
    for (const family of ["", " SF Mono", "sf mono", "SFMono-Regular"]) {
      expect(() =>
        validateUserConfiguration(
          { version: 1, font: { family } },
          configPath,
          installedFonts,
        ),
      ).toThrow(expect.objectContaining({ location: "font.family" }));
    }
  });
});

describe("isolated User Configuration loading", () => {
  async function roots() {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-config-test-"));
    return {
      root,
      xdg: path.join(root, "xdg"),
      home: path.join(root, "home"),
    };
  }

  it("treats only ENOENT as absence, without a fallback diagnostic, and creates no file or directory", async () => {
    const { xdg, home } = await roots();
    const getMetrics = vi.fn(getInstalledFontFamilyMetrics);
    const load = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      getInstalledFontFamilyMetrics: getMetrics,
    });
    expect(load.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(load.fallback).toBeUndefined();
    await expect(stat(xdg)).rejects.toMatchObject({ code: "ENOENT" });
    expect(getMetrics).not.toHaveBeenCalled();
  });

  it("starts with defaults for a dangling configuration symlink without changing it", async () => {
    const { xdg, home, root } = await roots();
    const directory = path.join(xdg, "omxterm");
    const file = path.join(directory, "config.json");
    const target = path.join(root, "missing-config.json");
    await mkdir(directory, { recursive: true });
    await symlink(target, file);
    const originalTarget = await readlink(file);
    const start = vi.fn((load: UserConfigurationLoad) => load);

    const load = await startWithUserConfiguration(
      {
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
      },
      start,
    );

    expect(start).toHaveBeenCalledOnce();
    expect(load.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(load.fallback).toMatchObject({
      surface: "configuration",
      error: {
        configurationPath: file,
        reason: "the file could not be read",
      },
    });
    expect(await readlink(file)).toBe(originalTarget);
    await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports read and UTF-8 decoding failures without treating them as absence", async () => {
    const base = {
      environment: { XDG_CONFIG_HOME: "/isolated" },
      homeDirectory: "/home/tester",
      getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
    };
    const denied = await loadUserConfiguration({
      ...base,
      read: vi.fn(async () => {
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      }) as never,
    });
    expect(denied.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(denied.fallback?.error).toMatchObject({
      reason: "the file could not be read",
    });
    const binary = await loadUserConfiguration({
      ...base,
      read: vi.fn(async () => Uint8Array.from([0xff])) as never,
    });
    expect(binary.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(binary.fallback?.error).toMatchObject({
      reason: "the file is not valid UTF-8",
    });
  });

  it.each([
    ["invalid JSON", "{not json", undefined, "the file is not valid JSON"],
    [
      "an unknown key",
      '{"version":1,"unknown":true}',
      "$.unknown",
      "is unknown",
    ],
    [
      "an invalid value",
      '{"version":1,"font":{"size":4}}',
      "font.size",
      "must be from 8 through 72",
    ],
    [
      "a conflicting keybind",
      '{"version":1,"keybinds":{"newWindow":"CommandOrControl+W"}}',
      "keybinds.newWindow",
      'conflicts with the "closeTab" keybind',
    ],
  ])(
    "starts with full defaults and a precise diagnostic for %s",
    async (_kind, contents, location, reason) => {
      const { xdg, home } = await roots();
      const file = path.join(xdg, "omxterm", "config.json");
      await mkdir(path.dirname(file), { recursive: true });
      const original = Buffer.from(contents);
      await writeFile(file, original);

      const load = await loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
      });

      expect(load.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
      expect(load.fallback).toMatchObject({
        surface: "configuration",
        error: { configurationPath: file, location, reason },
      });
      expect(load.fallback!.error.message).toContain(file);
      expect(await readFile(file)).toEqual(original);
    },
  );

  it("starts with defaults, leaves invalid bytes untouched, and emits content-free diagnostics", async () => {
    const { xdg, home } = await roots();
    const directory = path.join(xdg, "omxterm");
    const file = path.join(directory, "config.json");
    await mkdir(directory, { recursive: true });
    const canary = "SECRET-CONFIG-CANARY";
    const original = Buffer.from(`{"version":1,"unknown":"${canary}"}`);
    await writeFile(file, original);
    const start = vi.fn((load: UserConfigurationLoad) => load);

    const load = await startWithUserConfiguration(
      {
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
      },
      start,
    );

    expect(start).toHaveBeenCalledOnce();
    expect(load.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    const failure = load.fallback!.error;
    expect(failure).toBeInstanceOf(UserConfigurationError);
    expect(failure.message).toContain(file);
    expect(failure.message).toContain("$.unknown");
    expect(failure.message).not.toContain(canary);
    expect(userConfigurationFallbackNotice(load.fallback!)).not.toContain(
      canary,
    );
    expect(await readFile(file)).toEqual(original);
  });

  it("loads the XDG file and checks only the configured font family", async () => {
    const { xdg, home } = await roots();
    const xdgFile = path.join(xdg, "omxterm", "config.json");
    const homeFile = path.join(home, ".config", "omxterm", "config.json");
    await mkdir(path.dirname(xdgFile), { recursive: true });
    await mkdir(path.dirname(homeFile), { recursive: true });
    await writeFile(
      xdgFile,
      JSON.stringify({ version: 1, font: { family: "Exact Family" } }),
    );
    await writeFile(
      homeFile,
      JSON.stringify({ version: 1, font: { size: 30 } }),
    );
    const getMetrics = vi.fn(async (family: string) =>
      family === "Exact Family" ? commonFontMetrics : undefined,
    );

    const { configuration, fallback } = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      getInstalledFontFamilyMetrics: getMetrics,
    });

    expect(fallback).toBeUndefined();
    expect(configuration.fontFamily).toBe("Exact Family");
    expect(configuration.fontSize).toBe(16);
    expect(configuration.configuredFontMetrics).toEqual(commonFontMetrics);
    expect(getMetrics).toHaveBeenCalledExactlyOnceWith("Exact Family", 16);
  });

  it("warns and keeps a keybind that shadows a PTY control key on Linux, but not on macOS", async () => {
    const base = {
      environment: { XDG_CONFIG_HOME: "/isolated" },
      homeDirectory: "/home/tester",
      getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
      read: vi.fn(async () =>
        new TextEncoder().encode(
          JSON.stringify({
            version: 1,
            keybinds: { copy: "CommandOrControl+C" },
          }),
        ),
      ) as never,
    };

    const linux = await loadUserConfiguration({ ...base, platform: "linux" });
    expect(linux.fallback).toBeUndefined();
    // Warn-and-keep: the binding is still the configured accelerator.
    expect(linux.configuration.keybinds.copy).toBe("CommandOrControl+C");
    expect(linux.warnings).toHaveLength(1);
    expect(linux.warnings?.[0]).toContain("keybinds.copy");
    expect(linux.warnings?.[0]).toContain("Ctrl+C");
    expect(linux.warnings?.[0]).toContain("SIGINT");

    const darwin = await loadUserConfiguration({ ...base, platform: "darwin" });
    expect(darwin.fallback).toBeUndefined();
    expect(darwin.configuration.keybinds.copy).toBe("CommandOrControl+C");
    expect(darwin.warnings).toBeUndefined();
  });

  it.each(["relative", "absolute"])(
    "loads a complete external theme from a %s path relative to config.json rules",
    async (pathKind) => {
      const { xdg, home, root } = await roots();
      const configurationPath = path.join(xdg, "omxterm", "config.json");
      const themePath =
        pathKind === "relative"
          ? path.join(xdg, "omxterm", "themes", "custom.json")
          : path.join(root, "absolute-theme.json");
      await mkdir(path.dirname(configurationPath), { recursive: true });
      await mkdir(path.dirname(themePath), { recursive: true });
      await writeFile(themePath, JSON.stringify(externalTheme()));
      await writeFile(
        configurationPath,
        JSON.stringify({
          version: 1,
          theme: {
            path: pathKind === "relative" ? "./themes/custom.json" : themePath,
          },
        }),
      );

      const { configuration, fallback } = await loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
      });

      expect(fallback).toBeUndefined();
      expect(configuration.terminalTheme).toEqual(externalTheme());
      expect(configuration.terminalTheme.colors.background).toBe("#1e1e2e");
    },
  );

  it("starts with the bundled theme when the selected theme file is missing, keeping the rest of the configuration", async () => {
    const { xdg, home } = await roots();
    const configurationPath = path.join(xdg, "omxterm", "config.json");
    const resolvedThemePath = path.join(
      xdg,
      "omxterm",
      "themes",
      "missing.json",
    );
    await mkdir(path.dirname(configurationPath), { recursive: true });
    await writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        confirmClose: false,
        theme: { path: "./themes/missing.json" },
      }),
    );

    const { configuration, fallback } = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
    });

    expect(configuration.terminalTheme).toEqual(DEFAULT_TERMINAL_THEME);
    expect(configuration.confirmClose).toBe(false);
    expect(fallback).toMatchObject({
      surface: "theme",
      error: {
        configurationPath,
        location: "theme.path",
        reason: expect.stringContaining(resolvedThemePath) as string,
      },
    });
    expect(userConfigurationFallbackNotice(fallback!)).toContain(
      "bundled omtheme",
    );
  });

  it("starts with full defaults when the configured family is unavailable, without changing the file", async () => {
    const { xdg, home } = await roots();
    const file = path.join(xdg, "omxterm", "config.json");
    await mkdir(path.dirname(file), { recursive: true });
    const original = Buffer.from(
      '{"version":1,"confirmClose":false,"font":{"family":"Missing Family"}}',
    );
    await writeFile(file, original);
    const start = vi.fn((load: UserConfigurationLoad) => load);

    const load = await startWithUserConfiguration(
      {
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        getInstalledFontFamilyMetrics: vi.fn(async () => undefined),
      },
      start,
    );

    expect(start).toHaveBeenCalledOnce();
    expect(load.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(load.fallback).toMatchObject({
      surface: "configuration",
      error: {
        configurationPath: file,
        location: "font.family",
        reason: "must exactly name an installed font family",
      },
    });
    expect(userConfigurationFallbackNotice(load.fallback!)).toContain(
      "built-in default settings",
    );
    expect(await readFile(file)).toEqual(original);
  });

  it("preserves the actionable diagnostic when the targeted AppKit query fails", async () => {
    const { xdg, home } = await roots();
    const file = path.join(xdg, "omxterm", "config.json");
    await mkdir(path.dirname(file), { recursive: true });
    const original = Buffer.from(
      '{"version":1,"font":{"family":"Exact Family","size":72}}',
    );
    await writeFile(file, original);

    const load = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      getInstalledFontFamilyMetrics: vi.fn(async () => {
        throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
      }),
    });

    expect(load.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(load.fallback).toMatchObject({
      surface: "configuration",
      error: {
        configurationPath: file,
        location: "font.family",
        reason: "installed font families could not be discovered",
      },
    });
    expect(await readFile(file)).toEqual(original);
  });

  it("hands the complete validated contract to startup once without changing the file", async () => {
    const { xdg, home } = await roots();
    const directory = path.join(xdg, "omxterm");
    const file = path.join(directory, "config.json");
    await mkdir(directory, { recursive: true });
    const original = Buffer.from(
      '{\n  "version": 1, "confirmClose": false, "logLevel": "error", "window": { "alwaysOnTop": true }\n}\n',
    );
    await writeFile(file, original);
    const start = vi.fn((load: UserConfigurationLoad) => load);
    const getMetrics = vi.fn(getInstalledFontFamilyMetrics);

    const result = await startWithUserConfiguration(
      {
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        getInstalledFontFamilyMetrics: getMetrics,
      },
      start,
    );

    expect(start).toHaveBeenCalledOnce();
    expect(result.fallback).toBeUndefined();
    expect(result.configuration).toMatchObject({
      confirmClose: false,
      logLevel: "error",
      alwaysOnTop: true,
      fontSize: 16,
      scrollbackLines: 10_000,
      optionKeyMode: "none",
    });
    expect(getMetrics).not.toHaveBeenCalled();
    expect(await readFile(file)).toEqual(original);
  });
});
