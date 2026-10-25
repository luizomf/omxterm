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
  restty_cols(handle: number): number;
  restty_scrollbar_total(handle: number): number;
  restty_scrollbar_offset(handle: number): number;
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

function selectionText(
  exports: CoreExports,
  handle: number,
  range: readonly [number, number, number, number],
): string {
  const result = exports.restty_alloc(8);
  let pointer = 0;
  let length = 0;
  try {
    expect(
      exports.restty_selection_text(handle, ...range, result, result + 4),
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

// The prepared runtime's getBufferText() reads exactly this range: the same
// rows Select All selects, relative to the current viewport.
function bufferText(exports: CoreExports, handle: number): string {
  const total = exports.restty_scrollbar_total(handle);
  const offset = exports.restty_scrollbar_offset(handle);
  return selectionText(exports, handle, [
    -offset,
    0,
    total - offset - 1,
    exports.restty_cols(handle) - 1,
  ]);
}

function lines(count: number, line: (index: number) => string): string {
  return Array.from({ length: count }, (_, index) => line(index)).join("\r\n");
}

describe("pinned core buffer text for explicit export", () => {
  it("covers retained scrollback and the screen in order", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(40, 5);
      write(
        core.exports,
        handle,
        lines(50, (index) => `line ${index}`),
      );
      const text = bufferText(core.exports, handle);
      expect(text.split("\n")).toEqual(
        Array.from({ length: 50 }, (_, index) => `line ${index}`),
      );
    } finally {
      core.destroyAll();
    }
  });

  it("keeps wide, combining and ZWJ graphemes and trims row padding", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(20, 6);
      write(core.exports, handle, "café\r\n日本語の端末\r\n👩‍💻 ok   ");
      expect(bufferText(core.exports, handle)).toBe(
        "café\n日本語の端末\n👩‍💻 ok\n\n\n",
      );
    } finally {
      core.destroyAll();
    }
  });

  it("reads only the alternate screen while it is active", async () => {
    const core = await loadCore();
    try {
      const handle = core.create(20, 3);
      write(
        core.exports,
        handle,
        lines(10, (index) => `primary ${index}`),
      );
      write(core.exports, handle, "\u001b[?1049h\u001b[Halternate view");
      expect(bufferText(core.exports, handle)).toBe("alternate view\n\n");
      write(core.exports, handle, "\u001b[?1049l");
      expect(bufferText(core.exports, handle)).toContain("primary 0");
    } finally {
      core.destroyAll();
    }
  });
});
