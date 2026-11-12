import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { resolveMsvcEnvironment } from "../../scripts/windows-msvc-environment.mjs";
import { launchPackaged } from "../fixtures/packaged-inspector.js";

// Packaged SSH Connect smoke on a published host: install a local SSH archive,
// pick an alias from ~/.ssh/config and check what the ssh client received.
// A fake `ssh` first on PATH records its argv; nothing touches the network.
// On Windows the fake is a small compiled ssh.exe.
//
//   OMXTERM_SSH_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_SSH_SMOKE_ARCHIVE  ssh-X.Y.Z.omxext
const app = process.env.OMXTERM_SSH_SMOKE_APP;
const archive = process.env.OMXTERM_SSH_SMOKE_ARCHIVE;

it.skipIf(!app || !archive)(
  "installs SSH Connect and opens an alias with the ssh client on PATH",
  { timeout: 300000 },
  async () => {
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-ssh-smoke-")),
    );
    const marker = path.join(root, "ssh-argv.txt");
    const bin = path.join(root, "bin");
    await mkdir(bin);
    await mkdir(path.join(root, "home/.ssh"), { recursive: true });
    const windows = process.platform === "win32";
    if (windows) {
      // A tiny native ssh.exe that records its argv, built with the MSVC
      // tools every Windows checkout already needs.
      const source = path.join(root, "record-ssh.c");
      await writeFile(
        source,
        `#include <stdio.h>
int main(int argc, char** argv) {
  FILE* file = fopen(${JSON.stringify(marker)}, "wb");
  for (int i = 1; i < argc; i++) fprintf(file, "%s\\n", argv[i]);
  return fclose(file);
}
`,
      );
      await promisify(execFile)(
        "cl.exe",
        ["/nologo", source, `/Fe:${path.join(bin, "ssh.exe")}`],
        {
          cwd: root,
          env: resolveMsvcEnvironment() ?? process.env,
          timeout: 120000,
        },
      );
    } else {
      await writeFile(
        path.join(bin, "ssh"),
        `#!/bin/sh\nprintf '%s\\n' "$@" > '${marker}'\n`,
      );
      await chmod(path.join(bin, "ssh"), 0o755);
    }
    await writeFile(
      path.join(root, "home/.ssh/config"),
      "Host smoke-host\n  HostName 192.0.2.1\n",
    );
    const omxterm = await launchPackaged(
      app!,
      root,
      {
        PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      { defaultShell: process.platform === "win32" },
    );
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
