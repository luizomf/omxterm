import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSftpClient,
  isDirectoryMode,
  OPEN_FLAGS,
  sftpErrorMessage,
} from "../../src/main/sftp-client";

const SERVER = [
  "/usr/lib/ssh/sftp-server",
  "/usr/lib/openssh/sftp-server",
].find((candidate) => existsSync(candidate));
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function server() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-sftp-"));
  const child: ChildProcessWithoutNullStreams = spawn(SERVER!, [], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  cleanups.push(() => {
    child.kill();
  });
  return { root, client: await createSftpClient(child.stdout, child.stdin) };
}

describe.skipIf(SERVER === undefined)("SFTP client against OpenSSH", () => {
  it("lists, creates, writes, reads, renames and removes", async () => {
    const { root, client } = await server();
    expect(await client.realpath(root)).toBe(root);
    await client.mkdir(path.join(root, "folder"));
    await writeFile(path.join(root, "a b'c.txt"), "hello");
    const names = await client.list(root);
    expect(names.map((name) => name.filename).sort()).toEqual([
      "a b'c.txt",
      "folder",
    ]);
    const folder = names.find((name) => name.filename === "folder")!;
    expect(isDirectoryMode(folder.attributes.permissions)).toBe(true);

    const written = await client.open(
      path.join(root, "new.txt"),
      OPEN_FLAGS.write | OPEN_FLAGS.create | OPEN_FLAGS.exclusive,
      0o644,
    );
    await client.write(written, 0, Buffer.from("data"));
    await client.close(written);
    expect(await readFile(path.join(root, "new.txt"), "utf8")).toBe("data");
    await expect(
      client.open(
        path.join(root, "new.txt"),
        OPEN_FLAGS.write | OPEN_FLAGS.create | OPEN_FLAGS.exclusive,
      ),
    ).rejects.toThrow();

    const reading = await client.open(
      path.join(root, "a b'c.txt"),
      OPEN_FLAGS.read,
    );
    expect((await client.read(reading, 0, 1024))?.toString()).toBe("hello");
    expect(await client.read(reading, 5, 1024)).toBeUndefined();
    await client.close(reading);

    await expect(
      client.rename(path.join(root, "new.txt"), path.join(root, "a b'c.txt")),
    ).rejects.toThrow();
    await client.rename(
      path.join(root, "new.txt"),
      path.join(root, "moved.txt"),
    );
    await client.remove(path.join(root, "moved.txt"));
    await client.rmdir(path.join(root, "folder"));
    expect((await client.list(root)).map((name) => name.filename)).toEqual([
      "a b'c.txt",
    ]);
    const missing: unknown = await client
      .stat(path.join(root, "nope"))
      .catch((error: unknown) => error);
    expect(sftpErrorMessage(missing)).toBe("The item no longer exists.");
  });
});

describe("SFTP client framing", () => {
  it("rejects an oversized reply instead of buffering it", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.once("data", () => {
      const version = Buffer.from([0, 0, 0, 5, 2, 0, 0, 0, 3]);
      input.write(version);
    });
    const client = await createSftpClient(input, output);
    const pending = client.realpath(".");
    const header = Buffer.alloc(4);
    header.writeUInt32BE(64 * 1024 * 1024);
    input.write(header);
    await expect(pending).rejects.toThrow("Oversized SFTP reply");
  });
});
