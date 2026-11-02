import { createRequire } from "node:module";
import type { AcceleratorKeyboardInput } from "../shared/terminal-keybinds";
import type { KeybindKeyboardInput } from "./keybind-delivery";
import { hasNativeAltGr } from "./keyboard-modifiers";

// Synchronous and main-only: the addon samples the current AppKit key event,
// input source and owning window; it never retains an event or performs an action.
export interface MacOSOptionShortcut {
  resolve(handle: Buffer, code: string, characters: string): string | null;
}

export interface OptionShortcutIdentity {
  readonly platform: string;
  readonly native?: MacOSOptionShortcut | undefined;
}

export function loadMacOSOptionShortcut(): MacOSOptionShortcut | undefined {
  try {
    const native: unknown = createRequire(import.meta.url)(
      "./macos-option-shortcut.node",
    );
    if (
      typeof native === "object" &&
      native !== null &&
      "resolve" in native &&
      typeof native.resolve === "function"
    )
      return native as MacOSOptionShortcut;
  } catch {
    // Optional capability: retain the existing route if it cannot be loaded.
  }
  return undefined;
}

// Only ordinary alphanumeric positions with an observable, non-composing,
// fresh Option-only keydown enter native code. Preserve the original Input for
// gesture ownership and callbacks; this projection is for matching only.
export function optionShortcutInterpreter(
  options: OptionShortcutIdentity,
  windowHandle: () => Buffer,
): (input: KeybindKeyboardInput) => AcceleratorKeyboardInput {
  return (input) => {
    if (
      options.platform !== "darwin" ||
      !options.native ||
      input.type !== "keyDown" ||
      input.isComposing !== false ||
      input.isAutoRepeat !== false ||
      !input.alt ||
      input.control ||
      input.meta ||
      input.shift ||
      !input.code ||
      !/^(?:Key[A-Z]|Digit[0-9])$/u.test(input.code) ||
      !input.key ||
      ["Dead", "Process", "Unidentified"].includes(input.key) ||
      !("_modifiers" in input) ||
      typeof input._modifiers !== "number" ||
      !Number.isSafeInteger(input._modifiers) ||
      input._modifiers < 0 ||
      hasNativeAltGr(input)
    )
      return input;
    try {
      const identity = options.native.resolve(
        windowHandle(),
        input.code,
        input.key,
      );
      if (typeof identity !== "string") return input;
      const valid = input.code.startsWith("Digit")
        ? identity === input.code.slice(5)
        : /^[a-z]$/u.test(identity);
      return valid ? { ...input, key: identity } : input;
    } catch {
      return input;
    }
  };
}
