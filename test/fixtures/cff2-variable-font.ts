// A minimal OpenType CFF2 variable font with one weight axis, shaped like the
// Noto Sans CJK VF faces Fedora installs. Glyph 1 is a horizontal bar from
// (100, 400) to (900, 400 + thickness): 30 units at the axis minimum, growing
// by 200 units at its maximum through one CFF2 blend region.
export function cff2VariableFont(defaultWeight: number): Uint8Array {
  return sfnt([
    ["CFF2", cff2Table()],
    ["fvar", fvarTable(defaultWeight)],
  ]);
}

function cff2Table(): Uint8Array {
  // 100 400 rmoveto; 30 200 1 blend vlineto; 800 hlineto; -30 -200 1 blend vlineto
  const glyph = [239, 248, 36, 21, 169, 247, 92, 140, 16, 7, 249, 180, 6];
  glyph.push(109, 251, 92, 140, 16, 7);
  const vstore = [
    ...u16(30), // CFF2 length prefix of the ItemVariationStore below
    ...u16(1), // format
    ...u32(12), // VariationRegionList offset
    ...u16(1), // ItemVariationData count
    ...u32(22), // ItemVariationData offset
    ...u16(1), // axisCount
    ...u16(1), // regionCount
    ...[0, 0, 0x40, 0, 0x40, 0], // region: start 0, peak 1, end 1
    ...u16(0), // itemCount
    ...u16(0), // wordDeltaCount
    ...u16(1), // regionIndexCount
    ...u16(0), // regionIndexes
  ];
  const header = 5;
  const topDictLength = 19;
  const vstoreOffset = header + topDictLength + 4;
  const charStringsOffset = vstoreOffset + vstore.length;
  const charStrings = [...u32(2), 1, 1, 1, 1 + glyph.length, ...glyph];
  const fdArrayOffset = charStringsOffset + charStrings.length;
  const fdDict = [...int32(0), ...int32(fdArrayOffset + 18), 18];
  const fdArray = [...u32(1), 1, 1, 1 + fdDict.length, ...fdDict];
  const topDict = [
    ...int32(charStringsOffset),
    17,
    ...int32(fdArrayOffset),
    12,
    36,
    ...int32(vstoreOffset),
    24,
  ];
  if (topDict.length !== topDictLength) throw new Error("Top DICT size");
  return Uint8Array.from([
    ...[2, 0, header, ...u16(topDictLength)],
    ...topDict,
    ...u32(0), // empty Global Subr INDEX
    ...vstore,
    ...charStrings,
    ...fdArray,
  ]);
}

function fvarTable(defaultWeight: number): Uint8Array {
  return Uint8Array.from([
    ...[...u16(1), ...u16(0), ...u16(16), ...u16(2)],
    ...[...u16(1), ...u16(20), ...u16(0), ...u16(8)],
    ...[0x77, 0x67, 0x68, 0x74], // wght
    ...u32(100 * 65536),
    ...u32(defaultWeight * 65536),
    ...u32(900 * 65536),
    ...[...u16(0), ...u16(256)],
  ]);
}

function sfnt(tables: readonly [string, Uint8Array][]): Uint8Array {
  let offset = 12 + tables.length * 16;
  const directory = [0x4f, 0x54, 0x54, 0x4f, ...u16(tables.length)];
  directory.push(...u16(0), ...u16(0), ...u16(0));
  const bodies: number[] = [];
  for (const [tag, table] of tables) {
    directory.push(...[...tag].map((character) => character.charCodeAt(0)));
    directory.push(...u32(0), ...u32(offset), ...u32(table.length));
    const padded = (table.length + 3) & ~3;
    bodies.push(...table, ...new Array<number>(padded - table.length).fill(0));
    offset += padded;
  }
  return Uint8Array.from([...directory, ...bodies]);
}

function u16(value: number): number[] {
  return [(value >>> 8) & 255, value & 255];
}

function u32(value: number): number[] {
  return [...u16(value >>> 16), ...u16(value & 0xffff)];
}

// CFF DICT operand: 29 followed by a 32-bit integer.
function int32(value: number): number[] {
  return [29, ...u32(value)];
}
