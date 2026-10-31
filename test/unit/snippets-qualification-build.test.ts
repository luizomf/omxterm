import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

// Exercise the real builder CLI and filesystem layout, not Electron or a GUI.
// Like the builder itself, this lane admits Linux ARM64/x64 and macOS ARM64.
it.skipIf(
  !(
    (process.platform === "linux" && ["arm64", "x64"].includes(process.arch)) ||
    (process.platform === "darwin" && process.arch === "arm64")
  ),
)(
  "isolates a qualification build with the real development icon at the main entry's relative path",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "snippets-build-layout-"));
    try {
      const source = path.join(root, "source");
      const output = path.join(root, "qualification");
      for (const directory of [
        "test/fixtures",
        "src/main",
        "src/renderer",
        "dist/preload",
        "assets",
      ])
        await mkdir(path.join(source, directory), { recursive: true });
      const builder = path.join(
        source,
        "test/fixtures/snippets-qualification-build.mjs",
      );
      await cp("test/fixtures/snippets-qualification-build.mjs", builder);
      // Tiny bundle inputs keep this a bounded layout test. The image is the
      // actual application resource, not a placeholder or a native API mock.
      await writeFile(
        path.join(source, "src/main/index.ts"),
        "export const main = true;",
      );
      await writeFile(
        path.join(source, "src/renderer/index.ts"),
        "console.log('renderer');",
      );
      await writeFile(
        path.join(source, "dist/preload/index.cjs"),
        "// retained preload\n",
      );
      await cp(
        "assets/application-icon.png",
        path.join(source, "assets/application-icon.png"),
      );
      await symlink(
        await realpath("node_modules"),
        path.join(source, "node_modules"),
      );
      const build = () =>
        promisify(execFile)(process.execPath, [builder, output], {
          timeout: 15_000,
        });
      const { stdout } = await build();
      const entry = stdout.trim();
      // The unchanged production main resolves its icon two levels above its
      // own directory. A flattened output instead points outside the owned root.
      const iconPath = path.resolve(
        path.dirname(entry),
        "../..",
        "assets/application-icon.png",
      );
      const icon = await readFile(iconPath);
      expect(icon).toEqual(await readFile("assets/application-icon.png"));
      expect(iconPath).toBe(path.join(output, "assets/application-icon.png"));
      expect(entry).toBe(path.join(output, "dist/main/index.js"));
      expect(
        (await stat(path.join(output, "dist/renderer/index.js"))).isFile(),
      ).toBe(true);
      expect(
        await readFile(path.join(output, "dist/preload/index.cjs"), "utf8"),
      ).toBe("// retained preload\n");
      expect(await realpath(path.join(output, "node_modules"))).toBe(
        await realpath("node_modules"),
      );
      const receipt = JSON.parse(
        await readFile(path.join(output, "qualification.json"), "utf8"),
      ) as {
        differences: unknown[];
        inputs: Record<string, string>;
      };
      expect(receipt.differences).toEqual([]);
      expect(receipt.inputs["assets/application-icon.png"]).toBe(
        createHash("sha256").update(icon).digest("hex"),
      );
      await expect(stat(path.join(root, "assets"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(build()).rejects.toThrow();
      expect(await readFile(iconPath)).toEqual(icon);
      expect(
        await readFile(path.join(source, "dist/preload/index.cjs"), "utf8"),
      ).toBe("// retained preload\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  25_000,
);
