import type { SettingsBridge } from "../shared/settings";
import type { TerminalClipboardAction } from "../shared/terminal-contract";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { AuxiliaryPanel } from "./auxiliary-panel";
import type { RendererLanguage } from "./renderer-language";
import {
  mountWindowSnippets,
  type WindowSnippetsSource,
} from "./snippets-host";
import type { TerminalTabs } from "./terminal-tabs";
import {
  subscribeToGuardedActions,
  type TerminalWindowActionSubscriptions,
} from "./terminal-window-actions";

// Own the window's inbound action subscriptions and their partial-setup cleanup.
// The window retains the returned preview's modal and disposal lifetime.
export function subscribeToWindowTools(
  document: Document,
  options: TerminalWindowActionSubscriptions & {
    settings?: SettingsBridge;
    snippets?: WindowSnippetsSource;
    clipboard?: TerminalClipboard;
  },
  owner: {
    tabs: TerminalTabs;
    panel: AuxiliaryPanel | undefined;
    language: RendererLanguage;
    blocked(): boolean;
    onPreviewActivity(): void;
    modalClipboard(action: TerminalClipboardAction): boolean;
  },
) {
  const { tabs, panel } = owner;
  let removeActions: (() => void) | undefined;
  let removeSettings: (() => void) | undefined;
  let snippets: ReturnType<typeof mountWindowSnippets>;
  let disposed = false;
  const unsubscribe = () => {
    if (disposed) return;
    disposed = true;
    removeActions?.();
    snippets?.unsubscribe();
    removeSettings?.();
  };
  try {
    removeActions = subscribeToGuardedActions(
      options,
      tabs,
      owner.blocked,
      (action) =>
        (!tabs.isTerminalSelected() && !tabs.isSettingsSelected()) ||
        tabs.editSettingsClipboard(action, options.clipboard) ||
        (panel?.clipboardAction(action) ?? false),
      owner.modalClipboard,
    );
    snippets = mountWindowSnippets(document, panel, options.snippets, {
      tabs,
      language: owner.language,
      blocked: owner.blocked,
      onPreviewActivity: owner.onPreviewActivity,
      openOverlay: tabs.openOverlay,
    });
    removeSettings = options.settings?.onOpen(() => {
      if (!disposed && !owner.blocked()) tabs.openSettings();
    });
    return { preview: snippets?.preview, unsubscribe };
  } catch (error) {
    unsubscribe();
    snippets?.preview.dispose();
    throw error;
  }
}
