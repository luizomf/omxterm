import {
  terminalActionForKeyboardInput,
  type AcceleratorKeyboardInput,
  type TerminalActionName,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";
import { hasNativeAltGr } from "./keyboard-modifiers";

export interface KeybindKeyEvent {
  preventDefault(): void;
}

export interface KeybindKeyboardInput extends AcceleratorKeyboardInput {
  readonly type: string;
}

export interface KeybindWebContents {
  on(
    event: "before-input-event",
    listener: (event: KeybindKeyEvent, input: KeybindKeyboardInput) => void,
  ): unknown;
}

export interface CapturedKey {
  readonly key: string;
  readonly code: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

// While the Preferences shortcut recorder listens, every key goes to it
// instead of running a keybind, a menu shortcut or reaching the terminal.
export interface KeyCapture {
  active(): boolean;
  send(key: CapturedKey): void;
}

// macOS AppKit refuses to fire some registered menu key equivalents —
// Control+Tab is reserved for key-view loop navigation — so those keybinds
// shipped inert and the key fell through to the PTY (#82). before-input-event
// fires before the page and before menu-shortcut dispatch, so this delivers a
// matched keybind itself and consumes the event; preventDefault suppresses
// both the page event and the menu shortcut (documented Electron behavior),
// which is what guarantees one keybind fires exactly once. A key the matcher
// does not recognize is left untouched and keeps its old path: menu shortcut
// first, then the terminal.
export function deliverKeybindsFromKeyEvents(
  webContents: KeybindWebContents,
  keybinds: () => TerminalKeybinds,
  invokeAction: (action: TerminalActionName) => void,
  platform: string = "darwin",
  capture?: KeyCapture,
): void {
  webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" && input.type !== "rawKeyDown") return;
    if (capture?.active()) {
      event.preventDefault();
      capture.send({
        key: input.key,
        code: input.code ?? "",
        control: input.control,
        meta: input.meta,
        alt: input.alt,
        shift: input.shift,
      });
      return;
    }
    const action = terminalActionForKeyboardInput(
      keybinds(),
      { ...input, altGr: hasNativeAltGr(input) },
      platform,
    );
    if (action === undefined) return;
    // A delivered keybind must never also reach the Terminal Surface or PTY.
    event.preventDefault();
    invokeAction(action);
  });
}
