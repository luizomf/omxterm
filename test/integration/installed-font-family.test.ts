import { describe, expect, it } from "vitest";
import {
  installedFallbackFontData,
  installedFontData,
  installedFontFamilyMetrics,
} from "../../src/main/installed-font-family";

describe("native installed font-family availability", () => {
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
  });
});
