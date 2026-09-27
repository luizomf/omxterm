import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

const dist = path.dirname(createRequire(import.meta.url).resolve("restty"));
const runtime = readFileSync(path.join(dist, "chunk-c0rcpsc5.js"), "utf8");
const start = runtime.indexOf("function createScrollbarRuntime(options) {");
const end = runtime.indexOf(
  "// src/runtime/create-runtime/interaction-runtime/index.ts",
  start,
);
if (start < 0 || end <= start) throw new Error("Restty scrollbar seam drifted");

it.each([
  { fine: true, coarse: false, touch: 0, native: true },
  { fine: false, coarse: false, touch: 0, native: true },
  { fine: true, coarse: false, touch: 2, native: true },
  { fine: true, coarse: true, touch: 2, native: true },
  { fine: false, coarse: true, touch: 2, native: false },
  { fine: false, coarse: false, touch: 2, native: false },
])(
  "selects native scrolling=$native with fine=$fine coarse=$coarse touch=$touch",
  ({ fine, coarse, touch, native }) => {
    const sync = vi.fn();
    const destroy = vi.fn();
    const createNativeScrollbarHost = vi.fn(() => ({ sync, destroy }));
    // Exercise the installed controller, replacing only browser capability and
    // DOM construction boundaries. Native tests exercise the actual host.
    const create = runInNewContext(
      `${runtime.slice(start, end)}\ncreateScrollbarRuntime`,
      {
        window: {
          matchMedia: (query: string) => ({
            matches:
              query === "(any-pointer: fine)"
                ? fine
                : query === "(any-pointer: coarse)" && coarse,
          }),
        },
        navigator: { maxTouchPoints: touch },
        document: {},
        createNativeScrollbarHost,
      },
    ) as (options: { getCanvas(): object }) => {
      syncScrollbar(total: number, offset: number, length: number): void;
      destroy(): void;
    };
    const scrollbar = create({ getCanvas: () => ({}) });
    scrollbar.syncScrollbar(100, 20, 30);
    scrollbar.destroy();
    expect(createNativeScrollbarHost).toHaveBeenCalledTimes(native ? 1 : 0);
    expect(sync.mock.calls).toEqual(native ? [[100, 20, 30]] : []);
    expect(destroy).toHaveBeenCalledTimes(native ? 1 : 0);
  },
);
