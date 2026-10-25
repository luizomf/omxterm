import { settingsIpc } from "../shared/settings";
import type {
  CapturedShortcut,
  ShortcutCaptureRequest,
  ShortcutCaptureResult,
} from "../shared/settings-keybinds";
import { acceleratorForKeyboardInput } from "../shared/terminal-keybinds";
import type { KeybindKeyboardInput } from "./keybind-delivery";
import { hasNativeAltGr } from "./keyboard-modifiers";

const CAPTURE_LIMIT_MS = 30_000;
// Above a physical keyboard's key count; never consume an untrackable gesture.
const MAX_HELD_KEYS = 256;
const MAX_KEY_IDENTITY_LENGTH = 64;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

export interface CaptureTarget {
  isDestroyed?(): boolean;
  send(channel: string, payload: ShortcutCaptureResult): void;
}

interface Recording {
  readonly captureId: string;
  readonly deadline: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

// A recording owns consumed physical gestures through repeats and release,
// independently of the request ending. Fresh downs recover from lost keyups.
export function createKeybindCapture(
  platform: string,
  now: () => number = Date.now,
) {
  const recordings = new WeakMap<CaptureTarget, Recording>();
  const releases = new WeakMap<CaptureTarget, Set<string>>();
  const finish = (target: CaptureTarget) => {
    const recording = recordings.get(target);
    if (recording) clearTimeout(recording.timer);
    recordings.delete(target);
    return recording;
  };
  const send = (
    target: CaptureTarget,
    captureId: string,
    shortcut: CapturedShortcut,
  ) => {
    try {
      if (!target.isDestroyed?.())
        target.send(settingsIpc.captured, { captureId, shortcut });
    } catch {
      // A gone renderer cannot keep capture alive or throw from a timer.
      finish(target);
    }
  };
  return {
    // Focus loss, renderer replacement/loss and window disposal end both the
    // recording and any physical gestures whose native release may be lost.
    release(target: CaptureTarget) {
      const active = finish(target);
      releases.delete(target);
      if (active) send(target, active.captureId, { cancelled: true });
    },
    set(target: CaptureTarget, request: ShortcutCaptureRequest) {
      if (!request.active) {
        if (recordings.get(target)?.captureId === request.captureId)
          finish(target);
        return;
      }
      finish(target);
      const recording: Recording = {
        captureId: request.captureId,
        deadline: now() + CAPTURE_LIMIT_MS,
        timer: setTimeout(() => {
          if (recordings.get(target) !== recording) return;
          finish(target);
          send(target, recording.captureId, { cancelled: true });
        }, CAPTURE_LIMIT_MS),
      };
      recording.timer.unref?.();
      recordings.set(target, recording);
    },
    // Called from before-input-event; true when capture consumed the event.
    intercept(target: CaptureTarget, input: KeybindKeyboardInput): boolean {
      const identity = input.code || input.key;
      let held = releases.get(target);
      if (held?.has(identity)) {
        if (input.type === "keyUp") {
          held.delete(identity);
          return true;
        }
        if (input.isAutoRepeat) return true;
        held.delete(identity);
      }
      if (input.type !== "keyDown" && input.type !== "rawKeyDown") return false;
      const active = recordings.get(target);
      if (!active) return false;
      if (active.deadline <= now()) {
        finish(target);
        send(target, active.captureId, { cancelled: true });
        return false;
      }
      if (
        identity.length > MAX_KEY_IDENTITY_LENGTH ||
        (held?.size ?? 0) >= MAX_HELD_KEYS
      ) {
        finish(target);
        send(target, active.captureId, { cancelled: true });
        return false;
      }
      if (!held) {
        held = new Set();
        releases.set(target, held);
      }
      held.add(identity);
      if (MODIFIER_KEYS.has(input.key)) return true;
      const altGr = hasNativeAltGr(input);
      const plain =
        !input.control && !input.meta && !input.alt && !input.shift && !altGr;
      if (input.key === "Escape" && plain) {
        finish(target);
        send(target, active.captureId, { cancelled: true });
        return true;
      }
      const accelerator = acceleratorForKeyboardInput(
        { ...input, altGr },
        platform,
      );
      if (accelerator === undefined) {
        send(target, active.captureId, { invalid: true });
        return true;
      }
      finish(target);
      send(target, active.captureId, { accelerator });
      return true;
    },
  };
}

export type KeybindCapture = ReturnType<typeof createKeybindCapture>;
