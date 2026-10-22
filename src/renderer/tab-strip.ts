export const TERMINAL_TAB_DRAG_DATA_TYPE = "application/x-omxterm-tab";

export interface TabStripItem {
  readonly label: string;
  readonly paneCount: number;
  readonly color?: string;
  readonly broadcasting?: boolean;
}

export interface TabStrip<Tab> {
  render(tabs: readonly Tab[], selectedIndex: number, visible: boolean): void;
  dispose(): void;
}

export interface TabStripOptions<Tab> {
  readonly describe: (tab: Tab, index: number) => TabStripItem;
  readonly onSelect: (tab: Tab) => void;
  readonly onReorder: (tab: Tab, clientX: number) => void;
  readonly onContextMenu?: (tab: Tab, event: MouseEvent) => void;
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
  return {
    render(tabs, selectedIndex, visible) {
      strip.hidden = !visible;
      document.body.classList.toggle("tabs-visible", visible);
      if (!visible) {
        strip.replaceChildren();
        return;
      }
      strip.replaceChildren(
        ...tabs.map((tab, index) => {
          const item = options.describe(tab, index);
          const button = document.createElement("button");
          button.type = "button";
          dragging.bind(button, tab);
          // Sanitized display title pushed by main (ADR 0010); the literal
          // position stands in until the first push lands.
          const label = item.label || String(index + 1);
          button.textContent =
            item.paneCount > 1 ? `${label} (${item.paneCount})` : label;
          button.title = label;
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
          button.addEventListener("click", () => {
            if (!disposed) options.onSelect(tab);
          });
          if (options.onContextMenu)
            button.addEventListener("contextmenu", (event) => {
              event.preventDefault();
              if (!disposed) options.onContextMenu?.(tab, event);
            });
          return button;
        }),
      );
    },
    dispose() {
      disposed = true;
      dragging.dispose();
    },
  };
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
