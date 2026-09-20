import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";

interface Core extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_set_pixel_size(handle: number, width: number, height: number): number;
  restty_resize(handle: number, cols: number, rows: number): number;
  restty_output_ptr(handle: number): number;
  restty_output_len(handle: number): number;
  restty_output_consume(handle: number, length: number): number;
}

it("reports negotiated in-band geometry on enable and resize, and stays silent when disabled", async () => {
  const bytes = await readFile(
    new URL("../../assets/restty/omxterm-restty-core.wasm", import.meta.url),
  );
  const { instance } = await WebAssembly.instantiate(Uint8Array.from(bytes), {
    env: { now_ms: () => performance.now(), log: () => undefined },
  });
  const core = instance.exports as Core;
  const handle = core.restty_create(80, 24, 10_000_000);
  const write = (text: string) => {
    const payload = new TextEncoder().encode(text);
    const pointer = core.restty_alloc(payload.length);
    try {
      new Uint8Array(core.memory.buffer, pointer, payload.length).set(payload);
      expect(core.restty_write(handle, pointer, payload.length)).toBe(0);
    } finally {
      core.restty_free(pointer, payload.length);
    }
  };
  const drain = () => {
    const length = core.restty_output_len(handle);
    const pointer = core.restty_output_ptr(handle);
    const reply = new TextDecoder().decode(
      new Uint8Array(core.memory.buffer, pointer, length),
    );
    core.restty_output_consume(handle, length);
    return reply;
  };
  try {
    core.restty_set_pixel_size(handle, 800, 480);
    write("\u001b[?2048h");
    expect(drain()).toBe("\u001b[48;24;80;480;800t");
    core.restty_set_pixel_size(handle, 720, 396);
    core.restty_resize(handle, 60, 18);
    expect(drain()).toBe("\u001b[48;18;60;396;720t");
    // Cell-size-only updates also matter, even when the grid is unchanged.
    core.restty_set_pixel_size(handle, 780, 432);
    core.restty_resize(handle, 60, 18);
    expect(drain()).toBe("\u001b[48;18;60;432;780t");
    write("\u001b[?2048l");
    core.restty_set_pixel_size(handle, 800, 480);
    core.restty_resize(handle, 80, 24);
    expect(drain()).toBe("");
    write("\u001b[?2048h\u001bc");
    drain();
    core.restty_resize(handle, 70, 20);
    expect(drain()).toBe("");
  } finally {
    core.restty_destroy(handle);
  }
});
