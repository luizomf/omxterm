import type { TerminalFontZoom } from "../shared/terminal-contract";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../shared/user-configuration";
import type {
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import { tabPanes, type TerminalTab } from "./terminal-panes";

// Window Font Zoom and live Surface settings apply to retained terminals only;
// new/mounting panes read the same current baseline and zoom delta.
export function createTerminalTabConfiguration(
  initial: TerminalSurfaceOptions,
  tabs: () => readonly TerminalTab[],
) {
  let current = initial;
  let steps = 0;
  return {
    current: () => current,
    zoomSteps: () => steps,
    apply(configuration: TerminalSurfaceConfiguration) {
      current = { ...current, ...configuration };
      steps = Math.max(1 - configuration.appearance.fontSize, steps);
      for (const tab of tabs())
        for (const pane of tabPanes(tab))
          pane.surface?.applyConfiguration(configuration);
    },
    zoom(command: TerminalFontZoom) {
      const baseline =
        current.appearance?.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
      steps =
        command === "reset"
          ? 0
          : command === "in"
            ? steps + 1
            : Math.max(1 - baseline, steps - 1);
      for (const tab of tabs())
        for (const pane of tabPanes(tab)) pane.surface?.zoom(command);
    },
  };
}
