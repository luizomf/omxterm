import type { NativeTerminalWindow } from "./terminal-application";

export function createSelectedWindowAction<Window extends NativeTerminalWindow>(
  getSelectedWindow: () => Window | undefined,
): (action: (window: Window) => void) => () => void {
  return (action) => () => {
    const window = getSelectedWindow();
    if (window) action(window);
  };
}
