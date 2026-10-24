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

  it("explains a previous full-screen remap that now collides with Find", () => {
    expect(() => validate({ toggleFullScreen: "Control+Shift+F" })).toThrow(
      expect.objectContaining({
        location: "keybinds.toggleFullScreen",
        reason:
          'conflicts with the "find" keybind on Ctrl+Shift+F. Choose another shortcut for one of them, or set one of them to null to disable its shortcut',
      }),
    );
    // Either way out is accepted without touching the other action.
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
