import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { discoverAliases } from "../../extensions/ssh/discovery";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ssh-bounds-"));
  roots.push(root);
  const ssh = path.join(root, ".ssh");
  await mkdir(ssh);
  return {
    root,
    ssh,
    discover: () => discoverAliases(root, new AbortController().signal),
  };
}
it("stops nested Includes after depth16", async () => {
  const { ssh, discover } = await fixture();
  await writeFile(path.join(ssh, "config"), "Include 1");
  for (let i = 1; i <= 17; i++)
    await writeFile(
      path.join(ssh, String(i)),
      `Include ${i + 1}\nHost alias${i}\nHost *\n`,
    );
  const result = await discover();
  expect(result.aliases).toHaveLength(16);
  expect(result.aliases).not.toContain("alias17");
  expect(result.reasons["depth-limit"]).toBe(1);
});
it("counts repeated noncyclic visits against the64-file budget", async () => {
  const { ssh, discover } = await fixture();
  await writeFile(path.join(ssh, "config"), "Include child\n".repeat(65));
  await writeFile(path.join(ssh, "child"), "# comment\n");
  expect((await discover()).reasons).toEqual({ "file-limit": 1 });
});
it("bounds total bytes independently of the per-file limit", async () => {
  const { ssh, discover } = await fixture();
  await writeFile(path.join(ssh, "config"), "Include child\n".repeat(5));
  await writeFile(
    path.join(ssh, "child"),
    "#".repeat(1023).concat("\n").repeat(256),
  );
  expect((await discover()).reasons["byte-limit"]).toBe(2);
});
it("bounds directory enumeration even when no glob entry matches", async () => {
  const { ssh, discover } = await fixture();
  await mkdir(path.join(ssh, "parts"));
  await writeFile(path.join(ssh, "config"), "Include parts/*.conf");
  await Promise.all(
    Array.from({ length: 4097 }, (_, i) =>
      writeFile(path.join(ssh, "parts", String(i)), ""),
    ),
  );
  expect((await discover()).reasons).toEqual({ "glob-limit": 1 });
});
it.skipIf(process.platform === "win32")(
  "rejects FIFO and device Includes without waiting for writers",
  async () => {
    const { ssh, discover } = await fixture();
    execFileSync("mkfifo", [path.join(ssh, "pipe")]);
    await symlink("/dev/null", path.join(ssh, "device"));
    await writeFile(
      path.join(ssh, "config"),
      "Include pipe device\nHost after\n",
    );
    const result = await discover();
    expect(result.reasons).toEqual({ "non-regular": 2 });
    expect(result.aliases).toEqual(["after"]);
  },
);
