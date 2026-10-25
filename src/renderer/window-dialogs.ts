import type { AboutBridge } from "../shared/about";
import type { SettingsBridge } from "../shared/settings";
import type { TerminalClipboardAction } from "../shared/terminal-contract";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import { mountAboutDialog } from "./about/about-dialog";
import { mountSettingsDialog } from "./settings/settings-dialog";
import type { RendererLanguage } from "./renderer-language";

// About and Settings each own modal input; at most one is open, and neither
// opens over a Local Image Preview.
export function mountWindowDialogs(
  document: Document,
  bridges: {
    readonly about?: AboutBridge | undefined;
    readonly settings?: SettingsBridge | undefined;
  },
  canOpen: () => boolean,
  options: {
    readonly language?: RendererLanguage;
    readonly focusTerminal: () => void;
    readonly onActivityChange: (active: boolean) => void;
  },
) {
  const about = mountAboutDialog(document, bridges.about, canOpen, options);
  const settings = mountSettingsDialog(
    document,
    bridges.settings,
    canOpen,
    options,
  );
  return {
    isActive: () =>
      (about?.isActive() ?? false) || (settings?.isActive() ?? false),
    editClipboard(
      action: TerminalClipboardAction,
      clipboard: TerminalClipboard | undefined,
    ) {
      settings?.editClipboard(action, clipboard);
    },
    dispose() {
      about?.dispose();
      settings?.dispose();
    },
  };
}
