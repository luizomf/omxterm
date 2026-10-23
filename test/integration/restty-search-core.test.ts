import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const corePath = path.resolve(
  import.meta.dirname,
  "../../assets/restty/omxterm-restty-core.wasm",
);
const encoder = new TextEncoder();
// The pinned Restty runtime advances an incomplete search by this budget per
// rendered frame.
const RUNTIME_SEARCH_STEP_BUDGET = 64;

type CoreExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_search_set_query(
    handle: number,
    pointer: number,
    length: number,
  ): void;
  restty_search_clear(handle: number): void;
  restty_search_step(handle: number, budget: number): void;
  restty_search_select_next(handle: number): void;
  restty_search_select_prev(handle: number): void;
  restty_search_status_ptr(handle: number): number;
  restty_search_viewport_match_count(handle: number): number;
  restty_search_viewport_matches_ptr(handle: number): number;
  restty_render_update(handle: number): number;
};

interface SearchStatus {
  readonly active: boolean;
  readonly pending: boolean;
  readonly complete: boolean;
  readonly total: number;
  readonly selectedIndex: number | null;
}

async function loadCore() {
  const bytes = Uint8Array.from(await readFile(corePath));
  const module = await WebAssembly.compile(bytes);
  const instance = await WebAssembly.instantiate(module, {
    env: { now_ms: () => performance.now(), log: () => undefined },
  });
  const exports = instance.exports as CoreExports;
  const handles = new Set<number>();
  return {
    exports,
    create(cols: number, rows: number) {
      const handle = exports.restty_create(cols, rows, 10_000_000);
      if (!handle) throw new Error("actual Restty core creation failed");
      handles.add(handle);
      return handle;
    },
    destroyAll() {
      for (const handle of handles) exports.restty_destroy(handle);
      handles.clear();
    },
  };
}

function withBytes(
  exports: CoreExports,
  text: string,
  use: (pointer: number, length: number) => void,
): void {
  const bytes = encoder.encode(text);
  const pointer = exports.restty_alloc(bytes.length);
  if (!pointer) throw new Error("actual Restty core allocation failed");
  try {
    new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
    use(pointer, bytes.length);
  } finally {
    exports.restty_free(pointer, bytes.length);
  }
}

function write(exports: CoreExports, handle: number, text: string): void {
  withBytes(exports, text, (pointer, length) =>
    expect(exports.restty_write(handle, pointer, length)).toBe(0),
  );
}

function setQuery(exports: CoreExports, handle: number, query: string): void {
  withBytes(exports, query, (pointer, length) =>
    exports.restty_search_set_query(handle, pointer, length),
  );
}

// Mirrors the pinned runtime's 16-byte search status record.
function status(exports: CoreExports, handle: number): SearchStatus {
  const view = new DataView(
    exports.memory.buffer,
    exports.restty_search_status_ptr(handle),
    16,
  );
  const selectedIndex = view.getInt32(12, true);
  return {
    active: view.getUint8(0) !== 0,
    pending: view.getUint8(1) !== 0,
    complete: view.getUint8(2) !== 0,
    total: view.getUint32(8, true),
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
  };
}

// Visible row of the selected match, from the 8-byte viewport match records.
function selectedRow(exports: CoreExports, handle: number): number | null {
  expect(exports.restty_render_update(handle)).toBe(0);
  const count = exports.restty_search_viewport_match_count(handle);
  const view = new DataView(
    exports.memory.buffer,
    exports.restty_search_viewport_matches_ptr(handle),
    count * 8,
  );
  for (let index = 0; index < count; index += 1)
    if (view.getUint8(index * 8 + 6) !== 0)
      return view.getUint16(index * 8, true);
  return null;
}

function search(
  exports: CoreExports,
  handle: number,
  query: string,
): { readonly status: SearchStatus; readonly steps: number } {
  setQuery(exports, handle, query);
  let steps = 0;
  while (!status(exports, handle).complete) {
    if (steps > 100_000) throw new Error("search never completed");
    exports.restty_search_step(handle, RUNTIME_SEARCH_STEP_BUDGET);
    steps += 1;
  }
  return { status: status(exports, handle), steps };
}

function lines(count: number, line: (index: number) => string): string {
  return Array.from({ length: count }, (_, index) => `${line(index)}\r\n`).join(
    "",
  );
}

describe("pinned Restty/Ghostty scrollback search core", () => {
  it("counts matches in scrollback and the visible screen", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(40, 5);
      write(
        core.exports,
        handle,
        lines(200, (index) =>
          index % 20 === 0 ? `needle ${index}` : `hay ${index}`,
        ),
      );

      const found = search(core.exports, handle, "needle");
      expect(found.status).toMatchObject({
        active: true,
        pending: false,
        complete: true,
        total: 10,
      });
      expect(search(core.exports, handle, "absent").status.total).toBe(0);
    } finally {
      core.destroyAll();
    }
  });

  it("matches wide, accented, and emoji graphemes", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(40, 5);
      write(
        core.exports,
        handle,
        `café ✓\r\n日本語の端末\r\n👩‍💻 ok\r\n${lines(20, (index) => `${index}`)}`,
      );

      expect(search(core.exports, handle, "café").status.total).toBe(1);
      expect(search(core.exports, handle, "日本語").status.total).toBe(1);
      expect(search(core.exports, handle, "👩‍💻").status.total).toBe(1);
    } finally {
      core.destroyAll();
    }
  });

  it("selects matches in both directions and clears without residue", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(40, 5);
      write(
        core.exports,
        handle,
        lines(30, (index) => `row ${index} mark`),
      );
      expect(search(core.exports, handle, "mark").status.total).toBe(30);

      core.exports.restty_search_select_prev(handle);
      const first = status(core.exports, handle).selectedIndex;
      expect(first).not.toBeNull();
      core.exports.restty_search_select_prev(handle);
      const second = status(core.exports, handle).selectedIndex;
      expect(second).not.toBe(first);
      core.exports.restty_search_select_next(handle);
      expect(status(core.exports, handle).selectedIndex).toBe(first);

      core.exports.restty_search_clear(handle);
      expect(status(core.exports, handle)).toMatchObject({
        active: false,
        total: 0,
        selectedIndex: null,
      });
    } finally {
      core.destroyAll();
    }
  });

  // The search bar binds Enter and its down button to "previous", and
  // Shift+Enter and its up button to "next".
  it("moves next toward older output above and previous toward newer output below", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(20, 8);
      write(
        core.exports,
        handle,
        "mark\r\nz\r\nmark\r\nz\r\nmark\r\nz\r\nmark",
      );
      expect(search(core.exports, handle, "mark").status.total).toBe(4);

      const rows: Array<number | null> = [];
      for (const select of ["next", "next", "next", "prev", "prev"] as const) {
        if (select === "next") core.exports.restty_search_select_next(handle);
        else core.exports.restty_search_select_prev(handle);
        rows.push(selectedRow(core.exports, handle));
      }
      expect(rows).toEqual([6, 4, 2, 4, 6]);
    } finally {
      core.destroyAll();
    }
  });

  it("searches only the retained history of an over-cap buffer", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(80, 24);
      // Far more output than the 10,000,000-byte core limit retains.
      const written = 200_000;
      write(
        core.exports,
        handle,
        lines(written, (index) =>
          index % 1000 === 0
            ? `checkpoint ${index}`
            : `${index} ${"x".repeat(60)}`,
        ),
      );

      const found = search(core.exports, handle, "checkpoint");
      expect(found.steps).toBeLessThan(100);
      expect(found.status.total).toBeGreaterThan(0);
      expect(found.status.total).toBeLessThan(written / 1000);
    } finally {
      core.destroyAll();
    }
  });
});
