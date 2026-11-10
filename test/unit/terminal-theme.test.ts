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
  isTerminalTheme,
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
  it("ships a default palette that passes its own validation", () => {
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
    {},
    { paneDivider: "#aBcDeF" },
    { auxiliaryPanelDivider: "#123456" },
    { activePaneHighlight: "#654321" },
    { paneDivider: null },
    { auxiliaryPanelDivider: null },
    { activePaneHighlight: null },
    {
      paneDivider: "#123456",
      auxiliaryPanelDivider: null,
      activePaneHighlight: "#abcdef",
    },
  ])(
    "preserves optional appearance choices in an immutable copy: %j",
    (appearance) => {
      const document = { ...themeDocument(), appearance };
      const theme = validateTerminalTheme(document, themePath);
      expect(theme).toEqual(document);
      expect(isTerminalTheme(theme)).toBe(true);
      expect(theme.appearance).not.toBe(appearance);
      expect(Object.isFrozen(theme.appearance)).toBe(true);
      expect(isTerminalTheme(themeDocument())).toBe(true);
      expect(
        validateTerminalTheme(themeDocument(), themePath),
      ).not.toHaveProperty("appearance");
    },
  );

  it.each<[unknown, string]>([
    [null, "appearance"],
    [[], "appearance"],
    [undefined, "appearance"],
    [false, "appearance"],
    [{ "": null }, "appearance."],
    [{ extra: "#123456" }, "appearance.extra"],
    ...["paneDivider", "auxiliaryPanelDivider", "activePaneHighlight"].flatMap(
      (key) =>
        [
          undefined,
          0,
          false,
          "#fff",
          "#12345678",
          "red",
          "var(--paint)",
          "#zzzzzz",
        ].map((color): [unknown, string] => [
          { [key]: color },
          `appearance.${key}`,
        ]),
    ),
  ])(
    "rejects invalid appearance %j at %s in main and IPC",
    (appearance, location) => {
      const document = { ...themeDocument(), appearance };
      expect(() => validateTerminalTheme(document, themePath)).toThrow(
        expect.objectContaining({ themePath, location }),
      );
      expect(isTerminalTheme(document)).toBe(false);
    },
  );

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
