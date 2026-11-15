import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { cff2VariableFont } from "../fixtures/cff2-variable-font";
import { runtimeSection } from "../fixtures/restty-cpr-core-probe";

interface Font {
  getGlyphContours(glyph: number): { x: number; y: number }[][] | null;
  getGlyphContoursWithVariation(
    glyph: number,
    coords: number[],
  ): { x: number; y: number }[][] | null;
}

// The prepared runtime's bundled text-shaper, the copy Restty draws glyphs with.
const source = readFileSync(
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "utf8",
);
const { Font } = runInNewContext(
  runtimeSection(source, "var __defProp", "// src/input/keymap/constants.ts") +
    runtimeSection(
      source,
      "// node_modules/text-shaper/dist/index.js",
      "// src/runtime/create-runtime/runtime-io-utils.ts",
    ) +
    "\nexports_dist",
  // Share this realm's binary types so the reader accepts the fixture bytes.
  { ArrayBuffer, DataView, Uint8Array, TextDecoder, TextEncoder },
) as { Font: { load(buffer: ArrayBuffer): Font } };

function load(defaultWeight: number): Font {
  return Font.load(cff2VariableFont(defaultWeight).slice().buffer);
}

function bar(thickness: number) {
  return [
    [
      { x: 100, y: 400 },
      { x: 100, y: 400 + thickness },
      { x: 900, y: 400 + thickness },
      { x: 900, y: 400 },
    ].map((point) => expect.objectContaining(point)),
  ];
}

describe("Restty CFF2 variable outlines", () => {
  it("draws a Regular-default face at its default outline", () => {
    expect(load(400).getGlyphContours(1)).toEqual(bar(30));
  });

  it("draws a Thin-default face, like Noto Sans CJK VF, at Regular", () => {
    // wght 400 normalizes to (400 - 100) / (900 - 100) on a 100–900 axis.
    expect(load(100).getGlyphContours(1)).toEqual(bar(30 + 200 * 0.375));
  });

  it("blends explicit axis coordinates", () => {
    expect(load(100).getGlyphContoursWithVariation(1, [1])).toEqual(bar(230));
  });
});
