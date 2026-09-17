import { describe, expect, it } from "vitest";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";

describe("Terminal Font Stack", () => {
  it("provides real bold faces for the default bundled stack", () => {
    const fonts = terminalFontInputs({ fallbacks: [] });
    expect(
      fonts.filter((font) => font.weight === 700).map((font) => font.name),
    ).toEqual(["FiraCode Nerd Font Mono Bold", "DejaVu Sans Mono Bold"]);
  });
  it("owns one bounded native-font snapshot without retaining mutable input views", () => {
    const allocation = new Uint8Array([99, 10, 11, 88]);
    const view = allocation.subarray(1, 3);
    const fonts = terminalFontInputs({
      configured: { family: "Configured", data: view },
      fallbacks: [{ family: "Fallback", data: new Uint8Array([20, 21]) }],
    });
    const configured = fonts[0]!.data;
    const fallback = fonts.at(-1)!.data;
    expect(configured).toBeInstanceOf(ArrayBuffer);
    expect(fallback).toBeInstanceOf(ArrayBuffer);
    allocation.fill(0);
    expect([...new Uint8Array(configured)]).toEqual([10, 11]);
    expect([...new Uint8Array(fallback)]).toEqual([20, 21]);
    new Uint8Array(configured).fill(1);
    expect([...allocation]).toEqual([0, 0, 0, 0]);
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
      data: configuredBytes.buffer,
      weight: 400,
      style: "normal",
    });
    expect(fonts.some((font) => font.weight === 700)).toBe(false);
    expect(fonts.at(-1)?.data).toEqual(osFallbackBytes.buffer);
  });
});
