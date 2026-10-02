import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function discoveredFiles(root: string): string[] {
  // filesOnly uses the real configured discovery without importing test files,
  // so this regression never launches native fixtures or recursively runs itself.
  const result = spawnSync(
    process.execPath,
    [
      path.join(repositoryRoot, "node_modules/vitest/vitest.mjs"),
      "list",
      "--filesOnly",
      "--json",
      "--root",
      root,
      "--config",
      path.join(repositoryRoot, "vitest.config.ts"),
    ],
    { cwd: repositoryRoot, encoding: "utf8", timeout: 15_000 },
  );
  if (result.error) throw result.error;
  expect(result.status, result.stderr).toBe(0);
  const files = JSON.parse(result.stdout) as { file: string }[];
  return files
    .map(({ file }) => path.relative(root, file).split(path.sep).join("/"))
    .sort();
}

it("selects only project suites while retaining archived and third-party tests", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-test-discovery-"));
  const intended = [
    "test/unit/nested/example.test.ts",
    "test/integration/native.test.ts",
    "test/integration/platform.spec.js",
  ];
  const retained = [
    ".scratch/diagnostic.test.ts",
    ".scratch/archive/test/integration/native.test.ts",
    ".scratch/prepared-node_modules/vendor/src/example.spec.ts",
    ".scratch/prepared-node_modules/vendor/test/example.test.js",
    "test/fixtures/helper.test.ts",
    "src/example.test.ts",
    "release/archive.test.ts",
    "node_modules/vendor/example.test.ts",
  ];
  try {
    for (const file of [...intended, ...retained]) {
      const target = path.join(root, file);
      await mkdir(path.dirname(target), { recursive: true });
      // An import-time failure also guards against accidentally collecting tests.
      await writeFile(
        target,
        'throw new Error("discovery must not import tests");\n',
      );
    }
    expect(discoveredFiles(root)).toEqual([...intended].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);

it("keeps every existing unit and integration test in unfiltered discovery", async () => {
  // Walk the intended directories independently of the configured include glob.
  // This includes native/platform/opt-in suites without evaluating their skips.
  const intended: string[] = [];
  for (const directory of ["test/unit", "test/integration"]) {
    const entries = await readdir(path.join(repositoryRoot, directory), {
      recursive: true,
      withFileTypes: true,
    });
    const tests = entries
      .filter(
        (entry) =>
          entry.isFile() && /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(entry.name),
      )
      .map((entry) =>
        path
          .relative(repositoryRoot, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join("/"),
      );
    expect(
      tests.length,
      `No tests inventoried in ${directory}`,
    ).toBeGreaterThan(0);
    intended.push(...tests);
  }
  expect(discoveredFiles(repositoryRoot)).toEqual(intended.sort());
}, 20_000);
