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

  it("skips superseded queued generations and recovers after the active read fails", async () => {
    let family = "Family A";
    let generation = 0;
    let fail: (error: Error) => void = () => undefined;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = reject;
          }),
      )
      .mockResolvedValue({ fallbacks: [] });
    const request = createFontDataRequest({
      family: () => family,
      generation: () => generation,
      isDisposed: () => false,
      load,
      reject: vi.fn(),
    });
    const first = request(family);
    const firstFailure = expect(first).rejects.toThrow("controlled failure");
    family = "Family B";
    generation += 1;
    const stale = request(family);
    const staleFailure = expect(stale).rejects.toThrow("superseded");
    family = "Family C";
    generation += 1;
    const current = request(family);
    const shared = request(family);
    expect(load).toHaveBeenCalledTimes(1);
    fail(new Error("controlled failure"));
    await Promise.all([firstFailure, staleFailure]);
    await expect(current).resolves.toEqual({ fallbacks: [] });
    await expect(shared).resolves.toEqual({ fallbacks: [] });
    expect(load.mock.calls).toEqual([["Family A"], ["Family C"]]);
    await request(family);
    expect(load).toHaveBeenCalledTimes(3);
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
    expect(load).toHaveBeenCalledTimes(1);
    finishes[0]!({ fallbacks: [] });
    await expect(stale).rejects.toThrow("superseded");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    disposed = true;
    finishes[1]!({ fallbacks: [] });
    await expect(current).rejects.toThrow("superseded");
    await expect(request("Family A")).rejects.toThrow("disposed");
  });
});
