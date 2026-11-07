import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

async function runProbe(platform: string, arch: string, uid = 501) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-package-probe-"));
  try {
    const asar = path.join(root, "app.asar");
    const runtime = path.join(asar, "dist/extension-runtime");
    await mkdir(runtime, { recursive: true });
    await writeFile(
      path.join(runtime, "packages.mjs"),
      `import assert from 'node:assert/strict';
import path from 'node:path';
export function createNativeLeaseAdapter(addon) {
  assert.equal(addon, path.join(process.argv[1], 'dist/extension-runtime/extension-leases.node'));
  return { async tryAcquire(file, exclusive) {
    assert.equal(file, path.join(process.argv[2], 'lease'));
    assert.equal(exclusive, true);
    return { async release() {} };
  }};
}
export const InstalledPackages = { async open(options) {
  assert.equal(options.root, path.join(process.argv[2], 'store'));
  assert.equal(options.runtime.appVersion, '1.2.3');
  assert.equal(options.runtime.apiVersion, '0.1.0');
  return { async snapshot() { return []; } };
}};
`,
    );
    await writeFile(path.join(runtime, "bootstrap.mjs"), "process.exit(78);\n");
    if (arch === "arm64" && platform !== "win32")
      await writeFile(path.join(runtime, "files-move.node"), "fake");
    const probe = await readFile(
      "scripts/packaged-extensions-probe.mjs",
      "utf8",
    );
    const prelude = `
import { createRequire as fakeRequire } from 'node:module';
import * as fakeFs from 'node:fs/promises';
Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
Object.defineProperty(process, 'arch', { value: ${JSON.stringify(arch)} });
Object.defineProperty(process, 'getuid', { value: ${platform === "win32" ? "undefined" : `() => ${uid}`} });
process.versions.electron = '43.8.1';
fakeRequire(import.meta.url).extensions['.node'] = (module) => {
  module.exports = {
    async moveNoReplace(source, target) { await fakeFs.link(source, target); await fakeFs.unlink(source); },
    trash() { throw Object.assign(new Error('invalid root'), { code: 'EINVAL' }); },
  };
};
`;
    return spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `${prelude}\n${probe}`,
        "--",
        asar,
        root,
        "1.2.3",
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it("runs the packaged lease/store/bootstrap probe on Windows ARM64 without a POSIX UID", async () => {
  const result = await runProbe("win32", "arm64");
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    target: "win32-arm64",
    hostVersion: "1.2.3",
    checks: ["packaged-store-and-lease", "bootstrap-missing-IPC-refusal"],
  });
});

it.each([
  [
    "linux",
    "x64",
    ["packaged-store-and-lease", "bootstrap-missing-IPC-refusal"],
  ],
  [
    "linux",
    "arm64",
    [
      "packaged-store-and-lease",
      "native-move-and-conflict",
      "bootstrap-missing-IPC-refusal",
    ],
  ],
  [
    "darwin",
    "arm64",
    [
      "packaged-store-and-lease",
      "native-trash-export-and-root-refusal",
      "native-move-and-conflict",
      "bootstrap-missing-IPC-refusal",
    ],
  ],
])("retains packaged %s %s checks", async (platform, arch, checks) => {
  const result = await runProbe(platform, arch);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    target: `${platform}-${arch}`,
    checks,
  });
});

it("still refuses a root POSIX packaged-extension probe", async () => {
  const result = await runProbe("linux", "x64", 0);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("AssertionError");
  expect(result.stdout).toBe("");
});

it("runs the packaged lease/store/bootstrap probe on Windows x64 without a POSIX UID", async () => {
  const result = await runProbe("win32", "x64");
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    target: "win32-x64",
    hostVersion: "1.2.3",
    checks: ["packaged-store-and-lease", "bootstrap-missing-IPC-refusal"],
  });
});
