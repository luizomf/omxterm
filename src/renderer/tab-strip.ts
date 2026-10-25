import { icon } from "./ui/icons";

export const TERMINAL_TAB_DRAG_DATA_TYPE = "application/x-omxterm-tab";

export interface TabStripItem {
  readonly label: string;
  readonly paneCount: number;
  readonly color?: string;
  readonly broadcasting?: boolean;
  // An SSH session: the tab shows a server icon and this tooltip.
  readonly remote?: { readonly tooltip: string };
  // Membership in a tab group; `first` marks where its chip goes.
  readonly group?: {
    readonly name: string;
    readonly color: string;
    readonly collapsed: boolean;
    readonly first: boolean;
  };
}

export interface MenuPosition {
  readonly x: number;
  readonly y: number;
}

export interface TabStrip<Tab> {
  render(tabs: readonly Tab[], selectedIndex: number, visible: boolean): void;
  dispose(): void;
}

export interface TabStripOptions<Tab> {
  readonly describe: (tab: Tab, index: number) => TabStripItem;
  readonly onSelect: (tab: Tab) => void;
  readonly onReorder: (tab: Tab, clientX: number) => void;
  readonly onContextMenu?: (tab: Tab, position: MenuPosition) => void;
  // Group chips act on the group of the tab given.
  readonly onGroupToggle?: (tab: Tab) => void;
  readonly onGroupContextMenu?: (tab: Tab, position: MenuPosition) => void;
}

export function createTabStrip<Tab>(
  strip: HTMLElement,
  options: TabStripOptions<Tab>,
): TabStrip<Tab> {
  const document = strip.ownerDocument;
  let disposed = false;
  const dragging = installTabDragging<Tab>(strip, (tab, clientX) => {
    if (!disposed) options.onReorder(tab, clientX);
  });
  // Many tabs scroll sideways; a vertical wheel scrolls the strip too.
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (delta === 0) return;
    event.preventDefault();
    strip.scrollLeft += delta;
  };
  strip.addEventListener("wheel", onWheel, { passive: false });
  return {
    render(tabs, selectedIndex, visible) {
      strip.hidden = !visible;
      document.body.classList.toggle("tabs-visible", visible);
      if (!visible) {
        strip.replaceChildren();
        return;
      }
      strip.replaceChildren(
        ...tabs.flatMap((tab, index) => {
          const item = options.describe(tab, index);
          const chip = item.group?.first
            ? groupChip(document, tab, item.group, options, () => disposed)
            : undefined;
          const button = document.createElement("button");
          button.type = "button";
          dragging.bind(button, tab);
          // Sanitized display title pushed by main (ADR 0010); the literal
          // position stands in until the first push lands.
          const label = item.label || String(index + 1);
          button.textContent =
            item.paneCount > 1 ? `${label} (${item.paneCount})` : label;
          button.title = item.remote?.tooltip ?? label;
          if (item.remote) {
            const server = icon(document, "sessions");
            server.classList.add("tab-remote-icon");
            button.prepend(server);
            button.classList.add("tab-remote");
          }
          button.setAttribute("role", "tab");
          button.setAttribute(
            "aria-selected",
            index === selectedIndex ? "true" : "false",
          );
          if (item.color) {
            button.classList.add("tab-colored");
            button.style.setProperty("--tab-color", item.color);
          }
          if (item.broadcasting) button.classList.add("tab-broadcasting");
          if (item.group) {
            button.classList.add("tab-grouped");
            button.style.setProperty("--group-color", item.group.color);
            button.hidden = item.group.collapsed && index !== selectedIndex;
          }
          button.addEventListener("click", () => {
            if (!disposed) options.onSelect(tab);
          });
          onMenu(button, (position) => {
            if (!disposed) options.onContextMenu?.(tab, position);
          });
          return chip ? [chip, button] : [button];
        }),
      );
      strip
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    },
    dispose() {
      disposed = true;
      strip.removeEventListener("wheel", onWheel);
      dragging.dispose();
    },
  };
}

function groupChip<Tab>(
  document: Document,
  tab: Tab,
  group: NonNullable<TabStripItem["group"]>,
  options: TabStripOptions<Tab>,
  isDisposed: () => boolean,
): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "tab-group-chip";
  chip.textContent = group.name || "•";
  chip.title = group.name;
  chip.style.setProperty("--group-color", group.color);
  chip.setAttribute("aria-expanded", String(!group.collapsed));
  chip.addEventListener("click", () => {
    if (!isDisposed()) options.onGroupToggle?.(tab);
  });
  onMenu(chip, (position) => {
    if (!isDisposed()) options.onGroupContextMenu?.(tab, position);
  });
  return chip;
}

// Right click, the context menu key or Shift+F10; keyboard menus open under
// the element.
function onMenu(
  element: HTMLElement,
  open: (position: MenuPosition) => void,
): void {
  const below = () => {
    const rectangle = element.getBoundingClientRect();
    return { x: rectangle.left, y: rectangle.bottom };
  };
  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    open(
      event.clientX === 0 && event.clientY === 0
        ? below()
        : { x: event.clientX, y: event.clientY },
    );
  });
  element.addEventListener("keydown", (event) => {
    if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      open(below());
    }
  });
}

function installTabDragging<Tab>(
  strip: HTMLElement,
  reorder: (tab: Tab, clientX: number) => void,
) {
  let draggedTab: Tab | undefined;
  let enabled = true;
  const onDragOver = (event: DragEvent) => {
    if (draggedTab === undefined) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };
  const onDrop = (event: DragEvent) => {
    const tab = draggedTab;
    draggedTab = undefined;
    if (tab === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    reorder(tab, event.clientX);
  };
  const onDragEnd = () => {
    draggedTab = undefined;
  };
  strip.addEventListener("dragover", onDragOver);
  strip.addEventListener("drop", onDrop);
  strip.addEventListener("dragend", onDragEnd);
  return {
    bind(button: HTMLButtonElement, tab: Tab) {
      button.draggable = true;
      button.addEventListener("dragstart", (event) => {
        if (!enabled) return;
        draggedTab = tab;
        if (!event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(TERMINAL_TAB_DRAG_DATA_TYPE, "reorder");
      });
    },
    dispose() {
      enabled = false;
      draggedTab = undefined;
      strip.removeEventListener("dragover", onDragOver);
      strip.removeEventListener("drop", onDrop);
      strip.removeEventListener("dragend", onDragEnd);
    },
  };
}

export function moveTabToHorizontalDrop<Tab>(
  tabs: Tab[],
  tab: Tab,
  strip: HTMLElement,
  clientX: number,
): boolean {
  const sourceIndex = tabs.indexOf(tab);
  if (sourceIndex < 0) return false;
  const rawDestination = [...strip.querySelectorAll("button")].findIndex(
    (button) =>
      clientX <
      button.getBoundingClientRect().left +
        button.getBoundingClientRect().width / 2,
  );
  const insertionIndex = rawDestination < 0 ? tabs.length : rawDestination;
  const destinationIndex =
    sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  if (destinationIndex === sourceIndex) return false;
  tabs.splice(sourceIndex, 1);
  tabs.splice(destinationIndex, 0, tab);
  return true;
}
