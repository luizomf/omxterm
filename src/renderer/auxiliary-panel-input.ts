import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { TerminalClipboardAction } from "../shared/terminal-contract";

// Native menu edits and dismissal gesture ownership share the panel lifetime,
// not the lifetime of an individual catalog read or DOM row.
export function installAuxiliaryPanelInput(
  root: HTMLElement,
  separator: HTMLElement,
  close: HTMLButtonElement,
  options: {
    readonly interactive: () => boolean;
    readonly ownsFocus: () => boolean;
    readonly close: () => void;
    readonly blur: () => void;
    readonly clipboard?: TerminalClipboard;
  },
) {
  const document = root.ownerDocument;
  const page = document.defaultView!;
  let editGeneration = 0;
  let ownedKey: string | undefined;
  const invalidate = () => {
    editGeneration += 1;
  };
  const identity = (event: KeyboardEvent) =>
    event.code || `${event.key}:${event.location}`;
  const onPageKey = (event: KeyboardEvent) => {
    if (ownedKey !== identity(event)) return;
    if (event.type === "keydown" && !event.repeat) {
      ownedKey = undefined;
      return;
    }
    if (event.type === "keyup") ownedKey = undefined;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onPanelKey = (event: KeyboardEvent) => {
    if (!options.interactive()) return;
    const button =
      event.target instanceof page.HTMLButtonElement ? event.target : undefined;
    if (
      event.key !== "Escape" &&
      !(event.key === "Enter" && button && !button.disabled)
    )
      return;
    // Native Enter clicks any panel button before release. A row may return
    // terminal focus, so retain the whole gesture without changing its action.
    ownedKey = identity(event);
    event.stopPropagation();
    if (event.key === "Escape" || button === close) {
      event.preventDefault();
      options.close();
    }
  };
  const onClose = () => {
    if (options.interactive()) options.close();
  };
  const onBlur = () => {
    ownedKey = undefined;
    invalidate();
    options.blur();
  };
  const field = () => {
    const active = document.activeElement;
    return options.interactive() &&
      active instanceof page.HTMLInputElement &&
      root.contains(active) &&
      ["search", "text", "url", "tel", "password"].includes(active.type) &&
      !active.disabled &&
      !active.readOnly
      ? active
      : undefined;
  };
  const clipboardAction = (action: TerminalClipboardAction) => {
    if (!options.ownsFocus()) return false;
    const input = field();
    if (!input) return true; // Unsupported controls never fall through to the PTY.
    if (action === "select-all") input.select();
    else if (action === "copy") {
      const text = input.value.slice(
        input.selectionStart ?? 0,
        input.selectionEnd ?? 0,
      );
      if (text) void options.clipboard?.writeText(text).catch(() => {});
    } else {
      const generation = editGeneration;
      void options.clipboard
        ?.readText()
        .then((text) => {
          if (generation !== editGeneration || field() !== input || !text)
            return;
          input.setRangeText(
            text.replace(/[\r\n]+/g, " "),
            input.selectionStart ?? input.value.length,
            input.selectionEnd ?? input.value.length,
            "end",
          );
          input.dispatchEvent(new page.Event("input", { bubbles: true }));
        })
        .catch(() => {});
    }
    return true;
  };
  const onContextMenu = (event: MouseEvent) => {
    if (!field()) return;
    event.preventDefault();
    options.clipboard?.requestContextMenu();
  };
  // Native inertness blocks physical input; this also guards synthetic events
  // targeting retained controls while hidden, blocked or disposed.
  const onInactiveEvent = (event: Event) => {
    if (options.interactive()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  for (const element of [root, separator]) {
    element.addEventListener("click", onInactiveEvent, true);
    element.addEventListener("keydown", onInactiveEvent, true);
    element.addEventListener("keydown", onPanelKey);
  }
  root.addEventListener("focusout", invalidate);
  root.addEventListener("contextmenu", onContextMenu);
  close.addEventListener("click", onClose);
  page.addEventListener("keydown", onPageKey, true);
  page.addEventListener("keyup", onPageKey, true);
  page.addEventListener("blur", onBlur);
  return {
    invalidate,
    clipboardAction,
    dispose() {
      invalidate();
      ownedKey = undefined;
      for (const element of [root, separator]) {
        element.removeEventListener("click", onInactiveEvent, true);
        element.removeEventListener("keydown", onInactiveEvent, true);
        element.removeEventListener("keydown", onPanelKey);
      }
      root.removeEventListener("focusout", invalidate);
      root.removeEventListener("contextmenu", onContextMenu);
      close.removeEventListener("click", onClose);
      page.removeEventListener("keydown", onPageKey, true);
      page.removeEventListener("keyup", onPageKey, true);
      page.removeEventListener("blur", onBlur);
    },
  };
}
