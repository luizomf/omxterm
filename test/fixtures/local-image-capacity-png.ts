import { deflateSync } from "node:zlib";

export function capacityPng(
  width: number,
  height: number,
  noisyFraction = 0,
  encodedBytes?: number,
  animated = false,
): Buffer {
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  let seed = 0x494;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = y * stride + 1 + x * 3;
      if (x < width * noisyFraction) {
        for (let channel = 0; channel < 3; channel += 1) {
          seed ^= seed << 13;
          seed ^= seed >>> 17;
          seed ^= seed << 5;
          pixels[offset + channel] = seed & 255;
        }
      } else pixels[offset + 1] = 230;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const parts = [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
  ];
  if (animated)
    parts.push(chunk("acTL", Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])));
  parts.push(chunk("IDAT", deflateSync(pixels, { level: 1 })));
  const length = parts.reduce((sum, part) => sum + part.length, 0) + 12;
  if (encodedBytes !== undefined) {
    if (encodedBytes < length + 12)
      throw new Error("Synthetic PNG exceeds selected encoded size");
    // Valid unknown ancillary chunk accounts for the small size remainder; the
    // noisy IDAT itself supplies the representative expensive encoded payload.
    parts.push(chunk("paDd", Buffer.alloc(encodedBytes - length - 12)));
  }
  parts.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
function chunk(type: string, data: Buffer): Buffer {
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  result.write(type, 4, "ascii");
  data.copy(result, 8);
  let crc = 0xffffffff;
  for (const byte of result.subarray(4, -4))
    crc = table[(crc ^ byte) & 255]! ^ (crc >>> 8);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
