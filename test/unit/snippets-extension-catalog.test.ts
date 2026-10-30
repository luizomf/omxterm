import { describe, expect, it } from "vitest";
import { createSnippetCatalog } from "../../extensions/snippets/catalog";
import {
  captureValue,
  encode,
  type Value,
} from "../../src/extension-runtime/protocol";
import type {
  TerminalSnippet,
  TerminalSnippetsResponse,
} from "../../src/shared/terminal-snippets";

function record(value: Value) {
  return value as {
    rows: Value[];
    total: number;
    cursor: string | null;
    error?: string;
  };
}
function wire(value: Value) {
  captureValue(value);
  return (
    JSON.parse(
      encode({ epoch: "a".repeat(36), sequence: 1, kind: "response", value }),
    ) as { value: Value }
  ).value;
}

describe("Snippets activation catalog transport", () => {
  it("rejects an oversized empty diagnostic page without truncation", async () => {
    const catalog = createSnippetCatalog(async () => ({
      snippets: [],
      error: "x".repeat(1_048_576),
    }));
    await expect(catalog.open()).rejects.toThrow("oversized-catalog-page");
  });
  it.each(["x", '\u0000"\\\n'.repeat(16_384)])(
    "preserves all 512 entries across bounded protocol pages (%#)",
    async (body) => {
      const snippets = Array.from({ length: 512 }, (_, index) => ({
        name: `item ${index}`,
        body,
        execute: index % 2 === 0,
      }));
      const catalog = createSnippetCatalog(async () => ({ snippets }));
      let page = record(wire(await catalog.open()));
      const rows = [...page.rows];
      let pages = 1;
      while (page.cursor) {
        const cursor = page.cursor;
        page = record(wire(catalog.next(cursor)));
        expect(() => catalog.next(cursor)).toThrow("expired-snapshot");
        rows.push(...page.rows);
        pages++;
      }
      expect(pages).toBeGreaterThan(1);
      expect(rows).toEqual(snippets);
      expect(page.total).toBe(512);
    },
  );

  it("copies the snapshot and revokes it on close or the next activation", async () => {
    const snippets: TerminalSnippet[] = Array.from({ length: 300 }, () => ({
      name: "a",
      body: "x",
      execute: false,
    }));
    const catalog = createSnippetCatalog(async () => ({ snippets }));
    const first = record(await catalog.open());
    snippets[299] = { name: "changed", body: "changed", execute: true };
    expect(record(catalog.next(first.cursor!)).rows.at(-1)).toEqual({
      name: "a",
      body: "x",
      execute: false,
    });
    const second = record(await catalog.open());
    await catalog.open();
    expect(() => catalog.next(second.cursor!)).toThrow("expired-snapshot");
    const third = record(await catalog.open());
    catalog.close();
    expect(() => catalog.next(third.cursor!)).toThrow("expired-snapshot");
  });

  it("does not publish a late read after hiding, supersession or retirement", async () => {
    const reads: ((value: TerminalSnippetsResponse) => void)[] = [];
    const catalog = createSnippetCatalog(
      () => new Promise((resolve) => reads.push(resolve)),
    );
    const first = catalog.open();
    const second = catalog.open();
    reads[0]!({ snippets: [] });
    await expect(first).rejects.toThrow("expired-snapshot");
    catalog.close();
    reads[1]!({ snippets: [] });
    await expect(second).rejects.toThrow("expired-snapshot");
    const third = catalog.open();
    catalog.dispose();
    reads[2]!({ snippets: [] });
    await expect(third).rejects.toThrow("expired-snapshot");
    await expect(catalog.open()).rejects.toThrow("retired-catalog");
  });

  it("replaces an old catalog with empty and diagnostic results without retry", async () => {
    let reads = 0;
    const catalog = createSnippetCatalog(async () => {
      reads++;
      return reads === 1
        ? { snippets: [] }
        : { snippets: [], error: "Invalid YAML" };
    });
    expect(record(wire(await catalog.open()))).toEqual({
      rows: [],
      total: 0,
      cursor: null,
    });
    expect(record(wire(await catalog.open()))).toEqual({
      rows: [],
      total: 0,
      cursor: null,
      error: "Invalid YAML",
    });
    expect(reads).toBe(2);
  });
});
