import type {
  TerminalPaneTarget,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import {
  adjacentPane,
  directionalPane,
  equalizeLayout,
  layoutPanes,
} from "./pane-layout";
import { applyPaneWeights } from "./pane-view";
import { scheduleWorkspaceReport } from "./terminal-tabs-workspace";
import {
  closePane,
  closeTab,
  createTab,
  split,
  toggleBroadcast,
} from "./terminal-pane-lifecycle";
import type { TabsContext } from "./terminal-tabs-types";
import {
  applyVisibility,
  findBySession,
  focusPane,
  select,
  selectedTab,
} from "./terminal-tabs-view";

// Main-to-renderer Terminal Tab commands, including split-pane actions.
export function handleTabCommand(
  ctx: TabsContext,
  command: TerminalTabCommand,
): void {
  if (ctx.disposed || ctx.closing) return;
  switch (command.action) {
    case "new":
      // A failed additional spawn already dropped its tab; main shows the
      // native failure dialog, so the renderer only swallows here.
      void createTab(ctx).catch(() => {});
      return;
    case "close":
      closeTab(ctx, selectedTab(ctx));
      return;
    case "close-pane":
      closePane(ctx, selectedTab(ctx)?.focused);
      return;
    case "close-session":
      closePane(ctx, findBySession(ctx.tabs, command.sessionId));
      return;
    case "prepare-close":
    case "prepare-close-pane":
    case "resolve-close":
      handleCloseConfirmation(ctx, command);
      return;
    case "next":
    case "previous": {
      if (ctx.tabs.length === 0) return;
      const offset = command.action === "next" ? 1 : -1;
      select(
        ctx,
        (ctx.selectedIndex + offset + ctx.tabs.length) % ctx.tabs.length,
      );
      return;
    }
    case "select":
      if (command.position <= ctx.tabs.length)
        select(ctx, command.position - 1);
      return;
    case "split":
      split(ctx, command.direction);
      return;
    case "focus-pane":
      movePaneFocus(ctx, command.target);
      return;
    case "toggle-maximize-pane":
      toggleMaximize(ctx);
      return;
    case "find":
    case "equalize-panes":
    case "toggle-broadcast":
      handlePaneCommand(ctx, command.action);
      return;
  }
}

// Commands that act on the selected tab's panes.
function handlePaneCommand(
  ctx: TabsContext,
  action: "find" | "equalize-panes" | "toggle-broadcast",
): void {
  const tab = selectedTab(ctx);
  if (action === "toggle-broadcast") toggleBroadcast(ctx);
  else if (action === "find") tab?.focused.surface?.toggleSearch();
  else if (tab) {
    tab.layout = equalizeLayout(tab.layout);
    applyPaneWeights(tab.container, tab.layout);
    scheduleWorkspaceReport(ctx);
  }
}

// Main serializes confirmations: "prepare-*" retains the target in the tab
// owner, and "resolve-close" consumes that target, never a later selection.
function handleCloseConfirmation(
  ctx: TabsContext,
  command: Extract<
    TerminalTabCommand,
    { action: "prepare-close" | "prepare-close-pane" | "resolve-close" }
  >,
): void {
  if (command.action === "prepare-close") {
    const tab = selectedTab(ctx);
    ctx.pendingClose = tab ? { kind: "tab", tab } : undefined;
    return;
  }
  if (command.action === "prepare-close-pane") {
    const pane = selectedTab(ctx)?.focused;
    ctx.pendingClose = pane ? { kind: "pane", pane } : undefined;
    return;
  }
  const target = ctx.pendingClose;
  ctx.pendingClose = undefined;
  if (!command.confirmed || !target) return;
  if (target.kind === "tab") closeTab(ctx, target.tab);
  else closePane(ctx, target.pane);
}

function movePaneFocus(ctx: TabsContext, target: TerminalPaneTarget): void {
  const tab = selectedTab(ctx);
  if (!tab) return;
  const next =
    target === "next" || target === "previous"
      ? adjacentPane(tab.layout, tab.focused, target === "next" ? 1 : -1)
      : directionalPane(layoutPanes(tab.layout), tab.focused, target, (pane) =>
          pane.container.getBoundingClientRect(),
        );
  if (!next) return;
  focusPane(ctx, tab, next);
  next.surface?.focus();
}

function toggleMaximize(ctx: TabsContext): void {
  const tab = selectedTab(ctx);
  if (!tab || layoutPanes(tab.layout).length < 2) return;
  tab.maximized = tab.maximized ? undefined : tab.focused;
  applyVisibility(ctx);
  tab.focused.surface?.focus();
}
