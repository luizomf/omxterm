import { describe, expect, it, vi } from "vitest";
import { createLocalImageIpcBoundary } from "../../src/main/local-image-ipc";

describe("local image IPC ownership", () => {
  it("bounds concurrency and aborts a late result when its owner closes", async () => {
    let finish!: (value: null) => void;
    let observedSignal: AbortSignal | undefined;
    const load = vi.fn(
      (_request: unknown, signal: AbortSignal) =>
        new Promise<null>((resolve) => {
          observedSignal = signal;
          finish = resolve;
        }),
    );
    const reject = vi.fn();
    const boundary = createLocalImageIpcBoundary({
      load,
      isOwnerLost: () => false,
      reject,
    });
    const first = boundary.request({
      source: "file-url",
      url: "file:///tmp/image.png",
    });
    await expect(boundary.request({ source: "picker" })).rejects.toThrow(
      /already in progress/u,
    );
    expect(reject).toHaveBeenCalledOnce();

    boundary.dispose();
    expect(observedSignal?.aborted).toBe(true);
    finish(null);
    await expect(first).rejects.toThrow(/superseded/u);
    expect(load).toHaveBeenCalledOnce();
  });

  it("rejects malformed requests before invoking native file access", async () => {
    const load = vi.fn(async () => null);
    const reject = vi.fn();
    const boundary = createLocalImageIpcBoundary({
      load,
      isOwnerLost: () => false,
      reject,
    });
    for (const payload of [
      undefined,
      { source: "picker", url: "file:///tmp/a.png" },
      { source: "file-url", url: "" },
      { source: "file-url", url: "x".repeat(32_769) },
    ])
      await expect(boundary.request(payload)).rejects.toThrow(TypeError);
    expect(load).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(4);
    boundary.dispose();
  });
});
