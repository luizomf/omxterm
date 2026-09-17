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
  restty_render_update(handle: number): number;
  restty_rows(handle: number): number;
  restty_cols(handle: number): number;
  restty_cell_codepoints_ptr(handle: number): number;
  restty_scroll_viewport(handle: number, delta: number): number;
  restty_set_scrollback_limits(
    handle: number,
    maxLines: number,
    maxBytes: number,
  ): number;
  restty_scrollbar_total(handle: number): number;
  restty_scrollbar_offset(handle: number): number;
  restty_scrollbar_len(handle: number): number;
  restty_selection_text(
    handle: number,
    anchorRow: number,
    anchorCol: number,
    focusRow: number,
    focusCol: number,
    resultPointer: number,
    resultLength: number,
  ): number;
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

function selectionText(
  exports: CoreExports,
  handle: number,
  anchorRow: number,
  anchorCol: number,
  focusRow: number,
  focusCol: number,
): string {
  const result = exports.restty_alloc(8);
  if (!result)
    throw new Error("actual Restty selection result allocation failed");
  let pointer = 0;
  let length = 0;
  try {
    expect(
      exports.restty_selection_text(
        handle,
        anchorRow,
        anchorCol,
        focusRow,
        focusCol,
        result,
        result + 4,
      ),
    ).toBe(0);
    const view = new DataView(exports.memory.buffer);
    pointer = view.getUint32(result, true);
    length = view.getUint32(result + 4, true);
    return new TextDecoder().decode(
      new Uint8Array(exports.memory.buffer, pointer, length),
    );
  } finally {
    if (pointer && length) exports.restty_free(pointer, length);
    exports.restty_free(result, 8);
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

function visibleText(exports: CoreExports, handle: number): string {
  expect(exports.restty_render_update(handle)).toBe(0);
  const length = exports.restty_rows(handle) * exports.restty_cols(handle);
  const pointer = exports.restty_cell_codepoints_ptr(handle);
  const codepoints = new Uint32Array(exports.memory.buffer, pointer, length);
  return Array.from(codepoints, (value) =>
    value === 0 ? " " : String.fromCodePoint(value),
  ).join("");
}

describe("pinned Restty/Ghostty scrollback core", () => {
  it("preserves graphemes across proven soft wraps and separates hard breaks", async () => {
    const core = await loadCore();
    try {
      const soft = core.create(10, 4, 10_000_000);
      const softText = "漢e\u0301 http://x.test";
      write(core.exports, soft, softText);
      expect(selectionText(core.exports, soft, 0, 0, 1, 9)).toBe(softText);

      const hard = core.create(20, 4, 10_000_000);
      write(core.exports, hard, "http://one.test\r\nhttp://two.test");
      expect(selectionText(core.exports, hard, 0, 0, 1, 19)).toBe(
        "http://one.test\nhttp://two.test",
      );
    } finally {
      core.destroyAll();
    }
  });

  it("exposes viewport evidence when a soft-wrapped destination is concealed", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(20, 5, 10_000_000);
      const url = `https://clipped.test/${"z".repeat(20)}`;
      write(core.exports, handle, `${"\r\n".repeat(3)}${url}`);
      core.exports.restty_scroll_viewport(handle, -1);
      expect(core.exports.restty_scrollbar_offset(handle)).toBe(0);
      expect(core.exports.restty_scrollbar_total(handle)).toBeGreaterThan(
        core.exports.restty_scrollbar_len(handle),
      );
      const visible = selectionText(core.exports, handle, 0, 0, 4, 19);
      expect(url.startsWith(visible.trimStart())).toBe(true);
      expect(visible).not.toContain(url);
    } finally {
      core.destroyAll();
    }
  });

  it("enforces creation policies from 1 through 100,000 by whole pages", async () => {
    const core = await loadCore();
    try {
      const policies = [
        { label: "minimum", limit: 1 },
        { label: "ordinary", limit: 1_200 },
        { label: "default", limit: 10_000 },
        { label: "maximum", limit: 100_000 },
      ] as const;
      const retained = new Map<string, number>();
      for (const policy of policies) {
        const handle = core.create(40, 5, 256_000_000);
        expect(
          core.exports.restty_set_scrollback_limits(
            handle,
            policy.limit,
            256_000_000,
          ),
        ).toBe(0);
        write(core.exports, handle, output(policy.limit + 4_000, 40));
        retained.set(policy.label, history(core.exports, handle));
        core.destroy(handle);
      }

      const boundaryPage = retained.get("minimum")!;
      expect(boundaryPage).toBeGreaterThan(1);
      expect(boundaryPage).toBeLessThan(1_500);
      for (const policy of policies) {
        const actual = retained.get(policy.label)!;
        expect(actual).toBeGreaterThan(0);
        expect(actual).toBeLessThanOrEqual(policy.limit + boundaryPage);
      }
      expect(retained.get("ordinary")).toBeGreaterThan(boundaryPage);
      expect(retained.get("default")).toBeGreaterThan(
        retained.get("ordinary")!,
      );
      expect(retained.get("maximum")).toBeGreaterThan(retained.get("default")!);
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
      expect(before).toBeGreaterThan(0);

      core.exports.restty_set_scrollback_limits(handle, 3_000, 256_000_000);
      expect(core.exports.restty_resize(handle, 60, 10)).toBe(0);
      const reducedHistory = history(core.exports, handle);
      const reflowedOffset = core.exports.restty_scrollbar_offset(handle);
      expect(reducedHistory).toBeGreaterThan(0);
      expect(reducedHistory).toBeLessThan(4_500);
      expect(before).toBeGreaterThan(reducedHistory);
      expect(reflowedOffset).toBe(0);

      write(core.exports, handle, "\u001b[?1049h" + output(2_000, 58));
      expect(history(core.exports, handle)).toBe(0);
      write(core.exports, handle, "\u001b[?1049l");
      expect(history(core.exports, handle)).toBe(reducedHistory);
    } finally {
      core.destroyAll();
    }
  });

  it("does not mutate another core's viewport or visible content", async () => {
    const core = await loadCore();
    try {
      const first = core.create(40, 6, 10_000_000);
      const second = core.create(40, 6, 10_000_000);
      core.exports.restty_set_scrollback_limits(first, 3_000, 10_000_000);
      core.exports.restty_set_scrollback_limits(second, 3_000, 10_000_000);
      write(core.exports, first, output(4_000, 40));
      write(core.exports, second, `${output(2_000, 40)}SECOND-SURFACE-MARKER`);
      core.exports.restty_scroll_viewport(second, -500);
      const secondHistory = history(core.exports, second);
      const secondOffset = core.exports.restty_scrollbar_offset(second);
      const secondContent = visibleText(core.exports, second);

      core.exports.restty_set_scrollback_limits(first, 0, 10_000_000);
      write(core.exports, first, output(3_000, 40));
      core.exports.restty_set_scrollback_limits(first, 1_200, 10_000_000);
      write(core.exports, first, output(2_000, 40));

      expect(history(core.exports, second)).toBe(secondHistory);
      expect(core.exports.restty_scrollbar_offset(second)).toBe(secondOffset);
      expect(visibleText(core.exports, second)).toBe(secondContent);
    } finally {
      core.destroyAll();
    }
  });
});
