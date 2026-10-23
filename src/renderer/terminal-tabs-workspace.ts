import type { WorkspaceSnapshot } from "../shared/workspace";
import { layoutPanes, serializeLayout } from "./pane-layout";
import type { TerminalPane, TerminalTab } from "./terminal-tab-model";
import type { TabsContext } from "./terminal-tabs-types";

const REPORT_DELAY_MS = 250;
const timers = new WeakMap<TabsContext, ReturnType<typeof setTimeout>>();

// The window's tabs and panes for workspace restore. Shell panes are named by
// session (main knows their directories); Saved Session and Quick Connect
// panes also carry their launch, so a failed connection still restores.
export function workspaceSnapshot(ctx: TabsContext): WorkspaceSnapshot {
  const tabs = ctx.tabs.map(tabSnapshot);
  return {
    selected: tabs.length === 0 ? 0 : Math.max(0, ctx.selectedIndex),
    tabs,
  };
}

// One tab as workspace restore describes it (also used by Detach Tab).
export function tabSnapshot(
  tab: TerminalTab,
): WorkspaceSnapshot["tabs"][number] {
  const panes = layoutPanes(tab.layout);
  return {
    layout: serializeLayout(tab.layout, (pane) => panes.indexOf(pane)),
    focused: Math.max(0, panes.indexOf(tab.focused)),
    panes: panes.map(paneSnapshot),
    ...(tab.title ? { title: tab.title } : {}),
    ...(tab.color ? { color: tab.color } : {}),
    ...(tab.group
      ? {
          group: {
            name: tab.group.name,
            color: tab.group.color,
            collapsed: tab.group.collapsed,
          },
        }
      : {}),
  };
}

function paneSnapshot(pane: TerminalPane) {
  const sessionId = pane.adapter.sessionId() ?? null;
  const spec = pane.launch.spec;
  if (spec?.kind === "saved-session")
    return { sessionId, launch: { kind: spec.kind, id: spec.id } };
  if (spec?.kind === "quick-ssh")
    return { sessionId, launch: { kind: spec.kind, target: spec.target } };
  return { sessionId };
}

// Coalesces bursts of layout changes into one report.
export function scheduleWorkspaceReport(ctx: TabsContext): void {
  const report = ctx.options.onWorkspaceChange;
  if (!report || ctx.disposed || timers.has(ctx)) return;
  timers.set(
    ctx,
    setTimeout(() => {
      timers.delete(ctx);
      if (!ctx.disposed) report(workspaceSnapshot(ctx));
    }, REPORT_DELAY_MS),
  );
}

// Reports now: an emptied window closes before a delayed report would run.
export function flushWorkspaceReport(ctx: TabsContext): void {
  cancelWorkspaceReport(ctx);
  if (!ctx.disposed) ctx.options.onWorkspaceChange?.(workspaceSnapshot(ctx));
}

export function cancelWorkspaceReport(ctx: TabsContext): void {
  clearTimeout(timers.get(ctx));
  timers.delete(ctx);
}
