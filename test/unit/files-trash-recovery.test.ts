import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
  lstat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Entry = {
  source: string;
  destination: string;
  contents: string;
  verified: boolean;
  restored: boolean;
};
type Recovery = {
  prepare(options: {
    files: string;
    evidence: string;
    lookup: string;
  }): Promise<Entry>;
  recover(
    entry: Entry,
    evidence: string,
    move: (from: string, to: string) => Promise<void>,
  ): Promise<void>;
};
let root: string, files: string, trash: string, recovery: Recovery;
let lookupResult: string;
const move = vi.fn(async (from: string, to: string) => {
  await assert.rejects(lstat(to), { code: "ENOENT" });
  await rename(from, to);
});
beforeEach(async () => {
  move.mockClear();
  root = await mkdtemp(path.join(os.tmpdir(), "files-recovery-unit-"));
  files = path.join(root, "files");
  trash = path.join(root, "trash");
  await mkdir(files);
  await mkdir(trash);
  lookupResult = JSON.stringify({ directory: trash });
  const require = createRequire(import.meta.url);
  const module = { exports: {} as Recovery };
  runInNewContext(
    await readFile("test/fixtures/files-trash-recovery.cjs", "utf8"),
    {
      module,
      require: (name: string): unknown =>
        name === "node:util"
          ? { promisify: () => async () => ({ stdout: lookupResult }) }
          : require(name),
    },
  );
  recovery = module.exports;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const prepare = () =>
  recovery.prepare({
    files,
    evidence: root,
    lookup: "/not-executed/unit-lookup",
  });
it("records source identity before dispatch and restores only the verified exact entry", async () => {
  const entry = await prepare();
  const before: unknown = JSON.parse(
    await readFile(path.join(root, "trash-recovery.json"), "utf8"),
  );
  expect(before).toMatchObject({
    phase: "prepared",
    verified: false,
    restored: false,
  });
  expect(
    (await lstat(path.join(root, "trash-recovery.json"))).mode & 0o777,
  ).toBe(0o600);
  await rename(entry.source, entry.destination); // Controlled stand-in, not native qualification.
  await recovery.recover(entry, root, move);
  expect(move).toHaveBeenCalledExactlyOnceWith(entry.destination, entry.source);
  expect(await readFile(entry.source, "utf8")).toBe(entry.contents);
  expect(
    JSON.parse(await readFile(path.join(root, "trash-recovery.json"), "utf8")),
  ).toMatchObject({ phase: "restored", verified: true, restored: true });
});
it.each([
  "missing",
  "different-inode",
  "different-content",
  "source-exists",
  "receipt-collision",
])(
  "refuses %s without attempting recovery or erasing evidence",
  async (mode) => {
    const entry = await prepare();
    if (mode !== "source-exists") await rename(entry.source, entry.destination);
    if (mode === "missing")
      await rename(entry.destination, path.join(trash, "unexpected-name"));
    if (mode === "different-inode") {
      const other = path.join(root, "other");
      await writeFile(other, entry.contents);
      await rename(other, entry.destination);
    }
    if (mode === "different-content")
      await writeFile(entry.destination, "changed");
    if (mode === "receipt-collision")
      await writeFile(path.join(root, "trash-recovery.next.json"), "retain");
    await expect(recovery.recover(entry, root, move)).rejects.toThrow();
    expect(move).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        await readFile(path.join(root, "trash-recovery.json"), "utf8"),
      ),
    ).toMatchObject({ restored: false });
  },
);
it("retains verified identity when no-clobber restoration fails and never retries", async () => {
  const entry = await prepare();
  await rename(entry.source, entry.destination);
  const fail = vi.fn(async () => {
    throw Error("restore refused");
  });
  await expect(recovery.recover(entry, root, fail)).rejects.toThrow(
    "restore refused",
  );
  expect(fail).toHaveBeenCalledOnce();
  expect(await readFile(entry.destination, "utf8")).toBe(entry.contents);
  expect(
    JSON.parse(await readFile(path.join(root, "trash-recovery.json"), "utf8")),
  ).toMatchObject({ verified: true, restored: false });
});
it("refuses malformed or unavailable directory lookup before creating any source", async () => {
  lookupResult = JSON.stringify({ directory: "relative" });
  await expect(prepare()).rejects.toThrow();
});
