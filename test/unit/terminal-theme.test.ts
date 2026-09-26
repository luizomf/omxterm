import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTerminalTheme,
  TerminalThemeError,
  validateTerminalTheme,
} from "../../src/main/terminal-theme";
import {
  DEFAULT_TERMINAL_THEME,
  TERMINAL_THEME_COLOR_KEYS,
} from "../../src/shared/terminal-theme";

const themePath = "/isolated/themes/custom.json";

function themeDocument() {
  return {
    version: 1,
    name: "custom-theme",
    colors: { ...DEFAULT_TERMINAL_THEME.colors },
  };
}

describe("strict version 1 Terminal Theme", () => {
  it("ships the revised canonical palette as ordinary validated theme data", () => {
    expect(DEFAULT_TERMINAL_THEME.colors).toEqual({
      background: "#000000",
      foreground: "#f0f0ff",
      cursor: "#f0f0ff",
      selectionBackground: "#505064",
      selectionForeground: "#f0f0ff",
      black: "#000000",
      red: "#ff80aa",
      green: "#00ffbf",
      yellow: "#ffd480",
      blue: "#80aaff",
      magenta: "#e2a1f7",
      cyan: "#80d4ff",
      white: "#f0f0ff",
      brightBlack: "#505068",
      brightRed: "#ff99bb",
      brightGreen: "#66ffd9",
      brightYellow: "#fee59a",
      brightBlue: "#99bbff",
      brightMagenta: "#ebb4fd",
      brightCyan: "#99ddff",
      brightWhite: "#ffffff",
    });
    expect(validateTerminalTheme(DEFAULT_TERMINAL_THEME, themePath)).toEqual(
      DEFAULT_TERMINAL_THEME,
    );
  });
  it("accepts and freezes the complete public document", () => {
    const document = themeDocument();
    document.colors.background = "#ABCDEF";

    const theme = validateTerminalTheme(document, themePath);

    expect(theme).toEqual(document);
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.colors)).toBe(true);
  });

  it.each([
    [{ ...themeDocument(), extra: true }, "$.extra"],
    [{ version: 1, name: "custom-theme" }, "colors"],
    [{ ...themeDocument(), version: 2 }, "version"],
    [{ ...themeDocument(), name: "" }, "name"],
    [{ ...themeDocument(), name: "line\nbreak" }, "name"],
    [{ ...themeDocument(), name: "x".repeat(65) }, "name"],
    [
      {
        ...themeDocument(),
        colors: { ...themeDocument().colors, extra: "#000000" },
      },
      "colors.extra",
    ],
  ])("rejects an invalid document at %s", (document, location) => {
    const action = () => validateTerminalTheme(document, themePath);
    expect(action).toThrow(expect.objectContaining({ themePath, location }));
  });

  it.each(TERMINAL_THEME_COLOR_KEYS)(
    "requires the complete colors.%s field",
    (missing) => {
      const document = themeDocument();
      delete (document.colors as Record<string, string>)[missing];
      expect(() => validateTerminalTheme(document, themePath)).toThrow(
        expect.objectContaining({ location: `colors.${missing}` }),
      );
    },
  );

  it.each([
    "#00000000",
    "#fff",
    "black",
    "rgb(0 0 0)",
    "var(--black)",
    "000000",
    "#gg0000",
  ])("rejects unsupported color syntax %s", (background) => {
    const document = themeDocument();
    document.colors.background = background;
    expect(() => validateTerminalTheme(document, themePath)).toThrow(
      expect.objectContaining({ location: "colors.background" }),
    );
  });
});

describe("external Terminal Theme file loading", () => {
  async function roots() {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-theme-test-"));
    return { root, file: path.join(root, "theme.json") };
  }

  it("loads a symlink when its final target is a readable regular file", async () => {
    const { root, file } = await roots();
    const target = path.join(root, "target.json");
    await writeFile(target, JSON.stringify(themeDocument()));
    await symlink(target, file);

    await expect(loadTerminalTheme(file)).resolves.toEqual(themeDocument());
  });

  it("rejects a missing file and a symlink whose final target is non-regular", async () => {
    const { root, file } = await roots();
    await expect(loadTerminalTheme(file)).rejects.toMatchObject({
      themePath: file,
      reason: "could not be read",
    });

    const directory = path.join(root, "directory");
    await mkdir(directory);
    await symlink(directory, file);
    await expect(loadTerminalTheme(file)).rejects.toMatchObject({
      themePath: file,
      reason: "must be a regular file",
    });
  });

  it("rejects invalid UTF-8 and JSON with path-specific reasons", async () => {
    const { file } = await roots();
    await writeFile(file, Uint8Array.from([0xff]));
    await expect(loadTerminalTheme(file)).rejects.toMatchObject({
      themePath: file,
      reason: "is not valid UTF-8",
    });

    await writeFile(file, "{");
    await expect(loadTerminalTheme(file)).rejects.toMatchObject({
      themePath: file,
      reason: "is not valid JSON",
    });
  });

  it("keeps document contents out of diagnostics", () => {
    const canary = "SECRET-THEME-CANARY";
    let failure: unknown;
    try {
      validateTerminalTheme(
        { ...themeDocument(), colors: { background: canary } },
        themePath,
      );
    } catch (cause) {
      failure = cause;
    }
    expect(failure).toBeInstanceOf(TerminalThemeError);
    expect((failure as Error).message).toContain(themePath);
    expect((failure as Error).message).not.toContain(canary);
  });
});
