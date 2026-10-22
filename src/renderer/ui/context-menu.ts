export type ContextMenuItem =
  | {
      readonly label: string;
      readonly action: () => void;
      readonly danger?: boolean;
      readonly disabled?: boolean;
    }
  | { readonly separator: true };

export interface ContextMenu {
  close(): void;
}

// A small DOM menu for sidebar items: arrow keys move, Enter activates,
// Escape, outside clicks and blur close it. Positions stay inside the window.
export function showContextMenu(
  document: Document,
  position: { readonly x: number; readonly y: number },
  items: readonly ContextMenuItem[],
  onClose?: () => void,
): ContextMenu {
  document.querySelector(".omx-context-menu")?.remove();
  const menu = document.createElement("div");
  menu.className = "omx-context-menu";
  menu.setAttribute("role", "menu");
  const buttons: HTMLButtonElement[] = [];
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    menu.remove();
    document.removeEventListener("pointerdown", onOutside, true);
    onClose?.();
  };
  const onOutside = (event: Event) => {
    if (!menu.contains(event.target as Node)) close();
  };
  for (const item of items) {
    if ("separator" in item) {
      const separator = document.createElement("div");
      separator.className = "omx-context-menu-separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
      continue;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.textContent = item.label;
    button.disabled = item.disabled ?? false;
    if (item.danger) button.classList.add("danger");
    button.addEventListener("click", () => {
      close();
      item.action();
    });
    buttons.push(button);
    menu.append(button);
  }
  menu.addEventListener("keydown", (event) => {
    const enabled = buttons.filter((button) => !button.disabled);
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      enabled[(index + offset + enabled.length) % enabled.length]?.focus();
    }
    event.stopPropagation();
  });
  menu.addEventListener("focusout", (event) => {
    if (!menu.contains(event.relatedTarget as Node | null)) close();
  });
  document.body.append(menu);
  const view = document.defaultView;
  const width = view?.innerWidth ?? 0;
  const height = view?.innerHeight ?? 0;
  const rectangle = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(position.x, width - rectangle.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(position.y, height - rectangle.height - 4))}px`;
  document.addEventListener("pointerdown", onOutside, true);
  buttons.find((button) => !button.disabled)?.focus();
  return { close };
}
