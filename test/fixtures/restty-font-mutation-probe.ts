import { readFile } from "node:fs/promises";
import type { Plugin } from "esbuild";

// Test-only retained byte copies deliberately disturb memory accounting. Never
// use this instrumentation for the separate ordinary/GC memory measurements.
export const resttyFontMutationProbe: Plugin = {
  name: "restty-font-mutation-probe",
  setup(api) {
    api.onLoad({ filter: /chunk-c0rcpsc5\.js$/ }, async (args) => {
      let contents = await readFile(args.path, "utf8");
      const replace = (needle: string, replacement: string) => {
        if (!contents.includes(needle))
          throw new Error("Pinned font mutation probe seam drift");
        contents = contents.replace(needle, replacement);
      };
      replace(
        "function toSourceBuffer(source) {",
        `const fontMutationSources = new Map();
const fontMutationCalls = { collections: 0, shapes: 0, outlines: 0, colors: 0, borrowedViews: 0 };
globalThis.__fontMutationResult = () => {
  let bytes = 0;
  let changedSources = 0;
  for (const [buffer, before] of fontMutationSources) {
    const after = new Uint8Array(buffer);
    bytes += after.byteLength;
    for (let index = 0; index < before.length; index += 1) {
      if (before[index] !== after[index]) { changedSources += 1; break; }
    }
  }
  const result = { sources: fontMutationSources.size, bytes, changedSources, ...fontMutationCalls };
  fontMutationSources.clear();
  return result;
};
function toSourceBuffer(source) {
  if (source.kind === "buffer" && source.data instanceof ArrayBuffer && !fontMutationSources.has(source.data))
    fontMutationSources.set(source.data, new Uint8Array(source.data).slice());`,
      );
      for (const [needle, counter] of [
        [
          "  if (collection) {\n    const names = collection.names();",
          "collections",
        ],
        ["  function shapeClusterWithFont(entry, text) {", "shapes"],
        ["function R6(x, A, Q, K) {", "outlines"],
        [
          "  function rasterizeColorGlyphWithCanvas(entry, text, fontSize) {",
          "colors",
        ],
        [
          "  bytes(x) {\n    let A = new Uint8Array(this.data.buffer",
          "borrowedViews",
        ],
      ] as const) {
        const brace = needle.indexOf("{");
        replace(
          needle,
          `${needle.slice(0, brace + 1)}\nfontMutationCalls.${counter} += 1;${needle.slice(brace + 1)}`,
        );
      }
      return { contents, loader: "js" };
    });
  },
};
