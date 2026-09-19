import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Font } from "text-shaper";
import { expect, it } from "vitest";
import { readInstalledFontFace } from "../../src/main/installed-font-family";

it("validates compact shaping bytes through the installed-font boundary without modifying its source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-emoji-input-"));
  try {
    // Redistributable font plus synthetic bitmap bytes, never an Apple asset.
    const ttf = await readFile("assets/fonts/FiraCodeNerdFontMono-Regular.ttf");
    const n = ttf.readUInt16BE(4);
    const end = 12 + n * 16;
    const source = Buffer.alloc(ttf.length + 32 + 4096);
    source.write("ttcf");
    source.writeUInt32BE(0x10000, 4);
    source.writeUInt32BE(1, 8);
    source.writeUInt32BE(16, 12);
    ttf.copy(source, 16, 0, end);
    source.writeUInt16BE(n + 1, 20);
    for (let i = 0; i < n; i += 1)
      source.writeUInt32BE(ttf.readUInt32BE(20 + i * 16) + 32, 36 + i * 16);
    source.write("sbix", end + 16);
    source.writeUInt32BE(ttf.length + 32, end + 24);
    source.writeUInt32BE(4096, end + 28);
    ttf.copy(source, end + 32, end);
    const file = path.join(root, "synthetic.ttc");
    await writeFile(file, source);
    const face = {
      family: "Apple Color Emoji",
      postScriptName: "FiraCodeNFM-Reg",
      path: file,
      cellWidth: 10,
      cellHeight: 16,
    };
    const compact = await readInstalledFontFace(face);
    expect(compact.byteLength).toBeLessThan(source.length - 4000);
    const font = Font.collection(new Uint8Array(compact).buffer)!.get(0);
    expect(font.glyphIdForChar("A")).toBeGreaterThan(0);
    expect(font.unitsPerEm).toBe(1950);
    expect((await readFile(file)).equals(source)).toBe(true);
    expect(
      Buffer.from(
        await readInstalledFontFace({
          ...face,
          family: "FiraCode Nerd Font Mono",
        }),
      ).equals(source),
    ).toBe(true);
    await expect(
      readInstalledFontFace({ ...face, postScriptName: "not-the-font" }),
    ).rejects.toThrow("no exact regular family face");
    await expect(readInstalledFontFace(face, 10)).rejects.toThrow("byte limit");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
