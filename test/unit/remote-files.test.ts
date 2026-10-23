import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteFiles } from "../../src/main/remote-files";
import { sftpSubsystemArguments } from "../../src/main/ssh-command";

const SERVER = [
  "/usr/lib/ssh/sftp-server",
  "/usr/lib/openssh/sftp-server",
].find((candidate) => existsSync(candidate));
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-remote-"));
  const local = path.join(root, "local");
  const remote = path.join(root, "remote");
  await mkdir(local);
  await mkdir(remote);
  const spawned = vi.fn(() =>
    spawn(SERVER!, ["-d", remote], { stdio: ["pipe", "pipe", "pipe"] }),
  );
  const files = createRemoteFiles({ spawn: spawned, idleMs: 60_000 });
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  cleanups.push(() => files.dispose());
  return { files, local, remote, spawned, target: { key: "k", argv: [] } };
}

describe.skipIf(SERVER === undefined)("remote files over SFTP", () => {
  it("browses, creates, renames and deletes on one shared connection", async () => {
    const { files, remote, spawned, target } = await setup();
    expect(await files.home(target)).toBe(remote);
    await files.createFolder(target, remote, "docs");
    await files.createFile(target, path.join(remote, "docs"), "notes.txt");
    await expect(
      files.createFile(target, path.join(remote, "docs"), "notes.txt"),
    ).rejects.toThrow();
    await files.rename(target, path.join(remote, "docs", "notes.txt"), "n.txt");
    const listing = await files.list(target, path.join(remote, "docs"));
    expect(listing).toMatchObject({
      path: path.join(remote, "docs"),
      parent: remote,
      truncated: false,
    });
    expect(listing.entries.map((entry) => entry.name)).toEqual(["n.txt"]);
    expect(listing.entries[0]).toMatchObject({ kind: "file", size: 0 });
    await files.remove(target, [path.join(remote, "docs")]);
    expect((await files.list(target, remote)).entries).toEqual([]);
    expect(spawned).toHaveBeenCalledOnce();
  });

  it("downloads and uploads with pipelined chunks and progress", async () => {
    const { files, local, remote, target } = await setup();
    const data = randomBytes(1024 * 1024 + 123);
    await writeFile(path.join(remote, "big.bin"), data);
    const progress = vi.fn();
    await files.download(
      target,
      path.join(remote, "big.bin"),
      path.join(local, "big.bin"),
      progress,
      new AbortController().signal,
    );
    expect((await readFile(path.join(local, "big.bin"))).equals(data)).toBe(
      true,
    );
    expect(progress).toHaveBeenLastCalledWith(data.length, data.length);
    await expect(
      files.download(
        target,
        path.join(remote, "big.bin"),
        path.join(local, "big.bin"),
        progress,
        new AbortController().signal,
      ),
    ).rejects.toThrow();

    await files.upload(
      target,
      path.join(local, "big.bin"),
      path.join(remote, "copy.bin"),
      vi.fn(),
      new AbortController().signal,
    );
    expect((await readFile(path.join(remote, "copy.bin"))).equals(data)).toBe(
      true,
    );
    await expect(
      files.upload(
        target,
        path.join(local, "big.bin"),
        path.join(remote, "copy.bin"),
        vi.fn(),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });

  it("removes a partial download when cancelled", async () => {
    const { files, local, remote, target } = await setup();
    await writeFile(path.join(remote, "big.bin"), randomBytes(2 * 1024 * 1024));
    const controller = new AbortController();
    controller.abort();
    await expect(
      files.download(
        target,
        path.join(remote, "big.bin"),
        path.join(local, "big.bin"),
        vi.fn(),
        controller.signal,
      ),
    ).rejects.toThrow("Cancelled.");
    expect(existsSync(path.join(local, "big.bin"))).toBe(false);
  });
});

describe("SFTP subsystem arguments", () => {
  it("reuses the session's connection settings without its extras", () => {
    const argv = sftpSubsystemArguments(
      {
        host: "[2001:db8::1]",
        port: 2222,
        user: "admin",
        authentication: "key",
        identityFile: "~/.ssh/id_ed25519",
        forwardAgent: true,
        x11: true,
        multiplex: true,
        forwards: [
          { kind: "local", listenPort: 8080, host: "localhost", hostPort: 80 },
        ],
        remoteCommand: "htop",
      },
      {
        platform: "linux",
        controlDirectory: "/run/user/1000/omxterm-ssh",
        homeDirectory: "/home/me",
      },
    );
    expect(argv).toContain("BatchMode=yes");
    expect(argv).toContain("ControlPath=/run/user/1000/omxterm-ssh/%C");
    expect(argv).toEqual(
      expect.arrayContaining(["-i", "/home/me/.ssh/id_ed25519", "-p", "2222"]),
    );
    expect(argv.slice(-4)).toEqual(["admin", "-s", "2001:db8::1", "sftp"]);
    for (const absent of ["-A", "-Y", "-L", "-t", "htop"])
      expect(argv).not.toContain(absent);
  });
});
