import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadLocalImageRequest,
  readLocalImage,
  resolveLocalImageFileUrl,
} from "../../src/main/local-image";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const JPEG_2X1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x02, 0x01, 0x01,
  0x11, 0x00, 0xff, 0xd9,
]);
const directories: string[] = [];
const acceptDecodedImage = () => true;

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "omxterm-image-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("bounded local image loader", () => {
  it("accepts PNG and JPEG by validated contents without trusting extensions", async () => {
    const directory = await temporaryDirectory();
    const pngPath = path.join(directory, "not-an-extension");
    const jpegPath = path.join(directory, "pretends.png");
    await writeFile(pngPath, PNG_1X1);
    await writeFile(jpegPath, JPEG_2X1);
    const validateDecodedImage = (bytes: Uint8Array) => bytes.length > 0;

    await expect(
      readLocalImage(pngPath, { validateDecodedImage }),
    ).resolves.toMatchObject({
      name: "not-an-extension",
      mime: "image/png",
      width: 1,
      height: 1,
      data: new Uint8Array(PNG_1X1),
    });
    await expect(
      readLocalImage(jpegPath, { validateDecodedImage }),
    ).resolves.toMatchObject({
      name: "pretends.png",
      mime: "image/jpeg",
      width: 2,
      height: 1,
      data: new Uint8Array(JPEG_2X1),
    });
  });

  it("rejects unsupported, oversized, changing, animated, and decode-invalid input", async () => {
    const directory = await temporaryDirectory();
    const unsupported = path.join(directory, "fake.png");
    const oversized = path.join(directory, "large.png");
    await writeFile(unsupported, "<svg/>");
    await writeFile(oversized, Buffer.alloc(16 * 1024 * 1024 + 1));

    await expect(
      readLocalImage(unsupported, { validateDecodedImage: acceptDecodedImage }),
    ).rejects.toThrow(/PNG or JPEG/u);
    await expect(
      readLocalImage(oversized, { validateDecodedImage: acceptDecodedImage }),
    ).rejects.toThrow(/16 MiB/u);
    await expect(
      readLocalImage(path.join(directory, "synthetic"), {
        validateDecodedImage: acceptDecodedImage,
        open: async () => ({
          stat: async () => ({ isFile: () => true, size: 1 }),
          read: async () => ({ bytesRead: 0 }),
          close: async () => undefined,
        }),
      }),
    ).rejects.toThrow(/changed/u);

    const animated = Buffer.concat([
      PNG_1X1.subarray(0, 33),
      pngChunk("acTL", Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])),
      PNG_1X1.subarray(33),
    ]);
    const animatedPath = path.join(directory, "animated.png");
    await writeFile(animatedPath, animated);
    await expect(
      readLocalImage(animatedPath, {
        validateDecodedImage: acceptDecodedImage,
      }),
    ).rejects.toThrow(/Animated/u);

    const imagePath = path.join(directory, "image.png");
    await writeFile(imagePath, PNG_1X1);
    await expect(
      readLocalImage(imagePath, { validateDecodedImage: () => false }),
    ).rejects.toThrow(/Invalid PNG/u);
  });
});

describe("native local image request", () => {
  it.each([
    "\\\\server\\share\\a.png",
    "//server/share/a.png",
    "\\\\?\\C:\\a.png",
    "C:relative.png",
    "\\rooted.png",
  ])(
    "rejects Windows non-local or ambiguous picker path %s before reading",
    async (filePath) => {
      const read = vi.fn();
      await expect(
        loadLocalImageRequest(
          { source: "picker" },
          {
            platform: "win32",
            chooseFile: async () => filePath,
            read,
          },
        ),
      ).rejects.toThrow("Invalid local image path");
      expect(read).not.toHaveBeenCalled();
    },
  );

  it("preserves a drive-qualified local picker path", async () => {
    const read = vi.fn(async () => ({
      name: "image.png",
      mime: "image/png" as const,
      width: 1,
      height: 1,
      data: new Uint8Array(PNG_1X1),
    }));
    await loadLocalImageRequest(
      { source: "picker" },
      {
        platform: "win32",
        chooseFile: async () => "C:\\Users\\me\\image.png",
        read,
      },
    );
    expect(read).toHaveBeenCalledWith("C:\\Users\\me\\image.png");
  });
  it("treats picker cancellation and owner closure as side-effect-free results", async () => {
    const read = vi.fn();
    await expect(
      loadLocalImageRequest(
        { source: "picker" },
        { chooseFile: async () => null, read },
      ),
    ).resolves.toBeNull();
    expect(read).not.toHaveBeenCalled();

    let finishPicker!: (value: string) => void;
    const abort = new AbortController();
    const pending = loadLocalImageRequest(
      { source: "picker" },
      {
        abortSignal: abort.signal,
        chooseFile: () => new Promise((resolve) => (finishPicker = resolve)),
        read,
      },
    );
    abort.abort();
    finishPicker("/tmp/private.png");
    await expect(pending).rejects.toThrow(/superseded/u);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("literal local image URL boundary", () => {
  it("accepts only absolute authority-free file URLs for the active platform", () => {
    expect(resolveLocalImageFileUrl("file:///tmp/a%20b.png", "linux")).toBe(
      "/tmp/a b.png",
    );
    expect(resolveLocalImageFileUrl("file:///C:/Users/me/a.png", "win32")).toBe(
      "C:\\Users\\me\\a.png",
    );
    for (const rejected of [
      "file://server/share/a.png",
      "file://localhost/tmp/a.png",
      "FILE:///tmp/a.png",
      "file:relative.png",
      "https://example.test/a.png",
      "file:///tmp/a.png#fragment",
      "file:///tmp/a.png?download=1",
      "file:///tmp/%00a.png",
    ])
      expect(() => resolveLocalImageFileUrl(rejected, "linux")).toThrow();
  });
});

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(crcInput), 8 + data.length);
  return chunk;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
