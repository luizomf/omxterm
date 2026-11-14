import type { ExtensionsBridge } from "../shared/extensions";
import { openPanelDefault } from "./panel-default";
import type { SemanticInputBridge } from "../shared/semantic-input";
import { createSemanticInput } from "./semantic-input";
import { createFilesTerminalDropTarget } from "./files-terminal-drop-target";
import { installWindowFileDrops } from "./window-file-drops";
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
export function subscribeToWindowTools(
  document: Document,
  options: TerminalWindowActionSubscriptions & {
    semanticInput?: SemanticInputBridge;
    filesTerminalDrag?: import("../shared/files-terminal-drag").FilesTerminalDragBridge;
    droppedFilePathInsertion?: (files: readonly File[]) => string;
    extensions?: ExtensionsBridge;
    settings?: SettingsBridge;
    snippets?: WindowSnippetsSource;
    clipboard?: TerminalClipboard;
  },
  owner: {
    tabs: TerminalTabs;
    panel: AuxiliaryPanel | undefined;
    language: RendererLanguage;
    blocked(): boolean;
    semanticBlocked?(): boolean;
    modalClipboard(action: TerminalClipboardAction): boolean;
    focusTerminal?(focus?: () => void): void;
    sourceForeground?(id: string): boolean;
    sourceSelected?(id: string): boolean;
    togglePanelSide?(): void;
  },
) {
  const { tabs, panel } = owner;
  let removeActions: (() => void) | undefined;
  let removeSettings: (() => void) | undefined;
  let removeNative: (() => void) | undefined;
  let removePanel: (() => void) | undefined;
  const semanticBlocked = () =>
    owner.blocked() || owner.semanticBlocked?.() === true;
  const dropTarget = createFilesTerminalDropTarget(
    document,
    options.semanticInput ? options.filesTerminalDrag : undefined,
    tabs,
    owner.language,
    semanticBlocked,
  );
  const removeDrops = installWindowFileDrops(
    document,
    owner.blocked,
    tabs.injectText,
    options.droppedFilePathInsertion,
    dropTarget,
  );
  const input = createSemanticInput({
    capture: tabs.captureSnippetTarget,
    blocked: semanticBlocked,
    focusTerminal: owner.focusTerminal ?? tabs.focusSelected,
    focusCapturedTarget: (target, source, drop) => {
      if (
        semanticBlocked() ||
        !target.isCurrent?.() ||
        (source &&
          (drop
            ? owner.sourceSelected?.(source)
            : owner.sourceForeground?.(source)) !== true)
      )
        return;
      const focus = () => {
        if (
          !semanticBlocked() &&
          target.isCurrent?.() &&
          (!source || owner.sourceSelected?.(source) === true)
        )
          target.focus?.();
      };
      if (owner.focusTerminal) owner.focusTerminal(focus);
      else focus();
    },
  });
  let snippets: ReturnType<typeof mountWindowSnippets>;
  let disposed = false;
  const unsubscribe = () => {
    if (disposed) return;
    disposed = true;
    removeActions?.();
    snippets?.unsubscribe();
    input.dispose();
    removeSettings?.();
    removeNative?.();
    removePanel?.();
    removeDrops();
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
      () => panel?.cancelDefaultOpen(),
    );
    removePanel = options.subscribeToAuxiliaryPanelToggle?.(() => {
      if (!disposed && !owner.blocked() && tabs.isTerminalSelected())
        panel?.toggleVisibility((signal) => {
          if (options.snippets) panel.show("snippets");
          else if (options.extensions)
            void openPanelDefault(
              options.extensions,
              signal,
              () => panel.noticeEmpty(),
              (token) => panel.expectDefaultOpen(signal, token),
            ).then((opened) => {
              if (!opened && !signal.aborted) panel.cancelDefaultOpen();
            });
        });
    });
    const removePanelSide = options.subscribeToAuxiliaryPanelSideToggle?.(
      () => {
        // Side is a focused-window preference. Settings and hosted tabs may
        // change it; suspension and modal owners still hide or block the panel.
        if (!disposed && !owner.blocked()) owner.togglePanelSide?.();
      },
    );
    if (removePanelSide) {
      const previous = removePanel;
      removePanel = () => {
        previous?.();
        removePanelSide();
      };
    }
    snippets = mountWindowSnippets(document, panel, options.snippets, {
      tabs,
      input,
      language: owner.language,
      blocked: owner.blocked,
    });
    if (options.semanticInput)
      removeNative = subscribeNativeSemanticInput(
        options.semanticInput,
        input,
        tabs.selectionRevision,
        tabs.selectedSessionId,
        dropTarget.takeTarget,
      );
    removeSettings = options.settings?.onOpen(() => {
      if (!disposed && !owner.blocked()) tabs.openSettings();
    });
    return {
      unsubscribe,
      clearFileDrop: dropTarget.clear,
    };
  } catch (error) {
    unsubscribe();
    throw error;
  }
}
