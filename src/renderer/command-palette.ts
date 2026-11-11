import type {
  CommandPaletteBridge,
  PaletteAction,
  PaletteSnapshot,
} from "../shared/command-palette";
import type { TerminalClipboardAction } from "../shared/terminal-contract";
import type { TerminalClipboard } from "../terminal-surface/terminal-surface";
import type { RendererLanguage } from "./renderer-language";
import type { TerminalTabs } from "./terminal-tabs";
import { editPaletteQuery } from "./command-palette-input";
import { retainDismissalGesture } from "./about/about-dialog";

export function mountWindowPalette(
  document: Document,
  options: {
    readonly palette?: CommandPaletteBridge;
    readonly clipboard?: TerminalClipboard;
  },
  tabs: TerminalTabs,
  language: RendererLanguage,
  canOpen: () => boolean,
  onActivityChange: () => void,
) {
  if (!options.palette) return undefined;
  return createCommandPalette(document, {
    bridge: options.palette,
    language,
    captureTarget: tabs.captureActionTarget,
    canOpen,
    onActivityChange,
    focusSelected: () => {
      if (!tabs.isSettingsSelected()) tabs.focusSelected();
    },
    ...(options.clipboard ? { clipboard: options.clipboard } : {}),
  });
}

export function createCommandPalette(
  document: Document,
  options: {
    bridge: CommandPaletteBridge;
    language: RendererLanguage;
    captureTarget(): { isCurrent(): boolean };
    canOpen(): boolean;
    onActivityChange(): void;
    focusSelected(): void;
    clipboard?: TerminalClipboard;
  },
) {
  const page = document.defaultView!;
  const visible = (element: HTMLElement) => {
    for (
      let ancestor: HTMLElement | null = element;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      const style = page.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden")
        return false;
    }
    return true;
  };
  const keyboard = retainDismissalGesture(document);
  let dialog: HTMLDialogElement | undefined;
  let input: HTMLInputElement | undefined;
  let epoch = 0;
  let disposed = false;
  let authorization: { token: string; isCurrent(): boolean } | undefined;
  let relabel: (() => void) | undefined;
  let cancel: (() => void) | undefined;
  options.bridge.setDispatchGuard(
    (token) =>
      !disposed && authorization?.token === token && authorization.isCurrent(),
  );
  const unbind = options.language.bind(() => relabel?.());

  const open = async () => {
    if (disposed || dialog || !options.canOpen()) return;
    const request = ++epoch;
    authorization = undefined;
    // Capture before the asynchronous catalog read, never after dismissal.
    const target = options.captureTarget();
    const previous = document.activeElement;
    const current = document.createElement("dialog");
    dialog = current;
    current.className = "command-palette ui-dialog";
    const heading = document.createElement("h2");
    heading.id = "command-palette-title";
    // The search field comes first; the title only names the dialog.
    heading.className = "ui-visually-hidden";
    current.setAttribute("aria-labelledby", heading.id);
    const query = document.createElement("input");
    input = query;
    query.type = "text";
    query.className = "page-control";
    query.autocomplete = "off";
    query.spellcheck = false;
    query.setAttribute("role", "combobox");
    query.setAttribute("aria-autocomplete", "list");
    query.setAttribute("aria-expanded", "true");
    query.setAttribute("aria-controls", "command-palette-results");
    const list = document.createElement("div");
    list.id = "command-palette-results";
    list.setAttribute("role", "listbox");
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    let snapshot: PaletteSnapshot | undefined;
    let matches: readonly PaletteAction[] = [];
    let selected = 0;
    let failed = false;
    const restore = () => {
      if (!target.isCurrent()) return;
      if (
        previous instanceof page.HTMLElement &&
        previous !== document.body &&
        previous !== document.documentElement &&
        !previous.matches(":disabled") &&
        previous.isConnected &&
        !previous.closest(
          "[hidden], [inert], [disabled], [aria-hidden='true']",
        ) &&
        visible(previous)
      ) {
        previous.focus();
        if (document.activeElement === previous) return;
      }
      options.focusSelected();
    };
    const hide = () => {
      if (dialog !== current) return;
      dialog = undefined;
      input = undefined;
      relabel = undefined;
      cancel = undefined;
      current.close();
      current.remove();
      options.onActivityChange();
      restore();
    };
    cancel = () => {
      epoch += 1;
      authorization = undefined;
      hide();
    };
    const run = (action: PaletteAction, event?: KeyboardEvent) => {
      if (!snapshot || dialog !== current) return;
      const token = snapshot.token;
      const invoke = () => {
        if (disposed || request !== epoch || !target.isCurrent()) return;
        authorization = { token, isCurrent: target.isCurrent };
        // Electron's invoke reply may precede its sent notification. Keep this
        // one-shot main token's target guard until replacement or owner loss.
        void options.bridge.invoke(token, action.id).catch(() => {
          if (authorization?.token === token) authorization = undefined;
        });
      };
      // Retain repeats/release before removing the input owner. Invocation waits
      // until the owned release is consumed; blur/lost release cancels it.
      if (event) keyboard.settle(event, invoke);
      hide();
      if (!event) invoke();
    };
    const render = () => {
      heading.textContent = options.language.t("palette.title");
      query.placeholder = options.language.t("palette.query");
      query.setAttribute("aria-label", query.placeholder);
      list.setAttribute("aria-label", heading.textContent);
      matches =
        snapshot?.actions.filter((action) =>
          action.label
            .toLocaleLowerCase(options.language.language)
            .includes(query.value.toLocaleLowerCase(options.language.language)),
        ) ?? [];
      selected = Math.max(0, Math.min(selected, matches.length - 1));
      list.replaceChildren();
      matches.forEach((action, index) => {
        const row = document.createElement("div");
        row.id = `command-palette-option-${index}`;
        row.setAttribute("role", "option");
        row.className = "ui-row";
        row.setAttribute("aria-selected", String(index === selected));
        const label = document.createElement("span");
        label.textContent = action.label;
        const key = document.createElement("kbd");
        key.className = "ui-chip";
        key.textContent = action.accelerator ?? "";
        row.append(label, key);
        row.addEventListener("mousedown", (event) => event.preventDefault());
        row.addEventListener("click", () => run(action));
        list.append(row);
      });
      if (matches.length)
        query.setAttribute(
          "aria-activedescendant",
          `command-palette-option-${selected}`,
        );
      else query.removeAttribute("aria-activedescendant");
      status.hidden = !!matches.length;
      status.textContent = options.language.t(
        failed
          ? "palette.error"
          : snapshot
            ? "palette.empty"
            : "palette.loading",
      );
      list.children[selected]?.scrollIntoView?.({ block: "nearest" });
    };
    relabel = render;
    query.addEventListener("input", () => {
      selected = 0;
      render();
    });
    current.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        keyboard.settle(event);
        cancel?.();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const action = matches[selected];
        if (!event.repeat && !event.isComposing && action) run(action, event);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        selected = matches.length
          ? (selected + (event.key === "ArrowDown" ? 1 : -1) + matches.length) %
            matches.length
          : 0;
        render();
      } else if (event.key === "Tab") {
        event.preventDefault();
        query.focus();
      }
    });
    current.addEventListener("cancel", (event) => {
      event.preventDefault();
      cancel?.();
    });
    current.addEventListener("click", (event) => {
      if (event.target === current) cancel?.();
    });
    query.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      options.clipboard?.requestContextMenu({ target: "field" });
    });
    current.append(heading, query, list, status);
    document.body.append(current);
    render();
    options.onActivityChange();
    current.showModal();
    query.focus();
    try {
      const response = await options.bridge.snapshot();
      if (disposed || request !== epoch || dialog !== current) return;
      if (!target.isCurrent()) {
        cancel?.();
        return;
      }
      snapshot = response;
      render();
    } catch {
      if (dialog === current) {
        failed = true;
        render();
      }
    }
  };
  const removeOpen = options.bridge.onOpen(() => {
    void open();
  });
  return {
    isActive: () => !!dialog,
    clipboardAction(action: TerminalClipboardAction) {
      return editPaletteQuery(action, () => input, options.clipboard);
    },
    dispose() {
      disposed = true;
      epoch += 1;
      authorization = undefined;
      options.bridge.setDispatchGuard(undefined);
      removeOpen();
      unbind();
      keyboard.dispose();
      dialog?.remove();
      dialog = undefined;
      input = undefined;
      options.onActivityChange();
    },
  };
}
