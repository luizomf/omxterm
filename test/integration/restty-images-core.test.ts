import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPaddedPng,
  createUncompressedPng,
  PI_PHOTON_PNG_BASE64_CHARACTERS,
  PI_PHOTON_PNG_BYTES,
} from "../fixtures/kitty-image-data";

const corePath = path.resolve(
  import.meta.dirname,
  "../../assets/restty/omxterm-restty-core.wasm",
);
const encoder = new TextEncoder();

interface CoreExports extends WebAssembly.Exports {
  readonly memory: WebAssembly.Memory;
  restty_create(cols: number, rows: number, maxBytes: number): number;
  restty_destroy(handle: number): void;
  restty_alloc(length: number): number;
  restty_free(pointer: number, length: number): void;
  restty_write(handle: number, pointer: number, length: number): number;
  restty_set_pixel_size(handle: number, width: number, height: number): number;
  restty_render_update(handle: number): number;
  restty_kitty_placement_count(handle: number): number;
  restty_kitty_placements_ptr(handle: number): number;
  restty_kitty_placement_stride(): number;
  restty_debug_kitty_image_count(handle: number): number;
  restty_debug_kitty_total_bytes(handle: number): number;
  restty_debug_kitty_total_limit(handle: number): number;
  restty_debug_kitty_has_loading(handle: number): number;
}

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
  expect(exports.restty_set_pixel_size(handle, 800, 480)).toBe(0);
  return { exports, handle };
}

function write(exports: CoreExports, handle: number, value: string): void {
  const bytes = encoder.encode(value);
  const pointer = exports.restty_alloc(bytes.length);
  if (!pointer) throw new Error("actual Restty core allocation failed");
  try {
    new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes);
    expect(exports.restty_write(handle, pointer, bytes.length)).toBe(0);
  } finally {
    exports.restty_free(pointer, bytes.length);
  }
}

function placementImageIds(exports: CoreExports, handle: number): number[] {
  expect(exports.restty_render_update(handle)).toBe(0);
  const count = exports.restty_kitty_placement_count(handle);
  const pointer = exports.restty_kitty_placements_ptr(handle);
  const stride = exports.restty_kitty_placement_stride();
  const view = new DataView(exports.memory.buffer);
  return Array.from({ length: count }, (_, index) =>
    view.getUint32(pointer + index * stride, true),
  );
}

function transmit(
  exports: CoreExports,
  handle: number,
  bytes: Uint8Array,
  metadata: string,
): void {
  const encoded = Buffer.from(bytes).toString("base64");
  for (let offset = 0; offset < encoded.length; offset += 4_096) {
    const last = offset + 4_096 >= encoded.length;
    const controls =
      offset === 0 ? `${metadata}${last ? "" : ",m=1"}` : `m=${last ? 0 : 1}`;
    write(
      exports,
      handle,
      `\u001b_G${controls};${encoded.slice(offset, offset + 4_096)}\u001b\\`,
    );
  }
}

describe("pinned Restty/Ghostty inline images", () => {
  let core: Awaited<ReturnType<typeof loadCore>>;

  beforeEach(async () => {
    core = await loadCore();
  });

  afterEach(() => {
    core.exports.restty_destroy(core.handle);
  });

  it("replaces one pending anonymous Chafa prelude with the next prelude", () => {
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=2,v=1,c=2,r=1,m=1,q=2\u001b\\",
    );
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=1,v=1,c=1,r=1,m=1,q=2\u001b\\",
    );
    write(core.exports, core.handle, "\u001b_Gm=1;/wAA/w==\u001b\\");
    write(core.exports, core.handle, "\u001b_Gm=0\u001b\\");

    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(1);
  });

  it.each([
    ["malformed Base64", "\u001b_Gm=0;%%%\u001b\\"],
    ["cancelled APC", "\u001b_Gm=1;AAAA\u0018"],
  ])("recovers from a %s pending transmission", (_label, rejected) => {
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=2,v=1,c=2,r=1,m=1,q=2\u001b\\",
    );
    write(core.exports, core.handle, rejected);
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=1,v=1,c=1,r=1,m=0,q=2;/wAA/w==\u001b\\later",
    );

    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(1);
  });

  it("rejects a source above 4,194,304 pixels without blocking a later image", () => {
    transmit(
      core.exports,
      core.handle,
      new Uint8Array(2_049 * 2_048 * 4),
      "a=T,f=32,q=2,s=2049,v=2048,c=1,r=1,i=261",
    );
    transmit(
      core.exports,
      core.handle,
      new Uint8Array([0, 255, 0, 255]),
      "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=262",
    );

    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(1);
  }, 120_000);

  it("rejects direct encoded input above 32 MiB without blocking a later image", () => {
    transmit(
      core.exports,
      core.handle,
      createPaddedPng(33_554_433),
      "a=T,f=100,q=2,c=1,r=1,i=263",
    );
    transmit(
      core.exports,
      core.handle,
      new Uint8Array([0, 0, 255, 255]),
      "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=264",
    );

    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(1);
  }, 120_000);

  it("releases alternate-screen image resources when returning to the primary screen", () => {
    write(core.exports, core.handle, "\u001b[?1049h");
    transmit(
      core.exports,
      core.handle,
      new Uint8Array([255, 0, 255, 255]),
      "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=265",
    );
    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(1);

    write(core.exports, core.handle, "\u001b[?1049l\u001b[?1049h");
    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(0);
  });

  it("preserves Pi deletion forms and reset cleanup", () => {
    for (const id of [270, 271])
      transmit(
        core.exports,
        core.handle,
        new Uint8Array([id - 270, 0, 0, 255]),
        `a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=${id}`,
      );
    expect(placementImageIds(core.exports, core.handle)).toEqual([270, 271]);

    write(core.exports, core.handle, "\u001b_Ga=d,d=I,i=270,q=2\u001b\\");
    expect(placementImageIds(core.exports, core.handle)).toEqual([271]);
    write(core.exports, core.handle, "\u001b_Ga=d,d=a,q=2\u001b\\");
    expect(placementImageIds(core.exports, core.handle)).toEqual([]);
    expect(core.exports.restty_debug_kitty_image_count(core.handle)).toBe(1);
    write(core.exports, core.handle, "\u001b_Ga=d,d=A,q=2\u001b\\");
    expect(core.exports.restty_debug_kitty_image_count(core.handle)).toBe(0);

    transmit(
      core.exports,
      core.handle,
      new Uint8Array([1, 2, 3, 255]),
      "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=272",
    );
    write(core.exports, core.handle, "\u001bc");
    expect(placementImageIds(core.exports, core.handle)).toEqual([]);
    expect(core.exports.restty_debug_kitty_total_bytes(core.handle)).toBe(0);
  });

  it("accounts decoded bytes against 64,000,000 bytes and evicts oldest images", () => {
    expect(core.exports.restty_debug_kitty_total_limit(core.handle)).toBe(
      64_000_000,
    );
    const rgba = new Uint8Array(2_000 * 2_000 * 4);
    for (const id of [280, 281, 282, 283, 284]) {
      rgba[0] = id - 280;
      transmit(
        core.exports,
        core.handle,
        rgba,
        `a=T,f=32,q=2,s=2000,v=2000,c=1,r=1,i=${id}`,
      );
    }

    expect(core.exports.restty_debug_kitty_total_bytes(core.handle)).toBe(
      64_000_000,
    );
    expect(core.exports.restty_debug_kitty_image_count(core.handle)).toBe(4);
    expect(placementImageIds(core.exports, core.handle)).toEqual([
      281, 282, 283, 284,
    ]);
  }, 120_000);

  it.each([
    ["missing dimensions", "a=T,f=32,q=2,i=290", new Uint8Array([1, 2, 3, 4])],
    ["short RGBA", "a=T,f=32,q=2,s=2,v=1,i=291", new Uint8Array(4)],
    ["long RGBA", "a=T,f=32,q=2,s=1,v=1,i=292", new Uint8Array(8)],
    ["malformed PNG", "a=T,f=100,q=2,i=293", new Uint8Array([1, 2, 3, 4])],
  ])(
    "rejects %s and accepts following text and image",
    (_label, metadata, bytes) => {
      transmit(core.exports, core.handle, bytes, metadata);
      write(core.exports, core.handle, "later text");
      transmit(
        core.exports,
        core.handle,
        new Uint8Array([4, 3, 2, 255]),
        "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=299",
      );
      expect(placementImageIds(core.exports, core.handle)).toEqual([299]);
      expect(core.exports.restty_debug_kitty_has_loading(core.handle)).toBe(0);
    },
  );

  it("stores and places the Pi 2000-by-2000 PNG above the original 10 MB core limit", () => {
    const png = createUncompressedPng(2_000, 2_000, 0x2272_2722);
    expect(png).toHaveLength(PI_PHOTON_PNG_BYTES);
    expect(Buffer.from(png).toString("base64")).toHaveLength(
      PI_PHOTON_PNG_BASE64_CHARACTERS,
    );

    transmit(core.exports, core.handle, png, "a=T,f=100,q=2,c=4,r=3,i=260");
    expect(core.exports.restty_render_update(core.handle)).toBe(0);
    expect(core.exports.restty_kitty_placement_count(core.handle)).toBe(1);
  }, 120_000);
});
