import {
  terminalActionForKeyboardInput,
  type AcceleratorKeyboardInput,
  type TerminalActionName,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";

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

// macOS AppKit refuses to deliver some registered menu key equivalents —
// Control+Tab is reserved for key-view loop navigation — so those key events
// fall through to the window instead of firing their menu item (#82). An event
// a menu does handle never reaches before-input-event, which makes this the
// exact complement of the menu: matching every keybind here delivers the
// refused ones without ever double-firing a delivered one.
export function deliverUnhandledKeybinds(
  webContents: KeybindWebContents,
  keybinds: TerminalKeybinds,
  invokeAction: (action: TerminalActionName) => void,
): void {
  webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" && input.type !== "rawKeyDown") return;
    const action = terminalActionForKeyboardInput(keybinds, input);
    if (action === undefined) return;
    // A delivered keybind must never also reach the Terminal Surface or PTY.
    event.preventDefault();
    invokeAction(action);
  });
}
