import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

export const KITTY_SIZE_LIMIT = 33_554_432;
export const KITTY_ENCODED_LIMIT = Math.ceil((KITTY_SIZE_LIMIT * 4) / 3);
export const LARGEST_PADDED_BASE64 = 4 * Math.floor(KITTY_ENCODED_LIMIT / 4);
export const PI_PHOTON_PNG_BYTES = 16_003_288;
export const PI_PHOTON_PNG_BASE64_CHARACTERS = 21_337_720;
const KITTY_CHUNK_CHARACTERS = 4_096;
const OUTPUTS_PER_TASK = 64;

export interface KittyPlacement {
  readonly columns?: number;
  readonly cursorMovement?: 1;
  readonly id: number;
  readonly rows?: number;
}

export function kittyDelete(selector: "I", id: number): string;
export function kittyDelete(selector: "A" | "a"): string;
export function kittyDelete(selector: "A" | "I" | "a", id?: number): string {
  return `\u001b_Ga=d,d=${selector}${id === undefined ? "" : `,i=${id}`},q=2\u001b\\`;
}

export function kittyTransmission(
  bytes: Uint8Array,
  placement: KittyPlacement,
): string {
  const encoded = bytesToBase64(bytes);
  if (encoded.length > KITTY_CHUNK_CHARACTERS)
    throw new Error("Contiguous fixture unexpectedly requires Kitty chunks");
  return kittyChunk(encoded, placement, true, true);
}

export function* kittyChunks(
  encoded: string,
  placement: KittyPlacement,
): Generator<string> {
  const chunkCount = Math.ceil(encoded.length / KITTY_CHUNK_CHARACTERS);
  for (let index = 0; index < chunkCount; index += 1) {
    const start = index * KITTY_CHUNK_CHARACTERS;
    const last = index === chunkCount - 1;
    yield kittyChunk(
      encoded.slice(start, start + KITTY_CHUNK_CHARACTERS),
      placement,
      index === 0,
      last,
    );
  }
}

export async function sendKittyBase64(
  handlers: TerminalSessionHandlers,
  encoded: string,
  placement: KittyPlacement,
  transportSplit = false,
): Promise<void> {
  let index = 0;
  // One real frame proves cross-frame parsing without gating bulk transport on visual cadence.
  let crossTransportFrame = transportSplit;
  for (const sequence of kittyChunks(encoded, placement)) {
    if (transportSplit) {
      const splitAt = Math.min(sequence.length - 1, 31 + (index % 17));
      handlers.onOutput(sequence.slice(0, splitAt));
      if (crossTransportFrame) {
        await nextFrame();
        crossTransportFrame = false;
      }
      handlers.onOutput(sequence.slice(splitAt));
    } else {
      handlers.onOutput(sequence);
    }
    index += 1;
    if (index % OUTPUTS_PER_TASK === 0) await nextTask();
  }
  await nextFrame();
  await nextFrame();
}

function kittyChunk(
  payload: string,
  placement: KittyPlacement,
  first: boolean,
  last: boolean,
): string {
  const controls = first
    ? [
        "a=T",
        "f=100",
        "q=2",
        ...(placement.columns === undefined ? [] : [`c=${placement.columns}`]),
        ...(placement.rows === undefined ? [] : [`r=${placement.rows}`]),
        `i=${placement.id}`,
        ...(placement.cursorMovement === undefined
          ? []
          : [`C=${placement.cursorMovement}`]),
        ...(last ? [] : ["m=1"]),
      ].join(",")
    : `m=${last ? 0 : 1}`;
  return `\u001b_G${controls};${payload}\u001b\\`;
}

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function nextTask(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_766)
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_766)));
  return btoa(parts.join(""));
}

export function createPaddedPng(targetBytes: number): Uint8Array {
  const base = createUncompressedPng(2, 2, 0x2272_2722);
  const paddingBytes = targetBytes - base.length - 12;
  if (paddingBytes < 0)
    throw new Error(`PNG target is too small: ${targetBytes}`);
  return concatenate([
    base.subarray(0, -12),
    pngChunk("omXT", new Uint8Array(paddingBytes)),
    base.subarray(-12),
  ]);
}

export function createUncompressedPng(
  width: number,
  height: number,
  seed: number,
): Uint8Array {
  const stride = width * 4 + 1;
  const scanlines = new Uint8Array(stride * height);
  let state = seed >>> 0;
  for (let y = 0; y < height; y += 1) {
    let offset = y * stride;
    scanlines[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      scanlines[offset++] = state & 0xff;
      scanlines[offset++] = (state >>> 8) & 0xff;
      scanlines[offset++] = (state >>> 16) & 0xff;
      scanlines[offset++] = 0xff;
    }
  }

  const header = new Uint8Array(13);
  writeUint32(header, 0, width);
  writeUint32(header, 4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const compressed = zlibStored(scanlines);
  return concatenate([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function zlibStored(data: Uint8Array): Uint8Array {
  const blockCount = Math.ceil(data.length / 65_535);
  const output = new Uint8Array(2 + data.length + blockCount * 5 + 4);
  output.set([0x78, 0x01]);
  let inputOffset = 0;
  let outputOffset = 2;
  while (inputOffset < data.length) {
    const length = Math.min(65_535, data.length - inputOffset);
    const last = inputOffset + length === data.length;
    output[outputOffset++] = last ? 1 : 0;
    output[outputOffset++] = length & 0xff;
    output[outputOffset++] = length >>> 8;
    const complement = ~length & 0xffff;
    output[outputOffset++] = complement & 0xff;
    output[outputOffset++] = complement >>> 8;
    output.set(data.subarray(inputOffset, inputOffset + length), outputOffset);
    inputOffset += length;
    outputOffset += length;
  }
  writeUint32(output, outputOffset, adler32(data));
  return output;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const output = new Uint8Array(12 + data.length);
  writeUint32(output, 0, data.length);
  output.set(typeBytes, 4);
  output.set(data, 8);
  writeUint32(output, output.length - 4, crc32(concatenate([typeBytes, data])));
  return output;
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value >>> 24;
  target[offset + 1] = value >>> 16;
  target[offset + 2] = value >>> 8;
  target[offset + 3] = value;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  return ((b << 16) | a) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1)
    crc = (crc & 1) === 1 ? 0xedb8_8320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffff_ffff) >>> 0;
}
