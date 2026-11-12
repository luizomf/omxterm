import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Packaged Saved Layout smoke on a published host: install a local archive,
// arrange two tabs and a split in a reported folder, save, quit, then reopen
// the app, open the saved layout and ask the restored shell where it started.
// The Default Shell runs in both launches (PowerShell on Windows).
//
//   OMXTERM_RESTORATION_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_RESTORATION_SMOKE_ARCHIVE  restoration-X.Y.Z.omxext
const app = process.env.OMXTERM_RESTORATION_SMOKE_APP;
const archive = process.env.OMXTERM_RESTORATION_SMOKE_ARCHIVE;

it.skipIf(!app || !archive)(
  "saves a window's tabs, splits and folder and opens them after a restart",
  { timeout: 400000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-layout-smoke-")),
    );
    const folder = path.join(root, "home", "project");
    await mkdir(folder, { recursive: true });
    const marker = path.join(root, "layout");

    const first = await launchPackaged(app!, root, {}, { defaultShell: true });
    try {
      const saved = (await first.call(
        `layoutSave(${JSON.stringify({
          archive: path.resolve(archive!),
          folder,
          marker,
        })})`,
        180000,
      )) as { summary: string; notices: string[] };
      expect(saved.summary, saved.notices.join("\n")).toMatch(
        /2 tabs · 3 panes/,
      );
      await first.quit();
    } finally {
      await first.stop();
    }

    const second = await launchPackaged(app!, root, {}, { defaultShell: true });
    try {
      const opened = (await second.call(
        `layoutOpen(${JSON.stringify({ marker })})`,
        180000,
      )) as {
        windows: number;
        tabs: number;
        panes: number;
        pwd?: string;
        notices: string[];
      };
      expect(opened, opened.notices.join("\n")).toMatchObject({
        windows: 2,
        tabs: 2,
        panes: 3,
        pwd: folder,
      });
      await second.quit();
    } finally {
      await second.stop();
    }
    await rm(root, { recursive: true, force: true });
  },
);
