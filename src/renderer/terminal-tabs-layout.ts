import {
  isCapturedLayout,
  isInitialLayout,
  isLayoutTab,
  LAYOUT_MAX_PANES,
  LAYOUT_MAX_TABS,
  type CapturedLayout,
  type InitialLayout,
  type LayoutNode,
  type LayoutTab,
} from "../shared/terminal-layout";
import { layoutPanes, type PaneLayout } from "./pane-layout";
import { englishLanguage } from "./renderer-language";
import {
  appendTab,
  createPane,
  tabPanes,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";
import type { ApplicationTab, TerminalTabsOptions } from "./terminal-tabs";
import type { createPaneOperations } from "./terminal-pane-operations";

/** Flat indices keep the deepest supported split tree within wire depth limits. */
export function serializePaneLayout<Pane>(
  layout: PaneLayout<Pane>,
  focused: Pane,
): LayoutTab<Pane> {
  const panes = layoutPanes(layout);
  const nodes: LayoutNode[] = [];
  const visit = (node: PaneLayout<Pane>): number => {
    const index = nodes.length;
    nodes.push({ pane: 0 });
    nodes[index] =
      node.kind === "leaf"
        ? { pane: panes.indexOf(node.pane) }
        : {
            direction: node.direction,
            children: node.children.map(visit),
            weights: [...node.weights],
          };
    return index;
  };
  const result = {
    root: visit(layout),
    nodes,
    focused: panes.indexOf(focused),
    panes,
  };
  if (
    !isLayoutTab(result, (value): value is Pane =>
      panes.includes(value as Pane),
    )
  )
    throw new Error("Invalid terminal layout");
  return result;
}

export function deserializePaneLayout<Pane>(
  tab: LayoutTab<Pane>,
): PaneLayout<Pane> {
  if (
    !isLayoutTab(tab, (value): value is Pane =>
      tab.panes.includes(value as Pane),
    )
  )
    throw new Error("Invalid terminal layout");
  const visit = (index: number): PaneLayout<Pane> => {
    const node = tab.nodes[index]!;
    return "pane" in node
      ? { kind: "leaf", pane: tab.panes[node.pane]! }
      : {
          kind: "split",
          direction: node.direction,
          children: node.children.map(visit),
          weights: [...node.weights],
        };
  };
  return visit(tab.root);
}

/**
 * The window's terminal tabs within the layout limits: tabs past 16 tabs or
 * 32 panes are left out and counted in `omitted`, like graphical tabs. Null
 * when the window has no terminal tab at all.
 */
export function captureTerminalLayout(
  tabs: readonly ApplicationTab[],
  selected: ApplicationTab | undefined,
  remembered: TerminalTab | undefined,
): CapturedLayout | null {
  const open = tabs.filter((tab) => !tab.removed);
  const terminals: TerminalTab[] = [];
  let panes = 0;
  for (const tab of open) {
    if (tab.kind !== "terminal") continue;
    const count = tabPanes(tab).length;
    if (terminals.length >= LAYOUT_MAX_TABS || panes + count > LAYOUT_MAX_PANES)
      continue;
    terminals.push(tab);
    panes += count;
  }
  if (terminals.length === 0) return null;
  const selectedTerminal =
    selected?.kind === "terminal" && terminals.includes(selected)
      ? selected
      : remembered && terminals.includes(remembered)
        ? remembered
        : terminals[0]!;
  const result: CapturedLayout = {
    selected: terminals.indexOf(selectedTerminal),
    omitted: open.length - terminals.length,
    tabs: terminals.map((tab) => {
      const flat = serializePaneLayout(tab.layout, tab.focused);
      return {
        ...flat,
        panes: flat.panes.map((pane) =>
          pane.removed || pane.ended
            ? null
            : (pane.adapter.sessionId() ?? null),
        ),
      };
    }),
  };
  if (!isCapturedLayout(result)) throw new Error("Terminal layout unavailable");
  return result;
}

type InitialLayoutOwner = {
  panes: ReturnType<typeof createPaneOperations>;
  select(index: number, passive?: boolean): void;
  mount(pane: TerminalPane): Promise<void>;
  disposed(): boolean;
};

/** Retained terminal selection and capture lifetime belong to this window. */
export function createTerminalTabsLayout(
  parent: HTMLElement,
  tabs: ApplicationTab[],
  options: TerminalTabsOptions,
  selected: () => ApplicationTab | undefined,
  unavailable: () => boolean,
) {
  const history = new Set<TerminalTab>();
  let restoration: ReturnType<typeof mountInitialLayout> | undefined;
  let removeCapture: (() => void) | undefined;
  return {
    selected(tab: ApplicationTab) {
      if (tab.kind === "terminal") {
        history.delete(tab);
        history.add(tab);
      }
    },
    removed(tab: ApplicationTab) {
      if (tab.kind === "terminal") history.delete(tab);
    },
    initialize(owner: InitialLayoutOwner) {
      removeCapture = options.layout?.onCapture(() => {
        if (unavailable()) throw new Error("Terminal layout unavailable");
        return captureTerminalLayout(tabs, selected(), [...history].at(-1));
      });
      if (options.initialLayout)
        restoration = mountInitialLayout(
          parent,
          tabs,
          options.initialLayout,
          options,
          owner,
        );
      return restoration?.ready;
    },
    dispose() {
      removeCapture?.();
      restoration?.dispose();
      history.clear();
    },
  };
}

/** Allocate every owner before any Surface can start or emit an early exit. */
export function mountInitialLayout(
  parent: HTMLElement,
  tabs: ApplicationTab[],
  plan: InitialLayout,
  options: TerminalTabsOptions,
  owner: InitialLayoutOwner,
): { ready: Promise<void>; dispose(): void } {
  if (!isInitialLayout(plan)) throw new Error("Invalid initial layout");
  const restored = plan.tabs.map((saved) => {
    const first = appendTab(parent, () =>
      options.createAdapter(undefined, undefined, saved.panes[0]!),
    );
    const panes = [
      first,
      ...saved.panes
        .slice(1)
        .map((token) =>
          createPane(first.tab, () =>
            options.createAdapter(undefined, undefined, token),
          ),
        ),
    ];
    first.tab.layout = deserializePaneLayout({ ...saved, panes });
    first.tab.focused = panes[saved.focused]!;
    first.tab.container.hidden = true;
    tabs.push(first.tab);
    return first.tab;
  });
  for (const tab of restored) {
    owner.panes.renderTab(tab);
    for (const pane of tabPanes(tab)) owner.panes.trackFocus(pane);
  }
  owner.select(plan.selected, true);
  const selected = restored[plan.selected]!;
  const queue = [
    selected.focused,
    ...tabPanes(selected).filter((pane) => pane !== selected.focused),
    ...restored.filter((tab) => tab !== selected).flatMap(tabPanes),
  ];
  const status = parent.ownerDocument.createElement("div");
  status.className = "terminal-layout-status";
  status.setAttribute("role", "status");
  (parent.closest("#terminal-window-content") ?? parent).before(status);
  let disposed = false;
  let settled = 0;
  let failed = 0;
  const update = () => {
    if (disposed || owner.disposed()) return;
    status.dataset.phase =
      settled < queue.length
        ? "initializing"
        : failed
          ? "partial"
          : "completed";
    status.textContent = (options.language ?? englishLanguage).t(
      settled < queue.length
        ? "layout.initializing"
        : failed
          ? "layout.partial"
          : "layout.completed",
      { settled, total: queue.length, fallbacks: plan.fallbacks, failed },
    );
  };
  const removeLanguage = (options.language ?? englishLanguage).bind(update);
  update();
  let next = 0;
  const mount = async (pane: TerminalPane) => {
    try {
      if (disposed || owner.disposed() || pane.removed || pane.tab.removed) {
        failed++;
        return;
      }
      await owner.mount(pane);
      if (pane.ended || pane.removed) failed++;
    } catch (error) {
      if (pane.adapter.sessionId() === undefined) pane.adapter.close();
      failed++;
      throw error;
    } finally {
      settled++;
      update();
    }
  };
  // The first selected pane alone owns host readiness. Failures of later panes
  // are observed here and retain the normal mount's failure/empty policy.
  const ready = mount(queue[next++]!);
  const worker = async () => {
    while (next < queue.length && !disposed && !owner.disposed()) {
      const pane = queue[next++]!;
      await mount(pane).catch(() => {});
    }
  };
  void ready.then(worker, worker);
  void worker();
  return {
    ready,
    dispose() {
      disposed = true;
      removeLanguage();
      status.remove();
    },
  };
}
