import { describe, expect, it } from "vitest";
import { isTerminalFontData } from "../../src/shared/terminal-font-data";

describe("Terminal Font style transport", () => {
  const face = {
    family: "Configured",
    data: new Uint8Array([1, 2]),
    faceIndex: 0,
  };
  it("accepts selected faces only for the configured family", () => {
    expect(
      isTerminalFontData({
        configured: face,
        configuredStyles: { italic: { ...face, faceIndex: 2 } },
        fallbacks: [],
      }),
    ).toBe(true);
    for (const value of [
      { configuredStyles: { italic: face }, fallbacks: [] },
      {
        configured: face,
        configuredStyles: { italic: { ...face, family: "Other" } },
        fallbacks: [],
      },
      { configured: face, configuredStyles: { thin: face }, fallbacks: [] },
      {
        configured: face,
        configuredStyles: { italic: { ...face, faceIndex: -1 } },
        fallbacks: [],
      },
      {
        configured: face,
        configuredStyles: { italic: { ...face, faceIndex: 0.5 } },
        fallbacks: [],
      },
      {
        configured: face,
        configuredStyles: { italic: { ...face, path: "/font.ttf" } },
        fallbacks: [],
      },
    ])
      expect(isTerminalFontData(value)).toBe(false);
  });
});
