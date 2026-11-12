import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Packaged Mirror Typing smoke on a published host: install a local archive,
// split the tab, start mirroring with Enter, then check that typing reaches
// both shells and that clicking a mark, paste, a file drop and (optionally) a snippet
// Insert each leave the next command in one shell only.
//
//   OMXTERM_MIRROR_SMOKE_APP       .AppImage, .app bundle or packaged executable
//   OMXTERM_MIRROR_SMOKE_ARCHIVE   mirror-typing-X.Y.Z.omxext
//   OMXTERM_MIRROR_SMOKE_SNIPPETS  snippets-X.Y.Z.omxext (optional)
const app = process.env.OMXTERM_MIRROR_SMOKE_APP;
const archive = process.env.OMXTERM_MIRROR_SMOKE_ARCHIVE;
const snippetsArchive = process.env.OMXTERM_MIRROR_SMOKE_SNIPPETS;

it.skipIf(!app || !archive)(
  "installs Mirror Typing and mirrors typing until Stop, paste, drop or a snippet",
  { timeout: 300000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-mirror-smoke-")),
    );
    const marker = path.join(root, "mirror");
    const dropped = path.join(root, "dropped.txt");
    await writeFile(dropped, "");
    if (snippetsArchive) {
      const catalog = path.join(root, "home/.config/omxterm/snippets.yaml");
      await mkdir(path.dirname(catalog), { recursive: true });
      await writeFile(
        catalog,
        [
          "version: 1",
          "snippets:",
          "  - name: Mirror smoke",
          "    body: |-",
          process.platform === "win32"
            ? `      Add-Content -LiteralPath '${marker}.snippet' $PID`
            : `      echo $$ >> '${marker}.snippet'`,
          "    execute: false",
          "",
        ].join("\n"),
      );
    }
    // Windows runs its Default Shell, PowerShell; elsewhere /bin/sh.
    const omxterm = await launchPackaged(
      app!,
      root,
      {},
      { defaultShell: process.platform === "win32" },
    );
    try {
      const result = (await omxterm.call(
        `mirror(${JSON.stringify({
          archive: path.resolve(archive!),
          snippetsArchive: snippetsArchive && path.resolve(snippetsArchive),
          marker,
          dropped,
        })})`,
        240000,
      )) as {
        consents: string[];
        palette: string[];
        strayKeysStarted: boolean;
        otherPaneReached: boolean;
        panes: string[];
        active: string;
        grid: { active: number[][]; stopped: number[][] };
        steps: Record<string, string | string[]>;
        paste: Record<string, { status: string; lines: string[] }>;
      };
      const { steps } = result;
      expect(result.palette).toContain("Mirror Typing");
      expect(Object.keys(result.paste)).toEqual(
        process.platform === "linux"
          ? ["menu", "shortcut", "middleClick"]
          : ["menu", "shortcut"],
      );
      expect(result.strayKeysStarted).toBe(false);
      expect(result.panes).toHaveLength(2);
      // Marks never change the grid: same canvases with and without them.
      expect(result.grid.active).toHaveLength(2);
      for (const [width, height] of result.grid.active) {
        expect(width).toBeGreaterThan(0);
        expect(height).toBeGreaterThan(0);
      }
      expect(result.grid.stopped).toEqual(result.grid.active);
      expect(result.active).toBe(
        "Mirroring typing from this pane. Click to stop.",
      );
      // Two different shells ran the one typed command.
      expect(new Set(steps.typing).size).toBe(2);
      expect(steps.stopStatus).toBe("");
      expect(steps.stopped).toHaveLength(1);
      for (const [status, lines] of [
        ...Object.values(result.paste).map(({ status, lines }) => [
          status,
          lines,
        ]),
        [steps.dropStatus, steps.dropped],
        ...(snippetsArchive ? [[steps.snippetStatus, steps.snippet]] : []),
      ]) {
        expect(status).toBe(
          "Mirroring stopped, so this went to one pane only.",
        );
        expect(lines).toHaveLength(1);
      }
      expect(steps.dropped![0]).toContain("dropped.txt");
      if (process.platform !== "win32")
        expect(result.otherPaneReached).toBe(true);
      await omxterm.quit();
    } finally {
      await omxterm.stop();
    }
    await rm(root, { recursive: true, force: true });
  },
);
