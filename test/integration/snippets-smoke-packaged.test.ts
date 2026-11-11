import {
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

// Packaged Snippets smoke on a published host: install a local Snippets
// archive, then Insert and Run snippets from snippets.yaml and check what the
// shell received.
//
//   OMXTERM_SNIPPETS_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_SNIPPETS_SMOKE_ARCHIVE  snippets-X.Y.Z.omxext
const app = process.env.OMXTERM_SNIPPETS_SMOKE_APP;
const archive = process.env.OMXTERM_SNIPPETS_SMOKE_ARCHIVE;

it.skipIf(!app || !archive || process.platform === "win32")(
  "installs Snippets, then inserts and runs snippets in the terminal",
  { timeout: 300000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-snippets-smoke-")),
    );
    const marker = path.join(root, "snippet.txt");
    const catalog = path.join(root, "home/.config/omxterm/snippets.yaml");
    const yaml = [
      "version: 1",
      "snippets:",
      "  - name: Smoke insert",
      "    body: |-",
      `      printf '%s' inserted > '${marker}'`,
      "    execute: false",
      "  - name: Smoke run",
      "    body: |-",
      `      printf '%s' ran > '${marker}.run'`,
      "    execute: true",
      "",
    ].join("\n");
    await mkdir(path.dirname(catalog), { recursive: true });
    await writeFile(catalog, yaml);
    const omxterm = await launchPackaged(app!, root);
    try {
      const result = (await omxterm.call(
        `snippets(${JSON.stringify({
          archive: path.resolve(archive!),
          insert: "Smoke insert",
          run: "Smoke run",
          marker,
        })})`,
        180000,
      )) as { inserted?: string; ran?: string; notices: string[] };
      expect(result.notices).toEqual([]);
      expect(result.inserted).toBe("inserted");
      expect(result.ran).toBe("ran");
      await omxterm.quit();
    } finally {
      await omxterm.stop();
    }
    expect(await readFile(catalog, "utf8")).toBe(yaml);
    await rm(root, { recursive: true, force: true });
  },
);
