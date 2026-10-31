import assert from "node:assert/strict";
import {
  copyFile,
  lstat,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it.each(["move", "copy", "wrong-error"])(
  "checks source entry disappearance after %s",
  async (mode) => {
    const source = await readFile("test/fixtures/files-packaged.cjs", "utf8");
    const end = source.indexOf(
      '  checks.push("packaged-backend-create-move-conflict");',
    );
    const start = source.lastIndexOf(
      '  await filesAction(view, "Rename / move");',
      end,
    );
    assert.ok(start > 0 && end > start);
    const execute = new Function(
      "assert",
      "readFile",
      "lstat",
      "path",
      "options",
      "apply",
      `return (async () => { const view = {}; const filesAction = async () => {}; ${source.slice(start, end)} })();`,
    ) as (...args: unknown[]) => Promise<void>;
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-move-observer-"),
    );
    try {
      await writeFile(path.join(directory, "source.txt"), "source");
      const apply = async (_view: unknown, destination: string) => {
        await (mode === "copy" ? copyFile : rename)(
          path.join(directory, "source.txt"),
          destination,
        );
      };
      const inspect =
        mode === "wrong-error"
          ? async () => {
              throw Object.assign(new Error("denied"), { code: "EACCES" });
            }
          : lstat;
      const outcome = execute(
        assert,
        readFile,
        inspect,
        path,
        { files: directory },
        apply,
      );
      if (mode === "move") await expect(outcome).resolves.toBeUndefined();
      else await expect(outcome).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
