import { createHostedContentTabs } from "./hosted-content-tabs";
import { createSettingsTab, type SettingsTab } from "./settings-tab";
import type {
  ApplicationTab,
  TerminalTabs,
  TerminalTabsOptions,
} from "./terminal-tabs";
import type { RendererLanguage } from "./renderer-language";
import type { retainDismissalGesture } from "./about/about-dialog";

// Adapts graphical content into the window's existing ordered collection.
export function createGraphicalTabs(
  tabs: ApplicationTab[],
  parent: HTMLElement,
  options: TerminalTabsOptions,
  language: RendererLanguage,
  keyboard: ReturnType<typeof retainDismissalGesture>,
  owner: {
    available(): boolean;
    canFocus?: (() => boolean) | undefined;
    selected(): ApplicationTab | undefined;
    select(index: number, passive?: boolean): void;
    close(tab: ApplicationTab): void;
    remove(tab: ApplicationTab): void;
    render(): void;
  },
) {
  const hosted = createHostedContentTabs(
    parent,
    options.hostedContent,
    {
      open(tab) {
        if (
          !owner.available() ||
          tabs.some(
            (candidate) =>
              candidate.kind === "hosted" && candidate.id === tab.id,
          )
        ) {
          tab.container.remove();
          return;
        }
        tabs.push(tab);
        // Late activation may finish while a modal owns selection. Keep the
        // new tab in the background without changing the modal's owner/generation.
        if (owner.canFocus?.() === false) owner.render();
        else owner.select(tabs.length - 1, true);
      },
      retired(id) {
        const tab = tabs.find(
          (candidate) => candidate.kind === "hosted" && candidate.id === id,
        );
        if (tab) owner.remove(tab);
      },
      close: owner.close,
    },
    keyboard,
    language,
    options.hostedPresentation,
  );
  const settingsActions: Pick<
    TerminalTabs,
    | "openSettings"
    | "isSettingsSelected"
    | "setBlocked"
    | "editSettingsClipboard"
  > = {
    openSettings() {
      if (
        !owner.available() ||
        options.canFocus?.() === false ||
        !options.settings
      )
        return;
      let tab = tabs.find(
        (candidate): candidate is SettingsTab => candidate.kind === "settings",
      );
      if (!tab) {
        tab = createSettingsTab(
          parent,
          options.settings,
          language,
          keyboard,
          owner.close,
        );
        tabs.push(tab);
        owner.select(tabs.length - 1);
        void tab.view.open();
      } else if (tab !== owner.selected()) owner.select(tabs.indexOf(tab));
    },
    isSettingsSelected: () => owner.selected()?.kind === "settings",
    setBlocked(blocked) {
      for (const tab of tabs)
        if (tab.kind === "settings") tab.view.setBlocked(blocked);
      hosted.setBlocked(blocked);
    },
    editSettingsClipboard(action, clipboard) {
      const tab = owner.selected();
      if (tab?.kind !== "settings") return false;
      tab.view.editClipboard(action, clipboard);
      return true;
    },
  };
  return { hosted, settingsActions };
}
