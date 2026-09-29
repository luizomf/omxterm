import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";

const electron = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  createFromBuffer: vi.fn(),
  open: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ open: electron.open }));

vi.mock("electron", () => ({
  dialog: { showOpenDialog: electron.showOpenDialog },
  nativeImage: { createFromBuffer: electron.createFromBuffer },
}));

describe("native local image picker boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports actual WebP as unsupported without leaking paths or invoking native decode", async () => {
    // A real static 2x2 VP8 WebP, not PNG renamed with a .webp extension.
    const bytes = Buffer.from(
      "UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAIAAUAmJYgCdLoAA5gA/vmo7+1Niqnnd+hRsol8wAAA",
      "base64",
    );
    const close = vi.fn(async () => {});
    let position = 0;
    electron.open.mockResolvedValue({
      stat: async () => ({ isFile: () => true, size: bytes.length }),
      close,
      read: async (buffer: Uint8Array, offset: number, length: number) => {
        const chunk = bytes.subarray(position, position + length);
        buffer.set(chunk, offset);
        position += chunk.length;
        return { bytesRead: chunk.length };
      },
    });
    const filePath =
      process.platform === "win32"
        ? "C:\\private\\image.webp"
        : "/private/image.webp";
    await expect(
      loadLocalImageForWindow(
        {} as Electron.BrowserWindow,
        { source: "native-path", path: filePath },
        new AbortController().signal,
      ),
    ).rejects.toThrow(
      "Unsupported image format. Choose a static PNG or JPEG; WebP is not supported.",
    );
    expect(close).toHaveBeenCalledOnce();
    expect(electron.createFromBuffer).not.toHaveBeenCalled();
  });

  it("returns cancellation without reading a file", async () => {
    electron.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    await expect(
      loadLocalImageForWindow(
        {} as Electron.BrowserWindow,
        { source: "picker" },
        new AbortController().signal,
      ),
    ).resolves.toBeNull();
    expect(electron.createFromBuffer).not.toHaveBeenCalled();
  });

  it.each([
    "\\\\server\\share\\image.png",
    "//server/share/image.png",
    "relative.png",
  ])(
    "rejects non-local picker path %s before filesystem access",
    async (filePath) => {
      electron.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [filePath],
      });
      await expect(
        loadLocalImageForWindow(
          {} as Electron.BrowserWindow,
          { source: "picker" },
          new AbortController().signal,
        ),
      ).rejects.toThrow("The local image could not be loaded");
      expect(electron.open).not.toHaveBeenCalled();
      expect(electron.createFromBuffer).not.toHaveBeenCalled();
    },
  );

  it("does not expose private native failure details through IPC", async () => {
    electron.showOpenDialog.mockRejectedValue(
      new Error("permission denied: /private/secret/image.png"),
    );
    const failure = await loadLocalImageForWindow(
      {} as Electron.BrowserWindow,
      { source: "picker" },
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(failure).toEqual(new Error("The local image could not be loaded"));
    expect(String(failure)).not.toContain("/private/secret");
  });
});
