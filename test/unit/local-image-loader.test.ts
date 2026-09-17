import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";

const electron = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  createFromBuffer: vi.fn(),
}));

vi.mock("electron", () => ({
  dialog: { showOpenDialog: electron.showOpenDialog },
  nativeImage: { createFromBuffer: electron.createFromBuffer },
}));

describe("native local image picker boundary", () => {
  beforeEach(() => vi.clearAllMocks());

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
