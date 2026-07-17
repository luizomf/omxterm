import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execute = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fontDirectory = path.join(projectRoot, "assets", "fonts");
const outputFontDirectory = path.join(projectRoot, "dist", "renderer", "fonts");

const expectedAssets = {
  "JetBrainsMonoNerdFontMono-Regular.woff2":
    "50680a64466fbcc3eff68e00f84505f55681c86f8450c042416af5a8dbc1cce1",
  "OFL.txt": "30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad",
} as const;

describe("Terminal appearance build", () => {
  it("ships the accepted regular Nerd Font and OFL without another font weight", async () => {
    await execute(process.execPath, ["build.mjs"], { cwd: projectRoot });

    expect((await readdir(fontDirectory)).sort()).toEqual([
      "JetBrainsMonoNerdFontMono-Regular.woff2",
      "OFL.txt",
      "README.md",
    ]);

    for (const [fileName, expectedHash] of Object.entries(expectedAssets)) {
      const source = await readFile(path.join(fontDirectory, fileName));
      const output = await readFile(path.join(outputFontDirectory, fileName));
      expect(createHash("sha256").update(source).digest("hex")).toBe(
        expectedHash,
      );
      expect(createHash("sha256").update(output).digest("hex")).toBe(
        expectedHash,
      );
    }

    const css = await readFile(
      path.join(projectRoot, "dist", "renderer", "index.css"),
      "utf8",
    );
    expect(css).toContain("JetBrainsMonoNerdFontMono-Regular.woff2");
    expect(css).toContain("JetBrainsMono Nerd Font Mono");
    expect(css).not.toContain("JetBrainsMonoNerdFontMono-Bold");
  }, 30_000);
});
