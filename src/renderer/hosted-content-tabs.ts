import { englishLanguage, type RendererLanguage } from "./renderer-language";
import { createPageButton } from "./application-page";
import { createHostedContentPresentation } from "./hosted-content-presentation";
import type { retainDismissalGesture } from "./about/about-dialog";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../shared/extension-view";

export interface HostedTab {
  readonly kind: "hosted";
  readonly id: string;
  readonly title: string;
  readonly container: HTMLElement;
  readonly slot: HTMLElement;
  removed: boolean;
}

// Adapts main-issued native content into Application Tabs. Presentation rules
// live in the window owner, not in tab construction or tab command callbacks.
export function createHostedContentTabs(
  parent: HTMLElement,
  bridge: HostedContentBridge | undefined,
  callbacks: {
    open(tab: HostedTab): void;
    retired(id: string): void;
    close(tab: HostedTab): void;
  },
  keyboard: ReturnType<typeof retainDismissalGesture>,
  language: RendererLanguage = englishLanguage,
  owner?: ReturnType<typeof createHostedContentPresentation>,
) {
  let disposed = false;
  const presentation =
    owner ?? createHostedContentPresentation(parent, bridge, language);
  const removeLanguage = language.bind(() => {
    for (const button of parent.querySelectorAll(
      ".hosted-content-tab > button",
    ))
      button.textContent = language.t("hosted.close");
  });
  const removeOpen = bridge?.onOpen((descriptor: HostedContentDescriptor) => {
    if (disposed || descriptor.presentation === "panel") return;
    const container = parent.ownerDocument.createElement("section");
    container.className = "hosted-content-tab";
    container.hidden = true;
    const close = createPageButton(parent.ownerDocument);
    close.textContent = language.t("hosted.close");
    const slot = parent.ownerDocument.createElement("div");
    slot.className = "hosted-content-slot";
    const tab: HostedTab = {
      kind: "hosted",
      ...descriptor,
      container,
      slot,
      removed: false,
    };
    close.addEventListener("keydown", (event) => {
      if (event.key === "Enter") keyboard.track(event, close);
    });
    close.addEventListener("click", () => callbacks.close(tab));
    container.append(close, slot);
    parent.append(container);
    callbacks.open(tab);
  });
  const removeRetired = bridge?.onRetired(callbacks.retired);
  return {
    select: presentation.select,
    focus: presentation.focus,
    setBlocked: presentation.setBlocked,
    openOverlay: presentation.openOverlay,
    forget: presentation.forget,
    close(tab: HostedTab, remove: () => void) {
      presentation.close(tab.id, remove);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      removeOpen?.();
      removeRetired?.();
      removeLanguage();
      if (!owner) presentation.dispose();
    },
  };
}
