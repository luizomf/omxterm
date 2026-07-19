import { describe, expect, it } from "vitest";
import {
  canonicalAccelerator,
  DEFAULT_TERMINAL_KEYBINDS,
  isValidAccelerator,
  TERMINAL_ACTION_NAMES,
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
});
