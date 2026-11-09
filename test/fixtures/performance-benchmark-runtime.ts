import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app } from "electron";
import { fixtureProcesses } from "./native-fixture-processes";
import { packageArchive } from "./extension-package-archive";
import {
  memoryMetric,
  readProcessCpuSeconds,
  readProcessMemory,
} from "./performance-benchmark-memory";

// The extension runtime is a separate ELECTRON_RUN_AS_NODE app instance from our
// own bundle. Production never spawns it at startup ("Construction never
// launches a backend"), so its idle cost is measured here as its own figure: the
// production bootstrap, the production client and a real locally installed
// package, activated once and then left alone.
const resultPrefix = "__OMXTERM_RUNTIME_BENCH__";
const root = path.dirname(fileURLToPath(import.meta.url));
const metric = memoryMetric();
const WINDOW_MS = 6000;
const SAMPLE_MS = 500;

interface Sample {
  readonly atMs: number;
  readonly processes: ReadonlyArray<{
    readonly pid: number;
    readonly bytes: number | null;
    readonly cpuSeconds: number | null;
  }>;
}

function fail(error: unknown): never {
  const detail = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`Extension runtime benchmark failed: ${detail}\n`);
  app.exit(1);
  throw error;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ownership by descent from this fixture process, then a filter on the profile's
// own bootstrap path. Never a machine-wide name match: a user's running OMXTerm
// runtime must not be attributed to this measurement.
function runtimeProcesses(): number[] {
  const rows = fixtureProcesses();
  const owned = new Set<number>([process.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows)
      if (owned.has(row.parent) && !owned.has(row.pid)) {
        owned.add(row.pid);
        changed = true;
      }
  }
  const bootstrap = path.join(root, "extension-runtime", "bootstrap.mjs");
  const matching: number[] = [];
  if (process.platform === "win32") {
    for (const pid of owned) if (pid !== process.pid) matching.push(pid);
    return matching;
  }
  const listing = execFileSync("ps", ["-axo", "pid=,args="], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, LC_ALL: "C" },
  });
  const commands = new Map<number, string>();
  for (const line of listing.split("\n")) {
    const lineMatch = /^\s*(\d+)\s+(.*)$/u.exec(line);
    if (lineMatch) commands.set(Number(lineMatch[1]), lineMatch[2]!);
  }
  for (const pid of owned)
    if (pid !== process.pid && commands.get(pid)?.includes(bootstrap))
      matching.push(pid);
  return matching;
}

function sample(pids: readonly number[]): Sample {
  const memory = readProcessMemory(pids);
  return {
    atMs: performance.now(),
    processes: pids.map((pid) => ({
      pid,
      bytes: memory.get(pid) ?? null,
      cpuSeconds: readProcessCpuSeconds(pid),
    })),
  };
}

async function run(): Promise<void> {
  const build = path.join(root, "extension-runtime");
  const { InstalledPackages, createNativeLeaseAdapter } = (await import(
    pathToFileURL(path.join(build, "packages.mjs")).href
  )) as typeof import("../../src/installed-packages/installed-packages");
  const { createExtensionRuntime } = (await import(
    pathToFileURL(path.join(build, "index.mjs")).href
  )) as typeof import("../../src/extension-runtime/electron-runtime");
  const runtime = { appVersion: app.getVersion(), apiVersion: "0.1.0" };
  const storeRoot = path.join(root, "runtime-store");
  const store = await InstalledPackages.open({
    root: storeRoot,
    runtime,
    leases: createNativeLeaseAdapter(path.join(build, "extension-leases.node")),
  });
  const archive = packageArchive([
    {
      name: "extension.json",
      data: JSON.stringify({
        format: 1,
        id: "test.performance",
        name: "Performance runtime fixture",
        version: "1.0.0",
        engines: { omxterm: `>=${app.getVersion()}-0`, api: "0.1.x" },
        backend: "backend.mjs",
      }),
    },
    {
      name: "backend.mjs",
      data: `export function activate() {
  return { invoke(value) { return value; }, deactivate() {} };
}\n`,
    },
  ]);
  await store.install(archive, { expectedGeneration: 0, enabled: true });
  const owner = new AbortController();
  const host = await createExtensionRuntime({
    root: storeRoot,
    runtime,
    addon: path.join(build, "extension-leases.node"),
    bootstrap: path.join(build, "bootstrap.mjs"),
    environment: process.env,
    owner: owner.signal,
  });
  const backend = await host.activate("test.performance");
  const pids = runtimeProcesses();
  if (pids.length === 0)
    throw new Error("Activated runtime produced no bootstrap process");
  const samples: Sample[] = [];
  const started = performance.now();
  while (performance.now() - started < WINDOW_MS) {
    samples.push(sample(pids));
    await delay(SAMPLE_MS);
  }
  const retirement = await backend.retire();
  await host.dispose();
  const first = samples[0]!;
  const last = samples.at(-1)!;
  process.stdout.write(
    `${resultPrefix}${JSON.stringify({
      metric,
      build: Object.fromEntries(
        Object.entries({
          runtimeIndex: "index.mjs",
          runtimePackages: "packages.mjs",
          runtimeBootstrap: "bootstrap.mjs",
          runtimeLeases: "extension-leases.node",
        }).map(([name, file]) => [
          name,
          createHash("sha256")
            .update(readFileSync(path.join(build, file)))
            .digest("hex"),
        ]),
      ),
      windowMs: last.atMs - first.atMs,
      processCount: pids.length,
      samples,
      settled: retirement.settled,
      exitObserved: retirement.exitObserved,
      cooperative: retirement.cooperative,
      environment: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        versions: process.versions,
        cpuModel: os.cpus()[0]?.model ?? null,
      },
    })}\n`,
  );
  app.exit(0);
}

void app.whenReady().then(run).catch(fail);
