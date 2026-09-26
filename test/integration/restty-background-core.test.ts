import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

type Core = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_render_update(handle: number): number;
  restty_set_default_colors(
    handle: number,
    fg: number,
    bg: number,
    cursor: number,
  ): number;
  restty_cell_bg_rgba_ptr(handle: number): number;
  restty_cell_fg_rgba_ptr(handle: number): number;
};

it("retains explicit background identity through RGB matches, reverse-screen mode, erasure, reset and theme changes", async () => {
  const bytes = Uint8Array.from(
    await readFile(
      new URL("../../assets/restty/omxterm-restty-core.wasm", import.meta.url),
    ),
  );
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: { now_ms: () => performance.now(), log: () => {} },
  });
  const core = instance.exports as Core;
  const handle = core.restty_create(20, 4, 10_000_000);
  expect(handle).not.toBe(0);
  const write = (text: string) => {
    const encoded = new TextEncoder().encode(text);
    const ptr = core.restty_alloc(encoded.length);
    try {
      new Uint8Array(core.memory.buffer, ptr, encoded.length).set(encoded);
      expect(core.restty_write(handle, ptr, encoded.length)).toBe(0);
    } finally {
      core.restty_free(ptr, encoded.length);
    }
  };
  const backgrounds = (row = 0) => {
    expect(core.restty_render_update(handle)).toBe(0);
    const ptr = core.restty_cell_bg_rgba_ptr(handle);
    return [...new Uint8Array(core.memory.buffer, ptr + row * 20 * 4, 20 * 4)];
  };
  try {
    core.restty_set_default_colors(handle, 0xffffff, 0x123456, 0xffffff);
    write("A\u001b[48;2;18;52;86mB\u001b[49mC\u001b[44mD\u001b[0m");
    expect(backgrounds().slice(0, 12)).toEqual([
      0x12,
      0x34,
      0x56,
      0, // Implicit default.
      0x12,
      0x34,
      0x56,
      255, // Explicit equal-RGB truecolor.
      0x12,
      0x34,
      0x56,
      0, // SGR 49 restores implicit default.
    ]);
    expect(backgrounds()[15]).toBe(255); // Explicit palette background.
    write("\u001b[?5h"); // DECSCNM swaps core defaults, not the cell inverse flag.
    expect(backgrounds().slice(0, 12)).toEqual([
      255, 255, 255, 255, 0x12, 0x34, 0x56, 255, 255, 255, 255, 255,
    ]);
    expect([
      ...new Uint8Array(
        core.memory.buffer,
        core.restty_cell_fg_rgba_ptr(handle),
        4,
      ),
    ]).toEqual([0x12, 0x34, 0x56, 255]);
    write("\u001b[?5l");
    expect(backgrounds().slice(0, 4)).toEqual([0x12, 0x34, 0x56, 0]);
    write("\u001b[2;1H\u001b[48;2;18;52;86m\u001b[2K\u001b[0m");
    expect(backgrounds(1)[3]).toBe(255); // Background-color erase.
    core.restty_set_default_colors(handle, 0xffffff, 0x654321, 0xffffff);
    expect(backgrounds().slice(0, 8)).toEqual([
      0x65, 0x43, 0x21, 0, 0x12, 0x34, 0x56, 255,
    ]);
    write("\u001b[?1049h\u001b[H\u001b[48;2;101;67;33m \u001b[0m");
    expect(backgrounds()[3]).toBe(255);
    write("\u001b[?1049l");
    expect(backgrounds()[7]).toBe(255);
    write("\u001b[?5h");
    expect(backgrounds()[3]).toBe(255);
    write("\u001bc");
    expect(backgrounds()[3]).toBe(0);
  } finally {
    core.restty_destroy(handle);
  }
});
