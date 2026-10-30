import type { HostedContentBridge } from "../shared/extension-view";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { ApplicationTab } from "./terminal-tabs";
import { createAuxiliaryPanel } from "./auxiliary-panel";
import {
  createHostedContentPresentation,
  type HostedContentSlot,
} from "./hosted-content-presentation";
import type { RendererLanguage } from "./renderer-language";

// Window composition for the one native presenter and the exclusive companion
// panel. Tools never enter the application-tab collection or own core sessions.
export function createCompanionContent(
  parent: HTMLElement,
  root: HTMLElement | undefined,
  bridge: HostedContentBridge | undefined,
  options: {
    language: RendererLanguage;
    clipboard?: TerminalClipboard | undefined;
    focusTerminal(): void;
    blocked(): boolean;
  },
) {
  const presentation = createHostedContentPresentation(
    parent,
    bridge,
    options.language,
  );
  const slots = new Map<string, HostedContentSlot & { removed: boolean }>();
  let application: ApplicationTab | undefined;
  let disposed = false;
  const panel = root
    ? createAuxiliaryPanel(root, {
        content: root.parentElement!,
        views: [],
        language: options.language,
        ...(options.clipboard ? { clipboard: options.clipboard } : {}),
        focusTerminal: options.focusTerminal,
        select(id, activate) {
          if (application?.kind !== "terminal") return;
          presentation.select(
            id ? slots.get(id) : undefined,
            activate,
            application,
            id && slots.has(id) ? true : false,
          );
        },
      })
    : undefined;
  const selectedPanel = () => {
    const id = panel?.selected();
    return id ? slots.get(id) : undefined;
  };
  const removeOpen = bridge?.onOpen((descriptor) => {
    if (disposed || descriptor.presentation !== "panel" || !panel) return;
    if (!slots.has(descriptor.id)) {
      const slot = parent.ownerDocument.createElement("div");
      slot.className = "companion-native-slot";
      const target = { id: descriptor.id, slot, removed: false };
      slots.set(descriptor.id, target);
      panel.register({
        id: descriptor.id,
        label: descriptor.title,
        create: () => ({
          element: slot,
          activate() {},
          deactivate() {},
          focus() {},
          dispose() {
            target.removed = true;
            slot.remove();
          },
        }),
      });
    }
    // A late admitted open registers a tool, but never steals a modal or a
    // nonterminal selection. Its visible switcher remains available on return.
    if (
      application?.kind === "terminal" &&
      !application.removed &&
      !options.blocked() &&
      !presentation.isBlocked()
    )
      panel.show(descriptor.id);
  });
  const removeDismiss = bridge?.onDismissPanel?.((id) => {
    if (
      !disposed &&
      application?.kind === "terminal" &&
      panel?.requested() === id &&
      !options.blocked() &&
      !presentation.isBlocked()
    )
      panel.dismiss();
  });
  const removeRetired = bridge?.onRetired((id) => {
    const slot = slots.get(id);
    if (!slot || disposed) return;
    slot.removed = true;
    const remove = () => {
      panel?.remove(id);
      slots.delete(id);
      presentation.forget(slot);
    };
    if (application?.kind === "terminal" && panel?.requested() === id)
      presentation.select(
        undefined,
        () => {
          remove();
          if (!options.blocked()) options.focusTerminal();
        },
        application,
        false,
      );
    else remove();
  });
  return {
    panel,
    presentation,
    select(
      tab: ApplicationTab,
      activate: (focusAllowed?: boolean) => void,
      passive: boolean,
    ) {
      application = tab;
      const target =
        tab.kind === "hosted"
          ? tab
          : tab.kind === "terminal"
            ? selectedPanel()
            : undefined;
      presentation.select(
        target,
        (focusAllowed) => {
          panel?.setSuspended(tab.kind !== "terminal");
          activate(focusAllowed);
        },
        tab,
        tab.kind === "terminal" && target ? (passive ? false : "core") : true,
      );
    },
    ownsPanelFocus() {
      const target = selectedPanel();
      return (
        panel?.ownsFocus() === true ||
        (application?.kind === "terminal" &&
          !!target &&
          presentation.ownsFocus(target.id))
      );
    },
    focusTerminal() {
      presentation.focusCore(options.focusTerminal);
    },
    restoreSourceFocus(id: string) {
      if (
        disposed ||
        options.blocked() ||
        presentation.isBlocked() ||
        application?.kind !== "terminal" ||
        selectedPanel()?.id !== id
      )
        return false;
      presentation.restoreFocus();
      return true;
    },
    isSourceForeground(id: string) {
      return (
        !options.blocked() &&
        ((application?.kind === "hosted" && application.id === id) ||
          (application?.kind === "terminal" &&
            selectedPanel()?.id === id &&
            presentation.ownsFocus(id)))
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeOpen?.();
      removeRetired?.();
      removeDismiss?.();
      panel?.dispose();
      slots.clear();
      presentation.dispose();
    },
  };
}
