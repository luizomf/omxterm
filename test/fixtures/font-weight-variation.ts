// Add a default weight axis to the licensed DejaVu fixture. Reuse its optional
// FFTM directory entry; outline bytes remain the ordinary regular face.
export function fontWeightVariation(source: Uint8Array): Uint8Array {
  const offset = (source.byteLength + 3) & ~3;
  const bytes = new Uint8Array(offset + 36);
  bytes.set(source);
  const view = new DataView(bytes.buffer);
  let entry: number | undefined;
  for (let index = 0; index < view.getUint16(4); index++) {
    const position = 12 + index * 16;
    if (view.getUint32(position) === 0x4646544d) entry = position;
  }
  if (entry === undefined) throw new Error("Missing optional test font table");
  view.setUint32(entry, 0x66766172);
  view.setUint32(entry + 4, 0);
  view.setUint32(entry + 8, offset);
  view.setUint32(entry + 12, 36);
  view.setUint16(offset, 1);
  view.setUint16(offset + 4, 16);
  view.setUint16(offset + 6, 2);
  view.setUint16(offset + 8, 1);
  view.setUint16(offset + 10, 20);
  view.setUint16(offset + 14, 8);
  view.setUint32(offset + 16, 0x77676874);
  view.setInt32(offset + 20, 100 * 65536);
  view.setInt32(offset + 24, 400 * 65536);
  view.setInt32(offset + 28, 900 * 65536);
  view.setUint16(offset + 34, 256);
  return bytes;
}
