import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  symlink,
  lstat,
  rm,
  rename,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activate } from "../../extensions/files/backend.js";
import {
  boundedValue,
  type Value,
} from "../../src/extension-runtime/protocol.js";
let root: string;
const signal = new AbortController().signal;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-files-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const noMove = async () => {
  throw Object.assign(new Error("refused"), { code: "EXDEV" });
};
function backend(trash = vi.fn(async () => {})) {
  return activate({ signal, files: { moveNoReplace: noMove, trash } });
}
function object(value: Value) {
  return value as Record<string, Value>;
}
describe("separately installed Files backend", () => {
  it("reclaims abandoned cursor/confirmation capacity and never rebinds expired authority", async () => {
    await Promise.all(
      Array.from({ length: 101 }, (_, i) =>
        writeFile(path.join(root, `item-${i}`), "retained"),
      ),
    );
    const files = backend();
    const cursors: Value[] = [];
    const tokens: Value[] = [];
    const target = path.join(root, "item-0");
    for (let i = 0; i < 9; i++) {
      const departed = new AbortController();
      const list = object(
        await files.invoke({ operation: "list", path: root }, departed.signal),
      );
      const confirmation = object(
        await files.invoke(
          { operation: "prepare-delete", path: target },
          departed.signal,
        ),
      );
      expect(list.ok).toBe(true);
      expect(confirmation.ok).toBe(true);
      cursors.push(list.cursor!);
      tokens.push(confirmation.token!);
      departed.abort();
    }
    expect(
      object(
        await files.invoke(
          { operation: "list-next", cursor: cursors[0]! },
          signal,
        ),
      ).ok,
    ).toBe(false);
    expect(
      object(
        await files.invoke({ operation: "delete", token: tokens[0]! }, signal),
      ).ok,
    ).toBe(false);
    expect(await readFile(target, "utf8")).toBe("retained");
    expect(
      object(
        await files.invoke(
          { operation: "list-next", cursor: cursors[1]! },
          signal,
        ),
      ).ok,
    ).toBe(true);
    expect(
      await files.invoke({ operation: "delete", token: tokens[1]! }, signal),
    ).toEqual({ ok: true });
    await expect(lstat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("lists bounded snapshots, identifies symlinks, and consumes cursors", async () => {
    await Promise.all(
      Array.from({ length: 202 }, (_, i) =>
        writeFile(path.join(root, `file-${i}`), "x"),
      ),
    );
    await symlink("file-0", path.join(root, "link"));
    const files = backend();
    let page = object(
      await files.invoke({ operation: "list", path: root }, signal),
    );
    let count = 0;
    let link = false;
    const first = page.cursor;
    while (true) {
      expect(boundedValue(page)).toBe(true);
      const rows = page.rows as Record<string, Value>[];
      expect(rows.length).toBeLessThanOrEqual(100);
      count += rows.length;
      link ||= rows.some((row) => row.name === "link" && row.kind === "link");
      if (page.cursor === null) break;
      page = object(
        await files.invoke(
          { operation: "list-next", cursor: page.cursor! },
          signal,
        ),
      );
    }
    expect(count).toBe(203);
    expect(link).toBe(true);
    expect(
      object(
        await files.invoke({ operation: "list-next", cursor: first! }, signal),
      ).ok,
    ).toBe(false);
  });
  it("creates exclusively and refuses unsupported cross-device move without copy/delete", async () => {
    const files = backend();
    const target = path.join(root, "file");
    expect(
      await files.invoke({ operation: "create-file", path: target }, signal),
    ).toEqual({ ok: true });
    await writeFile(target, "retained");
    expect(
      await files.invoke({ operation: "create-file", path: target }, signal),
    ).toEqual({ ok: false, error: "conflict" });
    expect(await readFile(target, "utf8")).toBe("retained");
    expect(
      await files.invoke(
        {
          operation: "create-directory",
          path: path.join(root, "absent", "child"),
        },
        signal,
      ),
    ).toEqual({ ok: false, error: "not-found" });
    expect(
      await files.invoke(
        {
          operation: "move",
          path: target,
          destination: path.join(root, "new"),
        },
        signal,
      ),
    ).toEqual({ ok: false, error: "cross-device" });
    expect(await readFile(target, "utf8")).toBe("retained");
  });
  it("permanent delete requires a separate one-shot captured confirmation and does not follow links", async () => {
    const files = backend();
    const target = path.join(root, "target");
    const link = path.join(root, "link");
    await mkdir(target);
    await writeFile(path.join(target, "keep"), "safe");
    await symlink(target, link);
    expect(
      object(await files.invoke({ operation: "delete", path: link }, signal))
        .ok,
    ).toBe(false);
    const confirmation = object(
      await files.invoke({ operation: "prepare-delete", path: link }, signal),
    );
    expect(
      await files.invoke(
        { operation: "delete", token: confirmation.token! },
        signal,
      ),
    ).toEqual({ ok: true });
    expect(await readFile(path.join(target, "keep"), "utf8")).toBe("safe");
    expect(
      object(
        await files.invoke(
          { operation: "delete", token: confirmation.token! },
          signal,
        ),
      ).ok,
    ).toBe(false);
  });
  it("rejects changed entries and never converts failed trash to permanent deletion", async () => {
    const trash = vi.fn(async () => {
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    });
    const files = backend(trash);
    const target = path.join(root, "target");
    await writeFile(target, "original");
    const confirmation = object(
      await files.invoke({ operation: "prepare-delete", path: target }, signal),
    );
    await rename(target, path.join(root, "saved"));
    await writeFile(target, "replacement");
    expect(
      object(
        await files.invoke(
          { operation: "delete", token: confirmation.token! },
          signal,
        ),
      ).ok,
    ).toBe(false);
    expect(
      await files.invoke({ operation: "trash", path: target }, signal),
    ).toEqual({ ok: false, error: "outcome-unknown" });
    expect(await readFile(target, "utf8")).toBe("replacement");
    expect(trash).toHaveBeenCalledWith(target, signal);
  });
  it("keeps trash separate from one-shot permanent-delete confirmation", async () => {
    const trash = vi.fn(async () => {
      throw Object.assign(new Error("EIO"), { code: "EIO" });
    });
    const files = backend(trash);
    const target = path.join(root, "preserved");
    await writeFile(target, "safe");
    const confirmation = object(
      await files.invoke({ operation: "prepare-delete", path: target }, signal),
    );
    expect(
      object(
        await files.invoke(
          { operation: "trash", path: target },
          AbortSignal.abort(),
        ),
      ).ok,
    ).toBe(false);
    expect(trash).not.toHaveBeenCalled();
    expect(
      await files.invoke({ operation: "trash", path: target }, signal),
    ).toEqual({ ok: false, error: "outcome-unknown" });
    expect(await readFile(target, "utf8")).toBe("safe");
    expect(trash).toHaveBeenCalledExactlyOnceWith(target, signal);
    // Only this separate, deliberate confirmation can permanently delete it.
    expect(
      await files.invoke(
        { operation: "delete", token: confirmation.token! },
        signal,
      ),
    ).toEqual({ ok: true });
    expect(
      object(
        await files.invoke(
          { operation: "delete", token: confirmation.token! },
          signal,
        ),
      ).ok,
    ).toBe(false);
  });
  it("refuses aborted requests without dispatching mutations", async () => {
    const files = backend();
    const cancelled = AbortSignal.abort();
    const target = path.join(root, "absent");
    expect(
      object(
        await files.invoke(
          { operation: "create-file", path: target },
          cancelled,
        ),
      ).ok,
    ).toBe(false);
    await expect(lstat(target)).rejects.toHaveProperty("code", "ENOENT");
  });
});
