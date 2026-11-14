import { createIcon, type UiIconName } from "../../src/shared/ui-icons.js";

type Icon = "home" | "up" | "refresh" | "new-folder" | "actions" | "go";
type Hint = {
  wrapper: HTMLElement;
  button: HTMLButtonElement;
  tooltip: HTMLElement;
};

// Each control's icon from the shared set (docs/ui-style-guide.md#icons).
const icons: Record<Icon, UiIconName> = {
  home: "house",
  up: "arrow-up",
  refresh: "refresh-cw",
  "new-folder": "folder-plus",
  actions: "ellipsis",
  go: "arrow-right",
};

/** Tooltips stay in the child viewport and remain reachable from their anchor. */
export function createFilesToolbar(document: Document) {
  const page = document.defaultView!;
  const hints = new Map<Element, Hint>();
  let hovered: Hint | undefined;
  let focused: Hint | undefined;
  let active: Hint | undefined;
  let preferHover = false;
  let dismissed = false;
  let suppressed = false;
  let disposed = false;

  function position(hint: Hint) {
    const viewport = document.documentElement;
    const width = viewport.clientWidth || page.innerWidth;
    const height = viewport.clientHeight || page.innerHeight;
    const anchor = hint.button.getBoundingClientRect();
    if (
      anchor.bottom <= 0 ||
      anchor.top >= height ||
      anchor.right <= 0 ||
      anchor.left >= width
    ) {
      hint.tooltip.hidden = true;
      return;
    }
    hint.tooltip.hidden = false;
    const tip = hint.tooltip.getBoundingClientRect();
    const left = Math.max(4, Math.min(anchor.left, width - tip.width - 4));
    const below = anchor.bottom;
    const above = anchor.top - tip.height;
    const preferredTop =
      below + tip.height <= height - 4 ? below : above >= 4 ? above : below;
    const top = Math.max(
      4,
      Math.min(preferredTop, Math.max(4, height - tip.height - 4)),
    );
    hint.tooltip.style.left = `${left}px`;
    hint.tooltip.style.top = `${top}px`;
  }
  function update() {
    const next =
      disposed || suppressed || dismissed
        ? undefined
        : preferHover
          ? (hovered ?? focused)
          : (focused ?? hovered);
    if (active && active !== next) active.tooltip.hidden = true;
    active = next;
    if (active) {
      active.tooltip.hidden = false;
      position(active);
    }
  }
  function reset() {
    hovered = undefined;
    focused = undefined;
    dismissed = false;
    update();
  }
  const reposition = () => {
    if (active) position(active);
  };
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && active) {
      dismissed = true;
      update();
    }
  };
  function pointermove(event: PointerEvent) {
    const target = event.target as Element;
    const wrapper = target.closest?.(".toolbar-control");
    let next = wrapper ? hints.get(wrapper) : undefined;
    // The painted tooltip is pointer-transparent. Retain hover over its visible
    // rectangle only on noninteractive space; actual controls always get input.
    if (
      !next &&
      active &&
      !active.tooltip.hidden &&
      !target.closest?.(
        "button, input, select, textarea, a[href], [role='tree'], .operation-editor, .file-menu",
      )
    ) {
      const rect = active.tooltip.getBoundingClientRect();
      if (
        event.clientX >= rect.left &&
        event.clientX < rect.right &&
        event.clientY >= rect.top &&
        event.clientY < rect.bottom
      )
        next = active;
    }
    if (next === hovered && (!next || preferHover || dismissed)) return;
    if (next && next !== hovered) dismissed = false;
    hovered = next;
    preferHover = true;
    update();
  }
  const pointerleave = () => {
    hovered = undefined;
    update();
  };
  document.addEventListener("pointerover", pointermove);
  document.addEventListener("pointermove", pointermove);
  document.addEventListener("pointerleave", pointerleave);
  page.addEventListener("resize", reposition);
  document.addEventListener("scroll", reposition, true);
  document.addEventListener("keydown", keydown);

  function create(icon: Icon): Hint {
    const wrapper = document.createElement("span");
    wrapper.className = "toolbar-control";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "toolbar-button ui-icon-button";
    button.append(createIcon(document, icons[icon]));
    const tooltip = document.createElement("span");
    tooltip.className = "toolbar-tooltip ui-popover";
    tooltip.id = `files-toolbar-${icon}-tooltip`;
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    button.setAttribute("aria-describedby", tooltip.id);
    wrapper.append(button, tooltip);
    const hint = { wrapper, button, tooltip };
    hints.set(wrapper, hint);
    wrapper.addEventListener("focusin", () => {
      focused = hint;
      preferHover = false;
      dismissed = false;
      update();
    });
    wrapper.addEventListener("focusout", (event) => {
      if (!wrapper.contains(event.relatedTarget as Node | null)) {
        if (focused === hint) focused = undefined;
        update();
      }
    });
    return hint;
  }
  return {
    create,
    refresh: reposition,
    reset,
    suppress(value: boolean) {
      suppressed = value;
      update();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      hints.clear();
      document.removeEventListener("pointerover", pointermove);
      document.removeEventListener("pointermove", pointermove);
      document.removeEventListener("pointerleave", pointerleave);
      page.removeEventListener("resize", reposition);
      document.removeEventListener("scroll", reposition, true);
      document.removeEventListener("keydown", keydown);
    },
  };
}
