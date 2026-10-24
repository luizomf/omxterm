// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { surfaceLabels } from "../../src/renderer/renderer-language";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  applySearchTheme,
  focusedSearchField,
  retainSearchEscapeGesture,
  withSearchFieldClipboard,
} from "../../src/terminal-surface/restty-search-field";
import {
  mixThemeColors,
  toResttySearchStatusStyle,
  toResttySearchUiStyle,
} from "../../src/terminal-surface/restty-theme";

const LIGHT_THEME = {
  ...DEFAULT_TERMINAL_THEME,
  name: "Paper",
  colors: {
    ...DEFAULT_TERMINAL_THEME.colors,
    background: "#ffffff",
    foreground: "#000000",
  },
} as const;

function searchBar(open = true) {
  const container = document.createElement("main");
  const search = document.createElement("div");
  search.setAttribute("role", "search");
  const input = document.createElement("input");
  const status = document.createElement("div");
  status.className = "restty-pane-search-status";
  const terminalInput = document.createElement("textarea");
  search.append(input, status);
  container.append(terminalInput, search);
  document.body.append(container);
  const restty = { isSearchOpen: vi.fn(() => open) };
  return { container, input, status, terminalInput, restty };
}

function terminalActions() {
  return {
    copy: vi.fn(async () => undefined),
    paste: vi.fn(async () => undefined),
    selectAll: vi.fn(),
    inject: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("scrollback search field focus", () => {
  it("reports the field only while the open bar's field holds focus", () => {
    const bar = searchBar();
    expect(focusedSearchField(bar.restty, bar.container)).toBeUndefined();
    bar.input.focus();
    expect(focusedSearchField(bar.restty, bar.container)).toBe(bar.input);
    bar.terminalInput.focus();
    expect(focusedSearchField(bar.restty, bar.container)).toBeUndefined();
    bar.input.focus();
    bar.restty.isSearchOpen.mockReturnValue(false);
    expect(focusedSearchField(bar.restty, bar.container)).toBeUndefined();
  });
});

describe("clipboard actions with a focused search field", () => {
  function routed(clipboardText = "synthetic-search-query") {
    const bar = searchBar();
    const terminal = terminalActions();
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => clipboardText),
      confirmPaste: vi.fn(async () => true),
      requestContextMenu: vi.fn(),
    };
    const onClipboardError = vi.fn();
    const actions = withSearchFieldClipboard(
      terminal,
      () => focusedSearchField(bar.restty, bar.container),
      { clipboard, onClipboardError },
    );
    return { ...bar, terminal, clipboard, onClipboardError, actions };
  }

  it("pastes into the query, replacing its selection, never into the terminal", async () => {
    const view = routed("synthetic\r\nsearch\nquery");
    view.input.value = "original";
    view.input.focus();
    view.input.setSelectionRange(0, 4);
    const onInput = vi.fn();
    view.input.addEventListener("input", onInput);

    await view.actions.paste();

    expect(view.input.value).toBe("synthetic search queryinal");
    expect(onInput).toHaveBeenCalledOnce();
    expect(view.terminal.paste).not.toHaveBeenCalled();
    expect(view.actions.inject).toBe(view.terminal.inject);
  });

  it("copies and selects within the query instead of the terminal selection", async () => {
    const view = routed();
    view.input.value = "needle in hay";
    view.input.focus();
    view.input.setSelectionRange(0, 6);

    await view.actions.copy();
    view.actions.selectAll();

    expect(view.clipboard.writeText).toHaveBeenCalledExactlyOnceWith("needle");
    expect(view.terminal.copy).not.toHaveBeenCalled();
    expect([view.input.selectionStart, view.input.selectionEnd]).toEqual([
      0, 13,
    ]);
    expect(view.terminal.selectAll).not.toHaveBeenCalled();
  });

  it("keeps terminal behavior when the open bar is not focused", async () => {
    const view = routed();
    view.terminalInput.focus();

    await view.actions.copy();
    await view.actions.paste();
    view.actions.selectAll();

    expect(view.terminal.copy).toHaveBeenCalledOnce();
    expect(view.terminal.paste).toHaveBeenCalledOnce();
    expect(view.terminal.selectAll).toHaveBeenCalledOnce();
    expect(view.clipboard.readText).not.toHaveBeenCalled();
  });

  it("drops a paste whose field lost focus during the read and reports read failures", async () => {
    const view = routed();
    view.input.focus();
    let release!: (text: string) => void;
    view.clipboard.readText.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = view.actions.paste();
    view.terminalInput.focus();
    release("late");
    await pending;
    expect(view.input.value).toBe("");
    expect(view.terminal.paste).not.toHaveBeenCalled();

    view.input.focus();
    view.clipboard.readText.mockRejectedValueOnce(new Error("denied"));
    await view.actions.paste();
    expect(view.onClipboardError).toHaveBeenCalledOnce();
  });
});

describe("search bar theme", () => {
  const luminance = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16);
    const [r, g, b] = [value >> 16, (value >> 8) & 0xff, value & 0xff].map(
      (channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      },
    );
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const contrast = (a: string, b: string) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high! + 0.05) / (low! + 0.05);
  };

  it("mixes validated colors like CSS color-mix in sRGB", () => {
    expect(mixThemeColors("#f1e2d3", "#102030", 8)).toBe("#22303d");
    expect(mixThemeColors("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(mixThemeColors("#000000", "#ffffff", 100)).toBe("#000000");
  });

  it.each([
    ["the default theme", DEFAULT_TERMINAL_THEME],
    ["a white/black theme", LIGHT_THEME],
  ])("keeps the match counter legible on %s", (_name, theme) => {
    const ui = toResttySearchUiStyle(theme);
    const badge = toResttySearchStatusStyle(theme).background;
    for (const text of [
      ui.statusTextColor!,
      ui.statusActiveTextColor!,
      ui.statusCompleteTextColor!,
    ])
      expect(contrast(text, badge)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui.inputPlaceholderColor!, ui.inputBackground!)).toBe(
      contrast(ui.inputPlaceholderColor!, badge),
    );
  });

  it("paints Restty's fixed counter colors from the theme on every apply", () => {
    const bar = searchBar();
    const restty = { setSearchUiStyleOptions: vi.fn() };
    applySearchTheme(restty, bar.container, LIGHT_THEME);
    expect(bar.status.style.background).toBe("rgb(235, 235, 235)");
    expect(bar.status.style.borderColor).toBe("rgb(191, 191, 191)");
    expect(restty.setSearchUiStyleOptions).toHaveBeenCalledExactlyOnceWith(
      toResttySearchUiStyle(LIGHT_THEME),
    );

    applySearchTheme(restty, bar.container, DEFAULT_TERMINAL_THEME);
    expect(bar.status.style.background).not.toBe("rgb(235, 235, 235)");
  });

  it("relabels Restty's search controls in the configured language", () => {
    const bar = searchBar();
    const search = bar.container.querySelector<HTMLElement>('[role="search"]')!;
    const buttons = ["above", "below", "clear", "close"].map((name) => {
      const button = document.createElement("button");
      button.className = "restty-pane-search-button";
      button.dataset.name = name;
      search.append(button);
      return button;
    });
    const restty = { setSearchUiStyleOptions: vi.fn() };
    applySearchTheme(restty, bar.container, DEFAULT_TERMINAL_THEME);
    expect(bar.container.hasAttribute("aria-label")).toBe(false);

    for (const language of ["pt-BR", "en-US"] as const) {
      const labels = surfaceLabels(language);
      applySearchTheme(restty, bar.container, DEFAULT_TERMINAL_THEME, labels);
      expect(bar.container.getAttribute("aria-label")).toBe(
        labels.surfaceRegion,
      );
      expect(search.getAttribute("aria-label")).toBe(labels.searchRegion);
      expect(bar.input.placeholder).toBe(labels.searchPlaceholder);
      expect(
        buttons.map((button) => button.getAttribute("aria-label")),
      ).toEqual([
        labels.searchMatchAbove,
        labels.searchMatchBelow,
        null,
        labels.searchClose,
      ]);
      expect(buttons[0]!.title).toBe(labels.searchMatchAbove);
      expect(buttons[2]!.textContent).toBe(labels.searchClear);
    }
    expect(surfaceLabels("pt-BR").searchPlaceholder).toBe(
      "Buscar no histórico",
    );
    expect(surfaceLabels("pt-BR")).toBe(surfaceLabels("pt-BR"));
  });
});

describe("Escape that closes the search bar", () => {
  // Stands in for Restty's window-level key encoder, which reports releases
  // under Kitty event reporting.
  function encoder() {
    const events: string[] = [];
    const record = (event: KeyboardEvent) =>
      events.push(`${event.type}${event.repeat ? ":repeat" : ""}`);
    window.addEventListener("keydown", record);
    window.addEventListener("keyup", record);
    return {
      events,
      dispose() {
        window.removeEventListener("keydown", record);
        window.removeEventListener("keyup", record);
      },
    };
  }
  const press = (
    target: HTMLElement,
    type: "keydown" | "keyup",
    repeat = false,
  ) =>
    target.dispatchEvent(
      new KeyboardEvent(type, { key: "Escape", bubbles: true, repeat }),
    );

  it("keeps the closing gesture's repeats and release from the terminal encoder", () => {
    const bar = searchBar();
    const keys = encoder();
    const release = retainSearchEscapeGesture(bar.container);
    // Like Restty, the field's own handler closes and focuses the terminal.
    bar.input.addEventListener("keydown", () => bar.terminalInput.focus());
    try {
      bar.input.focus();
      press(bar.input, "keydown");
      press(bar.terminalInput, "keydown", true);
      press(bar.terminalInput, "keyup");
      expect(document.activeElement).toBe(bar.terminalInput);
      expect(keys.events).toEqual(["keydown"]);

      // A terminal-owned Escape afterwards is ordinary terminal input.
      press(bar.terminalInput, "keydown");
      press(bar.terminalInput, "keydown", true);
      press(bar.terminalInput, "keyup");
      expect(keys.events).toEqual([
        "keydown",
        "keydown",
        "keydown:repeat",
        "keyup",
      ]);
    } finally {
      release();
      keys.dispose();
    }
  });

  it("forgets an unreleased gesture on window blur and after disposal", () => {
    const bar = searchBar();
    const keys = encoder();
    const release = retainSearchEscapeGesture(bar.container);
    try {
      press(bar.input, "keydown");
      window.dispatchEvent(new Event("blur"));
      press(bar.terminalInput, "keyup");
      expect(keys.events).toEqual(["keydown", "keyup"]);

      release();
      press(bar.input, "keydown");
      press(bar.terminalInput, "keyup");
      expect(keys.events).toEqual(["keydown", "keyup", "keydown", "keyup"]);
    } finally {
      release();
      keys.dispose();
    }
  });
});
