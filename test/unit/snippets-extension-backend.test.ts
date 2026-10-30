import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activate } from "../../extensions/snippets/backend";
import { backendEnvironment } from "../../src/extension-runtime/electron-runtime";
import {
  captureValue,
  encode,
  type Value,
} from "../../src/extension-runtime/protocol";
import type { LoadTerminalSnippetsOptions } from "../../src/main/snippets";

const token = "activation_token_01";
const other = "activation_token_02";
const empty = Buffer.from("version: 1\nsnippets: []\n");
const fixture = Buffer.from(
  "version: 1\nsnippets:\n  - name: literal\n    body: |+\n      echo 'hello'\n\n    execute: true\n",
);
const roots: string[] = [];
const backends: ReturnType<typeof activate>[] = [];
afterEach(async () => {
  for (const backend of backends.splice(0)) backend.deactivate();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function setup(options: LoadTerminalSnippetsOptions) {
  const owner = new AbortController();
  const backend = activate({ signal: owner.signal }, options);
  backends.push(backend);
  const call = async (
    value: unknown,
    signal = new AbortController().signal,
  ) => {
    const result = await backend.invoke(value, signal);
    captureValue(result);
    encode({
      epoch: "a".repeat(36),
      sequence: 1,
      kind: "response",
      value: result,
    });
    return result as Record<string, Value>;
  };
  return { backend, owner, call };
}
async function directory() {
  const root = await mkdtemp(path.join(os.tmpdir(), "snippets-backend-"));
  roots.push(root);
  return root;
}
function adapter(read: LoadTerminalSnippetsOptions["read"]) {
  return { environment: {}, homeDirectory: "/synthetic/home", read };
}
function deferredRead() {
  const pending: ((value: Buffer) => void)[] = [];
  const read = vi.fn(
    () => new Promise<Buffer>((resolve) => pending.push(resolve)),
  );
  return { pending, read: read as unknown as typeof readFile };
}

describe("Snippets backend caller interface", () => {
  it.each([undefined, "", "xdg"])(
    "loads real YAML only on open, preserving environment resolution and file bytes (%s)",
    async (xdg) => {
      const home = await directory();
      const root = xdg ? path.join(home, xdg) : path.join(home, ".config");
      const filename = path.join(root, "omxterm", "snippets.yaml");
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, fixture);
      const environment = backendEnvironment({
        HOME: home,
        XDG_CONFIG_HOME: xdg === undefined ? undefined : xdg ? root : "",
      });
      expect(environment.HOME).toBe(home);
      expect(environment.XDG_CONFIG_HOME).toBe(xdg ? root : xdg);
      const { call, backend } = setup({ environment, homeDirectory: home });
      expect(await call({ operation: "open", activation: token })).toEqual({
        ok: true,
        rows: [{ name: "literal", body: "echo 'hello'\n\n", execute: true }],
        total: 1,
        cursor: null,
      });
      await writeFile(filename, empty);
      expect(
        await call({ operation: "open", activation: other }),
      ).toMatchObject({
        ok: true,
        rows: [],
        total: 0,
      });
      await writeFile(filename, fixture);
      await call({ operation: "close", activation: token });
      backend.deactivate();
      expect(await readFile(filename)).toEqual(fixture);
    },
  );

  it("does not read at startup, on malformed requests, or after retirement", async () => {
    const read = vi.fn(async () => empty);
    const { call, backend } = setup(
      adapter(read as unknown as typeof readFile),
    );
    expect(read).not.toHaveBeenCalled();
    for (const value of [
      null,
      [],
      {},
      { operation: "write", activation: token },
      { operation: "open", activation: token, path: "/other" },
      { operation: "open", activation: "short" },
    ]) {
      expect(await call(value)).toEqual({
        ok: false,
        error: "invalid-request",
      });
    }
    await call({ operation: "close", activation: token });
    await call({ operation: "next", activation: token, cursor: "missing" });
    backend.deactivate();
    expect(await call({ operation: "open", activation: token })).toEqual({
      ok: false,
      error: "unavailable",
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("returns clean absence without creating a file, and replaces invalid YAML with diagnostics without writes or retries", async () => {
    const home = await directory();
    const filename = path.join(home, ".config", "omxterm", "snippets.yaml");
    const { call, owner } = setup({ environment: {}, homeDirectory: home });
    expect(await call({ operation: "open", activation: token })).toEqual({
      ok: true,
      rows: [],
      total: 0,
      cursor: null,
    });
    await expect(readFile(filename)).rejects.toMatchObject({ code: "ENOENT" });
    await mkdir(path.dirname(filename), { recursive: true });
    const invalid = Buffer.from("version: 9\nsnippets: []\n");
    await writeFile(filename, invalid);
    const response = await call({ operation: "open", activation: other });
    expect(response).toMatchObject({
      ok: true,
      rows: [],
      total: 0,
      cursor: null,
    });
    expect(response.error).toContain("version");
    expect(response.error).toContain("must be 1");
    owner.abort();
    expect(await readFile(filename)).toEqual(invalid);
  });

  it.each(["close", "request", "owner", "deactivate"])(
    "revokes pending reads on %s without publishing late results or retrying",
    async (action) => {
      const { read, pending } = deferredRead();
      const { call, owner, backend } = setup(adapter(read));
      const request = new AbortController();
      const opening = call(
        { operation: "open", activation: token },
        request.signal,
      );
      if (action === "close")
        await call({ operation: "close", activation: token });
      if (action === "request") request.abort();
      if (action === "owner") owner.abort();
      if (action === "deactivate") backend.deactivate();
      pending[0]!(fixture);
      expect(await opening).toMatchObject({ ok: false });
      expect(read).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps concurrent view snapshots independent and prevents an old read from replacing a newer activation", async () => {
    const { read, pending } = deferredRead();
    const { call } = setup(adapter(read));
    const first = call({ operation: "open", activation: token });
    expect(await call({ operation: "open", activation: token })).toEqual({
      ok: false,
      error: "activation-in-use",
    });
    const second = call({ operation: "open", activation: other });
    await call({ operation: "close", activation: token });
    pending[1]!(fixture);
    expect(await second).toMatchObject({ ok: true, total: 1 });
    pending[0]!(empty);
    expect(await first).toMatchObject({ ok: false });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("transfers 512 exact entries in immutable bounded pages with long escaped bodies", async () => {
    const snippets = Array.from({ length: 512 }, (_, index) => ({
      name: `item ${index}`,
      body: index < 2 ? '\u0000"\\\n'.repeat(16_384) : `echo ${index}\n`,
      execute: index % 2 === 0,
    }));
    let bytes = Buffer.from(JSON.stringify({ version: 1, snippets }));
    const read = vi.fn(async () => bytes);
    const { call } = setup(adapter(read as unknown as typeof readFile));
    let page = await call({ operation: "open", activation: token });
    const rows = [...(page.rows as Value[])];
    expect(page.cursor).toEqual(expect.any(String));
    bytes = empty;
    // Another view opening must not supersede this view's in-flight snapshot.
    expect(await call({ operation: "open", activation: other })).toMatchObject({
      total: 0,
    });
    while (page.cursor) {
      const cursor = page.cursor;
      page = await call({ operation: "next", activation: token, cursor });
      expect(page.ok).toBe(true);
      expect((page.rows as Value[]).length).toBeLessThanOrEqual(256);
      rows.push(...(page.rows as Value[]));
    }
    expect(rows).toEqual(snippets);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each(["close", "request", "owner", "deactivate"])(
    "revokes retained cursors on %s",
    async (action) => {
      const snippets = Array.from({ length: 512 }, () => ({
        name: "item",
        body: "x",
      }));
      const read = vi.fn(async () =>
        Buffer.from(JSON.stringify({ version: 1, snippets })),
      );
      const { call, owner, backend } = setup(
        adapter(read as unknown as typeof readFile),
      );
      const request = new AbortController();
      const page = await call(
        { operation: "open", activation: token },
        request.signal,
      );
      expect(page.cursor).toEqual(expect.any(String));
      if (action === "close")
        await call({ operation: "close", activation: token });
      if (action === "request") request.abort();
      if (action === "owner") owner.abort();
      if (action === "deactivate") backend.deactivate();
      expect(
        await call({
          operation: "next",
          activation: token,
          cursor: page.cursor,
        }),
      ).toMatchObject({ ok: false });
      expect(read).toHaveBeenCalledTimes(1);
    },
  );
});
