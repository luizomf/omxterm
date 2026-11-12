import { describe, expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import {
  displayAccelerator,
  shadowedControlKeyBindings,
  terminalActionForKeyboardInput,
  terminalDefaultKeybinds,
  type AcceleratorKeyboardInput,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

const keyInput = (
  overrides: Partial<AcceleratorKeyboardInput> & { key: string },
): AcceleratorKeyboardInput => ({
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...overrides,
});

function validate(
  keybinds: Record<string, unknown>,
  platform = "linux",
): TerminalKeybinds {
  return validateUserConfiguration(
    { version: 1, keybinds },
    "fixture-config.json",
    new Set(),
    terminalDefaultKeybinds(platform),
    platform,
  ).keybinds;
}

describe("disabled keybinds and bare function keys", () => {
  it.each(["darwin", "linux", "win32"])(
    "delivers the palette default and preserves explicit remaps/null on %s",
    (platform) => {
      const defaults = validate({}, platform);
      const input = keyInput({
        key: "p",
        shift: true,
        meta: platform === "darwin",
        control: platform !== "darwin",
      });
      expect(terminalActionForKeyboardInput(defaults, input, platform)).toBe(
        "commandPalette",
      );
      expect(
        terminalActionForKeyboardInput(
          validate({ commandPalette: null }, platform),
          input,
          platform,
        ),
      ).toBeUndefined();
      expect(
        terminalActionForKeyboardInput(
          validate({ commandPalette: "Control+Alt+P" }, platform),
          input,
          platform,
        ),
      ).toBeUndefined();
      // Unrelated custom shortcuts stay untouched.
      expect(validate({ newWindow: "Control+Alt+P" }, platform).newWindow).toBe(
        "Control+Alt+P",
      );
      const configured = validate(
        { commandPalette: "Control+Alt+P" },
        platform,
      );
      expect(
        terminalActionForKeyboardInput(
          configured,
          keyInput({ key: "p", control: true, alt: true }),
          platform,
        ),
      ).toBe("commandPalette");
      expect(
        validate({ commandPalette: null }, platform).commandPalette,
      ).toBeNull();
    },
  );
  it.each(["darwin", "linux", "win32"])(
    "keeps an existing user mapping on the new default and unbinds the default on %s",
    (platform) => {
      const occupied = platform === "darwin" ? "shift+cmd+p" : "shift+ctrl+p";
      const kept = validate({ newWindow: occupied }, platform);
      expect(kept.newWindow).toBe(occupied);
      expect(kept.commandPalette).toBeNull();
      expect(() =>
        validate({ newWindow: occupied, commandPalette: occupied }, platform),
      ).toThrow(
        expect.objectContaining({
          location: "keybinds.commandPalette",
          reason: `conflicts with the "newWindow" keybind on ${platform === "darwin" ? "Cmd" : "Ctrl"}+Shift+P. Choose another shortcut for one of them, or set one of them to null to disable its shortcut`,
        }),
      );
      for (const commandPalette of [undefined, null, "Control+Alt+P"]) {
        const resolved = validate(
          { newWindow: occupied, commandPalette },
          platform,
        );
        expect(resolved.commandPalette).toBe(commandPalette ?? null);
        expect(
          terminalActionForKeyboardInput(
            resolved,
            keyInput({
              key: "p",
              shift: true,
              meta: platform === "darwin",
              control: platform !== "darwin",
            }),
            platform,
          ),
        ).toBe("newWindow");
      }
    },
  );
  it("ships Ctrl+Shift+F for Find and F11 for full screen on Linux and Windows", () => {
    for (const platform of ["linux", "win32"]) {
      const defaults = terminalDefaultKeybinds(platform);
      expect(defaults.find).toBe("Control+Shift+F");
      expect(defaults.toggleFullScreen).toBe("F11");
    }
    const mac = terminalDefaultKeybinds("darwin");
    expect(mac.find).toBe("CommandOrControl+F");
    expect(mac.toggleFullScreen).toBe("Control+Command+F");
  });

  it("delivers a bare F11 and never a disabled action", () => {
    const defaults = terminalDefaultKeybinds("linux");
    const f11 = keyInput({ key: "F11" });
    expect(terminalActionForKeyboardInput(defaults, f11, "linux")).toBe(
      "toggleFullScreen",
    );
    const disabled = { ...defaults, toggleFullScreen: null };
    expect(
      terminalActionForKeyboardInput(disabled, f11, "linux"),
    ).toBeUndefined();
    // Bare letters still reach the terminal.
    expect(
      terminalActionForKeyboardInput(defaults, keyInput({ key: "f" }), "linux"),
    ).toBeUndefined();
  });

  it("accepts null, keeps omitted actions on their defaults and frees a disabled key", () => {
    const keybinds = validate({
      toggleFullScreen: null,
      toggleSnippets: "F11",
    });
    expect(keybinds.toggleFullScreen).toBeNull();
    expect(keybinds.toggleSnippets).toBe("F11");
    expect(keybinds.find).toBe("Control+Shift+F");
    expect(Object.isFrozen(keybinds)).toBe(true);
  });

  it("keeps a previous full-screen remap that is now Find's default and unbinds Find", () => {
    const kept = validate({ toggleFullScreen: "Control+Shift+F" });
    expect(kept.toggleFullScreen).toBe("Control+Shift+F");
    expect(kept.find).toBeNull();
    expect(() =>
      validate({
        toggleFullScreen: "Control+Shift+F",
        find: "Control+Shift+F",
      }),
    ).toThrow(
      expect.objectContaining({
        location: "keybinds.toggleFullScreen",
        reason:
          'conflicts with the "find" keybind on Ctrl+Shift+F. Choose another shortcut for one of them, or set one of them to null to disable its shortcut',
      }),
    );
    // Explicit choices for Find are kept as written.
    expect(
      validate({ toggleFullScreen: "Control+Shift+F", find: null }).find,
    ).toBeNull();
    expect(
      validate({ toggleFullScreen: "Control+Shift+F", find: "Control+Alt+F" })
        .find,
    ).toBe("Control+Alt+F");
  });

  it.each([false, 0, "", [], {}, "F25", "Shift+Q"])(
    "rejects %j as a keybind value",
    (value) => {
      expect(() => validate({ find: value })).toThrow(
        expect.objectContaining({ location: "keybinds.find" }),
      );
    },
  );

  it("skips disabled actions in PTY control-key warnings", () => {
    const keybinds = { ...terminalDefaultKeybinds("linux"), copy: null };
    expect(
      shadowedControlKeyBindings(
        { ...keybinds, find: "Control+C", paste: null },
        "linux",
      ).map(({ action }) => action),
    ).toEqual(["find"]);
  });

  it.each([
    ["Control+Shift+F", "linux", "Ctrl+Shift+F"],
    ["CommandOrControl+F", "darwin", "Cmd+F"],
    ["CommandOrControl+F", "linux", "Ctrl+F"],
    ["f11", "linux", "F11"],
    ["Alt+PageDown", "win32", "Alt+Pagedown"],
  ])("displays %s on %s as %s", (value, platform, display) => {
    expect(displayAccelerator(value, platform)).toBe(display);
  });
});
