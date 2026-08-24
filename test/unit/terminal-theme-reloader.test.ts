import { describe, expect, it, vi } from "vitest";
import { createTerminalThemeReloader } from "../../src/main/terminal-theme-reloader";
import { TerminalThemeError } from "../../src/main/terminal-theme";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function theme(name: string, background: string) {
  return Object.freeze({
    ...DEFAULT_TERMINAL_THEME,
    name,
    colors: Object.freeze({
      ...DEFAULT_TERMINAL_THEME.colors,
      background,
    }),
  });
}

describe("Terminal Theme reloader", () => {
  it("is disabled without a retained external selection and never reads a file", async () => {
    const load = vi.fn();
    const apply = vi.fn();
    const reloader = createTerminalThemeReloader({
      initialTheme: DEFAULT_TERMINAL_THEME,
      startupNotices: [],
      load,
      apply,
    });

    expect(reloader.enabled).toBe(false);
    await reloader.reload();
    expect(load).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it("reloads only the retained path and exposes the palette to current and future consumers", async () => {
    const selectedPath = "/home/tester/.config/omxterm/themes/live.json";
    const reloaded = theme("reloaded", "#123456");
    const load = vi.fn(async () => reloaded);
    const apply = vi.fn();
    const reloader = createTerminalThemeReloader({
      selectedPath,
      initialTheme: DEFAULT_TERMINAL_THEME,
      startupNotices: ["unrelated startup warning"],
      load,
      apply,
    });

    await reloader.reload();

    expect(load).toHaveBeenCalledExactlyOnceWith(selectedPath);
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      terminalTheme: reloaded,
      userFileErrors: ["unrelated startup warning"],
    });
    expect(reloader.current()).toEqual({
      terminalTheme: reloaded,
      userFileErrors: ["unrelated startup warning"],
    });
  });

  it("keeps the last valid palette on failure and clears only its reload notice after recovery", async () => {
    const selectedPath = "/themes/live.json";
    const first = theme("first", "#112233");
    const recovered = theme("recovered", "#445566");
    const load = vi
      .fn<() => Promise<typeof first>>()
      .mockRejectedValueOnce(
        new TerminalThemeError(
          selectedPath,
          "colors.background",
          "must be a CSS hexadecimal #RRGGBB color",
        ),
      )
      .mockResolvedValueOnce(recovered);
    const apply = vi.fn();
    const reloader = createTerminalThemeReloader({
      selectedPath,
      initialTheme: first,
      startupNotices: ["startup theme error", "keybind warning"],
      load,
      apply,
    });

    await reloader.reload();
    const failed = reloader.current();
    expect(failed.terminalTheme).toBe(first);
    expect(failed.userFileErrors).toHaveLength(3);
    expect(failed.userFileErrors[2]).toContain(selectedPath);
    expect(failed.userFileErrors[2]).toContain("colors.background");
    expect(failed.userFileErrors[2]).toContain("#RRGGBB");
    expect(failed.userFileErrors[2]).toContain("View -> Reload Terminal Theme");

    await reloader.reload();
    expect(reloader.current()).toEqual({
      terminalTheme: recovered,
      userFileErrors: ["startup theme error", "keybind warning"],
    });
    expect(apply).toHaveBeenLastCalledWith(reloader.current());
  });
});
