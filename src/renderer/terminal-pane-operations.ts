import type { TerminalContextMenuTarget } from "../shared/terminal-contract";
import {
  MAX_PANES_PER_TAB,
  MIN_PANE_COLUMNS,
  MIN_PANE_ROWS,
  type TerminalPaneCommand,
  type TerminalPaneFocusTarget,
  type TerminalSplitDirection,
} from "../shared/terminal-panes";
import {
  adjacentPane,
  directionalPane,
  equalizeParent,
  leaf,
  removalNeighbor,
  removePane as removeLayoutPane,
  resizeSplit,
  splitPane,
  type PaneLayout,
  type SplitAxis,
} from "./pane-layout";
import { fitsPaneLayout, minimumLayoutExtent } from "./pane-geometry";
import type { TerminalSurfaceGeometry } from "../terminal-surface/terminal-surface";
import { applyPaneWeights, renderPaneLayout } from "./pane-view";
import {
  createPane,
  disposePane,
  endPane,
  tabPanes,
  type CreatePaneAdapter,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";

// Pane operations for the window's tabs. The tabs layer owns selection,
// session start and the last-tab lifecycle; panes own split, focus and size.
export function createPaneOperations(deps: {
  readonly selectedTab: () => TerminalTab | undefined;
  readonly takeContextMenuPane: (
    target: TerminalContextMenuTarget,
  ) => TerminalPane | undefined;
  readonly removeTab: (tab: TerminalTab, notify?: boolean) => void;
  readonly createAdapter: CreatePaneAdapter;
  readonly mountPane: (pane: TerminalPane) => Promise<void>;
  // Focus the pane's Surface when the window may move focus there.
  // passive: a background change, which never takes focus from panel or
  // overlay controls.
  readonly focusSurface: (pane: TerminalPane, passive?: boolean) => void;
  readonly canInteract: () => boolean;
  readonly surfaceLabel: () => string;
  readonly resizeLabel: () => string;
  // The focused pane or the tab's set of sessions changed.
  readonly onFocusChange: (tab: TerminalTab) => void;
  readonly disposed: () => boolean;
}) {
  let rendering = false;
  const renderTab = (tab: TerminalTab) => {
    const panes = tabPanes(tab);
    tab.container.toggleAttribute("data-split", panes.length > 1);
    for (const pane of panes) {
      pane.container.setAttribute("aria-label", deps.surfaceLabel());
      pane.container.classList.toggle(
        "pane-focused",
        panes.length > 1 && pane === tab.focused,
      );
    }
    rendering = true;
    try {
      renderPaneLayout(tab.container, tab.layout, {
        isInteractive: () => tab === deps.selectedTab() && deps.canInteract(),
        resizeLabel: deps.resizeLabel(),
        onResize(path, index, delta, length) {
          if (
            tab.removed ||
            tab !== deps.selectedTab() ||
            !deps.canInteract() ||
            length <= 0
          )
            return;
          tab.layout = resizeSplit(tab.layout, path, index, delta, (child) =>
            minimumFraction(child, axisAt(tab.layout, path), length),
          );
          applyPaneWeights(tab.container, tab.layout);
        },
      });
    } finally {
      rendering = false;
    }
  };

  const focusPane = (tab: TerminalTab, pane: TerminalPane, move = false) => {
    if (
      pane.removed ||
      tab.removed ||
      tab !== deps.selectedTab() ||
      !deps.canInteract()
    )
      return;
    const changed = tab.focused !== pane;
    tab.focused = pane;
    if (changed) {
      for (const candidate of tabPanes(tab))
        candidate.container.classList.toggle(
          "pane-focused",
          tabPanes(tab).length > 1 && candidate === pane,
        );
      deps.onFocusChange(tab);
    }
    if (move) deps.focusSurface(pane);
  };

  const trackFocus = (pane: TerminalPane) => {
    pane.container.addEventListener("focusin", () => {
      if (!rendering && !deps.disposed() && !pane.removed)
        focusPane(pane.tab, pane);
    });
  };

  // Removing a tab's last pane follows the existing last-tab lifecycle.
  const removePane = (pane: TerminalPane, notify = true) => {
    const { tab } = pane;
    if (pane.removed || tab.removed) return;
    endPane(pane);
    if (tabPanes(tab).length <= 1) {
      pane.removed = true;
      deps.removeTab(tab, notify);
      return;
    }
    const fallback = removalNeighbor(tab.layout, pane)!;
    pane.removed = true;
    tab.layout = removeLayoutPane(tab.layout, pane) ?? leaf(fallback);
    pane.container.remove();
    const wasFocused = tab.focused === pane;
    if (wasFocused) tab.focused = fallback;
    renderTab(tab);
    deps.onFocusChange(tab);
    if (wasFocused && tab === deps.selectedTab())
      deps.focusSurface(fallback, true);
  };

  const closePane = (pane: TerminalPane | undefined) => {
    if (!pane || pane.removed) return;
    removePane(pane);
    disposePane(pane);
  };
  // The focused pane retained by "prepare-close-pane", never a later focus.
  let pendingClose: TerminalPane | undefined;

  const operations = {
    renderTab,
    trackFocus,
    focusPane,
    removePane,
    closePane,
    // A split needs room for two minimum panes in the focused pane's grid; a
    // refused split starts no session.
    split(direction: TerminalSplitDirection) {
      const tab = deps.selectedTab();
      if (!tab || tabPanes(tab).length >= MAX_PANES_PER_TAB) return;
      const source = tab.focused;
      const size = source.size;
      if (
        !size ||
        source.ended ||
        size.cols < MIN_PANE_COLUMNS ||
        size.rows < MIN_PANE_ROWS ||
        !fitsProspectiveSplit(
          tab,
          source,
          direction === "right" ? "row" : "column",
        )
      )
        return;
      const pane = createPane(
        tab,
        deps.createAdapter,
        source.adapter.sessionId(),
      );
      tab.layout = splitPane(
        tab.layout,
        source,
        pane,
        direction === "right" ? "row" : "column",
      );
      tab.focused = pane;
      renderTab(tab);
      trackFocus(pane);
      deps.onFocusChange(tab);
      // A failed spawn already dropped its pane; main shows the native
      // failure dialog, so the renderer only swallows here.
      void deps.mountPane(pane).catch(() => {});
    },
    focusTarget(target: TerminalPaneFocusTarget) {
      const tab = deps.selectedTab();
      if (!tab) return;
      const next =
        target === "next" || target === "previous"
          ? adjacentPane(tab.layout, tab.focused, target === "next" ? 1 : -1)
          : directionalPane(tabPanes(tab), tab.focused, target, (pane) =>
              pane.container.getBoundingClientRect(),
            );
      if (next) focusPane(tab, next, true);
    },
    equalize() {
      const tab = deps.selectedTab();
      if (!tab) return;
      tab.layout = equalizeParent(tab.layout, tab.focused);
      applyPaneWeights(tab.container, tab.layout);
    },
    handleCommand(command: TerminalPaneCommand) {
      switch (command.action) {
        case "split":
          operations.split(command.direction);
          return;
        case "focus-pane":
          operations.focusTarget(command.target);
          return;
        case "equalize-panes":
          operations.equalize();
          return;
        case "close-pane":
          closePane(
            command.target
              ? deps.takeContextMenuPane(command.target)
              : deps.selectedTab()?.focused,
          );
          return;
        case "prepare-close-pane":
          pendingClose = command.target
            ? deps.takeContextMenuPane(command.target)
            : deps.selectedTab()?.focused;
          return;
        case "resolve-close-pane": {
          const target = pendingClose;
          pendingClose = undefined;
          if (command.confirmed) closePane(target);
        }
      }
    },
  };
  return operations;
}

function axisAt(
  layout: PaneLayout<TerminalPane>,
  path: readonly number[],
): SplitAxis {
  let node = layout;
  for (const index of path)
    if (node.kind === "split") node = node.children[index]!;
  return node.kind === "split" ? node.direction : "row";
}

function measurePane(pane: TerminalPane): TerminalSurfaceGeometry | undefined {
  const geometry = pane.surface?.geometry();
  if (geometry) pane.geometry = geometry;
  return geometry ?? pane.geometry;
}

function fitsProspectiveSplit(
  tab: TerminalTab,
  source: TerminalPane,
  axis: SplitAxis,
): boolean {
  const rectangle = tab.container.getBoundingClientRect();
  const style = tab.container.ownerDocument.defaultView!.getComputedStyle(
    tab.container,
  );
  const pixels = (value: string) => Number.parseFloat(value) || 0;
  const width =
    rectangle.width - pixels(style.paddingLeft) - pixels(style.paddingRight);
  const height =
    rectangle.height - pixels(style.paddingTop) - pixels(style.paddingBottom);
  // Reuse the source's current cell geometry as the new pane's admission
  // reference, without allocating an Adapter to represent the prospective leaf.
  return fitsPaneLayout(
    splitPane(tab.layout, source, source, axis),
    width,
    height,
    measurePane,
  );
}

function minimumFraction(
  child: PaneLayout<TerminalPane>,
  axis: SplitAxis,
  length: number,
): number {
  return minimumLayoutExtent(child, axis, measurePane) / length;
}
