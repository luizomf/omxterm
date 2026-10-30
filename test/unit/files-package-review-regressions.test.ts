import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { FileMatcher } from "app-builder-lib/out/fileMatcher.js";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const configPath = path.join(root, "electron-builder.yml");

describe("separate extension artifacts in actual packaging filters", () => {
  it.each(["mac", "linux", "win"] as const)(
    "excludes default and custom sidecars on %s",
    async (target) => {
      const config = parse(await readFile(configPath, "utf8")) as Record<
        string,
        { files: string[] }
      >;
      const patterns = config[target]?.files;
      assert.ok(patterns);
      const filter = new FileMatcher(
        root,
        root,
        (value) => value.replaceAll("${arch}", "arm64"),
        patterns,
      ).createFilter();
      const file = await stat(configPath);
      for (const directory of ["dist/extensions", "dist/elsewhere", "dist"]) {
        for (const suffix of [".omxext", ".omxext.json", ".omxext.sha256"]) {
          const relative = `${directory}/files${suffix}`;
          expect(filter(path.join(root, relative), file), relative).toBe(false);
        }
      }
      // Do not accidentally drop ordinary application resources or metadata.
      for (const relative of [
        "dist/main/index.js",
        "dist/main/data.json",
        "dist/main/data.sha256",
      ]) {
        expect(filter(path.join(root, relative), file), relative).toBe(true);
      }
    },
  );
});

type Child = {
  closed: boolean;
  exit: { code: number | null; signal: string | null } | null;
};
async function retirementOracle() {
  const source = await readFile(
    new URL("../fixtures/files-packaged.cjs", import.meta.url),
    "utf8",
  );
  const require = createRequire(
    new URL("../fixtures/files-packaged.cjs", import.meta.url),
  );
  const module = {
    exports: {} as { assertNormalBackendRetirement: (child: Child) => void },
  };
  // Load the real observer assertion without Electron startup or GUI access.
  // No observer run/inspect/quit method is invoked by this headless test.
  runInNewContext(source, {
    module,
    require: (name: string): unknown =>
      name === "electron" ? {} : require(name),
  });
  return module.exports.assertNormalBackendRetirement;
}

describe("ordinary packaged backend retirement oracle", () => {
  it("accepts a joined normal exit", async () => {
    const assertRetired = await retirementOracle();
    expect(() =>
      assertRetired({ closed: true, exit: { code: 0, signal: null } }),
    ).not.toThrow();
  });
  it.each([
    { closed: true, exit: { code: 1, signal: null } },
    { closed: true, exit: { code: null, signal: "SIGKILL" } },
    { closed: true, exit: null },
    { closed: false, exit: { code: 0, signal: null } },
  ])("rejects abnormal or incomplete retirement: %j", async (child) => {
    const assertRetired = await retirementOracle();
    expect(() => assertRetired(child)).toThrow();
  });
});
