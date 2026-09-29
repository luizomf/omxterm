import { constants } from "node:fs";
import { open as openFile, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { parseLocalImageReference } from "../shared/local-image-reference";
import { fileURLToPath } from "node:url";
import {
  UNSUPPORTED_LOCAL_IMAGE_FORMAT,
  MAX_LOCAL_IMAGE_BYTES,
  MAX_LOCAL_IMAGE_PIXELS,
  MAX_LOCAL_IMAGE_SIDE,
  MAX_LOCAL_IMAGE_SOURCE_LENGTH,
  type LocalImageData,
  type LocalImageMime,
  type LocalImageRequest,
} from "../shared/local-image";

interface OpenedLocalImage {
  stat(): Promise<{ isFile(): boolean; size: number }>;
  read(
    buffer: Uint8Array,
    offset: number,
    length: number,
    position: number | null,
  ): Promise<{ bytesRead: number }>;
  close(): Promise<void>;
}

interface LocalImageReadOptions {
  readonly platform?: NodeJS.Platform;
  readonly open?: (
    filePath: string,
    flags: number,
  ) => Promise<OpenedLocalImage>;
  readonly validateDecodedImage: (
    bytes: Uint8Array,
    expected: {
      readonly mime: LocalImageMime;
      readonly width: number;
      readonly height: number;
    },
  ) => boolean;
}

interface LocalImageRequestOptions {
  readonly platform?: NodeJS.Platform;
  readonly abortSignal?: AbortSignal;
  readonly homeDirectory?: string;
  readonly chooseFile: () => Promise<string | null>;
  readonly chooseDirectory?: (homeDirectory: string) => Promise<string | null>;
  readonly read: (filePath: string) => Promise<LocalImageData>;
}

export async function loadLocalImageRequest(
  request: LocalImageRequest,
  options: LocalImageRequestOptions,
): Promise<LocalImageData | null> {
  assertActive(options);
  if (request.source === "path-reference")
    return loadReference(request.path, options);
  const filePath =
    request.source === "picker"
      ? await options.chooseFile()
      : request.source === "file-url"
        ? resolveLocalImageFileUrl(request.url, options.platform)
        : localImagePath(request.path, options.platform);
  if (options.abortSignal?.aborted)
    throw new Error("Local image request was superseded");
  if (filePath === null) return null;
  const image = await options.read(localImagePath(filePath, options.platform));
  if (options.abortSignal?.aborted)
    throw new Error("Local image request was superseded");
  return image;
}

function assertActive(options: LocalImageRequestOptions): void {
  if (options.abortSignal?.aborted)
    throw new Error("Local image request was superseded");
}

async function loadReference(
  value: string,
  options: LocalImageRequestOptions,
): Promise<LocalImageData | null> {
  const reference = parseLocalImageReference(value);
  if (!reference) throw new TypeError("Invalid local image reference.");
  const platform = options.platform ?? process.platform;
  const paths = platform === "win32" ? path.win32 : path.posix;
  let base: string | undefined;
  if (reference.kind !== "absolute") {
    if (
      platform === "win32" &&
      /:/u.test(reference.path.replace(/:[1-9][0-9]*(?::[1-9][0-9]*)?$/u, ""))
    )
      throw new TypeError("Invalid local image reference.");
    base = localImagePath(options.homeDirectory ?? homedir(), platform);
    if (reference.kind === "relative") {
      const selected = await options.chooseDirectory?.(base);
      assertActive(options);
      if (selected === null) return null;
      if (selected === undefined)
        throw new TypeError("A local base directory is required.");
      base = localImagePath(selected, platform);
    }
  }
  const resolve = (literal: string) =>
    localImagePath(
      reference.kind === "absolute"
        ? literal
        : paths.resolve(
            base!,
            reference.kind === "home" ? literal.slice(2) || "." : literal,
          ),
      platform,
    );
  const read = async (literal: string) => {
    assertActive(options);
    const image = await options.read(resolve(literal));
    assertActive(options);
    return image;
  };
  try {
    return await read(reference.path);
  } catch (error) {
    assertActive(options);
    if (
      !reference.fallbackPath ||
      (error as NodeJS.ErrnoException)?.code !== "ENOENT"
    )
      throw error;
    return read(reference.fallbackPath);
  }
}

export class UnsupportedLocalImageFormatError extends Error {
  constructor() {
    super(UNSUPPORTED_LOCAL_IMAGE_FORMAT);
  }
}

export async function readLocalImage(
  filePath: string,
  options: LocalImageReadOptions,
): Promise<LocalImageData> {
  const platform = options.platform ?? process.platform;
  const open =
    options.open ??
    ((value, flags) => openFile(value, flags) as Promise<FileHandle>);
  const noFollow = platform === "win32" ? 0 : constants.O_NOFOLLOW;
  let file: OpenedLocalImage | undefined;
  try {
    file = await open(
      filePath,
      constants.O_RDONLY | constants.O_NONBLOCK | noFollow,
    );
    const stat = await file.stat();
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_LOCAL_IMAGE_BYTES)
      throw new Error("Choose a regular PNG or JPEG image up to 16 MiB.");

    const allocation = new Uint8Array(stat.size + 1);
    let count = 0;
    while (count < allocation.length) {
      const result = await file.read(
        allocation,
        count,
        allocation.length - count,
        null,
      );
      if (result.bytesRead === 0) break;
      count += result.bytesRead;
    }
    if (count !== stat.size)
      throw new Error("The local image changed while being read. Try again.");

    const data = allocation.slice(0, count);
    const dimensions = imageDimensions(data);
    if (
      dimensions.width > MAX_LOCAL_IMAGE_SIDE ||
      dimensions.height > MAX_LOCAL_IMAGE_SIDE ||
      dimensions.width * dimensions.height > MAX_LOCAL_IMAGE_PIXELS
    )
      throw new Error(
        "Image exceeds the preview limit: 8192 per side or 16 million pixels.",
      );
    if (!options.validateDecodedImage(data, dimensions))
      throw new Error(
        `Invalid ${dimensions.mime === "image/png" ? "PNG" : "JPEG"} image.`,
      );

    return Object.freeze({
      ...dimensions,
      name: path.basename(filePath),
      data,
    });
  } finally {
    await file?.close();
  }
}

export function resolveLocalImageFileUrl(
  value: unknown,
  platform: NodeJS.Platform = process.platform,
): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_LOCAL_IMAGE_SOURCE_LENGTH ||
    !value.startsWith("file:///") ||
    value.startsWith("file:////") ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new TypeError("Invalid local image URL.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError("Invalid local image URL.");
  }
  if (
    parsed.protocol !== "file:" ||
    parsed.host !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  )
    throw new TypeError("Invalid local image URL.");
  return localImagePath(
    fileURLToPath(parsed, { windows: platform === "win32" }),
    platform,
  );
}

function localImagePath(
  filePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  // A native chooser may return UNC/device paths too; validate before any I/O.
  const localAbsolute =
    platform === "win32"
      ? /^[a-z]:[\\\\/]/iu.test(filePath)
      : path.posix.isAbsolute(filePath) && !filePath.startsWith("//");
  if (
    !localAbsolute ||
    /[\p{Cc}\p{Cf}]/u.test(filePath) ||
    filePath.length > MAX_LOCAL_IMAGE_SOURCE_LENGTH
  )
    throw new TypeError("Invalid local image path.");
  return filePath;
}

function imageDimensions(data: Uint8Array): {
  readonly mime: LocalImageMime;
  readonly width: number;
  readonly height: number;
} {
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (isPng(bytes)) return pngDimensions(bytes);
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8)
    return jpegDimensions(bytes);
  throw new UnsupportedLocalImageFormatError();
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}

function pngDimensions(bytes: Buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let first = true;
  let ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("Invalid PNG image.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const expectedCrc = bytes.readUInt32BE(offset + 8 + length);
    const actualCrc = crc32(bytes.subarray(offset + 4, offset + 8 + length));
    if (actualCrc !== expectedCrc) throw new Error("Invalid PNG image.");
    if (first) {
      if (type !== "IHDR" || length !== 13)
        throw new Error("Invalid PNG image.");
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      if (
        width === 0 ||
        height === 0 ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        (bytes[offset + 20] !== 0 && bytes[offset + 20] !== 1)
      )
        throw new Error("Invalid PNG image.");
    } else if (type === "IHDR") throw new Error("Invalid PNG image.");
    if (["acTL", "fcTL", "fdAT"].includes(type))
      throw new Error("Animated PNG preview is not supported.");
    if (type === "IEND") {
      if (length !== 0 || end !== bytes.length)
        throw new Error("Invalid PNG image.");
      ended = true;
      break;
    }
    first = false;
    offset = end;
  }
  if (!ended) throw new Error("Invalid PNG image.");
  return { mime: "image/png" as const, width, height };
}

function jpegDimensions(bytes: Buffer) {
  let offset = 2;
  let width = 0;
  let height = 0;
  let ended = false;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error("Invalid JPEG image.");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined) break;
    if (marker === 0xd9) {
      ended = offset === bytes.length;
      break;
    }
    if (marker === 0xda) {
      const eoi = bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
      ended = eoi >= offset && eoi === bytes.length - 2;
      break;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length)
      throw new Error("Invalid JPEG image.");
    if (isStartOfFrame(marker)) {
      if (length < 8) throw new Error("Invalid JPEG image.");
      height = bytes.readUInt16BE(offset + 3);
      width = bytes.readUInt16BE(offset + 5);
    }
    offset += length;
  }
  if (!ended || width === 0 || height === 0)
    throw new Error("Choose a valid PNG or JPEG image.");
  return { mime: "image/jpeg" as const, width, height };
}

function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1)
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
