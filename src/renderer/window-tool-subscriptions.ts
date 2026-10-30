import type { SemanticInputBridge } from "../shared/semantic-input";
import { createSemanticInput } from "./semantic-input";
import { subscribeNativeSemanticInput } from "./native-semantic-input";
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
    semanticInput?: SemanticInputBridge;
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
    focusTerminal?(): void;
    restoreSourceFocus?(id: string): boolean;
  },
) {
  const { tabs, panel } = owner;
  let removeActions: (() => void) | undefined;
  let removeSettings: (() => void) | undefined;
  let removeNative: (() => void) | undefined;
  const input = createSemanticInput(document, {
    language: owner.language,
    capture: tabs.captureSnippetTarget,
    blocked: owner.blocked,
    focusTerminal: owner.focusTerminal ?? tabs.focusSelected,
    onPreviewActivity: owner.onPreviewActivity,
    openOverlay: tabs.openOverlay,
  });
  let snippets: ReturnType<typeof mountWindowSnippets>;
  let disposed = false;
  const unsubscribe = () => {
    if (disposed) return;
    disposed = true;
    removeActions?.();
    snippets?.unsubscribe();
    removeSettings?.();
    removeNative?.();
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
      input,
      language: owner.language,
      blocked: owner.blocked,
      onPreviewActivity: owner.onPreviewActivity,
      openOverlay: tabs.openOverlay,
    });
    if (options.semanticInput)
      removeNative = subscribeNativeSemanticInput(
        options.semanticInput,
        input,
        tabs.selectionRevision,
        owner.restoreSourceFocus ?? (() => false),
      );
    removeSettings = options.settings?.onOpen(() => {
      if (!disposed && !owner.blocked()) tabs.openSettings();
    });
    return { preview: input.preview, unsubscribe };
  } catch (error) {
    unsubscribe();
    input.preview.dispose();
    throw error;
  }
}
