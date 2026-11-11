import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Packaged Snippets smoke on a published host: install a local Snippets
// archive, pick a snippet from snippets.yaml and check what the shell received.
//
//   OMXTERM_SNIPPETS_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_SNIPPETS_SMOKE_ARCHIVE  snippets-X.Y.Z.omxext
const app = process.env.OMXTERM_SNIPPETS_SMOKE_APP;
const archive = process.env.OMXTERM_SNIPPETS_SMOKE_ARCHIVE;

it.skipIf(!app || !archive || process.platform === "win32")(
  "installs Snippets and inserts a snippet into the terminal",
  { timeout: 300000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-snippets-smoke-")),
    );
    const marker = path.join(root, "inserted.txt");
    const name = "Smoke snippet";
    const config = path.join(root, "home/.config/omxterm");
    await mkdir(config, { recursive: true });
    await writeFile(
      path.join(config, "snippets.yaml"),
      [
        "version: 1",
        "snippets:",
        `  - name: ${name}`,
        "    body: |-",
        `      printf '%s' snippet-smoke > '${marker}'`,
        "    execute: false",
        "",
      ].join("\n"),
    );
    const omxterm = await launchPackaged(app!, root);
    try {
      const result = (await omxterm.call(
        `snippets(${JSON.stringify({
          archive: path.resolve(archive!),
          name,
          marker,
        })})`,
        180000,
      )) as { inserted?: string; notices: string[] };
      expect(result.notices).toEqual([]);
      expect(result.inserted).toBe("snippet-smoke");
      await omxterm.quit();
    } finally {
      await omxterm.stop();
    }
    await rm(root, { recursive: true, force: true });
  },
);
