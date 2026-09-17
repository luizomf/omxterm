import { describe, expect, it } from "vitest";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";

describe("Terminal Font Stack", () => {
  it("provides real bold faces for the default bundled stack", () => {
    const fonts = terminalFontInputs({ fallbacks: [] });
    expect(
      fonts.filter((font) => font.weight === 700).map((font) => font.name),
    ).toEqual(["FiraCode Nerd Font Mono Bold", "DejaVu Sans Mono Bold"]);
  });
  it("keeps configured-family precedence before bundled and OS coverage faces", () => {
    const configuredBytes = new Uint8Array([10, 11]);
    const osFallbackBytes = new Uint8Array([20, 21]);
    const fonts = terminalFontInputs({
      configured: {
        family: "Exact Família",
        sourceFamily: "Embedded Exact Family",
        data: configuredBytes,
      },
      fallbacks: [
        {
          family: "Local Emoji",
          sourceFamily: "Embedded Emoji",
          data: osFallbackBytes,
        },
      ],
    });

    expect(fonts.map((font) => font.name)).toEqual([
      "Embedded Exact Family",
      "FiraCode Nerd Font Mono",
      "DejaVu Sans Mono",
      "JetBrainsMono Nerd Font Mono",
      "Embedded Emoji",
    ]);
    expect(fonts[0]).toMatchObject({
      data: configuredBytes,
      weight: 400,
      style: "normal",
    });
    expect(fonts.some((font) => font.weight === 700)).toBe(false);
    expect(fonts.at(-1)?.data).toBe(osFallbackBytes);
  });
});
