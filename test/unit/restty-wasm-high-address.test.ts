import { describe, expect, it } from "vitest";
import { loadResttyWasm } from "restty/internal";

const twoGiB = 2 ** 31;
const wasmPage = 64 * 1024;

// The core's allocator never returns memory, so a window that once held many
// large images keeps handing out addresses past 2 GiB. Growing the memory
// directly puts every fresh allocation there without decoding gigabytes.
describe("prepared Restty core above 2 GiB", () => {
  it("keeps writes, replies, render state and text reads working", async () => {
    const wasm = await loadResttyWasm();
    wasm.memory.grow((twoGiB - wasm.memory.buffer.byteLength) / wasmPage + 64);
    const probe = wasm.exports.restty_alloc(1 << 20) >>> 0;
    expect(probe).toBeGreaterThanOrEqual(twoGiB);
    wasm.exports.restty_free(probe, 1 << 20);

    const handle = wasm.create(120, 40, 10_000_000);
    expect(handle).not.toBe(0);
    for (const size of [1, 4_000, 16_000, 65_536, 200_000])
      wasm.write(handle, `${"x".repeat(size - 1)}\n`);
    wasm.write(handle, "\u001b[c");
    expect(wasm.drainOutput(handle)).toMatch(/^\u001b\[\?[\d;]+c$/u);

    wasm.renderUpdate(handle);
    expect(wasm.getRenderState(handle)?.rows).toBe(40);
    wasm.resize(handle, 160, 50);
    wasm.renderUpdate(handle);
    expect(wasm.getRenderState(handle)?.rows).toBe(50);

    wasm.write(handle, "\r\nfind me");
    expect(wasm.getSelectionText(handle, 49, 0, 49, 6)).toBe("find me");
    wasm.setSearchQuery(handle, "find me");
    wasm.stepSearch(handle, 100_000);
    expect(wasm.getSearchStatus(handle).active).toBe(true);
  }, 20_000);
});
