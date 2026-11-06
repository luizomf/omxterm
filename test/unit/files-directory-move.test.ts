import { createRequire } from "node:module";
import {
  mkdtemp,
  mkdir,
  lstat,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activate } from "../../extensions/files/backend.js";
import type { Value } from "../../src/extension-runtime/protocol.js";

let root: string;
const signal = new AbortController().signal;
const object = (value: Value) => value as Record<string, Value>;
const invoke = (files: ReturnType<typeof activate>, value: Value) =>
  files.invoke(value, signal);
const prepare = (
  files: ReturnType<typeof activate>,
  source: string,
  directory: string,
  kind = "file",
) =>
  invoke(files, {
    operation: "prepare-move-into",
    path: source,
    directory,
    kind,
  });
const commit = (files: ReturnType<typeof activate>, token: Value) =>
  invoke(files, { operation: "move-into", token });
function backend(
  moveNoReplace: (source: string, destination: string) => Promise<void> = vi.fn(
    async (_source: string, _destination: string) => {},
  ),
) {
  return {
    files: activate({ signal, files: { moveNoReplace } }),
    moveNoReplace,
  };
}
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "omx-directory-move-"));
  await mkdir(path.join(root, "folder"));
  await writeFile(path.join(root, "source"), "source bytes");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it("captures canonical source and destination, requires a one-shot token, and calls the existing service", async () => {
  const { files, moveNoReplace } = backend();
  const result = object(
    await prepare(files, path.join(root, "source"), path.join(root, "folder")),
  );
  expect(result.ok).toBe(true);
  expect(typeof result.token).toBe("string");
  const realRoot = await import("node:fs/promises").then((fs) =>
    fs.realpath(root),
  );
  expect(result.path).toBe(path.join(realRoot, "source"));
  expect(result.directory).toBe(path.join(realRoot, "folder"));
  expect(await commit(files, result.token!)).toEqual({ ok: true });
  expect(moveNoReplace).toHaveBeenCalledExactlyOnceWith(
    result.path,
    path.join(realRoot, "folder", "source"),
  );
  expect(await commit(files, result.token!)).toEqual({
    ok: false,
    error: "expired-confirmation",
  });
});

it("refuses same-directory, self, descendant, symlink destination and changed kinds before dispatch", async () => {
  const { files, moveNoReplace } = backend();
  const source = path.join(root, "source");
  const folder = path.join(root, "folder");
  await mkdir(path.join(folder, "child"));
  await symlink(folder, path.join(root, "alias"));
  expect(await prepare(files, source, root)).toEqual({
    ok: false,
    error: "same-directory",
  });
  expect(await prepare(files, folder, folder, "directory")).toEqual({
    ok: false,
    error: "self-or-descendant",
  });
  expect(
    await prepare(files, folder, path.join(folder, "child"), "directory"),
  ).toEqual({ ok: false, error: "self-or-descendant" });
  expect(
    await prepare(
      files,
      folder,
      path.join(root, "alias", "child"),
      "directory",
    ),
  ).toEqual({ ok: false, error: "self-or-descendant" });
  expect(await prepare(files, source, path.join(root, "alias"))).toEqual({
    ok: false,
    error: "target-not-directory",
  });
  expect(await prepare(files, source, source)).toEqual({
    ok: false,
    error: "target-not-directory",
  });
  expect(await prepare(files, source, path.join(root, "missing"))).toEqual({
    ok: false,
    error: "not-found",
  });
  expect(await prepare(files, source, folder, "directory")).toEqual({
    ok: false,
    error: "changed-entry",
  });
  expect(await prepare(files, source, "relative")).toEqual({
    ok: false,
    error: "invalid-path",
  });
  // Windows lstat reports ENOENT for a child under a regular file, while
  // POSIX reports ENOTDIR. The backend intentionally maps the OS error.
  expect(await prepare(files, source, path.join(source, "child"))).toEqual({
    ok: false,
    error: process.platform === "win32" ? "not-found" : "not-directory",
  });
  expect(moveNoReplace).not.toHaveBeenCalled();
});

it.each(["source", "directory", "target-link"])(
  "refuses a replaced %s after confirmation",
  async (change) => {
    const { files, moveNoReplace } = backend();
    const source = path.join(root, "source");
    const folder = path.join(root, "folder");
    const result = object(await prepare(files, source, folder));
    if (change === "source") {
      await rename(source, path.join(root, "old-source"));
      await writeFile(source, "replacement");
    } else {
      await rename(folder, path.join(root, "old-folder"));
      if (change === "directory") await mkdir(folder);
      else await symlink(path.join(root, "old-folder"), folder);
    }
    expect(await commit(files, result.token!)).toEqual({
      ok: false,
      error:
        change === "target-link" ? "target-not-directory" : "changed-entry",
    });
    expect(await commit(files, result.token!)).toEqual({
      ok: false,
      error: "expired-confirmation",
    });
    expect(moveNoReplace).not.toHaveBeenCalled();
  },
);

it.each([
  ["EEXIST", "conflict"],
  ["EXDEV", "cross-device"],
  ["EACCES", "permission"],
  ["ENOTSUP", "unsupported"],
  ["EIO", "outcome-unknown"],
])(
  "reports %s once without overwriting, copying, deleting or retrying",
  async (code, error) => {
    const move = vi.fn(async () => {
      throw Object.assign(new Error(code), { code });
    });
    const { files } = backend(move);
    const source = path.join(root, "source");
    const result = object(
      await prepare(files, source, path.join(root, "folder")),
    );
    expect(await commit(files, result.token!)).toEqual({ ok: false, error });
    expect(await readFile(source, "utf8")).toBe("source bytes");
    await expect(
      lstat(path.join(root, "folder", "source")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await commit(files, result.token!)).toEqual({
      ok: false,
      error: "expired-confirmation",
    });
    expect(move).toHaveBeenCalledTimes(1);
  },
);

it("cancels and evicts confirmations without rebinding them", async () => {
  const { files, moveNoReplace } = backend();
  const source = path.join(root, "source");
  const folder = path.join(root, "folder");
  const tokens: Value[] = [];
  for (let i = 0; i < 9; i++)
    tokens.push(object(await prepare(files, source, folder)).token!);
  expect(await commit(files, tokens[0]!)).toEqual({
    ok: false,
    error: "expired-confirmation",
  });
  await invoke(files, { operation: "cancel-move", token: tokens[1]! });
  expect(await commit(files, tokens[1]!)).toEqual({
    ok: false,
    error: "expired-confirmation",
  });
  expect(moveNoReplace).not.toHaveBeenCalled();
});

const nativePath = process.env.OMXTERM_FILES_MOVE_NATIVE;
it.skipIf(!nativePath)(
  "moves only synthetic entries with the actual no-replace addon",
  async () => {
    const native = createRequire(import.meta.url)(nativePath!) as {
      moveNoReplace(source: string, destination: string): Promise<void>;
    };
    const { files } = backend(native.moveNoReplace);
    const folder = path.join(root, "folder");
    const source = path.join(root, "source");
    const move = async (entry: string, kind: string) => {
      const result = object(await prepare(files, entry, folder, kind));
      expect(result.ok).toBe(true);
      return commit(files, result.token!);
    };
    await writeFile(path.join(folder, "source"), "destination bytes");
    expect(await move(source, "file")).toEqual({
      ok: false,
      error: "conflict",
    });
    expect(await readFile(source, "utf8")).toBe("source bytes");
    expect(await readFile(path.join(folder, "source"), "utf8")).toBe(
      "destination bytes",
    );
    await rm(path.join(folder, "source"));
    expect(await move(source, "file")).toEqual({ ok: true });
    await expect(lstat(source)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(folder, "source"), "utf8")).toBe(
      "source bytes",
    );
    await symlink("folder/source", path.join(root, "link"));
    expect(await move(path.join(root, "link"), "link")).toEqual({ ok: true });
    expect(await readlink(path.join(folder, "link"))).toBe("folder/source");
    expect(await readFile(path.join(folder, "source"), "utf8")).toBe(
      "source bytes",
    );
    await mkdir(path.join(root, "subdir"));
    await writeFile(path.join(root, "subdir", "inside"), "directory bytes");
    expect(await move(path.join(root, "subdir"), "directory")).toEqual({
      ok: true,
    });
    expect(await readFile(path.join(folder, "subdir", "inside"), "utf8")).toBe(
      "directory bytes",
    );
  },
);

const otherVolume = process.env.OMXTERM_FILES_MOVE_OTHER;
it.skipIf(!nativePath || !otherVolume)(
  "refuses an actual cross-volume move without copy or deletion",
  async () => {
    const native = createRequire(import.meta.url)(nativePath!) as {
      moveNoReplace(source: string, destination: string): Promise<void>;
    };
    const other = await mkdtemp(path.join(otherVolume!, "omx-directory-move-"));
    try {
      expect((await stat(root)).dev).not.toBe((await stat(other)).dev);
      const source = path.join(root, "source");
      const { files } = backend(native.moveNoReplace);
      const result = object(await prepare(files, source, other));
      expect(result.ok).toBe(true);
      expect(await commit(files, result.token!)).toEqual({
        ok: false,
        error: "cross-device",
      });
      expect(await readFile(source, "utf8")).toBe("source bytes");
      await expect(lstat(path.join(other, "source"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  },
);
