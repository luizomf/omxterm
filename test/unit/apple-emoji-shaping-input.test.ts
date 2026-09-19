import { describe, expect, it } from "vitest";
import { readAppleEmojiShapingInput } from "../../src/main/apple-emoji-shaping-input";

// Synthetic two-face collection sharing a bitmap and a shaping table.
function collection(): Buffer {
  const data = Buffer.alloc(256);
  data.write("ttcf");
  data.writeUInt32BE(0x10000, 4);
  data.writeUInt32BE(2, 8);
  for (const [index, directory] of [20, 64].entries()) {
    data.writeUInt32BE(directory, 12 + index * 4);
    data.writeUInt32BE(0x10000, directory);
    data.writeUInt16BE(2, directory + 4);
    data.write("cmap", directory + 12);
    data.writeUInt32BE(112, directory + 20);
    data.writeUInt32BE(4, directory + 24);
    data.write("sbix", directory + 28);
    data.writeUInt32BE(128, directory + 36);
    data.writeUInt32BE(128, directory + 40);
  }
  data.write("test", 112);
  return data;
}

function reader(data: Buffer, bitmapForbidden = true) {
  return async (offset: number, length: number) => {
    if (bitmapForbidden && offset + length > 128)
      throw new Error("Bitmap read forbidden");
    if (offset + length > data.length) throw new Error("Truncated read");
    return data.subarray(offset, offset + length);
  };
}

describe("Apple emoji shaping input", () => {
  it("leaves non-collections and collections without bitmap tables unchanged", async () => {
    const single = Buffer.alloc(12);
    expect(
      await readAppleEmojiShapingInput(reader(single), single.length),
    ).toBeUndefined();
    const data = collection();
    for (const directory of [20, 64]) data.write("name", directory + 28);
    expect(
      await readAppleEmojiShapingInput(reader(data), data.length),
    ).toBeUndefined();
  });

  it.each(["count", "range", "duplicate", "truncated"])(
    "rejects malformed %s before bitmap reads",
    async (kind) => {
      const data = collection();
      if (kind === "count") data.writeUInt32BE(65, 8);
      if (kind === "range") data.writeUInt32BE(1000, 56);
      if (kind === "duplicate") data.write("cmap", 48);
      const read =
        kind === "truncated" ? async () => Buffer.alloc(0) : reader(data);
      await expect(
        readAppleEmojiShapingInput(read, data.length),
      ).rejects.toThrow();
    },
  );
  it("preserves both faces and shared shaping bytes without reading bitmap payload", async () => {
    const data = collection();
    const compact = await readAppleEmojiShapingInput(reader(data), data.length);
    expect(compact).toBeDefined();
    const result = Buffer.from(compact!);
    expect(result.length).toBe(80);
    expect(result.readUInt32BE(8)).toBe(2);
    for (const offset of [20, 48]) {
      expect(result.readUInt16BE(offset + 4)).toBe(1);
      expect(result.toString("ascii", offset + 12, offset + 16)).toBe("cmap");
      expect(result.readUInt32BE(offset + 20)).toBe(76);
    }
    expect(result.toString("ascii", 76)).toBe("test");
  });
});
