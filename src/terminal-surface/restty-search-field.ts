import type { TerminalTheme } from "../shared/terminal-theme";
import type { PatchedRestty } from "./restty-runtime-contract";
import {
  toResttySearchStatusStyle,
  toResttySearchUiStyle,
} from "./restty-theme";
import type {
  TerminalSurface,
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
// reaches, so the Surface paints it from the Terminal Theme as well.
export function applySearchTheme(
  restty: Pick<PatchedRestty, "setSearchUiStyleOptions"> | undefined,
  container: HTMLElement,
  theme: TerminalTheme,
): void {
  restty?.setSearchUiStyleOptions(toResttySearchUiStyle(theme));
  const { background, borderColor } = toResttySearchStatusStyle(theme);
  for (const status of container.querySelectorAll<HTMLElement>(
    ".restty-pane-search-status",
  )) {
    status.style.background = background;
    status.style.borderColor = borderColor;
  }
}
