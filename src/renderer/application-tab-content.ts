import type { ApplicationTab, TerminalTabsOptions } from "./terminal-tabs";
import {
  disposePane,
  tabPanes,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";

export function activateTabContent(
  tabs: readonly ApplicationTab[],
  tab: ApplicationTab,
  changed: boolean,
  passive: boolean,
  options: TerminalTabsOptions,
  notifyFocus: (tab: TerminalTab) => void,
) {
  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.container.hidden = !selected;
    if (candidate.kind === "settings") candidate.view.setSelected(selected);
    else if (candidate.kind === "terminal")
      for (const pane of tabPanes(candidate)) pane.container.hidden = !selected;
  }
  if (tab.kind === "settings") {
    if (changed) options.onSettingsSelected?.();
    options.notifySelection?.({ kind: "settings" }, []);
    if ((changed || !passive) && options.canFocus?.() !== false)
      tab.view.focus();
  } else if (tab.kind === "terminal") {
    notifyFocus(tab);
    focusPane(tab.focused, options, passive);
  } else options.onGraphicalSelected?.();
}

export function captureActionTarget(
  selected: () => ApplicationTab | undefined,
  revision: () => number,
  available: () => boolean,
): { isCurrent(): boolean } {
  const tab = selected();
  const pane = tab?.kind === "terminal" ? tab.focused : undefined;
  const generation = revision();
  return {
    isCurrent: () =>
      available() &&
      !!tab &&
      !tab.removed &&
      revision() === generation &&
      selected() === tab &&
      (tab.kind !== "terminal" ||
        (!!pane && tab.focused === pane && !pane.removed && !pane.ended)),
  };
}

export function focusApplicationTab(
  tab: ApplicationTab | undefined,
  options: TerminalTabsOptions,
  focusHosted: () => void,
) {
  if (options.canFocus?.() === false) return;
  if (tab?.kind === "hosted") focusHosted();
  else if (tab?.kind === "settings") tab.view.focus();
  else if (tab?.kind === "terminal") focusPane(tab.focused, options);
}

export function disposeTabContent(tabs: ApplicationTab[]) {
  for (const tab of tabs) {
    tab.removed = true;
    if (tab.kind === "settings") tab.view.dispose();
    else if (tab.kind === "terminal")
      for (const pane of tabPanes(tab)) {
        pane.removed = true;
        disposePane(pane);
      }
  }
  tabs.length = 0;
}

export function focusPane(
  pane: TerminalPane | undefined,
  options: TerminalTabsOptions,
  passive = false,
  unchangedFocus = false,
): void {
  if (
    options.canFocus?.() !== false &&
    (!passive || options.canAutoFocus?.(unchangedFocus) !== false)
  )
    pane?.surface?.focus();
}
