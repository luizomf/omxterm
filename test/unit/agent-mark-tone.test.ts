// @vitest-environment jsdom
import { expect, it } from "vitest";
import { applyWindowTheme } from "../../src/renderer/terminal-window-theme";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

const agentTone = (colors: Partial<typeof DEFAULT_TERMINAL_THEME.colors>) => {
  applyWindowTheme(
    document,
    document.createElement("div"),
    {
      ...DEFAULT_TERMINAL_THEME,
      colors: { ...DEFAULT_TERMINAL_THEME.colors, ...colors },
    },
    0,
  );
  return document.documentElement.style.getPropertyValue("--terminal-agent");
};

it("paints the agent mark in the theme's red, or its foreground when the red is too faint", () => {
  const base = { background: "#101218", foreground: "#f4f4f4" };
  expect(agentTone({ ...base, red: "#e35d6a" })).toBe("#e35d6a");
  expect(agentTone({ ...base, red: "#2a1416" })).toBe("#f4f4f4");
});
