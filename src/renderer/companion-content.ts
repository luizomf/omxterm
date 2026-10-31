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
  type CompanionSlot = HostedContentSlot & {
    removed: boolean;
    closing: boolean;
    canRestoreFocus?: () => boolean;
  };
  const slots = new Map<string, CompanionSlot>();
  // A newer selection can supersede a retirement's hide continuation. Its
  // acknowledged activation still drains retired slots, without stealing focus.
  const drainRetired = () => {
    for (const [id, slot] of slots) {
      if (!slot.removed) continue;
      panel?.remove(id);
      slots.delete(id);
      presentation.forget(slot);
    }
  };
  let application: ApplicationTab | undefined;
  let selectionRevision = 0;
  let pendingActivation: ((focusAllowed?: boolean) => void) | undefined;
  // Application readiness belongs to the selection, not its replaceable native
  // target. Any acknowledged presentation of that selection settles it once.
  const activateApplication = (focusAllowed = true) => {
    const activate = pendingActivation;
    pendingActivation = undefined;
    panel?.setSuspended(application?.kind !== "terminal");
    activate?.(focusAllowed);
    return !!activate;
  };
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
          selectionRevision += 1;
          presentation.select(
            id ? slots.get(id) : undefined,
            () => {
              drainRetired();
              activateApplication(
                !options.blocked() && !presentation.isBlocked(),
              );
              activate();
            },
            application,
            id && slots.has(id) ? true : false,
          );
        },
      })
    : undefined;
  const selectedPanel = () => {
    const id = panel?.selected();
    const slot = id ? slots.get(id) : undefined;
    return slot?.removed ? undefined : slot;
  };
  const removeOpen = bridge?.onOpen((descriptor) => {
    if (disposed || descriptor.presentation !== "panel" || !panel) return;
    if (!slots.has(descriptor.id)) {
      const slot = parent.ownerDocument.createElement("div");
      slot.className = "companion-native-slot";
      const target: CompanionSlot = {
        id: descriptor.id,
        slot,
        removed: false,
        closing: false,
      };
      slots.set(descriptor.id, target);
      panel.register(
        {
          id: descriptor.id,
          label: descriptor.title,
          close() {
            if (target.closing || target.removed) return;
            target.closing = true;
            // Same-tab reselection is a new intent too. A later DOM focus
            // owner (including an overlay) must not inherit this close's focus.
            const revision = selectionRevision;
            const focused = parent.ownerDocument.activeElement;
            target.canRestoreFocus = () =>
              revision === selectionRevision &&
              focused === parent.ownerDocument.activeElement;
            presentation.close(target.id, () => retire(target.id));
          },
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
        },
        true,
      );
    }
    if (slots.get(descriptor.id)?.closing || slots.get(descriptor.id)?.removed)
      return;
    // A late admitted open registers a tool, but never steals a modal or a
    // nonterminal selection. Its visible switcher remains available on return.
    if (
      application?.kind === "terminal" &&
      !application.removed &&
      !options.blocked() &&
      !presentation.isBlocked()
    )
      if (descriptor.toggle) panel.toggle(descriptor.id);
      else panel.show(descriptor.id);
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
  function retire(id: string) {
    const slot = slots.get(id);
    if (!slot || disposed || slot.removed) return;
    slot.removed = true;
    if (application?.kind === "terminal" && panel?.requested() === id) {
      const captured = selectionRevision;
      presentation.select(
        undefined,
        () => {
          const restore =
            selectionRevision === captured &&
            (!slot.canRestoreFocus || slot.canRestoreFocus()) &&
            panel?.requested() === id &&
            !options.blocked() &&
            !presentation.isBlocked();
          drainRetired();
          const activated = activateApplication(
            !options.blocked() && !presentation.isBlocked(),
          );
          if (restore && !activated) options.focusTerminal();
        },
        application,
        false,
      );
    } else {
      panel?.remove(id);
      slots.delete(id);
      presentation.forget(slot);
    }
  }
  const removeRetired = bridge?.onRetired(retire);
  return {
    panel,
    presentation,
    select(
      tab: ApplicationTab,
      activate: (focusAllowed?: boolean) => void,
      passive: boolean,
    ) {
      application = tab;
      selectionRevision += 1;
      pendingActivation = activate;
      const target =
        tab.kind === "hosted"
          ? tab
          : tab.kind === "terminal"
            ? selectedPanel()
            : undefined;
      presentation.select(
        target,
        (focusAllowed) => {
          drainRetired();
          activateApplication(focusAllowed);
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
      pendingActivation = undefined;
      removeOpen?.();
      removeRetired?.();
      removeDismiss?.();
      panel?.dispose();
      slots.clear();
      presentation.dispose();
    },
  };
}
