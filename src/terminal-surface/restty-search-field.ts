import type { TerminalTheme } from "../shared/terminal-theme";
import type { PatchedRestty } from "./restty-runtime-contract";
import {
  toResttySearchStatusStyle,
  toResttySearchUiStyle,
} from "./restty-theme";
import type {
  TerminalSurface,
  TerminalSurfaceLabels,
  TerminalSurfaceOptions,
} from "./terminal-surface";

type ClipboardActions = Pick<TerminalSurface, "copy" | "paste" | "selectAll">;

// The query field of an open scrollback search bar while it holds focus. An
// open bar alone never takes keys or clipboard actions from the terminal.
export function focusedSearchField(
  restty: Pick<PatchedRestty, "isSearchOpen"> | undefined,
  container: HTMLElement,
): HTMLInputElement | undefined {
  const active = container.ownerDocument.activeElement;
  return restty?.isSearchOpen() === true &&
    active instanceof HTMLInputElement &&
    active.closest('[role="search"]') !== null &&
    container.contains(active)
    ? active
    : undefined;
}

// While the query field holds focus, application Copy, Paste and Select All
// (menu, keybind or context menu) edit the query: nothing reaches the terminal
// selection, Protected Paste or the PTY.
export function withSearchFieldClipboard<Actions extends ClipboardActions>(
  terminal: Actions,
  field: () => HTMLInputElement | undefined,
  options: Pick<TerminalSurfaceOptions, "clipboard" | "onClipboardError">,
): Actions {
  return {
    ...terminal,
    async copy() {
      const input = field();
      if (!input) return terminal.copy();
      const text = input.value.slice(
        input.selectionStart ?? 0,
        input.selectionEnd ?? 0,
      );
      if (!text) return;
      try {
        await options.clipboard?.writeText(text);
      } catch {
        options.onClipboardError?.();
      }
    },
    async paste() {
      const input = field();
      if (!input) return terminal.paste();
      if (!options.clipboard) return;
      let text: string;
      try {
        text = await options.clipboard.readText();
      } catch {
        options.onClipboardError?.();
        return;
      }
      // Focus may have moved during the read; a query is a single line.
      if (field() !== input || !text) return;
      input.setRangeText(
        text.replace(/[\r\n]+/g, " "),
        input.selectionStart ?? input.value.length,
        input.selectionEnd ?? input.value.length,
        "end",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selectAll() {
      const input = field();
      if (input) input.select();
      else terminal.selectAll();
    },
  };
}

// Restty paints the match counter with fixed dark colors that no style option
// reaches, so the Surface paints it from the Terminal Theme as well, and
// applies the window language when labels are given.
export function applySearchTheme(
  restty: Pick<PatchedRestty, "setSearchUiStyleOptions"> | undefined,
  container: HTMLElement,
  theme: TerminalTheme,
  labels?: TerminalSurfaceLabels,
): void {
  restty?.setSearchUiStyleOptions(toResttySearchUiStyle(theme));
  applySearchLabels(container, labels);
  const { background, borderColor } = toResttySearchStatusStyle(theme);
  for (const status of container.querySelectorAll<HTMLElement>(
    ".restty-pane-search-status",
  )) {
    status.style.background = background;
    status.style.borderColor = borderColor;
  }
}

// Restty closes the bar on the query's Escape keydown and moves focus to the
// terminal, whose window-level encoder would then report that gesture's held
// repeats and release (Kitty event reporting) to the PTY. The bar owns the
// whole gesture: its repeats and release stop here, before the encoder.
export function retainSearchEscapeGesture(container: HTMLElement): () => void {
  const page = container.ownerDocument.defaultView;
  if (!page) return () => undefined;
  let owned = false;
  const onFieldKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === "Escape" &&
      event.target instanceof HTMLInputElement &&
      event.target.closest('[role="search"]') !== null
    )
      owned = true;
  };
  const onPageKey = (event: KeyboardEvent) => {
    if (!owned || event.key !== "Escape") return;
    if (event.type === "keydown" && !event.repeat) {
      owned = false;
      return;
    }
    if (event.type === "keyup") owned = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const release = () => {
    owned = false;
  };
  container.addEventListener("keydown", onFieldKeyDown, true);
  page.addEventListener("keydown", onPageKey, true);
  page.addEventListener("keyup", onPageKey, true);
  page.addEventListener("blur", release);
  return () => {
    container.removeEventListener("keydown", onFieldKeyDown, true);
    page.removeEventListener("keydown", onPageKey, true);
    page.removeEventListener("keyup", onPageKey, true);
    page.removeEventListener("blur", release);
  };
}

// Restty builds the bar with fixed English titles and accessible names; the
// Surface applies the window language to them and follows later changes.
export function applySearchLabels(
  container: HTMLElement,
  labels: TerminalSurfaceLabels | undefined,
): void {
  if (!labels) return;
  container.setAttribute("aria-label", labels.surfaceRegion);
  for (const root of container.querySelectorAll<HTMLElement>(
    '[role="search"]',
  )) {
    root.setAttribute("aria-label", labels.searchRegion);
    const input = root.querySelector("input");
    if (input) input.placeholder = labels.searchPlaceholder;
    const [above, below, clear, close] = root.querySelectorAll<HTMLElement>(
      ".restty-pane-search-button",
    );
    above?.setAttribute("title", labels.searchMatchAbove);
    above?.setAttribute("aria-label", labels.searchMatchAbove);
    below?.setAttribute("title", labels.searchMatchBelow);
    below?.setAttribute("aria-label", labels.searchMatchBelow);
    if (clear) clear.textContent = labels.searchClear;
    close?.setAttribute("title", labels.searchClose);
    close?.setAttribute("aria-label", labels.searchClose);
  }
}
