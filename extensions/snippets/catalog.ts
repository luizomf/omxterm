import { randomUUID } from "node:crypto";
import {
  boundedValue,
  MESSAGE_BYTES,
  type Value,
} from "../../src/extension-runtime/protocol.js";
import type {
  TerminalSnippet,
  TerminalSnippetsResponse,
} from "../../src/shared/terminal-snippets.js";

/** One view's activation snapshot. Superseding or closing it revokes every cursor. */
export function createSnippetCatalog(
  load: () => Promise<TerminalSnippetsResponse>,
) {
  let revision = 0;
  let disposed = false;
  let snapshot:
    | {
        cursor: string;
        rows: readonly TerminalSnippet[];
        offset: number;
        error?: string;
      }
    | undefined;

  function close() {
    revision++;
    snapshot = undefined;
  }

  function page(cursor: string): Value {
    if (disposed || !snapshot || snapshot.cursor !== cursor)
      throw new Error("expired-snapshot");
    const current = snapshot;
    const rows: Value[] = [];
    const next = randomUUID();
    const response = (): Value => ({
      rows,
      total: current.rows.length,
      cursor: current.offset + rows.length < current.rows.length ? next : null,
      ...(current.error === undefined ? {} : { error: current.error }),
    });
    while (
      current.offset + rows.length < current.rows.length &&
      rows.length < 256
    ) {
      const row = current.rows[current.offset + rows.length]!;
      rows.push({ ...row });
      const candidate = response();
      if (
        // Reserve the backend's success envelope in the capture budget.
        !boundedValue({ ok: true, ...(candidate as Record<string, Value>) }) ||
        Buffer.byteLength(JSON.stringify(candidate)) > MESSAGE_BYTES - 1024
      ) {
        rows.pop();
        break;
      }
    }
    if (!rows.length && current.offset < current.rows.length) {
      close();
      throw new Error("oversized-snippet");
    }
    const result = response();
    if (
      !boundedValue({ ok: true, ...(result as Record<string, Value>) }) ||
      Buffer.byteLength(JSON.stringify(result)) > MESSAGE_BYTES - 1024
    ) {
      close();
      throw new Error("oversized-catalog-page");
    }
    current.offset += rows.length;
    if (current.offset === current.rows.length) snapshot = undefined;
    else current.cursor = next;
    return result;
  }

  return {
    async open(): Promise<Value> {
      if (disposed) throw new Error("retired-catalog");
      close();
      const activation = revision;
      const catalog = await load();
      if (disposed || activation !== revision)
        throw new Error("expired-snapshot");
      // Copy once: a later reader mutation cannot change an in-flight snapshot.
      const cursor = randomUUID();
      snapshot = {
        cursor,
        rows: catalog.snippets.map((row) => ({ ...row })),
        offset: 0,
        ...(catalog.error === undefined ? {} : { error: catalog.error }),
      };
      return page(cursor);
    },
    next: page,
    close,
    dispose() {
      disposed = true;
      close();
    },
  };
}
