import { describe, expect, it, vi } from "vitest";
import { createSnippetCatalogClient } from "../../extensions/snippets/catalog-client";
import { createSnippetCatalog } from "../../extensions/snippets/catalog";
import { captureValue } from "../../src/extension-runtime/protocol";

const row = { name: "example", body: "echo hello", execute: false };
const cursor = "cursor_0000000001";
const token = () => "activation_0000001";
const empty = { ok: true, rows: [], total: 0, cursor: null };
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function transport(...pages: unknown[]) {
  return {
    request: vi.fn(async (value: unknown) =>
      (value as { operation: string }).operation === "close"
        ? { ok: true }
        : pages.shift(),
    ),
  };
}

describe("Snippets catalog client", () => {
  it.each(["  echo 'hello'\r\n\t世界\n", '\u0000"\\\n'.repeat(16_384)])(
    "assembles all 512 bounded rows preserving exact text (%#)",
    async (body) => {
      const snippets = Array.from({ length: 512 }, (_, index) => ({
        name: `Snippet ${index}`,
        body,
        description: "  Literal description\n",
        execute: index % 2 === 0,
      }));
      const catalog = createSnippetCatalog(async () => ({ snippets }));
      const request = vi.fn(async (value: unknown) => {
        const input = value as {
          operation: string;
          activation: string;
          cursor?: string;
        };
        expect(input.activation).toBe(token());
        if (input.operation === "close") {
          catalog.close();
          return { ok: true };
        }
        const page =
          input.operation === "open"
            ? await catalog.open()
            : catalog.next(input.cursor!);
        const response = { ok: true, ...(page as object) };
        captureValue(response);
        return JSON.parse(JSON.stringify(response)) as unknown;
      });
      const client = createSnippetCatalogClient({ request }, token);
      expect(await client.load()).toEqual({ snippets });
      expect(request.mock.calls.length).toBeGreaterThan(2);
      expect(request.mock.calls.at(-1)).toEqual([
        { operation: "close", activation: token() },
      ]);
    },
  );

  it("returns missing catalogs and preserves catalog diagnostics", async () => {
    const backend = transport(empty, {
      ...empty,
      error: "Invalid YAML at line 3",
    });
    const client = createSnippetCatalogClient(backend);
    expect(await client.load()).toEqual({ snippets: [] });
    expect(await client.load()).toEqual({
      snippets: [],
      error: "Invalid YAML at line 3",
    });
    const opens = backend.request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "open",
    );
    expect(opens[0]).not.toEqual(opens[1]);
  });

  it.each([
    null,
    { ok: false, error: "busy" },
    { ...empty, extra: true },
    { ...empty, total: 513 },
    { ...empty, total: -1 },
    { ...empty, total: 0.5 },
    { ...empty, cursor: "bad" },
    { ...empty, rows: [row] },
    { ...empty, rows: [{ ...row, execute: "yes" }], total: 1 },
    { ...empty, rows: Array.from({ length: 257 }, () => row), total: 257 },
    { ...empty, total: 1 },
    { ...empty, cursor, total: 1 },
    { ...empty, error: "" },
    { ...empty, rows: [row], total: 1, error: "Invalid YAML" },
  ])(
    "rejects malformed/failing first pages without retry (%#)",
    async (page) => {
      const backend = transport(page);
      await expect(
        createSnippetCatalogClient(backend, token).load(),
      ).rejects.toThrow();
      expect(backend.request).toHaveBeenCalledTimes(2);
      expect(backend.request).toHaveBeenLastCalledWith({
        operation: "close",
        activation: token(),
      });
    },
  );

  it.each([
    { ok: true, rows: [row], total: 3, cursor: null },
    { ok: true, rows: [row], total: 2, cursor: null, error: "Changed" },
    { ok: true, rows: [], total: 2, cursor: null },
    { ok: true, rows: [row, row], total: 2, cursor: null },
    { ok: true, rows: [], total: 2, cursor },
    { ok: false, error: "expired-snapshot" },
  ])("rejects inconsistent continuation pages (%#)", async (page) => {
    const backend = transport(
      { ok: true, rows: [row], total: 2, cursor },
      page,
    );
    await expect(
      createSnippetCatalogClient(backend, token).load(),
    ).rejects.toThrow();
    expect(backend.request).toHaveBeenCalledTimes(3);
    expect(backend.request).toHaveBeenNthCalledWith(2, {
      operation: "next",
      activation: token(),
      cursor,
    });
  });

  it("rejects repeated cursors even before the total is reached", async () => {
    const page = { ok: true, rows: [row], total: 4, cursor };
    const backend = transport(page, page);
    await expect(
      createSnippetCatalogClient(backend, token).load(),
    ).rejects.toThrow("cursor");
    expect(backend.request).toHaveBeenCalledTimes(3);
  });

  it.each(["cancel", "dispose"] as const)(
    "%s closes a pending open and rejects immediately",
    async (action) => {
      const pending = deferred();
      const backend = {
        request: vi.fn((value: unknown) =>
          (value as { operation: string }).operation === "open"
            ? pending.promise
            : Promise.resolve({ ok: true }),
        ),
      };
      const client = createSnippetCatalogClient(backend, token);
      const result = client.load();
      const rejected = expect(result).rejects.toThrow("cancelled");
      client[action]();
      await rejected;
      expect(backend.request).toHaveBeenLastCalledWith({
        operation: "close",
        activation: token(),
      });
      pending.resolve(empty);
      await Promise.resolve();
      expect(backend.request).toHaveBeenCalledTimes(2);
      if (action === "dispose") {
        await expect(client.load()).rejects.toThrow("disposed");
        expect(backend.request).toHaveBeenCalledTimes(2);
      }
    },
  );

  it("supersedes pending opens without mixing late rows into the new load", async () => {
    const pending = deferred();
    const backend = transport({ ...empty, rows: [row], total: 1 });
    backend.request.mockImplementationOnce(() => pending.promise);
    let sequence = 0;
    const client = createSnippetCatalogClient(
      backend,
      () => `activation_000000${++sequence}`,
    );
    const first = client.load();
    const rejected = expect(first).rejects.toThrow("cancelled");
    const second = client.load();
    await rejected;
    expect(await second).toEqual({ snippets: [row] });
    pending.resolve({ ...empty, rows: [{ ...row, body: "stale" }], total: 1 });
    await Promise.resolve();
    expect(backend.request.mock.calls.map(([value]) => value)).toEqual([
      { operation: "open", activation: "activation_0000001" },
      { operation: "close", activation: "activation_0000001" },
      { operation: "open", activation: "activation_0000002" },
      { operation: "close", activation: "activation_0000002" },
    ]);
  });

  it("cancels pending next pages and consumes their late transport rejection", async () => {
    const pending = deferred();
    const backend = transport();
    backend.request.mockImplementationOnce(async () => ({
      ok: true,
      rows: [row],
      total: 2,
      cursor,
    }));
    const nextRequested = deferred();
    backend.request.mockImplementationOnce(() => {
      nextRequested.resolve(undefined);
      return pending.promise;
    });
    const client = createSnippetCatalogClient(backend, token);
    const result = client.load();
    const rejected = expect(result).rejects.toThrow("cancelled");
    await nextRequested.promise;
    expect(backend.request).toHaveBeenCalledTimes(2);
    client.cancel();
    await rejected;
    pending.reject(new Error("Transport lost"));
  });

  it("rejects transport failure, suppresses cleanup failure, and never retries", async () => {
    const backend = {
      request: vi.fn(async () => {
        throw new Error("Transport lost");
      }),
    };
    await expect(
      createSnippetCatalogClient(backend, token).load(),
    ).rejects.toThrow("Transport lost");
    expect(backend.request).toHaveBeenCalledTimes(2);
  });
});
