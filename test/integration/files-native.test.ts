import { createRequire } from "node:module";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
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
