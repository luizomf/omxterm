import type {
  AuxiliaryPanelSide,
  TerminalRendererConfiguration,
} from "../shared/user-configuration";
import type { HostedContentBridge } from "../shared/extension-view";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { ApplicationTab } from "./terminal-tabs";
import { createAuxiliaryPanel } from "./auxiliary-panel";
import {
  createHostedContentPresentation,
  type HostedContentSlot,
} from "./hosted-content-presentation";
import type { RendererLanguage } from "./renderer-language";
import { createHostedDialogs } from "./hosted-content-dialog";

function createPanelSideController(
  panel: ReturnType<typeof createAuxiliaryPanel> | undefined,
  layout: () => void,
  isBlocked: () => boolean,
) {
  let configuredSide: AuxiliaryPanelSide = "right";
  let override: AuxiliaryPanelSide | undefined;
  return {
    applyConfiguration(
      configuration?: Pick<TerminalRendererConfiguration, "auxiliaryPanelSide">,
    ) {
      const side = configuration?.auxiliaryPanelSide ?? "right";
      if (side !== configuredSide) override = undefined;
      configuredSide = side;
      if (panel?.setSide(override ?? side)) layout();
    },
    toggle() {
      if (!panel || isBlocked()) return;
      override = (override ?? configuredSide) === "left" ? "right" : "left";
      if (panel.setSide(override)) layout();
    },
  };
}

type CompanionSlot = HostedContentSlot & {
  removed: boolean;
  closing: boolean;
  canRestoreFocus?: () => boolean;
};

// A superseding selection can drain retired slots on its own acknowledged
// presentation without letting the older hide continuation restore focus.
function drainRetired(
  slots: Map<string, CompanionSlot>,
  panel: ReturnType<typeof createAuxiliaryPanel> | undefined,
  presentation: ReturnType<typeof createHostedContentPresentation>,
) {
  for (const [id, slot] of slots) {
    if (!slot.removed) continue;
    panel?.remove(id);
    slots.delete(id);
    presentation.forget(slot);
  }
}

// Window composition for the one native presenter, the exclusive companion
// panel and the one hosted dialog. Neither tools nor dialogs enter the
// application-tab collection or own core sessions.
// eslint-disable-next-line max-lines-per-function -- Tab, panel and dialog selections share one ordered presenter and selection revision.
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
  const slots = new Map<string, CompanionSlot>();
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
  const dialogs = createHostedDialogs(parent.ownerDocument, {
    language: options.language,
    canOpen: () =>
      !disposed &&
      !!application &&
      !application.removed &&
      !options.blocked() &&
      !presentation.isBlocked(),
    close: (id, closed) => presentation.close(id, closed),
    forget: presentation.forget,
    present(target) {
      selectionRevision += 1;
      presentation.select(
        target,
        () => {
          drainRetired(slots, panel, presentation);
          // Settle a pending tab activation without moving focus.
          activateApplication(false);
        },
        target,
        true,
      );
    },
    restore(settled) {
      const captured = ++selectionRevision;
      const next = applicationTarget();
      presentation.select(
        next,
        (focusAllowed) => {
          settled();
          drainRetired(slots, panel, presentation);
          const activated = activateApplication(focusAllowed);
          if (
            captured === selectionRevision &&
            focusAllowed &&
            !activated &&
            !options.blocked()
          )
            options.focusTerminal();
        },
        application,
        application?.kind === "terminal" && next ? "core" : true,
      );
    },
  });
  const applicationTarget = () =>
    application?.kind === "hosted"
      ? application
      : application?.kind === "terminal"
        ? selectedPanel()
        : undefined;
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
          dialogs.yield();
          presentation.select(
            id ? slots.get(id) : undefined,
            () => {
              dialogs.settle();
              drainRetired(slots, panel, presentation);
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
  const panelSide = createPanelSideController(
    panel,
    presentation.layout,
    () => disposed || options.blocked() || presentation.isBlocked(),
  );
  const selectedPanel = () => {
    const id = panel?.selected();
    const slot = id ? slots.get(id) : undefined;
    return slot?.removed ? undefined : slot;
  };
  const removeOpen = bridge?.onOpen((descriptor) => {
    if (descriptor.presentation === "dialog") {
      dialogs.open(descriptor.id, descriptor.title);
      return;
    }
    if (disposed || descriptor.presentation !== "panel" || !panel) return;
    if (
      descriptor.panelDefaultToken &&
      !panel.claimDefaultOpen(descriptor.panelDefaultToken)
    ) {
      void bridge?.close(descriptor.id).catch(() => {});
      return;
    }
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
      !presentation.isBlocked() &&
      !dialogs.shown()
    )
      if (descriptor.toggle) panel.toggle(descriptor.id);
      else panel.show(descriptor.id);
  });
  const removeDismiss = bridge?.onDismissPanel?.((id) => {
    if (dialogs.dismiss(id)) return;
    if (
      !disposed &&
      application?.kind === "terminal" &&
      panel?.requested() === id &&
      !options.blocked() &&
      !presentation.isBlocked()
    )
      panel.dismiss();
  });
  const removeContentHeight = bridge?.onContentHeight?.(dialogs.fit);
  function retire(id: string) {
    if (dialogs.retire(id)) return;
    const slot = slots.get(id);
    if (!slot || disposed || slot.removed) return;
    slot.removed = true;
    // A shown dialog keeps the presenter; the panel just drops the tool.
    if (
      application?.kind === "terminal" &&
      panel?.requested() === id &&
      !dialogs.shown()
    ) {
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
          drainRetired(slots, panel, presentation);
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
    applyConfiguration: panelSide.applyConfiguration,
    toggleSide: panelSide.toggle,
    select(
      tab: ApplicationTab,
      activate: (focusAllowed?: boolean) => void,
      passive: boolean,
      nativeFocus = true,
    ) {
      panel?.cancelDefaultOpen();
      application = tab;
      selectionRevision += 1;
      pendingActivation = activate;
      dialogs.yield();
      const target = applicationTarget();
      presentation.select(
        target,
        (focusAllowed) => {
          dialogs.settle();
          drainRetired(slots, panel, presentation);
          activateApplication(focusAllowed);
        },
        tab,
        tab.kind === "terminal" && target
          ? passive
            ? false
            : "core"
          : nativeFocus,
      );
    },
    dialogShown: dialogs.shown,
    closeDialog: dialogs.closeShown,
    ownsPanelFocus() {
      const target = selectedPanel();
      return (
        panel?.ownsFocus() === true ||
        (application?.kind === "terminal" &&
          !!target &&
          presentation.ownsFocus(target.id))
      );
    },
    focusTerminal: (focus: () => void = options.focusTerminal) =>
      presentation.focusCore(focus),
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
    isSourceSelected(id: string) {
      return (
        !disposed &&
        !options.blocked() &&
        application?.kind === "terminal" &&
        selectedPanel()?.id === id
      );
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
      removeContentHeight?.();
      panel?.dispose();
      slots.clear();
      dialogs.dispose();
      presentation.dispose();
    },
  };
}
