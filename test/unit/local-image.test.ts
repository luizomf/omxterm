import { describe, expect, it, vi } from "vitest";
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
function fileOptions(bytes: Uint8Array, size = bytes.length) {
  return {
    validateDecodedImage: vi.fn(() => true),
    open: async () => {
      let position = 0;
      return {
        stat: async () => ({ isFile: () => true, size }),
        async read(buffer: Uint8Array, offset: number, length: number) {
          const chunk = bytes.subarray(position, position + length);
          buffer.set(chunk, offset);
          position += chunk.length;
          return { bytesRead: chunk.length };
        },
        close: async () => {},
      };
    },
  };
}

describe("bounded local image loader", () => {
  it("accepts PNG and JPEG by validated contents without trusting extensions", async () => {
    await expect(
      readLocalImage("/fixture/not-an-extension", fileOptions(PNG_1X1)),
    ).resolves.toMatchObject({
      name: "not-an-extension",
      mime: "image/png",
      width: 1,
      height: 1,
      data: new Uint8Array(PNG_1X1),
    });
    await expect(
      readLocalImage("/fixture/pretends.png", fileOptions(JPEG_2X1)),
    ).resolves.toMatchObject({
      name: "pretends.png",
      mime: "image/jpeg",
      width: 2,
      height: 1,
      data: new Uint8Array(JPEG_2X1),
    });
  });

  it("rejects unsupported, oversized, changing, animated, and decode-invalid input", async () => {
    await expect(
      readLocalImage("/fixture/fake.png", fileOptions(Buffer.from("<svg/>"))),
    ).rejects.toThrow(/PNG or JPEG/u);
    await expect(
      readLocalImage(
        "/fixture/large.png",
        fileOptions(PNG_1X1, 16 * 1024 * 1024 + 1),
      ),
    ).rejects.toThrow(/16 MiB/u);
    await expect(
      readLocalImage(
        "/fixture/changing.png",
        fileOptions(PNG_1X1, PNG_1X1.length + 1),
      ),
    ).rejects.toThrow(/changed/u);

    const animated = Buffer.concat([
      PNG_1X1.subarray(0, 33),
      pngChunk("acTL", Buffer.from([0, 0, 0, 1, 0, 0, 0, 0])),
      PNG_1X1.subarray(33),
    ]);
    await expect(
      readLocalImage("/fixture/animated.png", fileOptions(animated)),
    ).rejects.toThrow(/Animated/u);
    await expect(
      readLocalImage("/fixture/image.png", {
        ...fileOptions(PNG_1X1),
        validateDecodedImage: () => false,
      }),
    ).rejects.toThrow(/Invalid PNG/u);
  });
});

describe.each(["png", "jpeg"] as const)(
  "%s predecode dimension budgets",
  (format) => {
    it.each([
      [8192, 1, true],
      [8193, 1, false],
      [1, 8192, true],
      [1, 8193, false],
      [4000, 4000, true],
      [4001, 4000, false],
    ] as const)(
      "checks %i×%i before native allocation (accepted=%s)",
      async (width, height, accepted) => {
        // Only metadata is needed to prove the predecode gate. Native decoding is
        // an injected boundary here; real PNG/JPEG decode lives in integration.
        const options = fileOptions(dimensionFixture(format, width, height));
        const pending = readLocalImage("/fixture/image", options);
        if (accepted) {
          await expect(pending).resolves.toMatchObject({ width, height });
          expect(options.validateDecodedImage).toHaveBeenCalledOnce();
        } else {
          await expect(pending).rejects.toThrow(/preview limit/u);
          expect(options.validateDecodedImage).not.toHaveBeenCalled();
        }
      },
    );
  },
);

function dimensionFixture(
  format: "png" | "jpeg",
  width: number,
  height: number,
): Buffer {
  if (format === "jpeg") {
    const bytes = Buffer.from(JPEG_2X1);
    bytes.writeUInt16BE(height, 7);
    bytes.writeUInt16BE(width, 9);
    return bytes;
  }
  const header = Buffer.from(PNG_1X1.subarray(16, 29));
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  return Buffer.concat([
    PNG_1X1.subarray(0, 8),
    pngChunk("IHDR", header),
    PNG_1X1.subarray(33),
  ]);
}

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

  it.each([
    ["win32", "\\\\server\\share\\a.png"],
    ["win32", "\\\\?\\C:\\a.png"],
    ["win32", "C:relative.png"],
    ["win32", "/tmp/image.png"],
    ["linux", "C:\\Users\\me\\image.png"],
    ["linux", "relative/image.png"],
    ["linux", "//server/share/a.png"],
    ["linux", "/tmp/control\nname.png"],
  ] as const)(
    "rejects a %s non-local or ambiguous native-path activation %s before reading",
    async (platform, filePath) => {
      const read = vi.fn();
      await expect(
        loadLocalImageRequest(
          { source: "native-path", path: filePath },
          { platform, chooseFile: async () => null, read },
        ),
      ).rejects.toThrow("Invalid local image path");
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["linux", "/tmp/image%23#literal.png"],
    ["win32", "C:\\Users\\me\\image%23#literal.jpg"],
  ] as const)(
    "preserves an exact %s native-path activation without URL decoding",
    async (platform, filePath) => {
      const read = vi.fn(async () => ({
        name: "image.png",
        mime: "image/png" as const,
        width: 1,
        height: 1,
        data: new Uint8Array(PNG_1X1),
      }));
      await loadLocalImageRequest(
        { source: "native-path", path: filePath },
        { platform, chooseFile: async () => null, read },
      );
      expect(read).toHaveBeenCalledExactlyOnceWith(filePath);
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
