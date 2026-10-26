import type { TerminalTheme } from "../shared/terminal-theme";
import { luminance, terminalPaneAccent } from "./terminal-pane-accent";

// Window-owned paint uses the complete validated theme, independently of
// Surface configuration and separator interaction/geometry owners.
export function applyWindowTheme(
  document: Document,
  tabs: HTMLElement,
  theme: TerminalTheme,
  transparency: number,
): void {
  const { background, foreground } = theme.colors;
  const style = document.documentElement.style;
  style.setProperty("--terminal-background-opacity", String(1 - transparency));
  style.setProperty("--terminal-background", background);
  style.setProperty("--terminal-foreground", foreground);
  style.setProperty(
    "--ui-color-scheme",
    luminance(background) > 0.179 ? "light" : "dark",
  );
  const appearance = theme.appearance;
  for (const [property, color] of [
    ["--terminal-pane-divider-color", appearance?.paneDivider],
    ["--auxiliary-panel-divider-color", appearance?.auxiliaryPanelDivider],
  ] as const) {
    if (color === undefined) style.removeProperty(property);
    else style.setProperty(property, color === null ? "transparent" : color);
  }
  const highlight = appearance?.activePaneHighlight;
  style.setProperty(
    "--terminal-pane-accent",
    highlight === undefined
      ? terminalPaneAccent(theme)
      : highlight === null
        ? "transparent"
        : highlight,
  );
  document.body.style.setProperty("--terminal-background", background);
  tabs.style.setProperty("--terminal-background", background);
}
