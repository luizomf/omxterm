import { describe, expect, it } from "vitest";
import {
  canonicalAccelerator,
  DEFAULT_TERMINAL_KEYBINDS,
  isValidAccelerator,
  TERMINAL_ACTION_NAMES,
  terminalActionForKeyboardInput,
  terminalDefaultKeybinds,
  type AcceleratorKeyboardInput,
} from "../../src/shared/terminal-keybinds";

describe("terminal keybind accelerators", () => {
  it.each([
    "CommandOrControl+Q",
    "CmdOrCtrl+Shift+P",
    "ctrl+alt+delete",
    "Alt+F5",
    "Command+Plus",
    "Cmd+-",
    "Option+Space",
    "Control+Command+F",
    "Cmd+num0",
  ])("accepts the accelerator %s", (accelerator) => {
    expect(isValidAccelerator(accelerator)).toBe(true);
  });

  it.each([
    "",
    "Q",
    "F5",
    "Shift+Q",
    "Shift+Shift+Q",
    "Cmd+",
    "Cmd++",
    "Cmd+Unknown",
    "Foo+Q",
    "Cmd+QQ",
    " Cmd+Q",
    "Cmd+Q ",
    `Cmd+${"Q".repeat(64)}`,
  ])("rejects the accelerator %j", (accelerator) => {
    expect(isValidAccelerator(accelerator)).toBe(false);
  });

  it("canonicalizes aliases, case, and modifier order for duplicate detection", () => {
    expect(canonicalAccelerator("CmdOrCtrl+Q")).toBe(
      canonicalAccelerator("CommandOrControl+Q"),
    );
    expect(canonicalAccelerator("command+q")).toBe(
      canonicalAccelerator("Cmd+Q"),
    );
    expect(canonicalAccelerator("Shift+Cmd+P")).toBe(
      canonicalAccelerator("Cmd+Shift+P"),
    );
    expect(canonicalAccelerator("Option+Return")).toBe(
      canonicalAccelerator("Alt+Enter"),
    );
    expect(canonicalAccelerator("Cmd+Plus")).not.toBe(
      canonicalAccelerator("Cmd+-"),
    );
    expect(canonicalAccelerator("Cmd+Q")).not.toBe(
      canonicalAccelerator("Ctrl+Q"),
    );
  });

  it("ships a valid, collision-free default for every action", () => {
    const canonicals = TERMINAL_ACTION_NAMES.map((action) => {
      expect(isValidAccelerator(DEFAULT_TERMINAL_KEYBINDS[action])).toBe(true);
      return canonicalAccelerator(DEFAULT_TERMINAL_KEYBINDS[action]);
    });
    expect(new Set(canonicals).size).toBe(TERMINAL_ACTION_NAMES.length);
  });

  describe("resolving a keyboard input to an action", () => {
    const keyInput = (
      overrides: Partial<AcceleratorKeyboardInput> & { key: string },
    ): AcceleratorKeyboardInput => ({
      control: false,
      meta: false,
      alt: false,
      shift: false,
      ...overrides,
    });
    const resolve = (input: AcceleratorKeyboardInput) =>
      terminalActionForKeyboardInput(DEFAULT_TERMINAL_KEYBINDS, input);

    it("resolves CommandOrControl bindings through the Command key", () => {
      expect(resolve(keyInput({ key: "t", meta: true }))).toBe("newTab");
      expect(resolve(keyInput({ key: "T", meta: true }))).toBe("newTab");
      expect(resolve(keyInput({ key: "t", control: true }))).toBeUndefined();
    });

    it("requires the exact modifier set of the binding", () => {
      expect(resolve(keyInput({ key: "Tab", control: true }))).toBe("nextTab");
      expect(
        resolve(keyInput({ key: "Tab", control: true, shift: true })),
      ).toBe("previousTab");
      expect(
        resolve(keyInput({ key: "Tab", control: true, alt: true })),
      ).toBeUndefined();
      expect(resolve(keyInput({ key: "Tab", meta: true }))).toBeUndefined();
      expect(resolve(keyInput({ key: "Tab" }))).toBeUndefined();
    });

    it("resolves named and aliased keys the accelerator grammar accepts", () => {
      const keybinds = {
        ...DEFAULT_TERMINAL_KEYBINDS,
        nextTab: "Ctrl+PageDown",
        previousTab: "Ctrl+Up",
        newTab: "Cmd+Plus",
        closeTab: "Cmd+Return",
        toggleSnippets: "Cmd+Space",
      };
      const resolveWith = (input: AcceleratorKeyboardInput) =>
        terminalActionForKeyboardInput(keybinds, input);
      expect(resolveWith(keyInput({ key: "PageDown", control: true }))).toBe(
        "nextTab",
      );
      expect(resolveWith(keyInput({ key: "ArrowUp", control: true }))).toBe(
        "previousTab",
      );
      expect(resolveWith(keyInput({ key: "+", meta: true }))).toBe("newTab");
      expect(resolveWith(keyInput({ key: "Enter", meta: true }))).toBe(
        "closeTab",
      );
      expect(resolveWith(keyInput({ key: " ", meta: true }))).toBe(
        "toggleSnippets",
      );
    });

    it("resolves nothing for keys outside the accelerator grammar", () => {
      expect(resolve(keyInput({ key: "Dead", control: true }))).toBeUndefined();
      expect(
        resolve(keyInput({ key: "MediaFastForward", control: true })),
      ).toBeUndefined();
    });
  });

  it("preserves PTY control keys in the Linux defaults", () => {
    const linux = terminalDefaultKeybinds("linux");
    expect(linux.copy).toBe("Control+Shift+C");
    expect(linux.paste).toBe("Control+Shift+V");
    expect(linux.selectAll).toBe("Control+Shift+A");
    expect(linux.newWindow).toBe("Control+Shift+N");
    expect(linux.newTab).toBe("Control+Shift+T");
    expect(linux.closeTab).toBe("Control+Shift+W");
    expect(linux.closeWindow).toBe("Control+Shift+Q");
    expect(linux.quit).toBe("Control+Alt+Shift+Q");
    expect(linux.nextTab).toBe("Control+PageDown");
    expect(linux.previousTab).toBe("Control+PageUp");
    expect(canonicalAccelerator("CommandOrControl+C", "linux")).toBe(
      canonicalAccelerator("Control+C", "linux"),
    );
    for (let position = 1; position <= 9; position += 1)
      expect(linux[`selectTab${position}` as keyof typeof linux]).toBe(
        `Alt+${position}`,
      );
  });

  it("ships the ADR 0016 macOS tab defaults with Cmd+W moved to closeTab", () => {
    expect(DEFAULT_TERMINAL_KEYBINDS.newTab).toBe("CommandOrControl+T");
    expect(DEFAULT_TERMINAL_KEYBINDS.closeTab).toBe("CommandOrControl+W");
    expect(DEFAULT_TERMINAL_KEYBINDS.closeWindow).toBe(
      "CommandOrControl+Shift+W",
    );
    expect(DEFAULT_TERMINAL_KEYBINDS.nextTab).toBe("Control+Tab");
    expect(DEFAULT_TERMINAL_KEYBINDS.previousTab).toBe("Control+Shift+Tab");
    for (let position = 1; position <= 9; position += 1)
      expect(
        DEFAULT_TERMINAL_KEYBINDS[
          `selectTab${position}` as keyof typeof DEFAULT_TERMINAL_KEYBINDS
        ],
      ).toBe(`CommandOrControl+${position}`);
  });
});
