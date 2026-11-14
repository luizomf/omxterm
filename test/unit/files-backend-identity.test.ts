import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activate } from "../../extensions/files/backend.js";
import type { Value } from "../../src/extension-runtime/protocol.js";

// NTFS file IDs go past 2^53. Node reports them exactly only as bigints; as
// numbers these two IDs (seen on Windows 11, #1149) round to the same value.
const before = 10977524092313715n;
const after = 10977524092313716n;
const fileIds = vi.hoisted(() => new Map<string, bigint>());
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    lstat: async (file: string, options?: { bigint?: boolean }) => {
      const stat = await actual.lstat(file, options);
      const id = fileIds.get(file);
      if (id === undefined) return stat;
      return Object.assign(stat, { ino: options?.bigint ? id : Number(id) });
    },
  };
});

let root: string;
const signal = new AbortController().signal;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-files-identity-"));
});
afterEach(async () => {
  fileIds.clear();
  await rm(root, { recursive: true, force: true });
});
async function invoke(
  files: ReturnType<typeof activate>,
  request: Record<string, Value>,
) {
  return (await files.invoke(request, signal)) as Record<string, Value>;
}
async function replace(file: string, id: bigint) {
  await rename(file, path.join(root, "renamed-away"));
  await writeFile(file, "replacement");
  fileIds.set(file, id);
}

it("treats file IDs that differ only past 2^53 as different files", () => {
  expect(Number(before)).toBe(Number(after));
});

it("refuses a confirmed delete when a file with a nearly equal large ID took the path", async () => {
  const files = activate({
    signal,
    files: { moveNoReplace: vi.fn(async () => {}) },
  });
  const target = path.join(root, "target");
  await writeFile(target, "original");
  fileIds.set(target, before);
  const confirmation = await invoke(files, {
    operation: "prepare-delete",
    path: target,
  });
  expect(confirmation.ok).toBe(true);
  await replace(target, after);

  const result = await invoke(files, {
    operation: "delete",
    token: confirmation.token!,
  });

  expect(result.ok).toBe(false);
  expect(await readFile(target, "utf8")).toBe("replacement");
});

it("refuses a prepared move when a file with a nearly equal large ID took the source path", async () => {
  const moveNoReplace = vi.fn(async () => {});
  const files = activate({ signal, files: { moveNoReplace } });
  const source = path.join(root, "source");
  const directory = path.join(root, "destination");
  await writeFile(source, "original");
  await mkdir(directory);
  fileIds.set(source, before);
  const prepared = await invoke(files, {
    operation: "prepare-move-into",
    path: source,
    directory,
    kind: "file",
  });
  expect(prepared.ok).toBe(true);
  await replace(source, after);

  const result = await invoke(files, {
    operation: "move-into",
    token: prepared.token!,
  });

  expect(result).toEqual({ ok: false, error: "changed-entry" });
  expect(moveNoReplace).not.toHaveBeenCalled();
});
