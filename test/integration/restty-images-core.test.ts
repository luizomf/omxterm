import { readFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
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

interface PlacementDetail {
  readonly imageId: number;
  readonly format: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly data: Uint8Array;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly placementId: number;
}

// Field offsets follow Restty's extern KittyPlacementAbi.
function placementDetails(
  exports: CoreExports,
  handle: number,
): PlacementDetail[] {
  expect(exports.restty_render_update(handle)).toBe(0);
  const count = exports.restty_kitty_placement_count(handle);
  const pointer = exports.restty_kitty_placements_ptr(handle);
  const stride = exports.restty_kitty_placement_stride();
  const view = new DataView(exports.memory.buffer);
  return Array.from({ length: count }, (_, index) => {
    const offset = pointer + index * stride;
    const dataPointer = view.getUint32(offset + 16, true);
    const dataLength = view.getUint32(offset + 20, true);
    return {
      imageId: view.getUint32(offset, true),
      format: view.getUint8(offset + 4),
      imageWidth: view.getUint32(offset + 8, true),
      imageHeight: view.getUint32(offset + 12, true),
      data: new Uint8Array(
        exports.memory.buffer,
        dataPointer,
        dataLength,
      ).slice(),
      x: view.getInt32(offset + 24, true),
      y: view.getInt32(offset + 28, true),
      width: view.getUint32(offset + 36, true),
      height: view.getUint32(offset + 40, true),
      placementId: view.getUint32(offset + 68, true),
    };
  });
}

// Deterministic bytes that zlib cannot shrink, like a photo's pixels.
function noise(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = 0x2545_f491;
  for (let index = 0; index < length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
}

// kitten icat 0.47 (`WriteWithPayloadTo`): unpadded Base64 in 128 KiB chunks.
// The first chunk carries the metadata; every later chunk repeats only a=T
// and q, and the last one omits m.
function icatChunks(payload: Uint8Array, metadata: string): string[] {
  const encoded = Buffer.from(payload).toString("base64").replace(/=+$/u, "");
  const chunkSize = 128 * 1024;
  const chunks: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    const more = offset + chunkSize < encoded.length;
    const controls =
      offset === 0
        ? `a=T,q=2,${metadata}${more ? ",m=1" : ""}`
        : `a=T,q=2${more ? ",m=1" : ""}`;
    chunks.push(
      `\u001b_G${controls};${encoded.slice(offset, offset + chunkSize)}\u001b\\`,
    );
  }
  return chunks;
}

function placementImageIds(exports: CoreExports, handle: number): number[] {
  return placementSnapshots(exports, handle).map(({ imageId }) => imageId);
}

function placementSnapshots(
  exports: CoreExports,
  handle: number,
): Array<{ readonly imageId: number; readonly x: number; readonly y: number }> {
  expect(exports.restty_render_update(handle)).toBe(0);
  const count = exports.restty_kitty_placement_count(handle);
  const pointer = exports.restty_kitty_placements_ptr(handle);
  const stride = exports.restty_kitty_placement_stride();
  const view = new DataView(exports.memory.buffer);
  return Array.from({ length: count }, (_, index) => {
    const offset = pointer + index * stride;
    return {
      imageId: view.getUint32(offset, true),
      x: view.getInt32(offset + 24, true),
      y: view.getInt32(offset + 28, true),
    };
  });
}

function createCompressedSolidPng(
  width: number,
  height: number,
  bitDepth: 8 | 16 = 8,
): Uint8Array {
  const scanlines = new Uint8Array(((width * 4 * bitDepth) / 8 + 1) * height);
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([bitDepth, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    output.length - 4,
  );
  return output;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
  }
  return (crc ^ 0xffff_ffff) >>> 0;
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

  it("replaces a pending image with Chafa and Pi transmission starts", () => {
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=2,v=1,c=2,r=1,m=1,q=2,i=300\u001b\\",
    );
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=1,v=1,c=1,r=1,m=1,q=2,i=301\u001b\\",
    );
    write(core.exports, core.handle, "\u001b_Gm=1;/wAA/w==\u001b\\");
    write(core.exports, core.handle, "\u001b_Gm=0\u001b\\");
    expect(placementImageIds(core.exports, core.handle)).toEqual([301]);

    write(
      core.exports,
      core.handle,
      "\u001b_Ga=T,f=32,s=2,v=1,c=2,r=1,m=1,q=2,i=302;AAAA\u001b\\",
    );
    transmit(
      core.exports,
      core.handle,
      new Uint8Array([0, 255, 0, 255]),
      "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=303",
    );
    expect(placementImageIds(core.exports, core.handle)).toEqual([301, 303]);
    expect(core.exports.restty_debug_kitty_has_loading(core.handle)).toBe(0);
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

  it("rejects oversized PNG dimensions before decoded allocation", () => {
    const png = createCompressedSolidPng(4_000, 4_001);
    const beforeBytes = core.exports.memory.buffer.byteLength;
    transmit(core.exports, core.handle, png, "a=T,f=100,q=2,c=1,r=1,i=260");
    const growthBytes = core.exports.memory.buffer.byteLength - beforeBytes;

    expect(placementImageIds(core.exports, core.handle)).toEqual([]);
    expect(growthBytes).toBeLessThan(1_000_000);
  }, 120_000);

  // RGB reaches the pixel check. For RGBA the extra row also passes
  // 64,000,000 bytes, so the byte limit rejects it first.
  it.each([
    ["RGB", "f=24", 3],
    ["RGBA", "f=32", 4],
  ])(
    "accepts %s up to 16,000,000 source pixels and rejects one more row",
    (_label, format, bytesPerPixel) => {
      transmit(
        core.exports,
        core.handle,
        new Uint8Array(4_000 * 4_001 * bytesPerPixel),
        `a=T,${format},q=2,s=4000,v=4001,c=1,r=1,i=261`,
      );
      transmit(
        core.exports,
        core.handle,
        new Uint8Array(4_000 * 4_000 * bytesPerPixel),
        `a=T,${format},q=2,s=4000,v=4000,c=1,r=1,i=262`,
      );

      expect(placementImageIds(core.exports, core.handle)).toEqual([262]);
      expect(core.exports.restty_debug_kitty_total_bytes(core.handle)).toBe(
        4_000 * 4_000 * bytesPerPixel,
      );
    },
    120_000,
  );

  it.each([8, 16] as const)(
    "decodes a %i-bit PNG of 16,000,000 source pixels",
    (bitDepth) => {
      transmit(
        core.exports,
        core.handle,
        createCompressedSolidPng(4_000, 4_000, bitDepth),
        "a=T,f=100,q=2,c=1,r=1,i=262",
      );

      expect(placementImageIds(core.exports, core.handle)).toEqual([262]);
      expect(core.exports.restty_debug_kitty_total_bytes(core.handle)).toBe(
        64_000_000,
      );
    },
    120_000,
  );

  it("rejects direct encoded input above 64,000,000 bytes without blocking a later image", () => {
    transmit(
      core.exports,
      core.handle,
      createPaddedPng(64_000_001),
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

  it("keeps placements anchored while direct-session output scrolls", () => {
    transmit(
      core.exports,
      core.handle,
      new Uint8Array([0, 255, 0, 255]),
      "a=T,f=32,q=2,s=1,v=1,c=1,r=1,i=279",
    );
    const before = placementSnapshots(core.exports, core.handle);
    expect(before).toHaveLength(1);

    write(core.exports, core.handle, "\r\n".repeat(24));
    const after = placementSnapshots(core.exports, core.handle);
    expect(after).not.toEqual(before);
    expect(after).toEqual([]);
    expect(core.exports.restty_debug_kitty_image_count(core.handle)).toBe(1);
  });

  it("keeps two maximum-size images per screen and evicts the oldest", () => {
    expect(core.exports.restty_debug_kitty_total_limit(core.handle)).toBe(
      128_000_000,
    );
    const rgba = new Uint8Array(4_000 * 4_000 * 4);
    for (const id of [280, 281, 282]) {
      rgba[0] = id - 280;
      transmit(
        core.exports,
        core.handle,
        rgba,
        `a=T,f=32,q=2,s=4000,v=4000,c=1,r=1,i=${id}`,
      );
    }

    expect(core.exports.restty_debug_kitty_total_bytes(core.handle)).toBe(
      128_000_000,
    );
    expect(core.exports.restty_debug_kitty_image_count(core.handle)).toBe(2);
    expect(placementImageIds(core.exports, core.handle)).toEqual([281, 282]);
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

// Shapes emitted by kitten icat, timg, yazi and snacks.nvim.
describe("pinned Restty/Ghostty Kitty producer paths", () => {
  let core: Awaited<ReturnType<typeof loadCore>>;

  beforeEach(async () => {
    core = await loadCore();
  });

  afterEach(() => {
    core.exports.restty_destroy(core.handle);
  });

  it("completes kitten icat's chunked stream that repeats a=T on every chunk", () => {
    const rgb = noise(944 * 629 * 3);
    const chunks = icatChunks(deflateSync(rgb), "f=24,o=z,s=944,v=629");
    expect(chunks.length).toBeGreaterThan(10);
    expect(chunks.at(1)).toMatch(/^\u001b_Ga=T,q=2,m=1;/u);
    expect(chunks.at(-1)).toMatch(/^\u001b_Ga=T,q=2;/u);

    for (const chunk of chunks) write(core.exports, core.handle, chunk);

    expect(core.exports.restty_debug_kitty_has_loading(core.handle)).toBe(0);
    const [placement, ...others] = placementDetails(core.exports, core.handle);
    expect(others).toEqual([]);
    expect(placement).toMatchObject({ imageWidth: 944, imageHeight: 629 });
    expect(Buffer.from(placement!.data).equals(Buffer.from(rgb))).toBe(true);
  }, 120_000);

  it("completes icat's photo for a full-screen 3456-pixel-wide window", () => {
    const rgb = noise(3_456 * 2_592 * 3);
    const chunks = icatChunks(
      deflateSync(rgb, { level: 1 }),
      "f=24,o=z,s=3456,v=2592",
    );

    for (const chunk of chunks) write(core.exports, core.handle, chunk);

    const [placement, ...others] = placementDetails(core.exports, core.handle);
    expect(others).toEqual([]);
    expect(placement).toMatchObject({ imageWidth: 3_456, imageHeight: 2_592 });
    expect(Buffer.from(placement!.data).equals(Buffer.from(rgb))).toBe(true);
  }, 120_000);

  it("still replaces a pending icat stream when a new image starts", () => {
    const [first, second] = icatChunks(
      deflateSync(noise(400 * 400 * 3)),
      "f=24,o=z,s=400,v=400,i=310",
    );
    write(core.exports, core.handle, first!);
    write(core.exports, core.handle, second!);
    expect(core.exports.restty_debug_kitty_has_loading(core.handle)).toBe(1);

    for (const chunk of icatChunks(
      new Uint8Array([9, 8, 7]),
      "f=24,s=1,v=1,c=1,r=1,i=311",
    ))
      write(core.exports, core.handle, chunk);

    expect(core.exports.restty_debug_kitty_has_loading(core.handle)).toBe(0);
    expect(placementImageIds(core.exports, core.handle)).toEqual([311]);
  });

  it.each([
    ["RGB", "f=24", 3],
    ["zlib RGB", "f=24,o=z", 3],
    ["zlib RGBA", "f=32,o=z", 4],
  ])("stores and places %s pixels unchanged", (_label, format, channels) => {
    const pixels = noise(3 * 2 * channels);
    const payload = format.endsWith("o=z") ? deflateSync(pixels) : pixels;
    transmit(
      core.exports,
      core.handle,
      payload,
      `a=T,${format},q=2,s=3,v=2,c=3,r=1,i=320`,
    );

    const [placement] = placementDetails(core.exports, core.handle);
    expect(placement).toMatchObject({
      imageId: 320,
      imageWidth: 3,
      imageHeight: 2,
      width: 30,
      height: 20,
    });
    expect(Buffer.from(placement!.data).equals(Buffer.from(pixels))).toBe(true);
  });

  it("places an image again under separate placement IDs", () => {
    transmit(
      core.exports,
      core.handle,
      new Uint8Array([1, 2, 3, 255]),
      "a=t,f=32,q=2,s=1,v=1,i=330",
    );
    expect(placementDetails(core.exports, core.handle)).toEqual([]);

    write(
      core.exports,
      core.handle,
      "\u001b_Ga=p,i=330,p=1,c=2,r=1,q=2\u001b\\",
    );
    write(core.exports, core.handle, "\u001b[5;10H");
    write(
      core.exports,
      core.handle,
      "\u001b_Ga=p,i=330,p=2,c=1,r=1,q=2\u001b\\",
    );
    const pick = ({ imageId, placementId, x, y }: PlacementDetail) => ({
      imageId,
      placementId,
      x,
      y,
    });
    expect(placementDetails(core.exports, core.handle).map(pick)).toEqual([
      { imageId: 330, placementId: 1, x: 0, y: 0 },
      { imageId: 330, placementId: 2, x: 9, y: 4 },
    ]);

    // Placing an existing placement ID moves it instead of adding another.
    write(core.exports, core.handle, "\u001b[10;20H");
    write(core.exports, core.handle, "\u001b_Ga=p,i=330,p=1,q=2\u001b\\");
    expect(
      placementDetails(core.exports, core.handle)
        .map(pick)
        .sort((a, b) => a.placementId - b.placementId),
    ).toEqual([
      { imageId: 330, placementId: 1, x: 19, y: 9 },
      { imageId: 330, placementId: 2, x: 9, y: 4 },
    ]);

    write(core.exports, core.handle, "\u001b_Ga=d,d=i,i=330,p=1,q=2\u001b\\");
    expect(placementDetails(core.exports, core.handle).map(pick)).toEqual([
      { imageId: 330, placementId: 2, x: 9, y: 4 },
    ]);
  });

  it.each([
    // Two diacritics give row and column; the foreground color is the image ID.
    ["two diacritics", 7, "\u001b[38;5;7m", "\u0305"],
    // A third diacritic carries the image ID's most significant byte.
    ["three diacritics", (2 << 24) | 7, "\u001b[38;5;7m", "\u0305\u030e"],
  ])(
    "places Unicode placeholders with %s",
    (_label, imageId, color, firstCellSuffix) => {
      transmit(
        core.exports,
        core.handle,
        new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]),
        `a=T,U=1,f=32,q=2,s=2,v=1,c=2,r=1,i=${imageId}`,
      );
      expect(placementDetails(core.exports, core.handle)).toEqual([]);

      // Row 0 / column 0, then row 0 / column 1.
      write(
        core.exports,
        core.handle,
        `\u001b[3;4H${color}\u{10eeee}\u0305${firstCellSuffix}\u{10eeee}\u0305\u030d\u001b[39m`,
      );
      const [placement, ...others] = placementDetails(
        core.exports,
        core.handle,
      );
      expect(others).toEqual([]);
      expect(placement).toMatchObject({
        imageId,
        imageWidth: 2,
        imageHeight: 1,
        x: 3,
        y: 2,
      });
    },
  );
});
