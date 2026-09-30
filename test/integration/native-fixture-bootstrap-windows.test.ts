import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import {
  fixtureProcesses,
  terminateFixtureProcesses,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";

async function waitFor<T>(read: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (true) {
    try {
      return await read();
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function exited(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
}

// Real Windows WMI/Job behavior, with a controlled after-spawn interruption.
// The independent identity journal is outside the profile and is only for test
// cleanup, never supervisor ownership. No surviving orphan is presumed.
describe.skipIf(
  process.platform !== "win32" ||
    process.env["OMXTERM_TEST_NATIVE_INTERRUPTION"] !== "1",
)("Windows fixture bootstrap ownership", () => {
  it.each(["interrupted", "ordinary", "immediate", "failed"] as const)(
    "preserves ownership certainty and the original %s launch outcome",
    async (mode) => {
      const base = await mkdtemp(path.join(tmpdir(), "omxterm-bootstrap-"));
      const root = await mkdtemp(path.join(base, "profile-"));
      const evidence = path.join(base, "outcome.json");
      const identities = path.join(base, "identities.json");
      const workerProgram = path.join(base, "worker.cjs");
      // Interpose only at native process I/O. Calls still reach real spawn/WMI;
      // filtering excludes esbuild and every non-profile child.
      await build({
        outfile: workerProgram,
        bundle: true,
        packages: "external",
        platform: "node",
        format: "cjs",
        stdin: {
          resolveDir: path.resolve("test/fixtures"),
          contents: `
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {fixtureProcesses} = require('./native-fixture-processes');
const {runNativeFixture} = require('./run-native-fixture');
const [root, evidence, identities, mode] = process.argv.slice(2);
const known = [];
const record = (pid) => {
  const identity = fixtureProcesses().find(row => row.pid === pid);
  if (!identity) throw new Error('Cannot capture independent native identity');
  known.push(identity);
  fs.writeFileSync(identities, JSON.stringify(known));
};
const realExec = cp.execFileSync;
cp.execFileSync = (file, args, options) => {
  const result = realExec(file, args, options);
  if (String(args?.at(-1)).includes('Invoke-CimMethod')) record(Number(result));
  return result;
};
const realSpawn = cp.spawn;
cp.spawn = (file, args, options) => {
  const child = realSpawn(file, args, options);
  if (options?.cwd === root && file === process.execPath) {
    const live = fixtureProcesses().find(row => row.pid === child.pid);
    if (live) { known.push(live); fs.writeFileSync(identities, JSON.stringify(known)); }
    if (mode === 'interrupted') {
      if (!live) throw new Error('Interrupted child identity was not captured');
      process.exit(73); // Real spawn happened; caller has not received the child.
    }
  }
  return child;
};
runNativeFixture({
  executable: mode === 'failed' ? path.join(baseDirectory(), 'missing-executable') : process.execPath,
  args: mode === 'failed' ? [] : ['-e', mode === 'interrupted'
    ? 'setInterval(()=>{},1000)'
    : "console.log('synthetic bootstrap output');" + (mode === 'ordinary' ? 'setTimeout(()=>process.exit(7),1500)' : 'process.exit(0)')],
  root, evidencePath: evidence, timeout: 12000,
}).then(result => process.exit(result.reason === 'exit' && result.exitCode === 0 && result.cleanupErrors.length === 0 ? 0 : 1))
  .catch(error => { console.error(error); process.exit(1); });
function baseDirectory() { return path.dirname(root); }
`,
        },
      });
      // Resolve native esbuild from the same checkout, not a cross-OS copy.
      const sentinel = spawn(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        {
          stdio: "ignore",
        },
      );
      const sentinelExit = exited(sentinel);
      const known = new Map<number, FixtureProcess>();
      let worker: ChildProcess | undefined;
      let workerExit: Promise<number | null> | undefined;
      try {
        const sentinelIdentity = fixtureProcesses().find(
          (row) => row.pid === sentinel.pid,
        );
        if (!sentinelIdentity) throw new Error("Cannot identify sentinel");
        known.set(sentinelIdentity.pid, sentinelIdentity);
        worker = spawn(
          process.execPath,
          [workerProgram, root, evidence, identities, mode],
          {
            env: { ...process.env, NODE_PATH: path.resolve("node_modules") },
            stdio: ["ignore", "ignore", "inherit"],
          },
        );
        workerExit = exited(worker);
        const workerIdentity = fixtureProcesses().find(
          (row) => row.pid === worker!.pid,
        );
        if (workerIdentity) known.set(workerIdentity.pid, workerIdentity);
        const result = await waitFor(
          async () =>
            JSON.parse(await readFile(evidence, "utf8")) as {
              reason: string;
              exitCode: number | null;
              signal: string | null;
              cleanupErrors: string[];
              stdout: string;
              stderr: string;
              ownedProcesses: FixtureProcess[];
            },
        );
        expect(await workerExit).toBe(
          mode === "interrupted"
            ? 73
            : mode === "ordinary" || mode === "failed"
              ? 1
              : 0,
        );
        expect(result.reason).toBe(
          mode === "interrupted"
            ? "parent-disconnected"
            : mode === "failed"
              ? "spawn-error"
              : "exit",
        );
        if (mode === "interrupted") {
          expect(result.cleanupErrors).toContain(
            "Error: Fixture process registration was interrupted; cleanup is uncertain",
          );
          await expect(access(root)).resolves.toBeUndefined();
        } else {
          expect(result.exitCode).toBe(
            mode === "ordinary" ? 7 : mode === "immediate" ? 0 : null,
          );
          expect(result.signal).toBeNull();
          expect(result.cleanupErrors).toEqual([]);
          if (mode === "failed") expect(result.stderr).toContain("ENOENT");
          else expect(result.stdout).toBe("synthetic bootstrap output\n");
          await expect(access(root)).rejects.toThrow();
        }
        expect(fixtureProcesses()).toContainEqual(sentinelIdentity);
        expect(sentinel.exitCode).toBeNull();
        expect(sentinel.signalCode).toBeNull();
      } finally {
        // Works even when intentional failure/production cleanup removes no
        // profile, or the assertions fail. Never discover targets by name.
        const recorded = await readFile(identities, "utf8").then(
          (text) => JSON.parse(text) as FixtureProcess[],
          () => [],
        );
        for (const row of recorded) known.set(row.pid, row);
        await terminateFixtureProcesses(known);
        if (workerExit) await workerExit;
        await sentinelExit;
        await rm(base, { recursive: true, force: true });
      }
    },
    45_000,
  );
});
