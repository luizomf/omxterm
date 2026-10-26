export const TERMINAL_TAB_DRAG_DATA_TYPE = "application/x-omxterm-tab";

// One strip presents the tab owner's actual collection; drag never owns a
// parallel order or selection. Its retained references also cover Settings.
export function createApplicationTabStrip<Tab>(
  strip: HTMLElement,
  tabs: Tab[],
  options: {
    readonly label: (tab: Tab, index: number) => string;
    readonly select: (tab: Tab) => void;
    readonly canInteract: () => boolean;
    readonly reordered: (reorder: () => void) => void;
  },
) {
  let dragged: Tab | undefined;
  let disposed = false;
  const dragover = (event: DragEvent) => {
    if (!dragged || !options.canInteract()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };
  const drop = (event: DragEvent) => {
    const tab = dragged;
    dragged = undefined;
    if (!tab || !options.canInteract()) return;
    event.preventDefault();
    event.stopPropagation();
    const source = tabs.indexOf(tab);
    if (source < 0) return;
    const raw = [...strip.querySelectorAll("button")].findIndex((button) => {
      const rect = button.getBoundingClientRect();
      return event.clientX < rect.left + rect.width / 2;
    });
    const insertion = raw < 0 ? tabs.length : raw;
    const destination = source < insertion ? insertion - 1 : insertion;
    if (source === destination) return;
    options.reordered(() => {
      tabs.splice(source, 1);
      tabs.splice(destination, 0, tab);
    });
  };
  const dragend = () => {
    dragged = undefined;
  };
  strip.addEventListener("dragover", dragover);
  strip.addEventListener("drop", drop);
  strip.addEventListener("dragend", dragend);
  return {
    render(selectedIndex: number, enabled: boolean) {
      const visible = enabled && tabs.length >= 2;
      strip.hidden = !visible;
      strip.ownerDocument.body.classList.toggle("tabs-visible", visible);
      strip.replaceChildren(
        ...(visible
          ? tabs.map((tab, index) => {
              const button = strip.ownerDocument.createElement("button");
              button.type = "button";
              button.textContent = options.label(tab, index);
              button.setAttribute("role", "tab");
              button.setAttribute(
                "aria-selected",
                String(index === selectedIndex),
              );
              button.draggable = true;
              button.addEventListener("click", () => {
                if (!disposed && options.canInteract()) options.select(tab);
              });
              button.addEventListener("dragstart", (event) => {
                if (disposed || !options.canInteract()) {
                  event.preventDefault();
                  return;
                }
                dragged = tab;
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    TERMINAL_TAB_DRAG_DATA_TYPE,
                    "reorder",
                  );
                }
              });
              return button;
            })
          : []),
      );
    },
    dispose() {
      disposed = true;
      dragged = undefined;
      strip.removeEventListener("dragover", dragover);
      strip.removeEventListener("drop", drop);
      strip.removeEventListener("dragend", dragend);
    },
  };
}
