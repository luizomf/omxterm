import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const corePath = path.resolve(
  import.meta.dirname,
  "../../assets/restty/omxterm-restty-core.wasm",
);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

type CoreExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_event_ptr(handle: number): number;
  restty_event_len(handle: number): number;
  restty_event_consume(handle: number, length: number): number;
  restty_output_len(handle: number): number;
};

type ParsedEvent =
  | { readonly type: "title"; readonly title: string }
  | { readonly type: "title-overlong" }
  | { readonly type: "bell" };

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
  const handle = exports.restty_create(80, 24, 10_000_000);
  if (!handle) throw new Error("actual Restty core creation failed");
  return { exports, handle };
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

function drainEvents(exports: CoreExports, handle: number): ParsedEvent[] {
  const length = exports.restty_event_len(handle);
  if (length === 0) return [];
  const pointer = exports.restty_event_ptr(handle);
  const bytes = Uint8Array.from(
    new Uint8Array(exports.memory.buffer, pointer, length),
  );
  expect(exports.restty_event_consume(handle, length)).toBe(0);
  const events: ParsedEvent[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const kind = bytes[offset++]!;
    if (kind === 1) {
      events.push({ type: "bell" });
      continue;
    }
    if (kind === 3) {
      events.push({ type: "title-overlong" });
      continue;
    }
    if (kind !== 2 || offset + 4 > bytes.length)
      throw new Error("invalid parsed-event fixture bytes");
    const size = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    ).getUint32(0, true);
    offset += 4;
    events.push({
      type: "title",
      title: decoder.decode(bytes.subarray(offset, offset + size)),
    });
    offset += size;
  }
  return events;
}

describe("pinned Restty/Ghostty parsed title and bell events", () => {
  let core: Awaited<ReturnType<typeof loadCore>>;

  beforeEach(async () => {
    core = await loadCore();
  });

  afterEach(() => {
    core.exports.restty_destroy(core.handle);
  });

  it("emits OSC 0 and OSC 2 titles once across every byte boundary", () => {
    for (const [sequence, title] of [
      ["\u001b]0;split BEL title\u0007", "split BEL title"],
      ["\u001b]2;split ST title\u001b\\", "split ST title"],
    ] as const) {
      const bytes = [...sequence];
      for (let boundary = 1; boundary < bytes.length; boundary += 1) {
        write(core.exports, core.handle, bytes.slice(0, boundary).join(""));
        write(core.exports, core.handle, bytes.slice(boundary).join(""));
        expect(drainEvents(core.exports, core.handle)).toEqual([
          { type: "title", title },
        ]);
      }
    }
  });

  it("distinguishes plain BEL from OSC terminators and cancelled controls", () => {
    write(core.exports, core.handle, "\u0007");
    write(core.exports, core.handle, "\u001b]0;title\u0007");
    write(core.exports, core.handle, "\u001b]2;cancelled-can\u0018");
    write(core.exports, core.handle, "\u001b]0;cancelled-sub\u001a");
    write(core.exports, core.handle, "\u001b]malformed\u0007");

    expect(drainEvents(core.exports, core.handle)).toEqual([
      { type: "bell" },
      { type: "title", title: "title" },
    ]);
  });

  it("preserves raw over-limit evidence before host sanitization", () => {
    write(
      core.exports,
      core.handle,
      `\u001b]0;${"🙂".repeat(256)}\u202e\u0007`,
    );
    write(core.exports, core.handle, `\u001b]2;${"x".repeat(257)}\u0007`);
    write(core.exports, core.handle, `\u001b]0;${"y".repeat(3_000)}\u0007`);
    write(core.exports, core.handle, `\u001b]2;\ufeff${"z".repeat(256)}\u0007`);

    expect(drainEvents(core.exports, core.handle)).toEqual([
      { type: "title-overlong" },
      { type: "title", title: "x".repeat(257) },
      { type: "title", title: "x".repeat(257) },
      { type: "title", title: `\ufeff${"z".repeat(256)}` },
    ]);
  });

  it("does not answer title report queries", () => {
    write(core.exports, core.handle, "\u001b[20t\u001b[21t");

    expect(core.exports.restty_output_len(core.handle)).toBe(0);
    expect(drainEvents(core.exports, core.handle)).toEqual([]);
  });
});
