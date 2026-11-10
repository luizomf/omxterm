import { execFile, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { inspector, until } from "../fixtures/packaged-inspector.js";

// Packaged Files smoke on a published host: install a local Files archive,
// list a directory and insert a path into the terminal.
//
//   OMXTERM_FILES_SMOKE_APP      .AppImage, .app bundle or packaged executable
//   OMXTERM_FILES_SMOKE_ARCHIVE  files-X.Y.Z.omxext
const app = process.env.OMXTERM_FILES_SMOKE_APP;
const archive = process.env.OMXTERM_FILES_SMOKE_ARCHIVE;
const execute = promisify(execFile);

async function executable(root: string, target: string) {
  if (target.endsWith(".AppImage")) {
    // Extracting avoids a FUSE dependency; the bytes are unchanged.
    await execute(path.resolve(target), ["--appimage-extract"], {
      cwd: root,
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return path.join(root, "squashfs-root/omxterm");
  }
  if (target.endsWith(".app")) {
    const [name] = await readdir(path.join(target, "Contents/MacOS"));
    return path.join(target, "Contents/MacOS", name!);
  }
  return target;
}

it.skipIf(!app || !archive)(
  "installs Files, lists a directory and inserts a path into the terminal",
  { timeout: 300000 },
  async () => {
    // Files shows canonical paths (macOS /var is /private/var).
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), "omxterm-files-smoke-")),
    );
    const home = path.join(root, "home");
    const directory = path.join(root, "listed");
    const fileName = "smoke file.txt";
    for (const name of [home, directory, path.join(home, ".config/omxterm")])
      await mkdir(name, { recursive: true });
    await writeFile(path.join(directory, fileName), "smoke");
    await mkdir(path.join(directory, "folder"));
    await writeFile(
      path.join(home, ".config/omxterm/config.json"),
      JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
    );
    const child = spawn(
      await executable(root, app!),
      [
        ...(process.platform === "linux" ? ["--no-sandbox"] : []),
        "--inspect=127.0.0.1:0",
        `--user-data-dir=${path.join(root, "profile")}`,
        "-e",
        "/bin/sh",
      ],
      {
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: path.join(home, ".config"),
          ELECTRON_RUN_AS_NODE: undefined,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (data: string) => {
      stderr += data;
    });
    const exited = new Promise((resolve) => child.once("exit", resolve));
    let client: Awaited<ReturnType<typeof inspector>> | undefined;
    try {
      await until(
        () => /Debugger listening on ws:\/\/127\.0\.0\.1:/.test(stderr),
        "main inspector",
        60000,
      );
      const url = /Debugger listening on (ws:\/\/\S+)/.exec(stderr)![1]!;
      client = await inspector(url);
      const observerFile = path.resolve(
        "test/fixtures/files-smoke-observer.cjs",
      );
      const observer = `process.getBuiltinModule('module').createRequire(${JSON.stringify(observerFile)})(${JSON.stringify(observerFile)})`;
      await until(
        async () =>
          (await client!
            .evaluate(`${observer}.windows()`, 5000)
            .catch(() => 0)) === 1,
        "application window",
        60000,
      );
      const marker = path.join(root, "inserted.txt");
      const result = (await client.evaluate(
        `${observer}.run(${JSON.stringify({
          archive: path.resolve(archive!),
          directory,
          fileName,
          marker,
        })})`,
        180000,
      )) as { rows: string[]; inserted?: string; notices: string[] };
      expect(result.rows).toEqual(
        expect.arrayContaining([
          path.join(directory, "folder"),
          path.join(directory, fileName),
        ]),
      );
      expect(result.notices).toEqual([]);
      expect(result.inserted).toBe(path.join(directory, fileName));
      await client.evaluate(`${observer}.quit()`, 5000);
      // Node waits for an attached debugger before the process can exit.
      client.close();
      client = undefined;
      await Promise.race([
        exited,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("normal Quit")), 15000),
        ),
      ]);
    } finally {
      client?.close();
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await exited;
    }
    await rm(root, { recursive: true, force: true });
  },
);
