// Assemble a test TTC from licensed standalone SFNT inputs. Table offsets in a
// collection are absolute; no outline or naming data is changed.
export function fontCollection(inputs: readonly Uint8Array[]): Uint8Array {
  const headerSize = 12 + inputs.length * 4;
  const sizes = inputs.map((input) => (input.byteLength + 3) & ~3);
  const bytes = new Uint8Array(
    headerSize + sizes.reduce((sum, size) => sum + size, 0),
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x74746366);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, inputs.length);
  let offset = headerSize;
  inputs.forEach((input, index) => {
    view.setUint32(12 + index * 4, offset);
    bytes.set(input, offset);
    const count = view.getUint16(offset + 4);
    for (let table = 0; table < count; table++) {
      const pointer = offset + 12 + table * 16 + 8;
      view.setUint32(pointer, view.getUint32(pointer) + offset);
    }
    offset += sizes[index]!;
  });
  return bytes;
}
