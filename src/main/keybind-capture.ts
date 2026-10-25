import { settingsIpc } from "../shared/settings";
import type { CapturedShortcut } from "../shared/settings-keybinds";
import { acceleratorForKeyboardInput } from "../shared/terminal-keybinds";
import type { KeybindKeyboardInput } from "./keybind-delivery";
import { hasNativeAltGr } from "./keyboard-modifiers";

// A recorder that never stops (renderer crash, reload) cannot hold a window's
// keyboard for longer than this.
const CAPTURE_LIMIT_MS = 30_000;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

export interface CaptureTarget {
  send(channel: string, payload: CapturedShortcut): void;
}

// While Settings records a shortcut, main owns that window's keyboard: the
// next press is reported instead of running a keybind, a menu shortcut or
// reaching the terminal, and its release is consumed too.
export function createKeybindCapture(
  platform: string,
  now: () => number = Date.now,
) {
  const deadlines = new WeakMap<object, number>();
  const releases = new WeakMap<object, string>();
  return {
    set(owner: object, active: boolean) {
      if (active) deadlines.set(owner, now() + CAPTURE_LIMIT_MS);
      else deadlines.delete(owner);
    },
    // Called from before-input-event; true when capture consumed the event.
    intercept(target: CaptureTarget, input: KeybindKeyboardInput): boolean {
      if (input.type === "keyUp") {
        if (releases.get(target) !== (input.code ?? input.key)) return false;
        releases.delete(target);
        return true;
      }
      const deadline = deadlines.get(target);
      if (deadline === undefined) return false;
      if (deadline <= now()) {
        deadlines.delete(target);
        target.send(settingsIpc.captured, { cancelled: true });
        return false;
      }
      if (MODIFIER_KEYS.has(input.key)) return true;
      releases.set(target, input.code ?? input.key);
      const plain = !input.control && !input.meta && !input.alt && !input.shift;
      if (input.key === "Escape" && plain) {
        deadlines.delete(target);
        target.send(settingsIpc.captured, { cancelled: true });
        return true;
      }
      const accelerator = acceleratorForKeyboardInput(
        { ...input, altGr: hasNativeAltGr(input) },
        platform,
      );
      if (accelerator === undefined) {
        target.send(settingsIpc.captured, { invalid: true });
        return true;
      }
      deadlines.delete(target);
      target.send(settingsIpc.captured, { accelerator });
      return true;
    },
  };
}

export type KeybindCapture = ReturnType<typeof createKeybindCapture>;
