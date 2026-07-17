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
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
  resolveUserConfigurationPath,
  UserConfigurationError,
  validateUserConfiguration,
} from "../../src/main/user-configuration";

const configPath = "/isolated/config/omxterm/config.json";
const installedFonts = new Set(["SF Mono", "Exact Family"]);
const commonFontMetrics = Object.freeze({ cellWidth: 8, cellHeight: 16 });

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
    [{ version: 1, confirmClose: 1 }, "confirmClose"],
    [{ version: 1, logLevel: "warn" }, "logLevel"],
    [{ version: 1, keyboard: { optionAsAlt: "alt" } }, "keyboard.optionAsAlt"],
  ])("rejects the complete strict schema at %s", (document, location) => {
    expect(() =>
      validateUserConfiguration(document, configPath, installedFonts),
    ).toThrow(expect.objectContaining({ location }));
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

  it("treats only ENOENT as absence and creates no file or directory", async () => {
    const { xdg, home } = await roots();
    const getMetrics = vi.fn(getInstalledFontFamilyMetrics);
    const configuration = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      getInstalledFontFamilyMetrics: getMetrics,
    });
    expect(configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    await expect(stat(xdg)).rejects.toMatchObject({ code: "ENOENT" });
    expect(getMetrics).not.toHaveBeenCalled();
  });

  it("rejects a dangling configuration symlink without changing it or starting", async () => {
    const { xdg, home, root } = await roots();
    const directory = path.join(xdg, "omxterm");
    const file = path.join(directory, "config.json");
    const target = path.join(root, "missing-config.json");
    await mkdir(directory, { recursive: true });
    await symlink(target, file);
    const originalTarget = await readlink(file);
    const start = vi.fn();

    await expect(
      startWithUserConfiguration(
        {
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
          getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
        },
        start,
      ),
    ).rejects.toMatchObject({
      configurationPath: file,
      reason: "the file could not be read",
    });

    expect(start).not.toHaveBeenCalled();
    expect(await readlink(file)).toBe(originalTarget);
    await expect(readFile(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports read and UTF-8 decoding failures without treating them as absence", async () => {
    const base = {
      environment: { XDG_CONFIG_HOME: "/isolated" },
      homeDirectory: "/home/tester",
      getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
    };
    await expect(
      loadUserConfiguration({
        ...base,
        read: vi.fn(async () => {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        }) as never,
      }),
    ).rejects.toMatchObject({ reason: "the file could not be read" });
    await expect(
      loadUserConfiguration({
        ...base,
        read: vi.fn(async () => Uint8Array.from([0xff])) as never,
      }),
    ).rejects.toMatchObject({ reason: "the file is not valid UTF-8" });
  });

  it("validates before startup, leaves invalid bytes untouched, and emits content-free diagnostics", async () => {
    const { xdg, home } = await roots();
    const directory = path.join(xdg, "omxterm");
    const file = path.join(directory, "config.json");
    await mkdir(directory, { recursive: true });
    const canary = "SECRET-CONFIG-CANARY";
    const original = Buffer.from(`{"version":1,"unknown":"${canary}"}`);
    await writeFile(file, original);
    const start = vi.fn();

    let failure: unknown;
    try {
      await startWithUserConfiguration(
        {
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
          getInstalledFontFamilyMetrics: vi.fn(getInstalledFontFamilyMetrics),
        },
        start,
      );
    } catch (cause) {
      failure = cause;
    }

    expect(failure).toBeInstanceOf(UserConfigurationError);
    expect((failure as Error).message).toContain(file);
    expect((failure as Error).message).toContain("$.unknown");
    expect((failure as Error).message).not.toContain(canary);
    expect(start).not.toHaveBeenCalled();
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

    const configuration = await loadUserConfiguration({
      environment: { XDG_CONFIG_HOME: xdg },
      homeDirectory: home,
      getInstalledFontFamilyMetrics: getMetrics,
    });

    expect(configuration.fontFamily).toBe("Exact Family");
    expect(configuration.fontSize).toBe(16);
    expect(configuration.configuredFontMetrics).toEqual(commonFontMetrics);
    expect(getMetrics).toHaveBeenCalledExactlyOnceWith("Exact Family", 16);
  });

  it("rejects an unavailable configured family without starting or changing the file", async () => {
    const { xdg, home } = await roots();
    const file = path.join(xdg, "omxterm", "config.json");
    await mkdir(path.dirname(file), { recursive: true });
    const original = Buffer.from(
      '{"version":1,"confirmClose":false,"font":{"family":"Missing Family"}}',
    );
    await writeFile(file, original);
    const start = vi.fn();

    await expect(
      startWithUserConfiguration(
        {
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
          getInstalledFontFamilyMetrics: vi.fn(async () => undefined),
        },
        start,
      ),
    ).rejects.toMatchObject({
      configurationPath: file,
      location: "font.family",
      reason: "must exactly name an installed font family",
    });

    expect(start).not.toHaveBeenCalled();
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
    const start = vi.fn();

    await expect(
      startWithUserConfiguration(
        {
          environment: { XDG_CONFIG_HOME: xdg },
          homeDirectory: home,
          getInstalledFontFamilyMetrics: vi.fn(async () => {
            throw Object.assign(new Error("timed out"), { code: "ETIMEDOUT" });
          }),
        },
        start,
      ),
    ).rejects.toMatchObject({
      configurationPath: file,
      location: "font.family",
      reason: "installed font families could not be discovered",
    });

    expect(start).not.toHaveBeenCalled();
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
    const start = vi.fn((configuration) => configuration);
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
    expect(result).toMatchObject({
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
