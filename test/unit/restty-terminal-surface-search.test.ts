// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";

function createAdapter() {
  return {
    start: vi.fn(async () => undefined),
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  };
}

describe("Restty Scrollback Search", () => {
  beforeEach(() => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
  });

  it("opens theme-styled scrollback search only on request and keeps focus in it", async () => {
    const container = document.createElement("main");
    document.body.append(container);
    const adapter = createAdapter();
    const surface = await mountResttyTerminalSurface(container, adapter, {
      theme: DEFAULT_TERMINAL_THEME,
    });
    const restty = harness.instances[0]!;

    expect(restty.options.surface).toMatchObject({
      shortcuts: false,
      searchUi: {
        shortcut: false,
        styles: {
          panelBackground: DEFAULT_TERMINAL_THEME.colors.background,
          panelTextColor: DEFAULT_TERMINAL_THEME.colors.foreground,
        },
      },
    });
    expect(restty.openSearch).not.toHaveBeenCalled();
    surface.find();
    expect(restty.openSearch).toHaveBeenCalledExactlyOnceWith({
      selectAll: true,
    });

    const search = document.createElement("div");
    search.setAttribute("role", "search");
    const input = document.createElement("input");
    search.append(input);
    restty.pane.container.append(search);
    input.focus();
    restty.isSearchOpen.mockReturnValue(true);
    restty.focus.mockClear();
    surface.focus();
    expect(restty.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);

    restty.isSearchOpen.mockReturnValue(false);
    surface.focus();
    expect(restty.focus).toHaveBeenCalledOnce();

    surface.dispose();
    surface.find();
    expect(restty.openSearch).toHaveBeenCalledOnce();
    container.remove();
  });

  it("pastes into a focused query through the application path, never the PTY", async () => {
    const container = document.createElement("main");
    document.body.append(container);
    const adapter = createAdapter();
    const clipboard = {
      writeText: vi.fn(async () => undefined),
      readText: vi.fn(async () => "synthetic-search-query"),
      confirmPaste: vi.fn(async () => true),
      requestContextMenu: vi.fn(),
    };
    const surface = await mountResttyTerminalSurface(container, adapter, {
      theme: DEFAULT_TERMINAL_THEME,
      clipboard,
    });
    const restty = harness.instances[0]!;
    const search = document.createElement("div");
    search.setAttribute("role", "search");
    const input = document.createElement("input");
    input.value = "original";
    search.append(input);
    restty.pane.container.append(search);
    restty.isSearchOpen.mockReturnValue(true);
    input.focus();
    input.setSelectionRange(8, 8);

    await surface.paste();
    surface.selectAll();

    expect(input.value).toBe("originalsynthetic-search-query");
    expect(adapter.write).not.toHaveBeenCalled();
    expect(restty.pane.runtime.interaction.selectAll).not.toHaveBeenCalled();

    // Once the terminal has focus again, Paste reaches the PTY as before.
    input.blur();
    await surface.paste();
    expect(adapter.write).toHaveBeenCalledWith("synthetic-search-query");
    surface.dispose();
    container.remove();
  });
});
