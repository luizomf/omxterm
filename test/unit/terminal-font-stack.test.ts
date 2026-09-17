import { describe, expect, it } from "vitest";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";

describe("Terminal Font Stack", () => {
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
      "FiraCode Nerd Font Mono Bold",
      "DejaVu Sans Mono",
      "DejaVu Sans Mono Bold",
      "JetBrainsMono Nerd Font Mono",
      "Embedded Emoji",
    ]);
    expect(fonts[0]).toMatchObject({
      data: configuredBytes,
      weight: 400,
      style: "normal",
    });
    expect(fonts[2]).toMatchObject({ weight: 700, style: "normal" });
    expect(fonts[4]).toMatchObject({ weight: 700, style: "normal" });
    expect(fonts.at(-1)?.data).toBe(osFallbackBytes);
  });
});
