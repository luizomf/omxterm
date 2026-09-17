import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const corePath = path.resolve(
  import.meta.dirname,
  "../../assets/restty/omxterm-restty-core.wasm",
);
const encoder = new TextEncoder();

type CoreExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_resize(handle: number, cols: number, rows: number): number;
  restty_scroll_viewport(handle: number, delta: number): number;
  restty_set_scrollback_limits(
    handle: number,
    maxLines: number,
    maxBytes: number,
  ): number;
  restty_scrollbar_total(handle: number): number;
  restty_scrollbar_offset(handle: number): number;
  restty_scrollbar_len(handle: number): number;
};

async function loadCore() {
  const bytes = Uint8Array.from(await readFile(corePath));
  let memory: WebAssembly.Memory | undefined;
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {
    env: {
      now_ms: () => performance.now(),
      log: () => memory,
    },
  });
  const exports = instance.exports as CoreExports;
  memory = exports.memory;
  const handles = new Set<number>();
  return {
    exports,
    create(cols: number, rows: number, maxBytes: number) {
      const handle = exports.restty_create(cols, rows, maxBytes);
      if (!handle) throw new Error("actual Restty core creation failed");
      handles.add(handle);
      return handle;
    },
    destroy(handle: number) {
      exports.restty_destroy(handle);
      handles.delete(handle);
    },
    destroyAll() {
      for (const handle of handles) exports.restty_destroy(handle);
      handles.clear();
    },
  };
}

function write(exports: CoreExports, handle: number, text: string): void {
  const bytes = encoder.encode(text);
  const pointer = exports.restty_alloc(bytes.length);
  if (!pointer) throw new Error("actual Restty core allocation failed");
  try {
    new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
    expect(exports.restty_write(handle, pointer, bytes.length)).toBe(0);
  } finally {
    exports.restty_free(pointer, bytes.length);
  }
}

function output(lines: number, width: number): string {
  const chunks = new Array<string>(lines);
  for (let index = 0; index < lines; index += 1)
    chunks[index] = `${String(index).padStart(width - 2, "x")}\r\n`;
  return chunks.join("");
}

function history(exports: CoreExports, handle: number): number {
  return (
    exports.restty_scrollbar_total(handle) -
    exports.restty_scrollbar_len(handle)
  );
}

describe("pinned Restty/Ghostty scrollback core", () => {
  it("enforces positive physical-line targets by whole pages across several boundaries", async () => {
    const core = await loadCore();
    try {
      const retained: number[] = [];
      for (const limit of [1, 1_200, 3_000, 4_500, 100_000]) {
        const handle = core.create(40, 5, 256_000_000);
        expect(
          core.exports.restty_set_scrollback_limits(handle, limit, 256_000_000),
        ).toBe(0);
        write(core.exports, handle, output(8_000, 40));
        retained.push(history(core.exports, handle));
        core.destroy(handle);
      }

      const boundaryPage = retained[0]!;
      expect(boundaryPage).toBeGreaterThan(1);
      expect(boundaryPage).toBeLessThan(1_500);
      expect(retained[1]).toBeLessThanOrEqual(1_200 + boundaryPage);
      expect(retained[2]).toBeGreaterThan(retained[1]!);
      expect(retained[2]).toBeLessThanOrEqual(3_000 + boundaryPage);
      expect(retained[3]).toBeGreaterThan(retained[2]!);
      expect(retained[3]).toBeLessThanOrEqual(4_500 + boundaryPage);
      expect(retained[4]).toBeGreaterThan(4_500);
    } finally {
      core.destroyAll();
    }
  });

  it("keeps the 10,000,000-byte ceiling independent from the line target", async () => {
    const core = await loadCore();
    try {
      const constrained = core.create(400, 5, 10_000_000);
      const lineOnly = core.create(400, 5, 256_000_000);
      for (const [handle, maxBytes] of [
        [constrained, 10_000_000],
        [lineOnly, 256_000_000],
      ] as const) {
        expect(
          core.exports.restty_set_scrollback_limits(handle, 100_000, maxBytes),
        ).toBe(0);
        write(core.exports, handle, output(5_000, 400));
      }

      expect(history(core.exports, constrained)).toBeGreaterThan(0);
      expect(history(core.exports, constrained)).toBeLessThan(
        history(core.exports, lineOnly),
      );
      expect(history(core.exports, lineOnly)).toBeGreaterThan(4_900);
    } finally {
      core.destroyAll();
    }
  });

  it("uses no-history mode at zero and permits only new history after re-enabling", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(40, 5, 10_000_000);
      expect(
        core.exports.restty_set_scrollback_limits(handle, 3_000, 10_000_000),
      ).toBe(0);
      write(core.exports, handle, output(4_000, 40));
      expect(history(core.exports, handle)).toBeGreaterThan(0);

      expect(
        core.exports.restty_set_scrollback_limits(handle, 0, 10_000_000),
      ).toBe(0);
      expect(history(core.exports, handle)).toBe(0);
      write(core.exports, handle, output(4_000, 40));
      expect(core.exports.restty_resize(handle, 60, 8)).toBe(0);
      write(core.exports, handle, output(2_000, 58));
      expect(history(core.exports, handle)).toBe(0);

      expect(
        core.exports.restty_set_scrollback_limits(handle, 3_000, 10_000_000),
      ).toBe(0);
      write(core.exports, handle, output(1_500, 58));
      expect(history(core.exports, handle)).toBeGreaterThan(0);
    } finally {
      core.destroyAll();
    }
  });

  it("keeps viewport, reflow, and alternate-screen state coherent on reduction", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(40, 8, 256_000_000);
      core.exports.restty_set_scrollback_limits(handle, 100_000, 256_000_000);
      write(core.exports, handle, output(6_000, 40));
      core.exports.restty_scroll_viewport(handle, -2_000);
      const before = core.exports.restty_scrollbar_offset(handle);

      core.exports.restty_set_scrollback_limits(handle, 3_000, 256_000_000);
      expect(core.exports.restty_resize(handle, 60, 10)).toBe(0);
      const reducedHistory = history(core.exports, handle);
      expect(reducedHistory).toBeGreaterThan(0);
      expect(reducedHistory).toBeLessThan(4_500);
      expect(core.exports.restty_scrollbar_offset(handle)).toBeLessThanOrEqual(
        reducedHistory,
      );
      expect(before).toBeGreaterThanOrEqual(0);

      write(core.exports, handle, "\u001b[?1049h" + output(2_000, 58));
      expect(history(core.exports, handle)).toBe(0);
      write(core.exports, handle, "\u001b[?1049l");
      expect(history(core.exports, handle)).toBe(reducedHistory);
    } finally {
      core.destroyAll();
    }
  });
});
