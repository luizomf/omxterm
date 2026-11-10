import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Packaged SSH Connect smoke on a published host: install a local SSH archive,
// pick an alias from ~/.ssh/config and check what the ssh client received.
// A fake `ssh` first on PATH records its argv; nothing touches the network.
//
//   OMXTERM_SSH_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_SSH_SMOKE_ARCHIVE  ssh-X.Y.Z.omxext
const app = process.env.OMXTERM_SSH_SMOKE_APP;
const archive = process.env.OMXTERM_SSH_SMOKE_ARCHIVE;

it.skipIf(!app || !archive || process.platform === "win32")(
  "installs SSH Connect and opens an alias with the ssh client on PATH",
  { timeout: 300000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-ssh-smoke-")),
    );
    const marker = path.join(root, "ssh-argv.txt");
    const bin = path.join(root, "bin");
    await mkdir(bin);
    await writeFile(
      path.join(bin, "ssh"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > '${marker}'\n`,
    );
    await chmod(path.join(bin, "ssh"), 0o755);
    await mkdir(path.join(root, "home/.ssh"), { recursive: true });
    await writeFile(
      path.join(root, "home/.ssh/config"),
      "Host smoke-host\n  HostName 192.0.2.1\n",
    );
    const omxterm = await launchPackaged(app!, root, {
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    });
    try {
      const result = (await omxterm.call(
        `ssh(${JSON.stringify({
          archive: path.resolve(archive!),
          alias: "smoke-host",
          marker,
        })})`,
        180000,
      )) as { argv?: string[]; notices: string[] };
      expect(result.argv, result.notices.join("\n")).toEqual([
        "--",
        "smoke-host",
      ]);
      await omxterm.quit();
    } finally {
      await omxterm.stop();
    }
    await rm(root, { recursive: true, force: true });
  },
);
