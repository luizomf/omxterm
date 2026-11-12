import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Packaged Files smoke on a published host: install a local Files archive,
// list a directory, insert a path into the terminal, then rename a file and
// send a folder to the system trash.
//
//   OMXTERM_FILES_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_FILES_SMOKE_ARCHIVE  files-X.Y.Z.omxext
const app = process.env.OMXTERM_FILES_SMOKE_APP;
const archive = process.env.OMXTERM_FILES_SMOKE_ARCHIVE;

it.skipIf(!app || !archive)(
  "installs Files, lists a directory, inserts a path, renames and trashes",
  { timeout: 300000 },
  async () => {
    // Files shows canonical paths (macOS /var is /private/var).
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-files-smoke-")),
    );
    const directory = path.join(root, "listed");
    const fileName = "smoke file.txt";
    await mkdir(path.join(directory, "folder"), { recursive: true });
    await writeFile(path.join(directory, fileName), "smoke");
    const omxterm = await launchPackaged(
      app!,
      root,
      {},
      { defaultShell: process.platform === "win32" },
    );
    try {
      const result = (await omxterm.call(
        `files(${JSON.stringify({
          archive: path.resolve(archive!),
          directory,
          fileName,
          marker: path.join(root, "inserted.txt"),
          rename: "renamed.txt",
          trash: "folder",
        })})`,
        180000,
      )) as {
        rows: string[];
        inserted?: string;
        notices: string[];
        renamed: unknown;
        trashed: unknown;
      };
      expect(result.rows).toEqual(
        expect.arrayContaining([
          path.join(directory, "folder"),
          path.join(directory, fileName),
        ]),
      );
      expect(result.notices).toEqual([]);
      expect(result.inserted).toBe(path.join(directory, fileName));
      expect(result.renamed).toEqual({ ok: true });
      expect(await readFile(path.join(directory, "renamed.txt"), "utf8")).toBe(
        "smoke",
      );
      expect(result.trashed).toEqual({ ok: true });
      await expect(access(path.join(directory, "folder"))).rejects.toThrow();
      await omxterm.quit();
    } finally {
      await omxterm.stop();
    }
    await rm(root, { recursive: true, force: true });
  },
);
