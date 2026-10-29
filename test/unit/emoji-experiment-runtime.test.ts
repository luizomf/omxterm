import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import runtimeHistory from "../fixtures/restty-runtime-history.json";
import { inputRoutingCorrections } from "../../scripts/restty-input-routing-corrections.mjs";

const harness = vi.hoisted(() => ({
  runtime: "",
  fontReader: "",
  renderers: [] as string[],
  mainReaders: [] as string[],
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async (file: string) => {
    if (file === "node_modules/restty/dist/chunk-c0rcpsc5.js")
      return harness.runtime;
    if (file.endsWith("installed-font-family.ts")) return harness.fontReader;
    if (file === "src/renderer/index.html")
      return "<meta content=\"default-src 'none'\">";
    return Buffer.from("controlled font input");
  }),
  writeFile: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
  copyFile: vi.fn(async () => {}),
}));
vi.mock("../../scripts/emoji-experiment/compact.mjs", () => ({
  compactCollection: (bytes: Buffer) => Buffer.from(bytes),
}));
vi.mock("text-shaper", () => ({
  Font: {
    collection: () => ({
      names: () => [{ index: 0 }],
      get: () => ({ unitsPerEm: 1, ascender: 1, descender: 0, numGlyphs: 1 }),
    }),
  },
  UnicodeBuffer: class {
    addStr() {}
  },
  shape: () => [],
}));
vi.mock("node:module", () => ({
  createRequire: () => () => "controlled-electron",
}));
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(() => ({
    status: 0,
    stdout: JSON.stringify({
      result: {
        results: [],
        fontBytes: ["controlled font input".length],
        probe: { canvas: 1, raster: 1, atlas: 1 },
      },
      phases: [{ hash: "controlled capture" }],
    }),
    stderr: "",
  })),
}));
vi.mock("esbuild", () => ({
  build: vi.fn(
    async (options: {
      entryPoints: string[];
      plugins: Array<{
        setup(builder: {
          onLoad(
            filter: unknown,
            callback: (args: { path: string }) => Promise<{ contents: string }>,
          ): void;
        }): void;
      }>;
    }) => {
      const renderer = options.entryPoints[0]!.endsWith(
        "restty-emoji-experiment.ts",
      );
      for (const plugin of options.plugins) {
        let load:
          | ((args: { path: string }) => Promise<{ contents: string }>)
          | undefined;
        plugin.setup({
          onLoad(_filter, callback) {
            load = callback;
          },
        });
        const result = await load!({
          path: path.resolve(
            renderer
              ? "node_modules/restty/dist/chunk-c0rcpsc5.js"
              : "src/main/installed-font-family.ts",
          ),
        });
        (renderer ? harness.renderers : harness.mainReaders).push(
          result.contents,
        );
      }
    },
  ),
}));

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalArgv = process.argv;
// This side-effect-only CLI has no exported TypeScript interface.
const runDriver = () => {
  const driver = "../../scripts/emoji-experiment/run.mjs";
  return import(driver);
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  harness.runtime = readFileSync(
    "node_modules/restty/dist/chunk-c0rcpsc5.js",
    "utf8",
  );
  harness.fontReader = readFileSync(
    "src/main/installed-font-family.ts",
    "utf8",
  );
  harness.renderers.length = harness.mainReaders.length = 0;
  Object.defineProperty(process, "platform", {
    ...originalPlatform,
    value: "darwin",
  });
  process.argv = ["node", "run.mjs", ".scratch/controlled-emoji-experiment"];
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

// Execute the actual documented driver and all actual onLoad transforms. Only
// its external platform/font/parser/filesystem/build/process I/O is controlled;
// no Apple input, graphical capture or historical observation is claimed.
it("accepts the prepared runtime and instruments all eighteen emoji trial recipes", async () => {
  await expect(runDriver()).resolves.toBeDefined();
  expect(spawnSync).toHaveBeenCalledTimes(20);
  expect(harness.renderers).toHaveLength(18);
  expect(harness.mainReaders).toHaveLength(18);
  for (const source of harness.renderers) {
    expect(source).toContain(
      "globalThis.emojiProbe={canvas:0,raster:0,atlas:0};",
    );
    expect(source).toContain("globalThis.emojiProbe.canvas++;");
    expect(source).toContain("globalThis.emojiProbe.raster++;");
    expect(source).toContain(
      "globalThis.emojiProbe.atlas++;atlas = buildAtlas",
    );
    for (const { corrected } of inputRoutingCorrections)
      expect(source).toContain(corrected);
    // Prior product corrections also survive this unrelated fixture transform.
    expect(source).toContain(
      "if (host.scrollTop !== scrollTopBeforeSpacer) ignoreNextScroll = true;",
    );
  }
  expect(
    harness.renderers.filter((source) =>
      source.includes("globalThis.emojiProbe.canvas++;return null;"),
    ),
  ).toHaveLength(4);
  expect(
    harness.renderers.filter((source) =>
      source.includes("colorGlyphAtlas && false"),
    ),
  ).toHaveLength(2);
  // Syntax-check the actual transformed bytes without launching a renderer.
  Object.defineProperty(process, "platform", originalPlatform);
  const { transformSync } =
    await vi.importActual<typeof import("esbuild")>("esbuild");
  for (const source of new Set(harness.renderers))
    expect(transformSync(source, { loader: "js" }).code).not.toBe("");
});

it("rejects the previous prepared runtime instead of relabeling historical bytes", async () => {
  const previous = runtimeHistory[0]!;
  const lines = harness.runtime.split("\n");
  for (const edit of previous.edits)
    lines.splice(edit.start, edit.deleteCount, ...edit.lines);
  harness.runtime = lines.join("\n");
  expect(createHash("sha256").update(harness.runtime).digest("hex")).toBe(
    previous.sha256,
  );
  await expect(runDriver()).rejects.toThrow("Unreviewed Restty runtime");
  expect(spawnSync).not.toHaveBeenCalled();
  expect(harness.renderers).toEqual([]);
  expect(harness.mainReaders).toEqual([]);
});

it("rejects modified runtime bytes before any renderer instrumentation or native launch", async () => {
  harness.runtime += "\n";
  await expect(runDriver()).rejects.toThrow("Unreviewed Restty runtime");
  expect(spawnSync).not.toHaveBeenCalled();
  expect(harness.renderers).toEqual([]);
  expect(harness.mainReaders).toEqual([]);
});
