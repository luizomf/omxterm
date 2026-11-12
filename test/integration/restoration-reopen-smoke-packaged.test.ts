import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Reopening smoke for Saved Layout 0.3.0 and later on a host that reopens
// windows: install the archive, arrange a window with a reported folder, open
// a second window, quit, then start again and check that both windows came
// back and where the arranged pane's shell started. Uses the same variables as
// restoration-smoke-packaged.test.ts plus OMXTERM_RESTORATION_SMOKE_REOPEN=1.
const app = process.env.OMXTERM_RESTORATION_SMOKE_APP;
const archive = process.env.OMXTERM_RESTORATION_SMOKE_ARCHIVE;
// An app started from Finder or the Dock on macOS has no locale variables.
const finderEnvironment =
  process.platform === "darwin"
    ? { LANG: undefined, LC_ALL: undefined, LC_CTYPE: undefined }
    : {};
const reopen = process.env.OMXTERM_RESTORATION_SMOKE_REOPEN === "1";

it.skipIf(!app || !archive || !reopen)(
  "reopens every window's tabs, splits and folders after a restart",
  { timeout: 400000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-reopen-smoke-")),
    );
    // Non-ASCII, like macOS's "Área de Trabalho" in Portuguese.
    const folder = path.join(root, "home", "Área de Trabalho");
    await mkdir(folder, { recursive: true });
    const marker = path.join(root, "layout");

    const first = await launchPackaged(app!, root, finderEnvironment, {
      defaultShell: true,
    });
    try {
      const remembered = (await first.call(
        `layoutRemember(${JSON.stringify({
          archive: path.resolve(archive!),
          folder,
          marker,
        })})`,
        180000,
      )) as { windows: number };
      expect(remembered.windows).toBe(2);
      await first.quit();
    } finally {
      await first.stop();
    }

    const second = await launchPackaged(app!, root, finderEnvironment, {
      defaultShell: true,
      windows: 2,
    });
    try {
      const reopened = await second.call(
        `layoutReopened(${JSON.stringify({ marker })})`,
        180000,
      );
      expect(reopened).toEqual({ panes: [1, 3], tabs: 2, pwd: folder });
      await second.quit();
    } finally {
      await second.stop();
    }
    await rm(root, { recursive: true, force: true });
  },
);
