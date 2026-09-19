type ReadRange = (offset: number, length: number) => Promise<Buffer>;
interface Table {
  readonly offset: number;
  readonly length: number;
  target: number;
}

// Apple Color Emoji's sbix is not consumed by pinned Restty's atlas paths.
// Preserve every face and every other table; native Canvas still uses the
// unchanged installed font. No derivative is persisted or exposed as a font URL.
export async function readAppleEmojiShapingInput(
  read: ReadRange,
  size: number,
): Promise<Uint8Array | undefined> {
  const range: ReadRange = async (offset, length) => {
    if (offset < 0 || length < 0 || offset + length > size)
      throw new Error("the selected font has an out-of-range table");
    const bytes = await read(offset, length);
    if (bytes.length !== length)
      throw new Error("the selected font is truncated");
    return bytes;
  };
  const header = await range(0, 12);
  if (header.toString("ascii", 0, 4) !== "ttcf") return undefined;
  const version = header.readUInt32BE(4);
  if (version !== 0x10000 && version !== 0x20000)
    throw new Error("the selected font has an invalid collection version");
  const count = header.readUInt32BE(8);
  if (count < 1 || count > 64)
    throw new Error("the selected font has an invalid face count");
  const offsets = await range(12, count * 4);
  const faces = [];
  const tables = new Map<string, Table>();
  let outputSize = 12 + count * 4;
  let hasBitmap = false;
  for (let index = 0; index < count; index += 1) {
    const offset = offsets.readUInt32BE(index * 4);
    const faceHeader = await range(offset, 12);
    const n = faceHeader.readUInt16BE(4);
    if (n < 1 || n > 256)
      throw new Error("the selected font has an invalid table count");
    const directory = await range(offset + 12, n * 16);
    const entries = [];
    const tags = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const record = directory.subarray(i * 16, (i + 1) * 16);
      const tag = record.toString("ascii", 0, 4);
      const start = record.readUInt32BE(8);
      const length = record.readUInt32BE(12);
      if (start + length > size || tags.has(tag))
        throw new Error("the selected font has an invalid table directory");
      tags.add(tag);
      if (tag === "sbix") {
        hasBitmap = true;
        continue;
      }
      const key = `${start}:${length}`;
      if (!tables.has(key))
        tables.set(key, { offset: start, length, target: 0 });
      entries.push({ record, key });
    }
    if (!entries.length)
      throw new Error("the selected font has no shaping tables");
    faces.push({ faceHeader, entries, target: outputSize });
    outputSize += 12 + entries.length * 16;
  }
  if (!hasBitmap) return undefined;
  for (const table of tables.values()) {
    table.target = outputSize;
    outputSize += Math.ceil(table.length / 4) * 4;
  }
  // An unfamiliar layout is left intact instead of amplifying a small input.
  if (outputSize > size) return undefined;
  const result = Buffer.alloc(outputSize);
  result.write("ttcf");
  result.writeUInt32BE(0x10000, 4);
  result.writeUInt32BE(count, 8);
  for (const [index, face] of faces.entries()) {
    result.writeUInt32BE(face.target, 12 + index * 4);
    face.faceHeader.copy(result, face.target, 0, 4);
    const n = face.entries.length;
    const power = 2 ** Math.floor(Math.log2(n));
    result.writeUInt16BE(n, face.target + 4);
    result.writeUInt16BE(power * 16, face.target + 6);
    result.writeUInt16BE(Math.log2(power), face.target + 8);
    result.writeUInt16BE(n * 16 - power * 16, face.target + 10);
    for (const [i, entry] of face.entries.entries()) {
      const target = face.target + 12 + i * 16;
      entry.record.copy(result, target);
      result.writeUInt32BE(tables.get(entry.key)!.target, target + 8);
    }
  }
  for (const table of tables.values())
    (await range(table.offset, table.length)).copy(result, table.target);
  return result;
}
