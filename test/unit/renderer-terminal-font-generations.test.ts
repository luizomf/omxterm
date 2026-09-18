import { describe, expect, it, vi } from "vitest";
import { createTerminalFontGenerationOwner } from "../../src/renderer/terminal-font-generations";

describe("renderer Terminal Font generations", () => {
  it.each([false, true])(
    "removes pending cancellation listeners after settlement (failure: %s)",
    async (fails) => {
      const abort = new AbortController();
      const add = vi.spyOn(abort.signal, "addEventListener");
      const remove = vi.spyOn(abort.signal, "removeEventListener");
      const owner = createTerminalFontGenerationOwner(async () => {
        if (fails) throw new Error("load failed");
        return { fallbacks: [] };
      });
      if (fails)
        await expect(owner.acquire(undefined, abort.signal)).rejects.toThrow(
          "load failed",
        );
      else (await owner.acquire(undefined, abort.signal)).release();
      expect(add).toHaveBeenCalledOnce();
      expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]![1]);
      owner.dispose();
    },
  );
  it("shares one caller-isolated native backing across compatible live Surface leases", async () => {
    const callerBytes = new Uint8Array([10, 11, 12]);
    const load = vi.fn(async () => ({
      fallbacks: [{ family: "Native Coverage", data: callerBytes }],
    }));
    const owner = createTerminalFontGenerationOwner(load);

    const [first, second] = await Promise.all([
      owner.acquire(undefined),
      owner.acquire(undefined),
    ]);
    const firstNative = first.fonts.at(-1)!.data as ArrayBuffer;
    const secondNative = second.fonts.at(-1)!.data as ArrayBuffer;
    callerBytes.fill(99);

    expect(load).toHaveBeenCalledOnce();
    expect(secondNative).toBe(firstNative);
    expect([...new Uint8Array(firstNative)]).toEqual([10, 11, 12]);

    first.release();
    second.release();
    owner.dispose();
  });

  it("drops the generation after its final release and recovers from a failed load", async () => {
    let attempt = 0;
    const owner = createTerminalFontGenerationOwner(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("native read failed");
      return {
        fallbacks: [
          { family: "Native Coverage", data: new Uint8Array([attempt]) },
        ],
      };
    });

    await expect(owner.acquire(undefined)).rejects.toThrow(
      "native read failed",
    );
    const recovered = await owner.acquire(undefined);
    const recoveredBacking = recovered.fonts.at(-1)!.data;
    recovered.release();
    const reloaded = await owner.acquire(undefined);

    expect(attempt).toBe(3);
    expect(reloaded.fonts.at(-1)!.data).not.toBe(recoveredBacking);

    reloaded.release();
    owner.dispose();
  });

  it("keeps old live leases on their creation-time generation after configuration changes", async () => {
    const owner = createTerminalFontGenerationOwner(
      async (family) => ({
        configured: {
          family: family!,
          data: new Uint8Array([family === "First" ? 1 : 2]),
        },
        fallbacks: [],
      }),
      "First",
    );
    const first = await owner.acquire("First");
    const firstBacking = first.fonts[0]!.data as ArrayBuffer;

    owner.select("Second");
    const second = await owner.acquire("Second");

    expect([...new Uint8Array(firstBacking)]).toEqual([1]);
    expect([...new Uint8Array(second.fonts[0]!.data as ArrayBuffer)]).toEqual([
      2,
    ]);
    await expect(owner.acquire("First")).rejects.toThrow(
      "active configuration",
    );

    first.release();
    second.release();
    owner.dispose();
  });

  it("lets a pending old-generation lease finish without crossing into the new generation", async () => {
    let finishFirst: ((value: Uint8Array) => void) | undefined;
    const firstBytes = new Promise<Uint8Array>((resolve) => {
      finishFirst = resolve;
    });
    const owner = createTerminalFontGenerationOwner(
      async (family) => ({
        configured: {
          family: family!,
          data: family === "First" ? await firstBytes : new Uint8Array([2]),
        },
        fallbacks: [],
      }),
      "First",
    );
    const oldPending = owner.acquire("First");

    owner.select("Second");
    const second = await owner.acquire("Second");
    finishFirst!(new Uint8Array([1]));
    const first = await oldPending;

    expect([...new Uint8Array(first.fonts[0]!.data as ArrayBuffer)]).toEqual([
      1,
    ]);
    expect([...new Uint8Array(second.fonts[0]!.data as ArrayBuffer)]).toEqual([
      2,
    ]);

    first.release();
    second.release();
    owner.dispose();
  });

  it("cancels one pending acquisition without invalidating another concurrent consumer", async () => {
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const load = vi.fn(async () => {
      await gate;
      return {
        fallbacks: [{ family: "Native Coverage", data: new Uint8Array([7]) }],
      };
    });
    const owner = createTerminalFontGenerationOwner(load);
    const abort = new AbortController();
    const cancelled = owner.acquire(undefined, abort.signal);
    const live = owner.acquire(undefined);

    abort.abort();
    await expect(cancelled).rejects.toThrow("cancelled");
    finish!();
    const lease = await live;

    expect(load).toHaveBeenCalledOnce();
    expect([
      ...new Uint8Array(lease.fonts.at(-1)!.data as ArrayBuffer),
    ]).toEqual([7]);

    lease.release();
    owner.dispose();
  });

  it("keeps identical configurations in separate Terminal Windows independent", async () => {
    const callerBytes = new Uint8Array([4]);
    const load = async () => ({
      fallbacks: [{ family: "Native Coverage", data: callerBytes }],
    });
    const firstOwner = createTerminalFontGenerationOwner(load);
    const secondOwner = createTerminalFontGenerationOwner(load);
    const [first, second] = await Promise.all([
      firstOwner.acquire(undefined),
      secondOwner.acquire(undefined),
    ]);

    expect(first.fonts.at(-1)!.data).not.toBe(second.fonts.at(-1)!.data);

    first.release();
    second.release();
    firstOwner.dispose();
    secondOwner.dispose();
  });

  it("makes a disposed pending owner inert even if its native load completes late", async () => {
    let finish: ((value: Uint8Array) => void) | undefined;
    const bytes = new Promise<Uint8Array>((resolve) => {
      finish = resolve;
    });
    const owner = createTerminalFontGenerationOwner(async () => ({
      fallbacks: [{ family: "Native Coverage", data: await bytes }],
    }));
    const pending = owner.acquire(undefined);

    owner.dispose();
    await expect(pending).rejects.toThrow("cancelled");
    finish!(new Uint8Array([8]));
    await Promise.resolve();
    await expect(owner.acquire(undefined)).rejects.toThrow("disposed");
  });
});
