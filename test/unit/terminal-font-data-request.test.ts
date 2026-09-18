import { describe, expect, it, vi } from "vitest";
import { createFontDataRequest } from "../../src/main/terminal-font-data-request";

describe("Terminal Font data request lifetime", () => {
  it("releases a failed shared load so a later valid request can retry", async () => {
    let rejectLookup: (cause: Error) => void = () => undefined;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectLookup = reject;
          }),
      )
      .mockResolvedValueOnce({ fallbacks: [] });
    const request = createFontDataRequest({
      family: () => undefined,
      generation: () => 0,
      isDisposed: () => false,
      load,
      reject: vi.fn(),
    });

    const first = request();
    const overlapping = request();
    rejectLookup(new Error("controlled read failure"));
    await expect(first).rejects.toThrow("controlled read failure");
    await expect(overlapping).rejects.toThrow("controlled read failure");
    await expect(request()).resolves.toEqual({ fallbacks: [] });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidates pending loads across change-away-and-back and disposal", async () => {
    let family = "Family A";
    let generation = 0;
    let disposed = false;
    const finishes: Array<(value: { fallbacks: never[] }) => void> = [];
    const load = vi.fn(
      () =>
        new Promise<{ fallbacks: never[] }>((resolve) => {
          finishes.push(resolve);
        }),
    );
    const request = createFontDataRequest({
      family: () => family,
      generation: () => generation,
      isDisposed: () => disposed,
      load,
      reject: vi.fn(),
    });

    const stale = request("Family A");
    family = "Family B";
    generation += 1;
    family = "Family A";
    generation += 1;
    const current = request("Family A");
    expect(load).toHaveBeenCalledTimes(2);
    finishes[0]!({ fallbacks: [] });
    await expect(stale).rejects.toThrow("superseded");
    disposed = true;
    finishes[1]!({ fallbacks: [] });
    await expect(current).rejects.toThrow("superseded");
    await expect(request("Family A")).rejects.toThrow("disposed");
  });
});
