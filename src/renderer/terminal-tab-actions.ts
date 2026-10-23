import type { Translator } from "../shared/i18n";
import { normalizeGroups } from "./tab-groups";
import { layoutPanes } from "./pane-layout";
import type { TerminalTab } from "./terminal-tab-model";
import type { TabsContext } from "./terminal-tabs-types";
import { closeTab } from "./terminal-pane-lifecycle";
import { renderStrip, selectedTab } from "./terminal-tabs-view";
import { tabSnapshot } from "./terminal-tabs-workspace";
import type { ContextMenuItem } from "./ui/context-menu";
import { confirmAction } from "./ui/modal";

const sessionsOf = (tabs: readonly TerminalTab[]) =>
  tabs.flatMap((tab) =>
    layoutPanes(tab.layout)
      .map((pane) => pane.adapter.sessionId())
      .filter((id): id is string => id !== undefined),
  );

// Asks before ending running programs; true when it is fine to go on.
async function confirmEnding(
  ctx: TabsContext,
  t: Translator["t"],
  tabs: readonly TerminalTab[],
  message: string,
): Promise<boolean> {
  const busy = (await ctx.options.paneBusy?.(sessionsOf(tabs))) ?? false;
  if (!busy) return true;
  return confirmAction(ctx.document, {
    title: t("tabs.runningTitle"),
    message,
    confirmLabel: t("tabs.closeAnyway"),
    cancelLabel: t("common.cancel"),
    danger: true,
  });
}

function moveTab(ctx: TabsContext, tab: TerminalTab, offset: -1 | 1): void {
  const from = ctx.tabs.indexOf(tab);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= ctx.tabs.length) return;
  const selected = selectedTab(ctx);
  ctx.tabs.splice(from, 1);
  ctx.tabs.splice(to, 0, tab);
  normalizeGroups(ctx.tabs);
  ctx.selectedIndex = selected ? ctx.tabs.indexOf(selected) : -1;
  renderStrip(ctx);
}

async function closeTabs(
  ctx: TabsContext,
  t: Translator["t"],
  tabs: readonly TerminalTab[],
): Promise<void> {
  if (tabs.length === 0) return;
  const confirmed = await confirmEnding(
    ctx,
    t,
    tabs,
    t("tabs.runningClose", { count: tabs.length }),
  );
  if (!confirmed) return;
  for (const tab of tabs) if (!tab.removed) closeTab(ctx, tab);
}

// The tab reopens in a new window in the same folders and connections; a
// live process cannot move between windows, so a running one ends.
async function detachTab(
  ctx: TabsContext,
  t: Translator["t"],
  tab: TerminalTab,
): Promise<void> {
  const detach = ctx.options.detachTab;
  if (!detach || tab.removed) return;
  const confirmed = await confirmEnding(ctx, t, [tab], t("tabs.runningDetach"));
  if (!confirmed || tab.removed) return;
  const opened = await detach({ selected: 0, tabs: [tabSnapshot(tab)] }).catch(
    () => false,
  );
  if (opened && !tab.removed) closeTab(ctx, tab);
}

// Move, detach and close items of a tab's menu.
export function tabArrangeItems(
  ctx: TabsContext,
  t: Translator["t"],
  tab: TerminalTab,
): ContextMenuItem[] {
  const index = ctx.tabs.indexOf(tab);
  const others = ctx.tabs.filter((candidate) => candidate !== tab);
  const right = ctx.tabs.slice(index + 1);
  return [
    {
      label: t("tabs.moveLeft"),
      disabled: index <= 0,
      action: () => moveTab(ctx, tab, -1),
    },
    {
      label: t("tabs.moveRight"),
      disabled: index >= ctx.tabs.length - 1,
      action: () => moveTab(ctx, tab, 1),
    },
    ...(ctx.options.detachTab
      ? [
          {
            label: t("tabs.detach"),
            action: () => void detachTab(ctx, t, tab),
          },
        ]
      : []),
    { separator: true },
    { label: t("tabs.close"), action: () => void closeTabs(ctx, t, [tab]) },
    {
      label: t("tabs.closeOthers"),
      disabled: others.length === 0,
      action: () => void closeTabs(ctx, t, others),
    },
    {
      label: t("tabs.closeRight"),
      disabled: right.length === 0,
      action: () => void closeTabs(ctx, t, right),
    },
  ];
}
