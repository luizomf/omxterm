import { describe, expect, it } from "vitest";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import {
  canonicalAccelerator,
  DEFAULT_TERMINAL_KEYBINDS,
  isValidAccelerator,
  shadowedControlKeyBindings,
  TERMINAL_ACTION_NAMES,
  terminalActionForKeyboardInput,
  terminalDefaultKeybinds,
  type AcceleratorKeyboardInput,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

describe("terminal keybind accelerators", () => {
  it("accepts distinct Alt and AltGr bindings but rejects an AltGr duplicate", () => {
    for (const platform of ["darwin", "linux", "win32"]) {
      const keybinds = { newTab: "AltGr+J", closeTab: "Alt+J" };
      const validate = (overrides: Partial<TerminalKeybinds>) =>
        validateUserConfiguration(
          { version: 1, keybinds: overrides },
          "fixture-config.json",
          new Set(),
          terminalDefaultKeybinds(platform),
          platform,
        );
      expect(validate(keybinds).keybinds).toMatchObject(keybinds);
      expect(() => validate({ ...keybinds, closeTab: "altgr+j" })).toThrow(
        'conflicts with the "newTab" keybind',
      );
    }
  });
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
    "F5",
    "F11",
    "Shift+F24",
  ])("accepts the accelerator %s", (accelerator) => {
    expect(isValidAccelerator(accelerator)).toBe(true);
  });

  it.each([
    "",
    "Q",
    "F25",
    "Space",
    "Return",
    "Escape",
    "Shift+Space",
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

  it("uses Electron's intrinsic Shift identities without merging keypad keys", () => {
    // Independent literals from Electron 43.4.1 keyboard_util.cc.
    const symbols = '!"#$%&()*+:<>?@^_{|}~';
    const nativeKeys = "1'3457908=;,./26-[\\]`";
    for (const [index, symbol] of [...symbols].entries()) {
      const token = symbol === "+" ? "Plus" : symbol;
      expect(canonicalAccelerator(`Control+${token}`)).toBe(
        canonicalAccelerator(`Control+Shift+${nativeKeys[index]}`),
      );
    }
    expect(canonicalAccelerator("Control+numadd")).not.toBe(
      canonicalAccelerator("Control+Plus"),
    );
    expect(canonicalAccelerator("Control+num1")).not.toBe(
      canonicalAccelerator("Control+1"),
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
      expect(resolveWith(keyInput({ key: "+", meta: true }))).toBe("zoomIn");
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

  it("preserves PTY control keys in the Linux and Windows defaults", () => {
    expect(terminalDefaultKeybinds("win32")).toEqual(
      terminalDefaultKeybinds("linux"),
    );
    const linux = terminalDefaultKeybinds("linux");
    expect(linux.copy).toBe("Control+Shift+C");
    expect(linux.paste).toBe("Control+Shift+V");
    expect(linux.selectAll).toBe("Control+Shift+A");
    expect(linux.find).toBe("Control+Shift+F");
    expect(linux.toggleFullScreen).toBe("F11");
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
    expect(DEFAULT_TERMINAL_KEYBINDS.reloadConfig).toBe(
      "CommandOrControl+Shift+,",
    );
    expect(terminalDefaultKeybinds("linux").reloadConfig).toBe(
      "Control+Shift+,",
    );
    expect(terminalDefaultKeybinds("win32").reloadConfig).toBe(
      "Control+Shift+,",
    );
    for (let position = 1; position <= 9; position += 1)
      expect(
        DEFAULT_TERMINAL_KEYBINDS[
          `selectTab${position}` as keyof typeof DEFAULT_TERMINAL_KEYBINDS
        ],
      ).toBe(`CommandOrControl+${position}`);
  });

  describe("detecting keybinds that shadow PTY control keys", () => {
    function withKeybinds(
      overrides: Partial<TerminalKeybinds>,
      platform: string,
    ): TerminalKeybinds {
      return { ...terminalDefaultKeybinds(platform), ...overrides };
    }

    it("flags a bare Ctrl+<key> that shadows a control key on this platform", () => {
      const shadowed = shadowedControlKeyBindings(
        withKeybinds({ copy: "CommandOrControl+C" }, "linux"),
        "linux",
      );
      expect(shadowed).toEqual([
        { action: "copy", controlKey: "Ctrl+C", shadows: "SIGINT (interrupt)" },
      ]);
    });

    it("does not flag the same CommandOrControl bind on macOS, where it is Cmd", () => {
      expect(
        shadowedControlKeyBindings(
          withKeybinds({ copy: "CommandOrControl+C" }, "darwin"),
          "darwin",
        ),
      ).toEqual([]);
    });

    it("flags an explicit Control+<key> shadow on macOS too", () => {
      const shadowed = shadowedControlKeyBindings(
        withKeybinds({ paste: "Control+D" }, "darwin"),
        "darwin",
      );
      expect(shadowed).toEqual([
        {
          action: "paste",
          controlKey: "Ctrl+D",
          shadows: "end-of-input (EOF)",
        },
      ]);
    });

    it("reports the backslash control key readably", () => {
      const shadowed = shadowedControlKeyBindings(
        withKeybinds({ quit: "Control+\\" }, "linux"),
        "linux",
      );
      expect(shadowed).toEqual([
        { action: "quit", controlKey: "Ctrl+\\", shadows: "SIGQUIT (quit)" },
      ]);
    });

    it("ignores Control combos that add another modifier or miss the set", () => {
      expect(
        shadowedControlKeyBindings(
          withKeybinds(
            { copy: "Control+Shift+C", newTab: "Control+B" },
            "linux",
          ),
          "linux",
        ),
      ).toEqual([]);
    });

    it("never flags the built-in defaults on either platform", () => {
      expect(
        shadowedControlKeyBindings(terminalDefaultKeybinds("linux"), "linux"),
      ).toEqual([]);
      expect(
        shadowedControlKeyBindings(terminalDefaultKeybinds("darwin"), "darwin"),
      ).toEqual([]);
    });
  });
});
