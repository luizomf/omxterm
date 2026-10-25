import {
  MAX_PANES_PER_TAB,
  type TerminalExit,
  type TerminalSessionId,
  type TerminalSplitDirection,
} from "../shared/terminal-contract";
import type {
  TerminalSurface,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import {
  adjacentPane,
  deserializeLayout,
  layoutPanes,
  leaf,
  removePane as removeLayoutPane,
  replacePane,
  splitPane,
} from "./pane-layout";
import {
  closePendingPane,
  completeConfiguration,
  createPane,
  DEFAULT_ENDED_BANNER_STRINGS,
  paneSessionAdapter,
  showEndedBanner,
  type PaneLaunch,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-tab-model";
import type { TabsContext } from "./terminal-tabs-types";
import type { RestoredPane, WorkspacePlan } from "../shared/workspace";
import { normalizeGroups, type TabGroup } from "./tab-groups";
import { scheduleWorkspaceReport } from "./terminal-tabs-workspace";
import {
  applyVisibility,
  focusPane,
  notifyEmpty,
  notifyFocus,
  renderLayout,
  renderStrip,
  select,
  selectedTab,
  stopBroadcast,
} from "./terminal-tabs-view";

export function removeTab(
  ctx: TabsContext,
  tab: TerminalTab,
  notify = true,
): void {
  const index = ctx.tabs.indexOf(tab);
  if (tab.removed || index < 0) return;
  tab.removed = true;
  for (const pane of layoutPanes(tab.layout)) pane.removed = true;
  if (ctx.broadcastTab === tab) stopBroadcast(ctx);
  ctx.tabs.splice(index, 1);
  tab.container.remove();
  if (ctx.tabs.length === 0) {
    ctx.selectedIndex = -1;
    renderStrip(ctx);
    if (notify) notifyEmpty(ctx);
    return;
  }
  if (index < ctx.selectedIndex) ctx.selectedIndex -= 1;
  select(ctx, Math.min(ctx.selectedIndex, ctx.tabs.length - 1));
}

// Removing a tab's last pane follows the existing last-tab lifecycle.
export function removePane(
  ctx: TabsContext,
  pane: TerminalPane,
  notify = true,
): void {
  const { tab } = pane;
  if (pane.removed || tab.removed) return;
  if (layoutPanes(tab.layout).length <= 1) {
    removeTab(ctx, tab, notify);
    return;
  }
  const fallback =
    adjacentPane(tab.layout, pane, -1) ?? adjacentPane(tab.layout, pane, 1)!;
  pane.removed = true;
  tab.layout = removeLayoutPane(tab.layout, pane) ?? leaf(fallback);
  if (tab.maximized === pane) tab.maximized = undefined;
  if (layoutPanes(tab.layout).length < 2 && ctx.broadcastTab === tab)
    stopBroadcast(ctx);
  pane.container.remove();
  renderLayout(ctx, tab);
  if (tab.focused === pane) {
    tab.focused = fallback;
    if (tab === selectedTab(ctx)) tab.focused.surface?.focus();
  }
  applyVisibility(ctx);
  renderStrip(ctx);
  notifyFocus(ctx, tab);
}

export function closePane(
  ctx: TabsContext,
  pane: TerminalPane | undefined,
): void {
  if (!pane || pane.removed) return;
  removePane(ctx, pane);
  if (pane.surface) pane.surface.dispose();
  else closePendingPane(pane);
}

export function closeTab(ctx: TabsContext, tab: TerminalTab | undefined): void {
  if (!tab || tab.removed) return;
  const panes = layoutPanes(tab.layout);
  // Disposing a Surface closes its Terminal Adapter and session; a pane still
  // mounting has no Surface yet, so its adapter is closed directly.
  removeTab(ctx, tab);
  for (const pane of panes) {
    if (pane.surface) pane.surface.dispose();
    else closePendingPane(pane);
  }
}

// How much of an ended pane's final output an offer may inspect.
const ENDED_OUTPUT_TAIL = 4096;
const SSH_ERROR_STATUS = 255;

const isSshLaunch = (launch: PaneLaunch) =>
  launch.spec?.kind === "saved-session" || launch.spec?.kind === "quick-ssh";

function onSessionEnd(
  ctx: TabsContext,
  pane: TerminalPane,
  exit: TerminalExit,
): void {
  if (ctx.disposed || pane.removed) return;
  pane.ended = true;
  renderStrip(ctx);
  // A retained pane keeps a failed connection's screen with Reconnect.
  if (
    pane.launch.retainOnExit &&
    exit.signal === 0 &&
    !exit.startupFailed &&
    exit.exitCode !== 0
  ) {
    const output = pane.surface?.outputText?.().slice(-ENDED_OUTPUT_TAIL);
    // ssh exits with 255 for its own errors (host key, sign-in, network).
    const solution =
      exit.exitCode === SSH_ERROR_STATUS && isSshLaunch(pane.launch)
        ? ctx.options.endedSolution
        : undefined;
    const addOffer = showEndedBanner(
      pane,
      exit.exitCode,
      ctx.options.endedBanner ?? DEFAULT_ENDED_BANNER_STRINGS,
      {
        reconnect: () => reconnect(ctx, pane),
        close: () => closePane(ctx, pane),
        ...(solution
          ? {
              solution: () =>
                solution(pane.launch, output ?? "", () => reconnect(ctx, pane)),
            }
          : {}),
      },
    );
    void ctx.options
      .endedOffer?.(pane.launch, output ?? "")
      .then((offer) => {
        if (offer && !ctx.disposed && !pane.removed) addOffer(offer);
      })
      .catch(() => {});
    return;
  }
  // An ordinary end removes the pane; an unexpected signal keeps it visible
  // until main acknowledges the failure and orders removal.
  if (exit.signal === 0 && !exit.startupFailed) removePane(ctx, pane);
}

function broadcastFrom(
  ctx: TabsContext,
  pane: TerminalPane,
  text: string,
): void {
  const { tab } = pane;
  if (tab !== ctx.broadcastTab || tab.focused !== pane || ctx.disposed) return;
  for (const target of layoutPanes(tab.layout))
    if (target !== pane && !target.removed && !target.ended && target.surface)
      target.adapter.write(text);
}

function paneSurfaceOptions(
  ctx: TabsContext,
  pane: TerminalPane,
): TerminalSurfaceOptions {
  // Title, BEL and directory events carry the emitting pane's session id; the
  // Surface itself stays tab-unaware. Events can only follow session output,
  // so the id is always known by the time they fire.
  const withSession =
    <Argument extends unknown[]>(
      callback: (sessionId: TerminalSessionId, ...rest: Argument) => void,
    ) =>
    (...rest: Argument) => {
      if (ctx.disposed || pane.removed) return;
      const sessionId = pane.adapter.sessionId();
      if (sessionId !== undefined) callback(sessionId, ...rest);
    };
  const { options } = ctx;
  const highlighter = options.createHighlighter?.();
  pane.highlighter = highlighter;
  const clipboard = ctx.activeSurfaceOptions.clipboard;
  return {
    ...ctx.activeSurfaceOptions,
    // The context menu acts on the focused pane, so a right-click focuses its
    // own pane first; a split pane's menu also offers Close Pane.
    ...(clipboard
      ? {
          clipboard: {
            ...clipboard,
            requestContextMenu() {
              if (ctx.disposed || pane.removed) return;
              focusPane(ctx, pane.tab, pane);
              pane.surface?.focus();
              clipboard.requestContextMenu(
                layoutPanes(pane.tab.layout).length > 1
                  ? { closePane: true }
                  : undefined,
              );
            },
          },
        }
      : {}),
    abortSignal: pane.mountAbort.signal,
    ...(pane.launch.retainOnExit ? { retainOnExit: true } : {}),
    ...(highlighter ? { transformOutput: highlighter.transform } : {}),
    onUserInput: (text: string) => {
      highlighter?.userInput(text);
      broadcastFrom(ctx, pane, text);
    },
    ...(options.notifyTitle
      ? { onTitleRequest: withSession(options.notifyTitle) }
      : {}),
    ...(options.notifyBell ? { onBell: withSession(options.notifyBell) } : {}),
    ...(options.onWorkingDirectory
      ? { onWorkingDirectory: withSession(options.onWorkingDirectory) }
      : {}),
  };
}

function replayZoom(ctx: TabsContext, surface: TerminalSurface): void {
  for (let step = 0; step < Math.abs(ctx.zoomSteps); step += 1)
    surface.zoom(ctx.zoomSteps > 0 ? "in" : "out");
}

async function mountPane(ctx: TabsContext, pane: TerminalPane): Promise<void> {
  const { adapter } = pane;
  const sessionAdapter = paneSessionAdapter(
    pane,
    (ended, exit) => onSessionEnd(ctx, ended, exit),
    () => {
      if (ctx.disposed || pane.removed) return;
      const sessionId = adapter.sessionId();
      if (sessionId !== undefined) ctx.options.syncTitle?.(sessionId);
      // Selection is reported only after the Surface mount returns, as for
      // tabs; a session start alone never selects (tab-removal readiness).
    },
  );
  let surface: TerminalSurface;
  try {
    surface = await ctx.options.mount(
      pane.container,
      sessionAdapter,
      paneSurfaceOptions(ctx, pane),
    );
  } catch (error) {
    // Once a native session exists, retain its failed pane through
    // asynchronous termination and main's acknowledgement. A close request is
    // not an exit.
    if (adapter.sessionId() === undefined) {
      const lastPane = layoutPanes(pane.tab.layout).length <= 1;
      removePane(ctx, pane, false);
      if (lastPane) {
        if (pane.startRequested) notifyEmpty(ctx);
        else if (!pane.mountAbort.signal.aborted)
          notifyEmpty(ctx, "rendering-failure");
      }
    }
    throw error;
  }
  if (ctx.disposed || pane.removed) {
    surface.dispose();
    return;
  }
  pane.surface = surface;
  pane.startedAt = Date.now();
  // The pane's session id is known now; main needs it for its directory.
  scheduleWorkspaceReport(ctx);
  const latestConfiguration = completeConfiguration(ctx.activeSurfaceOptions);
  if (latestConfiguration) surface.applyConfiguration(latestConfiguration);
  replayZoom(ctx, surface);
  if (selectedTab(ctx) === pane.tab && pane.tab.focused === pane) {
    notifyFocus(ctx, pane.tab);
    if (ctx.document.hasFocus()) surface.focus();
  }
}

function trackPaneFocus(ctx: TabsContext, pane: TerminalPane): void {
  pane.container.addEventListener("focusin", () => {
    if (!ctx.disposed && !pane.removed) focusPane(ctx, pane.tab, pane);
  });
}

export async function createTab(
  ctx: TabsContext,
  launch: PaneLaunch = {},
): Promise<void> {
  const tab: TerminalTab = {
    container: ctx.document.createElement("div"),
    layout: undefined!,
    focused: undefined!,
    maximized: undefined,
    removed: false,
  };
  tab.container.className = "terminal-tab";
  const pane = createPane(
    tab,
    ctx.document,
    ctx.options.createAdapter,
    launch,
    ctx.options.surfaceLabel,
  );
  tab.layout = leaf(pane);
  tab.focused = pane;
  ctx.elements.container.append(tab.container);
  renderLayout(ctx, tab);
  trackPaneFocus(ctx, pane);
  ctx.tabs.push(tab);
  select(ctx, ctx.tabs.length - 1);
  await mountPane(ctx, pane);
}

// Reopens a saved window: every tab with its layout, the saved tab
// selected. The selected tab's panes decide readiness, like a first tab.
export async function restoreTabs(
  ctx: TabsContext,
  plan: WorkspacePlan,
): Promise<void> {
  // Tabs that were in one group share it again (same name and color).
  const groups = new Map<string, TabGroup>();
  const restored = plan.tabs.map((shape) => {
    const tab: TerminalTab = {
      container: ctx.document.createElement("div"),
      layout: undefined!,
      focused: undefined!,
      maximized: undefined,
      removed: false,
      title: shape.title,
      color: shape.color,
    };
    if (shape.group) {
      const key = `${shape.group.color}\n${shape.group.name}`;
      if (!groups.has(key)) groups.set(key, { ...shape.group });
      tab.group = groups.get(key);
    }
    tab.container.className = "terminal-tab";
    const panes = shape.panes.map((pane) =>
      createPane(
        tab,
        ctx.document,
        ctx.options.createAdapter,
        restoredLaunch(pane),
        ctx.options.surfaceLabel,
      ),
    );
    tab.layout = deserializeLayout(shape.layout, (index) => panes[index]!);
    tab.focused = panes[shape.focused] ?? panes[0]!;
    ctx.elements.container.append(tab.container);
    renderLayout(ctx, tab);
    for (const pane of panes) trackPaneFocus(ctx, pane);
    ctx.tabs.push(tab);
    return panes;
  });
  normalizeGroups(ctx.tabs);
  select(ctx, plan.selected);
  const selected = restored[plan.selected] ?? [];
  const ready = selected.map((pane) => mountPane(ctx, pane));
  for (const panes of restored)
    if (panes !== selected)
      for (const pane of panes) void mountPane(ctx, pane).catch(() => {});
  await Promise.all(ready);
}

function restoredLaunch(pane: RestoredPane): PaneLaunch {
  if (pane.kind === "saved-session")
    return {
      spec: { kind: "saved-session", id: pane.id },
      label: pane.label,
      ...(pane.color ? { color: pane.color } : {}),
      retainOnExit: true,
    };
  if (pane.kind === "quick-ssh")
    return {
      spec: { kind: "quick-ssh", target: pane.target },
      label: pane.target,
      retainOnExit: true,
    };
  return pane.token ? { spec: { kind: "restored", token: pane.token } } : {};
}

function attachPane(
  ctx: TabsContext,
  tab: TerminalTab,
  pane: TerminalPane,
): void {
  renderLayout(ctx, tab);
  trackPaneFocus(ctx, pane);
  applyVisibility(ctx);
  renderStrip(ctx);
  // A failed spawn already dropped its pane; main shows the native failure
  // dialog, so the renderer only swallows here.
  void mountPane(ctx, pane).catch(() => {});
}

export function split(
  ctx: TabsContext,
  direction: TerminalSplitDirection,
  launch?: PaneLaunch,
): void {
  const tab = selectedTab(ctx);
  if (!tab || layoutPanes(tab.layout).length >= MAX_PANES_PER_TAB) return;
  // A plain split starts the Default Shell where the focused pane is.
  const source = tab.focused.adapter.sessionId();
  const paneLaunch: PaneLaunch =
    launch ??
    (source === undefined
      ? {}
      : { spec: { kind: "inherit", sessionId: source } });
  const pane = createPane(
    tab,
    ctx.document,
    ctx.options.createAdapter,
    paneLaunch,
    ctx.options.surfaceLabel,
  );
  tab.layout = splitPane(
    tab.layout,
    tab.focused,
    pane,
    direction === "right" ? "row" : "column",
  );
  tab.maximized = undefined;
  tab.focused = pane;
  attachPane(ctx, tab, pane);
}

// Replace an ended pane with a fresh session from the same launch.
export function reconnect(ctx: TabsContext, old: TerminalPane): void {
  const { tab } = old;
  if (ctx.disposed || old.removed || tab.removed) return;
  const pane = createPane(
    tab,
    ctx.document,
    ctx.options.createAdapter,
    old.launch,
  );
  old.removed = true;
  tab.layout = replacePane(tab.layout, old, pane);
  if (tab.focused === old) tab.focused = pane;
  if (tab.maximized === old) tab.maximized = pane;
  old.surface?.dispose();
  old.container.remove();
  attachPane(ctx, tab, pane);
}

export function toggleBroadcast(ctx: TabsContext): void {
  const tab = selectedTab(ctx);
  if (!tab) return;
  if (ctx.broadcastTab) {
    stopBroadcast(ctx);
    return;
  }
  const targets = layoutPanes(tab.layout).length - 1;
  if (targets < 1) return;
  const start = () => {
    if (ctx.disposed || tab.removed || tab !== selectedTab(ctx)) return;
    if (layoutPanes(tab.layout).length < 2) return;
    ctx.broadcastTab = tab;
    ctx.options.onBroadcastChange?.(layoutPanes(tab.layout).length - 1);
    applyVisibility(ctx);
    renderStrip(ctx);
  };
  if (!ctx.options.confirmBroadcast) {
    start();
    return;
  }
  void ctx.options.confirmBroadcast(targets).then((confirmed) => {
    if (confirmed) start();
    if (!ctx.disposed) tab.focused.surface?.focus();
  });
}
