// Experiment only: rebuild every TTC face, preserving shared tables except sbix.
// Never install or distribute the resulting proprietary derivative.
export function compactCollection(source) {
  if (source.toString("ascii", 0, 4) !== "ttcf")
    throw new Error("Expected a TrueType collection");
  const count = source.readUInt32BE(8);
  if (count < 1 || count > 64) throw new Error("Invalid face count");
  const faces = [];
  const tables = new Map();
  let size = 12 + count * 4;
  for (let index = 0; index < count; index += 1) {
    const offset = source.readUInt32BE(12 + index * 4);
    const entries = [];
    const tableCount = source.readUInt16BE(offset + 4);
    if (tableCount > 256) throw new Error("Invalid table count");
    for (let table = 0; table < tableCount; table += 1) {
      const record = offset + 12 + table * 16;
      const tag = source.toString("ascii", record, record + 4);
      const start = source.readUInt32BE(record + 8);
      const length = source.readUInt32BE(record + 12);
      if (start + length > source.length) throw new Error("Truncated table");
      if (tag === "sbix") continue;
      const key = `${start}:${length}`;
      if (!tables.has(key)) tables.set(key, { start, length });
      entries.push({ record, key });
    }
    faces.push({ offset, entries, target: size });
    size += 12 + entries.length * 16;
  }
  for (const table of tables.values()) {
    table.target = size;
    size += (table.length + 3) & ~3;
  }
  const result = Buffer.alloc(size);
  result.write("ttcf");
  result.writeUInt32BE(0x00010000, 4);
  result.writeUInt32BE(count, 8);
  for (const [index, face] of faces.entries()) {
    result.writeUInt32BE(face.target, 12 + index * 4);
    source.copy(result, face.target, face.offset, face.offset + 4);
    const n = face.entries.length;
    const power = 2 ** Math.floor(Math.log2(n));
    result.writeUInt16BE(n, face.target + 4);
    result.writeUInt16BE(power * 16, face.target + 6);
    result.writeUInt16BE(Math.log2(power), face.target + 8);
    result.writeUInt16BE(n * 16 - power * 16, face.target + 10);
    for (const [i, entry] of face.entries.entries()) {
      const target = face.target + 12 + i * 16;
      source.copy(result, target, entry.record, entry.record + 16);
      result.writeUInt32BE(tables.get(entry.key).target, target + 8);
    }
  }
  for (const table of tables.values())
    source.copy(result, table.target, table.start, table.start + table.length);
  return result;
}
