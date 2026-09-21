import { describe, expect, it } from "vitest";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { isTerminalFontData } from "../../src/shared/terminal-font-data";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";
import {
  installedFallbackFontData,
  installedFontData,
  installedFontFamilyMetrics,
} from "../../src/main/installed-font-family";

describe("native installed font-family availability", () => {
  it("delivers native regular, bold, italic and bold-italic faces through the bounded font contract", async () => {
    const family =
      process.platform === "darwin"
        ? "Menlo"
        : process.platform === "win32"
          ? "Consolas"
          : "DejaVu Sans Mono";
    const data = await loadTerminalFontData(family);
    expect(data.configuredStyles?.bold).toBeDefined();
    expect(data.configuredStyles?.italic).toBeDefined();
    expect(data.configuredStyles?.boldItalic).toBeDefined();
    expect(isTerminalFontData(data)).toBe(true);
    const fonts = terminalFontInputs(data);
    expect(fonts.slice(0, 4).map((font) => [font.weight, font.style])).toEqual([
      [400, "normal"],
      [700, "normal"],
      [400, "italic"],
      [700, "italic"],
    ]);
    if (process.platform === "darwin") {
      expect(new Set(fonts.slice(0, 4).map((font) => font.data)).size).toBe(1);
      expect(
        new Set(fonts.slice(0, 4).map((font) => font.faceIndex)).size,
      ).toBe(4);
    }
  }, 30_000);
  it("accepts an exact built-in family and rejects a nonexistent family", async () => {
    const installedFamily =
      process.platform === "darwin"
        ? "Helvetica"
        : process.platform === "win32"
          ? "Consolas"
          : "DejaVu Sans";
    const metrics = await installedFontFamilyMetrics(installedFamily, 16);
    expect(metrics?.cellWidth).toBeGreaterThan(0);
    expect(metrics?.cellHeight).toBeGreaterThan(0);
    const bytes = await installedFontData(installedFamily);
    expect(bytes?.byteLength).toBeGreaterThan(12);
    const fallbacks = await installedFallbackFontData();
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.every((face) => face.data.byteLength > 12)).toBe(true);
    await expect(
      installedFontFamilyMetrics("OMXTerm Definitely Missing Font 37", 16),
    ).resolves.toBeUndefined();
  }, 30_000);
});
