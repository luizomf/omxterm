// Executed as literal -e source by the packaged Electron in Node mode, outside
// the checkout. Only builtins and modules anchored inside app.asar are loaded.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [asar, scratch, appVersion] = process.argv.slice(1);
assert.ok(["linux", "darwin"].includes(process.platform));
assert.equal(process.arch, "arm64");
assert.ok(process.versions.electron);
assert.equal(process.type, undefined);
assert.notEqual(process.getuid(), 0);
const runtime = path.join(asar, "dist/extension-runtime");
const require = createRequire(path.join(runtime, "bootstrap.mjs"));
const { InstalledPackages, createNativeLeaseAdapter } = await import(
  pathToFileURL(path.join(runtime, "packages.mjs")).href
);
const adapter = createNativeLeaseAdapter(
  path.join(runtime, "extension-leases.node"),
);
const lease = await adapter.tryAcquire(path.join(scratch, "lease"), true);
assert.ok(lease);
await lease.release();
const packages = await InstalledPackages.open({
  root: path.join(scratch, "store"),
  runtime: { appVersion, apiVersion: "0.1.0" },
  leases: adapter,
});
assert.deepEqual(await packages.snapshot(), []);
const checks = ["packaged-store-and-lease"];
// Native loading/conflict evidence only, not a complete Files qualification.
{
  const move = require("./files-move.node");
  const source = path.join(scratch, "source");
  const target = path.join(scratch, "target");
  await writeFile(source, "source");
  await writeFile(target, "preserved");
  await assert.rejects(move.moveNoReplace(source, target), { code: "EEXIST" });
  assert.equal(await readFile(target, "utf8"), "preserved");
  assert.equal(await readFile(source, "utf8"), "source");
  await move.moveNoReplace(source, path.join(scratch, "moved"));
  assert.equal(await readFile(path.join(scratch, "moved"), "utf8"), "source");
  checks.push("native-move-and-conflict");
}
// Missing-IPC refusal is after ESM resolution, not a backend activation pass.
const bootstrap = spawnSync(
  process.execPath,
  [path.join(runtime, "bootstrap.mjs")],
  {
    env: process.env,
    cwd: scratch,
    timeout: 10_000,
    killSignal: "SIGKILL",
    encoding: "utf8",
  },
);
assert.equal(bootstrap.error, undefined);
assert.equal(bootstrap.signal, null);
assert.equal(bootstrap.status, 78);
assert.equal(bootstrap.stderr, "");
checks.push("bootstrap-missing-IPC-refusal");
console.log(
  JSON.stringify({
    checks,
    runtime: process.versions,
    hostVersion: appVersion,
    target: `${process.platform}-${process.arch}`,
  }),
);
