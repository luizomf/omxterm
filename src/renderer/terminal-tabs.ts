import { DEFAULT_TERMINAL_FONT_SIZE } from "../shared/user-configuration";
import { layoutPanes } from "./pane-layout";
import { createTabStrip, moveTabToHorizontalDrop } from "./tab-strip";
import { installWheelZoom } from "./wheel-zoom";
import { closePendingPane, type TerminalTab } from "./terminal-tab-model";
import { handleTabCommand } from "./terminal-tabs-commands";
import { createTab, restoreTabs, split } from "./terminal-pane-lifecycle";
import { cancelWorkspaceReport } from "./terminal-tabs-workspace";
import { normalizeGroups } from "./tab-groups";
import { openGroupMenu, openTabMenu, toggleGroup } from "./terminal-tab-menu";
import type {
  TabsContext,
  TerminalTabs,
  TerminalTabsElements,
  TerminalTabsOptions,
} from "./terminal-tabs-types";
import {
  allPanes,
  findBySession,
  renderStrip,
  select,
  selectedTab,
} from "./terminal-tabs-view";

export { TERMINAL_TAB_DRAG_DATA_TYPE } from "./tab-strip";
export type { PaneLaunch } from "./terminal-tab-model";
export type {
  MountTerminalSurface,
  TerminalLaunchPlacement,
  TerminalTabs,
  TerminalTabsElements,
  TerminalTabsOptions,
} from "./terminal-tabs-types";

export function createTerminalTabs(
  elements: TerminalTabsElements,
  options: TerminalTabsOptions,
): TerminalTabs {
  const ctx: TabsContext = {
    document: elements.container.ownerDocument,
    elements,
    options,
    tabs: [],
    strip: createTabStrip<TerminalTab>(elements.strip, {
      describe: (tab, index) => {
        const panes = layoutPanes(tab.layout);
        const color =
          tab.color ?? panes.find((pane) => pane.launch.color)?.launch.color;
        const group = tab.group;
        return {
          label: tab.title ?? tab.focused.label,
          paneCount: panes.length,
          broadcasting: tab === ctx.broadcastTab,
          ...(color ? { color } : {}),
          ...(group
            ? {
                group: {
                  name: group.name,
                  color: group.color,
                  collapsed: group.collapsed,
                  first: ctx.tabs[index - 1]?.group !== group,
                },
              }
            : {}),
        };
      },
      onSelect: (tab) => select(ctx, ctx.tabs.indexOf(tab)),
      onReorder: (tab, clientX) => {
        const selected = selectedTab(ctx);
        if (!moveTabToHorizontalDrop(ctx.tabs, tab, elements.strip, clientX))
          return;
        normalizeGroups(ctx.tabs);
        ctx.selectedIndex = selected ? ctx.tabs.indexOf(selected) : -1;
        renderStrip(ctx);
      },
      onContextMenu: (tab, position) => openTabMenu(ctx, tab, position),
      onGroupToggle: (tab) => {
        if (tab.group) toggleGroup(ctx, tab.group);
      },
      onGroupContextMenu: (tab, position) => {
        if (tab.group) openGroupMenu(ctx, tab.group, position);
      },
    }),
    selectedIndex: -1,
    zoomSteps: 0,
    activeSurfaceOptions: options.surfaceOptions,
    tabBarEnabled: options.showTabBar ?? true,
    disposed: false,
    closing: false,
    pendingClose: undefined,
    broadcastTab: undefined,
  };

  const ready = options.initialWorkspace
    ? restoreTabs(ctx, options.initialWorkspace)
    : createTab(ctx, options.initialLaunch);
  const focusedSurface = () => selectedTab(ctx)?.focused.surface;

  const api: TerminalTabs = {
    ready,
    setSessionTitle(sessionId, title) {
      if (ctx.disposed) return;
      const pane = findBySession(ctx.tabs, sessionId);
      if (!pane) return;
      pane.label = title;
      renderStrip(ctx);
    },
    applyConfiguration(configuration) {
      if (ctx.disposed) return;
      ctx.activeSurfaceOptions = {
        ...ctx.activeSurfaceOptions,
        ...configuration,
      };
      ctx.zoomSteps = Math.max(
        1 - configuration.appearance.fontSize,
        ctx.zoomSteps,
      );
      for (const pane of allPanes(ctx.tabs))
        pane.surface?.applyConfiguration(configuration);
    },
    handleCommand: (command) => handleTabCommand(ctx, command),
    zoom(command) {
      const baseline =
        ctx.activeSurfaceOptions.appearance?.fontSize ??
        DEFAULT_TERMINAL_FONT_SIZE;
      ctx.zoomSteps =
        command === "reset"
          ? 0
          : command === "in"
            ? ctx.zoomSteps + 1
            : Math.max(1 - baseline, ctx.zoomSteps - 1);
      for (const pane of allPanes(ctx.tabs)) pane.surface?.zoom(command);
    },
    clipboardAction(action) {
      const surface = focusedSurface();
      if (!surface) return;
      if (action === "copy") void surface.copy();
      else if (action === "paste") void surface.paste();
      else surface.selectAll();
    },
    injectText(text) {
      void focusedSurface()?.inject(text);
    },
    injectSnippet(body, injectOptions) {
      const pane = selectedTab(ctx)?.focused;
      if (!pane?.surface) return;
      pane.highlighter?.injected(body, injectOptions.submit);
      void pane.surface.inject(body, { submit: injectOptions.submit });
    },
    toggleTabBar() {
      if (ctx.disposed) return;
      ctx.tabBarEnabled = !ctx.tabBarEnabled;
      renderStrip(ctx);
      focusedSurface()?.focus();
    },
    focusSelected() {
      focusedSurface()?.focus();
    },
    focusedSessionId() {
      return selectedTab(ctx)?.focused.adapter.sessionId();
    },
    focusedOutput() {
      return focusedSurface()?.outputText?.() ?? "";
    },
    tabList() {
      return ctx.tabs.map((tab, index) => ({
        label: tab.title ?? (tab.focused.label || String(index + 1)),
        selected: index === ctx.selectedIndex,
      }));
    },
    selectTab(index) {
      if (index < 0 || index >= ctx.tabs.length) return;
      select(ctx, index);
      focusedSurface()?.focus();
    },
    sendKeys(keys) {
      selectedTab(ctx)?.focused.adapter.write(keys);
    },
    focusedSelection() {
      return focusedSurface()?.selectionText?.() ?? "";
    },
    openLaunch(launch, placement) {
      if (ctx.disposed || ctx.closing) return;
      if (placement === "tab") void createTab(ctx, launch).catch(() => {});
      else split(ctx, placement === "split-right" ? "right" : "down", launch);
    },
    dispose() {
      if (ctx.disposed) return;
      removeWheelZoom();
      ctx.disposed = true;
      ctx.pendingClose = undefined;
      ctx.broadcastTab = undefined;
      cancelWorkspaceReport(ctx);
      ctx.strip.dispose();
      for (const tab of [...ctx.tabs]) {
        tab.removed = true;
        for (const pane of layoutPanes(tab.layout)) {
          pane.removed = true;
          if (pane.surface) pane.surface.dispose();
          else closePendingPane(pane);
        }
      }
      ctx.tabs.length = 0;
    },
  };
  const removeWheelZoom = installWheelZoom(elements.container, (command) =>
    api.zoom(command),
  );
  return api;
}
