import type { HostedAppearance } from "../../src/shared/extension-view.js";
import { luminance } from "../../src/renderer/terminal-pane-accent.js";

export interface AppearanceBridge {
  onAppearance(listener: (appearance: HostedAppearance) => void): () => void;
}

// Native backing and the parent window own the base tint. Only project tokens;
// never paint a second page background or alter whole-view/text opacity.
export function mountHostedAppearance(
  document: Document,
  bridge: AppearanceBridge,
): () => void {
  return bridge.onAppearance(({ background, foreground, opacity }) => {
    const root = document.documentElement;
    root.style.setProperty("--terminal-background", background);
    root.style.setProperty("--terminal-foreground", foreground);
    root.style.setProperty("--terminal-background-opacity", String(opacity));
    root.style.colorScheme = luminance(background) > 0.179 ? "light" : "dark";
  });
}
