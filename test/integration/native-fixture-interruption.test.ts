import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  fixtureProcesses,
  signalFixtureProcess,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";

const fixtureSource = `
const {spawn} = require('node:child_process');
const {spawnFixtureProcess} = require('./native-fixture-ownership');
const {writeFileSync} = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
process.on('SIGTERM', () => {});
const child = spawnFixtureProcess(() => {
  const spawned = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {detached:true,stdio:'ignore'});
  return spawned;
});
writeFileSync(path.join(root,'ready.json'), JSON.stringify({leader:process.pid,session:child.pid}));
console.log('fixture diagnostic before interruption');
setInterval(()=>{},1000);
`;

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

// Explicit opt-in: these tests interrupt owned processes and belong in a
// disposable VM, not alongside the maintainer's production applications.
describe.skipIf(process.env["OMXTERM_TEST_NATIVE_INTERRUPTION"] !== "1")(
  "native fixture cleanup after worker loss",
  () => {
    it("preserves spawn failure and removes only its empty disposable profile", async () => {
      const base = await mkdtemp(path.join(tmpdir(), "omxterm-spawn-failure-"));
      const root = await mkdtemp(path.join(base, "profile-"));
      const evidencePath = path.join(base, "outcome.json");
      try {
        const result = await runNativeFixture({
          executable: path.join(base, "missing-executable"),
          args: [],
          root,
          timeout: 1_500,
          evidencePath,
        });
        expect(result.reason).toBe("spawn-error");
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain("ENOENT");
        expect(result.cleanupErrors).toEqual([]);
        expect(JSON.parse(await readFile(evidencePath, "utf8"))).toMatchObject(
          result,
        );
        await expect(access(root)).rejects.toThrow();
      } finally {
        await rm(base, { recursive: true, force: true });
      }
    }, 15_000);
    it.each([
      "SIGTERM",
      "SIGKILL",
      "fixture-SIGTERM",
      "timeout",
      "failure",
      "success",
      "registration-interrupted",
    ] as const)(
      "cleans an owned detached tree after %s, preserving a sentinel and mechanical evidence",
      async (mode) => {
        const base = await mkdtemp(
          path.join(tmpdir(), "omxterm-interruption-test-"),
        );
        const root = await mkdtemp(path.join(base, "profile-"));
        const evidence = path.join(base, "outcome.json");
        const program = path.join(base, "fixture.cjs");
        const parentProgram = path.join(base, "parent.mjs");
        await build({
          outfile: program,
          bundle: true,
          packages: "external",
          platform: "node",
          format: "cjs",
          stdin: {
            resolveDir: path.resolve("test/fixtures"),
            contents:
              (mode === "fixture-SIGTERM"
                ? fixtureSource.replace(
                    "process.on('SIGTERM', () => {});",
                    "process.on('SIGTERM', () => process.send({type:'fixture-interrupted',signal:'SIGTERM'}));",
                  )
                : mode === "registration-interrupted"
                  ? fixtureSource.replace(
                      "return spawned;",
                      "writeFileSync(path.join(root,'ready.json'), JSON.stringify({leader:process.pid,session:spawned.pid})); process.exit(23);",
                    )
                  : fixtureSource) +
              (mode === "failure" || mode === "success"
                ? `\nsetTimeout(() => process.exit(${mode === "failure" ? 23 : 0}), 1500);\n`
                : ""),
          },
        });
        await symlink(
          path.resolve("node_modules"),
          path.join(base, "node_modules"),
          "junction",
        );
        await build({
          entryPoints: ["test/fixtures/native-fixture-interruption-parent.ts"],
          outfile: parentProgram,
          bundle: true,
          packages: "external",
          platform: "node",
          format: "esm",
        });
        const sentinel = spawn(
          process.execPath,
          ["-e", "setInterval(()=>{},1000)"],
          { stdio: "ignore" },
        );
        const sentinelExit = exited(sentinel);
        const parent = spawn(
          process.execPath,
          [
            parentProgram,
            root,
            evidence,
            program,
            mode === "timeout" ? "1500" : "60000",
          ],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        const parentExit = exited(parent);
        let emergencyCleanup: FixtureProcess[] = [];
        try {
          const ready = await waitFor(
            async () =>
              JSON.parse(
                await readFile(path.join(root, "ready.json"), "utf8"),
              ) as { leader: number; session: number },
          );
          emergencyCleanup = fixtureProcesses().filter(
            (row) => row.pid === ready.leader || row.pid === ready.session,
          );
          const sentinelIdentity = fixtureProcesses().find(
            (row) => row.pid === sentinel.pid,
          )!;
          signalFixtureProcess(
            { ...sentinelIdentity, identity: "0" },
            "SIGKILL",
          );
          if (mode === "SIGTERM" || mode === "SIGKILL") parent.kill(mode);
          if (mode === "fixture-SIGTERM") process.kill(ready.leader, "SIGTERM");
          const parentCode = await parentExit;
          if (mode === "success") expect(parentCode).toBe(0);
          else expect(parentCode).not.toBe(0);
          const result = await waitFor(
            async () =>
              JSON.parse(await readFile(evidence, "utf8")) as {
                reason: string;
                cleanupErrors: string[];
                stdout: string;
                exitCode: number | null;
              },
          );
          expect(result.reason).toBe(
            mode === "fixture-SIGTERM"
              ? process.platform === "win32"
                ? "exit"
                : "fixture-SIGTERM"
              : mode === "timeout"
                ? "timeout"
                : mode === "failure" ||
                    mode === "success" ||
                    mode === "registration-interrupted"
                  ? "exit"
                  : "parent-disconnected",
          );
          if (mode === "failure") expect(result.exitCode).toBe(23);
          if (mode === "success") expect(result.exitCode).toBe(0);
          if (mode === "registration-interrupted") {
            expect(result.cleanupErrors).not.toEqual([]);
            await expect(access(root)).resolves.toBeUndefined();
          } else {
            expect(result.cleanupErrors).toEqual([]);
            expect(result.stdout).toContain(
              "fixture diagnostic before interruption",
            );
            await expect(access(root)).rejects.toThrow();
            expect(
              fixtureProcesses().filter(
                (row) => row.pid === ready.leader || row.pid === ready.session,
              ),
            ).toEqual([]);
          }
          expect(sentinel.exitCode).toBeNull();
          expect(sentinel.signalCode).toBeNull();
        } finally {
          if (parent.exitCode === null && parent.signalCode === null)
            parent.kill();
          for (const row of emergencyCleanup)
            signalFixtureProcess(row, "SIGKILL");
          sentinel.kill();
          await sentinelExit;
          await rm(base, { recursive: true, force: true });
        }
      },
      45_000,
    );
  },
);
