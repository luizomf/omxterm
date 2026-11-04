import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const execute = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const configName = "vitest.config.cts";
const cli = path.join(repositoryRoot, "node_modules/vitest/vitest.mjs");

// Snapshot the disposable shared cache destinations and package links without
// traversing the separately installed tooling packages.
async function snapshot(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  async function visit(file: string) {
    const info = await lstat(file, { bigint: true });
    const relative = path.relative(root, file);
    const metadata = `${info.mode}:${info.mtimeNs}:${info.ctimeNs}`;
    if (info.isSymbolicLink())
      result[relative] = `${metadata}:link:${await readlink(file)}`;
    else if (info.isDirectory()) {
      result[relative] = `${metadata}:directory`;
      for (const name of (await readdir(file)).sort())
        await visit(path.join(file, name));
    } else {
      result[relative] = `${metadata}:${createHash("sha256")
        .update(await readFile(file))
        .digest("hex")}`;
    }
  }
  await visit(root);
  return result;
}

async function sharedDependencies(scope: string) {
  const shared = path.join(scope, "shared-dependencies");
  await mkdir(shared);
  for (const name of await readdir(path.join(repositoryRoot, "node_modules"))) {
    if (name.startsWith(".")) continue;
    await symlink(
      path.join(repositoryRoot, "node_modules", name),
      path.join(shared, name),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  // Existing generated state must not be reset or touched, even transiently by
  // the config bundler creating and deleting a temporary module.
  for (const directory of [".vite", ".vite-temp"])
    await mkdir(path.join(shared, directory));
  await writeFile(
    path.join(shared, ".vite", "historical-cache"),
    "unknown prior state\n",
  );
  return shared;
}

async function worktree(scope: string, name: string, shared: string) {
  const root = path.join(scope, name);
  await mkdir(path.join(root, "test/unit"), { recursive: true });
  await mkdir(path.join(root, ".scratch"));
  await writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
  await copyFile(
    path.join(repositoryRoot, configName),
    path.join(root, configName),
  );
  await symlink(
    shared,
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  for (const name of ["first", "second"])
    await writeFile(
      path.join(root, "test/unit", `${name}.test.ts`),
      `import { it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
it('${name} executes in its owned worker', () => {
  expect(process.env.VITEST).toBe('true');
  writeFileSync(new URL('../../.scratch/${name}-worker.json', import.meta.url), JSON.stringify({ pid: process.pid, cwd: process.cwd() }));
});\n`,
    );
  return root;
}

async function run(root: string, selection = "test/unit") {
  const result = await execute(
    process.execPath,
    [cli, "run", "--maxWorkers=2", "--fileParallelism", selection],
    {
      cwd: root,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, NO_COLOR: "1" },
    },
  );
  expect(result.stderr).not.toContain("No test files found");
  return JSON.parse(
    await readFile(path.join(root, ".scratch/vitest-results.json"), "utf8"),
  ) as {
    success: boolean;
    numPassedTests: number;
  };
}

async function resultCache(root: string) {
  const files = await readdir(path.join(root, ".scratch"), { recursive: true });
  const result = files.filter((file) =>
    file.endsWith(`${path.sep}results.json`),
  );
  expect(result).toHaveLength(1);
  return path.join(root, ".scratch", result[0]!);
}

it("keeps actual worker caches local across worktrees sharing dependencies", async () => {
  const scope = await realpath(
    await mkdtemp(path.join(tmpdir(), "omxterm-test-cache-")),
  );
  try {
    const shared = await sharedDependencies(scope);
    const before = await snapshot(shared);
    const first = await worktree(scope, "first-worktree", shared);
    const second = await worktree(scope, "second-worktree", shared);
    expect(await run(first)).toMatchObject({
      success: true,
      numPassedTests: 2,
    });
    expect(await snapshot(shared)).toEqual(before);
    const workers = await Promise.all(
      ["first", "second"].map(
        async (name) =>
          JSON.parse(
            await readFile(
              path.join(first, ".scratch", `${name}-worker.json`),
              "utf8",
            ),
          ) as { pid: number; cwd: string },
      ),
    );
    expect(new Set(workers.map((worker) => worker.pid)).size).toBe(2);
    expect(workers.every((worker) => worker.cwd === first)).toBe(true);
    expect(await run(second)).toMatchObject({
      success: true,
      numPassedTests: 2,
    });
    const secondCache = await readFile(await resultCache(second), "utf8");
    expect(await run(first, "test/unit/first.test.ts")).toMatchObject({
      success: true,
      numPassedTests: 1,
    });
    const cumulative = JSON.parse(
      await readFile(await resultCache(first), "utf8"),
    ) as { results: unknown[] };
    expect(cumulative.results).toHaveLength(2);
    expect(await readFile(await resultCache(second), "utf8")).toBe(secondCache);
    expect(await snapshot(shared)).toEqual(before);
  } finally {
    await rm(scope, { recursive: true, force: true });
  }
}, 60_000);

it("keeps nested project optimizer caches owned when launched through a directory alias", async () => {
  const scope = await realpath(
    await mkdtemp(path.join(tmpdir(), "omxterm-project-cache-")),
  );
  try {
    const shared = await sharedDependencies(scope);
    const dependency = path.join(shared, "cache-probe-dependency");
    await mkdir(dependency);
    await writeFile(
      path.join(dependency, "package.json"),
      JSON.stringify({ name: "cache-probe-dependency", main: "index.cjs" }),
    );
    await writeFile(
      path.join(dependency, "index.cjs"),
      "module.exports = { value: 42 };\n",
    );
    const before = await snapshot(shared);
    const root = await worktree(scope, "project-worktree", shared);
    await copyFile(
      path.join(root, configName),
      path.join(root, "base.config.cts"),
    );
    await writeFile(
      path.join(root, configName),
      `const base = require('./base.config.cts');
module.exports = { ...base, test: { ...base.test, projects: ['alpha', 'beta'].map(name => ({
  extends: true,
  root: __dirname + '/nested/' + name,
  test: { name, deps: { optimizer: { ssr: { enabled: true, include: ['cache-probe-dependency'] } } } }
})) } };\n`,
    );
    for (const name of ["alpha", "beta"]) {
      const directory = path.join(root, "nested", name, "test/unit");
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, "optimized.test.ts"),
        `import { expect, it } from 'vitest';
import dependency from 'cache-probe-dependency';
it('executes the optimized Node dependency', () => expect(dependency.value).toBe(42));\n`,
      );
    }
    const alias = path.join(scope, "project-alias");
    await symlink(
      root,
      alias,
      process.platform === "win32" ? "junction" : "dir",
    );
    expect(await run(alias)).toMatchObject({
      success: true,
      numPassedTests: 2,
    });
    const generated = Object.keys(await snapshot(root));
    const metadata = generated.filter((file) =>
      file.endsWith(`${path.sep}_metadata.json`),
    );
    expect(metadata).toHaveLength(2);
    for (const file of metadata) {
      expect(file.split(path.sep).join("/")).toMatch(
        /^(?:\.scratch\/|nested\/(?:alpha|beta)\/\.scratch\/)/u,
      );
      const value = JSON.parse(
        await readFile(path.join(root, file), "utf8"),
      ) as { optimized: Record<string, unknown> };
      expect(value.optimized["cache-probe-dependency"]).toBeDefined();
    }
    await resultCache(root);
    expect(await snapshot(shared)).toEqual(before);
  } finally {
    await rm(scope, { recursive: true, force: true });
  }
}, 60_000);
