import { describe, expect, it } from "vitest";
import {
  canonicalAccelerator,
  DEFAULT_TERMINAL_KEYBINDS,
  shortcutText,
  terminalActionForKeyboardInput,
  terminalDefaultKeybinds,
  type AcceleratorKeyboardInput,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

describe("Settings shortcut and shortcut text", () => {
  it("opens Settings with Cmd+, or Ctrl+, without touching Reload Settings", () => {
    const press = (
      keybinds: TerminalKeybinds,
      platform: string,
      modifiers: Partial<AcceleratorKeyboardInput>,
    ) =>
      terminalActionForKeyboardInput(
        keybinds,
        {
          key: ",",
          code: "Comma",
          control: false,
          meta: false,
          alt: false,
          shift: false,
          ...modifiers,
        },
        platform,
      );
    expect(press(DEFAULT_TERMINAL_KEYBINDS, "darwin", { meta: true })).toBe(
      "settings",
    );
    expect(
      press(DEFAULT_TERMINAL_KEYBINDS, "darwin", { meta: true, shift: true }),
    ).toBe("reloadConfig");
    const linux = terminalDefaultKeybinds("linux");
    expect(press(linux, "linux", { control: true })).toBe("settings");
    expect(press(linux, "linux", { control: true, shift: true })).toBe(
      "reloadConfig",
    );
  });

  it.each(["darwin", "linux", "win32"])(
    "gives no two default shortcuts the same key on %s",
    (platform) => {
      const bound = Object.values(terminalDefaultKeybinds(platform))
        .filter((value) => value !== null)
        .map((value) => canonicalAccelerator(value, platform));
      expect(new Set(bound).size).toBe(bound.length);
    },
  );

  it("shows shortcuts as quiet text", () => {
    expect(shortcutText("CommandOrControl+Plus", "darwin")).toBe("⇧ ⌘ =");
    expect(shortcutText("CommandOrControl+,", "darwin")).toBe("⌘ ,");
    expect(shortcutText("CommandOrControl+Alt+Left", "darwin")).toBe("⌥ ⌘ ←");
    expect(shortcutText("Control+Shift+Tab", "darwin")).toBe("⌃ ⇧ ⇥");
    expect(shortcutText("CommandOrControl+Plus", "linux")).toBe("Ctrl+Shift+=");
    expect(shortcutText("Control+,", "win32")).toBe("Ctrl+,");
    expect(shortcutText("not a shortcut", "linux")).toBeUndefined();
  });
});
