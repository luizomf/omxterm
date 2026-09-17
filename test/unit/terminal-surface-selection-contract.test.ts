import { describe, expect, it } from "vitest";
import { isTerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

const configuration = {
  terminalSurface: "xterm",
  fontSize: 16,
  fontLineHeight: 1,
  terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
  scrollbackLines: 10_000,
  optionKeyMode: "none",
  nativeTitleInset: 30,
  terminalTheme: DEFAULT_TERMINAL_THEME,
  userFileErrors: [],
};

describe("Terminal Surface renderer configuration", () => {
  it.each(["xterm", "restty"])("accepts the typed %s selection", (value) => {
    expect(
      isTerminalRendererConfiguration({
        ...configuration,
        terminalSurface: value,
      }),
    ).toBe(true);
  });

  it("rejects an unknown selection at the bridge boundary", () => {
    expect(
      isTerminalRendererConfiguration({
        ...configuration,
        terminalSurface: "automatic",
      }),
    ).toBe(false);
  });
});
