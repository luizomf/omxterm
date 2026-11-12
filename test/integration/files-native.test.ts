import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, it } from "vitest";
import { activate } from "../../extensions/files/backend";
import { buildFilesMove } from "../../scripts/build-files-move.mjs";

// Builds and loads the real Files addon headlessly. Trash runs only on Windows,
// where the test owns a temporary file; macOS trash is covered by its probe.
type FilesAddon = {
  moveNoReplace(source: string, destination: string): Promise<void>;
  trash?(target: string): Promise<string>;
};
let build: string;
let root: string;
let addon: FilesAddon;

beforeAll(async () => {
  await mkdir(".scratch", { recursive: true });
  build = await mkdtemp(path.resolve(".scratch/files-native-build-"));
  await buildFilesMove(build);
  addon = createRequire(import.meta.url)(
    path.join(build, "files-move.node"),
  ) as FilesAddon;
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-files-native-"));
}, 100_000);
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  // Windows maps the addon until this worker exits.
  if (build && process.platform !== "win32")
    await rm(build, { recursive: true, force: true });
});

it("moves without replacing an existing file or directory", async () => {
  const source = path.join(root, "source");
  const file = path.join(root, "file");
  const directory = path.join(root, "directory");
  await writeFile(source, "source");
  await writeFile(file, "preserved");
  await mkdir(directory);
  await expect(addon.moveNoReplace(source, file)).rejects.toMatchObject({
    code: "EEXIST",
  });
  await expect(addon.moveNoReplace(source, directory)).rejects.toMatchObject({
    code: "EEXIST",
  });
  expect(await readFile(file, "utf8")).toBe("preserved");
  await addon.moveNoReplace(source, path.join(root, "moved"));
  expect(await readFile(path.join(root, "moved"), "utf8")).toBe("source");
  await expect(access(source)).rejects.toMatchObject({ code: "ENOENT" });
});

it("refuses relative paths synchronously", () => {
  expect(() => addon.moveNoReplace("relative", "other")).toThrow(
    expect.objectContaining({ code: "EINVAL" }),
  );
});

it.runIf(process.platform === "win32")(
  "sends a Windows file to the Recycle Bin and refuses the drive root",
  async () => {
    const target = path.join(root, "trash me.txt");
    await writeFile(target, "recyclable");
    await expect(addon.trash!(target)).resolves.toBeTypeOf("string");
    await expect(access(target)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(addon.trash!(path.join(root, "missing"))).rejects.toThrow();
    expect(() => addon.trash!(path.parse(root).root)).toThrow(
      expect.objectContaining({ code: "EINVAL" }),
    );
  },
);

it.runIf(process.platform === "win32")(
  "recycles a junction itself, never the folder it points to",
  async () => {
    const target = path.join(root, "junction target");
    const link = path.join(root, "junction link");
    await mkdir(target);
    await writeFile(path.join(target, "kept.txt"), "kept");
    await symlink(target, link, "junction");
    await addon.trash!(link);
    await expect(access(link)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(target, "kept.txt"), "utf8")).toBe("kept");
  },
);

it.runIf(process.platform === "win32")(
  "refuses Windows spellings that name a different entry",
  async () => {
    await writeFile(path.join(root, "kept"), "kept");
    for (const spelling of ["kept.", "kept ", "kept:stream", "..."]) {
      expect(() => addon.trash!(path.join(root, spelling))).toThrow(
        expect.objectContaining({ code: "EINVAL" }),
      );
      expect(() =>
        addon.moveNoReplace(path.join(root, spelling), path.join(root, "x")),
      ).toThrow(expect.objectContaining({ code: "EINVAL" }));
    }
    expect(await readFile(path.join(root, "kept"), "utf8")).toBe("kept");
  },
);

it.runIf(process.platform === "win32")(
  "moves entries past the 260-character path limit",
  async () => {
    const deep = path.join(
      root,
      ...Array.from({ length: 6 }, () => "d".repeat(50)),
    );
    await mkdir(deep, { recursive: true });
    const source = path.join(deep, "long.txt");
    await writeFile(source, "long");
    await addon.moveNoReplace(source, path.join(deep, "moved.txt"));
    expect(await readFile(path.join(deep, "moved.txt"), "utf8")).toBe("long");
  },
);

it.runIf(process.platform === "win32")(
  "refuses, without deleting, an item on a drive with no Recycle Bin",
  async () => {
    // A subst drive has no Recycle Bin; the shell would delete permanently.
    const letter = [..."PQRSTUVWXY"].find(
      (candidate) => !existsSync(`${candidate}:\\`),
    );
    expect(letter).toBeDefined();
    const folder = path.join(root, "no bin");
    await mkdir(folder);
    await writeFile(path.join(folder, "kept.txt"), "kept");
    const run = promisify(execFile);
    await run("subst.exe", [`${letter}:`, folder]);
    try {
      await expect(addon.trash!(`${letter}:\\kept.txt`)).rejects.toMatchObject({
        code: "ENOTRASH",
      });
    } finally {
      await run("subst.exe", [`${letter}:`, "/D"]);
    }
    expect(await readFile(path.join(folder, "kept.txt"), "utf8")).toBe("kept");
  },
);

it.runIf(process.platform === "win32")(
  "deletes a folder holding a junction without touching the junction's target",
  async () => {
    const target = path.join(root, "delete target");
    const folder = path.join(root, "delete me");
    await mkdir(target);
    await writeFile(path.join(target, "kept.txt"), "kept");
    await mkdir(folder);
    await symlink(target, path.join(folder, "link"), "junction");
    const signal = new AbortController().signal;
    const backend = activate({
      signal,
      files: { moveNoReplace: (from, to) => addon.moveNoReplace(from, to) },
    });
    const prepared = (await backend.invoke(
      { operation: "prepare-delete", path: folder },
      signal,
    )) as { ok: boolean; token: string };
    expect(prepared.ok).toBe(true);
    expect(
      await backend.invoke(
        { operation: "delete", token: prepared.token },
        signal,
      ),
    ).toEqual({ ok: true });
    await expect(access(folder)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(target, "kept.txt"), "utf8")).toBe("kept");
  },
);
