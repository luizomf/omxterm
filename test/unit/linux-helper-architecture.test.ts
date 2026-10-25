import { execFile as callback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(callback);
it.skipIf(process.platform === "win32").each([
  ["x86_64", "x86-64", true],
  ["aarch64", "ARM aarch64", true],
  ["x86_64", "ARM aarch64", false],
  ["aarch64", "x86-64", false],
  ["riscv64", "x86-64", false],
])(
  "rejects host/ELF mismatch before executing: %s / %s",
  async (host, machine, match) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-helper-arch-"));
    try {
      const bin = path.join(root, "bin");
      await mkdir(bin);
      for (const [name, value] of [
        ["uname", host],
        ["file", `ELF 64-bit LSB executable, ${machine}`],
      ])
        await writeFile(
          path.join(bin, name!),
          `#!/bin/sh\nprintf '%s\\n' '${value}'\n`,
          { mode: 0o755 },
        );
      const image = path.join(root, "image.AppImage");
      const marker = path.join(root, "executed");
      await writeFile(
        image,
        '#!/bin/sh\nprintf executed > "$MARKER"\nexit 7\n',
        { mode: 0o755 },
      );
      const result = execute(
        "/bin/sh",
        [path.resolve("scripts/install-linux-appimage.sh"), "install", image],
        {
          env: {
            ...process.env,
            HOME: path.join(root, "home"),
            PATH: `${bin}:${process.env.PATH}`,
            MARKER: marker,
          },
        },
      );
      await expect(result).rejects.toThrow(
        match ? "required packaged metadata" : "matching the host architecture",
      );
      if (match) expect(await readFile(marker, "utf8")).toBe("executed");
      else
        await expect(readFile(marker)).rejects.toMatchObject({
          code: "ENOENT",
        });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
