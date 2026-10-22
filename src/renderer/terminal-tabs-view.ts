import type { TerminalSessionId } from "../shared/terminal-contract";
import { layoutPanes, resizeSplit } from "./pane-layout";
import { applyPaneWeights, renderPaneLayout } from "./pane-view";
import type { TerminalPane, TerminalTab } from "./terminal-tab-model";
import type { TabsContext } from "./terminal-tabs-types";

export const selectedTab = (ctx: TabsContext): TerminalTab | undefined =>
  ctx.tabs[ctx.selectedIndex];

export function allPanes(tabs: readonly TerminalTab[]): TerminalPane[] {
  return tabs.flatMap((tab) => layoutPanes(tab.layout));
}

export function findBySession(
  tabs: readonly TerminalTab[],
  sessionId: TerminalSessionId,
): TerminalPane | undefined {
  return allPanes(tabs).find((pane) => pane.adapter.sessionId() === sessionId);
}

export function renderStrip(ctx: TabsContext): void {
  ctx.strip.render(
    ctx.tabs,
    ctx.selectedIndex,
    ctx.tabBarEnabled && ctx.tabs.length >= 2,
  );
}

export function applyVisibility(ctx: TabsContext): void {
  for (const [position, tab] of ctx.tabs.entries()) {
    const shown = position === ctx.selectedIndex;
    const panes = layoutPanes(tab.layout);
    tab.container.hidden = !shown;
    tab.container.classList.toggle("split", panes.length > 1);
    tab.container.classList.toggle("maximized", tab.maximized !== undefined);
    tab.container.classList.toggle("broadcasting", tab === ctx.broadcastTab);
    // Hidden Surfaces must not draw (spec: hidden tabs keep their grid).
    for (const pane of panes) {
      pane.container.hidden =
        !shown || (tab.maximized !== undefined && tab.maximized !== pane);
      pane.container.classList.toggle("focused-pane", pane === tab.focused);
    }
  }
}

export function renderLayout(ctx: TabsContext, tab: TerminalTab): void {
  renderPaneLayout(tab.container, tab.layout, {
    dividerLabel: ctx.options.dividerLabel ?? "Resize panes",
    onResize: (path, index, delta) => {
      tab.layout = resizeSplit(tab.layout, path, index, delta);
      applyPaneWeights(tab.container, tab.layout);
    },
  });
}

export function tabSessionIds(tab: TerminalTab): TerminalSessionId[] {
  return layoutPanes(tab.layout)
    .map((pane) => pane.adapter.sessionId())
    .filter((id): id is TerminalSessionId => id !== undefined);
}

export function notifyFocus(ctx: TabsContext, tab: TerminalTab): void {
  if (tab !== selectedTab(ctx)) return;
  // Main tracks the selected session for titles and close confirmations (a
  // pane still starting has no id yet and is reported once it starts).
  const sessionId = tab.focused.adapter.sessionId();
  if (sessionId === undefined) return;
  const siblings = tabSessionIds(tab);
  if (siblings.length > 1) ctx.options.notifySelection?.(sessionId, siblings);
  else ctx.options.notifySelection?.(sessionId);
}

export function select(ctx: TabsContext, index: number): void {
  const tab = ctx.tabs[index];
  if (!tab) return;
  ctx.selectedIndex = index;
  applyVisibility(ctx);
  renderStrip(ctx);
  notifyFocus(ctx, tab);
  tab.focused.surface?.focus();
}

export function focusPane(
  ctx: TabsContext,
  tab: TerminalTab,
  pane: TerminalPane,
): void {
  if (tab.focused === pane && pane.container.classList.contains("focused-pane"))
    return;
  tab.focused = pane;
  if (tab.maximized && tab.maximized !== pane) tab.maximized = pane;
  applyVisibility(ctx);
  renderStrip(ctx);
  notifyFocus(ctx, tab);
}

export function notifyEmpty(
  ctx: TabsContext,
  reason?: "rendering-failure",
): void {
  if (ctx.disposed || ctx.closing || ctx.tabs.length !== 0) return;
  // Commit last-tab closure: a later queued New Tab cannot resurrect it.
  ctx.closing = true;
  ctx.options.notifyEmpty?.(reason);
}

export function stopBroadcast(ctx: TabsContext): void {
  if (!ctx.broadcastTab) return;
  ctx.broadcastTab = undefined;
  ctx.options.onBroadcastChange?.(0);
  applyVisibility(ctx);
  renderStrip(ctx);
}
