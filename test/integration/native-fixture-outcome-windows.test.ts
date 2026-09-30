import * as childProcess from "node:child_process";
import * as files from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  fixtureProcesses,
  signalFixtureProcess,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";

vi.mock("node:child_process", { spy: true });
vi.mock("node:fs/promises", { spy: true });

// These real WMI/publication/exit tests widen a legal I/O interval, not a
// spontaneous failure-rate measurement. Emergency cleanup may kill owned
// processes, so use the existing disposable-VM interruption opt-in.
describe.skipIf(
  process.platform !== "win32" ||
    process.env["OMXTERM_TEST_NATIVE_INTERRUPTION"] !== "1",
)("Windows fixture final outcome after supervisor exit", () => {
  it.each(["success", "failure", "invalid", "missing"] as const)(
    "observes %s evidence published between the first read and liveness check",
    async (mode) => {
      const realFiles = await vi.importActual<typeof files>("node:fs/promises");
      const realChildProcess =
        await vi.importActual<typeof childProcess>("node:child_process");
      const base = await realFiles.mkdtemp(
        path.join(tmpdir(), "omxterm-outcome-native-"),
      );
      const root = await realFiles.mkdtemp(path.join(base, "profile-"));
      const evidencePath = path.join(base, "outcome.json");
      const known = new Map<number, FixtureProcess>();
      let supervisorPid: number | undefined;
      let interleaved = false;
      let published: unknown;
      vi.mocked(childProcess.execFileSync).mockImplementation(
        (file, args, options) => {
          const result = realChildProcess.execFileSync(file, args, options);
          if (String(args?.at(-1)).includes("Invoke-CimMethod")) {
            supervisorPid = Number(result);
            const supervisor = fixtureProcesses().find(
              (row) => row.pid === supervisorPid,
            );
            if (!supervisor)
              throw new Error("Cannot record emergency supervisor identity");
            known.set(supervisor.pid, supervisor);
          }
          return result;
        },
      );
      vi.mocked(childProcess.spawn).mockImplementation(
        (file, args, options) => {
          const child = realChildProcess.spawn(file, args, options);
          if (file === process.execPath && options?.cwd === root) {
            const leader = fixtureProcesses().find(
              (row) => row.pid === child.pid,
            );
            if (leader) known.set(leader.pid, leader);
          }
          return child;
        },
      );
      vi.mocked(files.readFile).mockImplementation(async (file, options) => {
        try {
          return await realFiles.readFile(file, options);
        } catch (error) {
          if (
            file === evidencePath &&
            (error as NodeJS.ErrnoException).code === "ENOENT" &&
            existsSync(path.join(root, "native-process.json")) &&
            !interleaved
          ) {
            const leader = JSON.parse(
              await realFiles.readFile(
                path.join(root, "native-process.json"),
                "utf8",
              ),
            ) as FixtureProcess;
            known.set(leader.pid, leader);
            if (!supervisorPid) throw new Error("No native supervisor PID");
            const deadline = Date.now() + 15_000;
            while (true) {
              let alive = true;
              try {
                process.kill(supervisorPid, 0);
              } catch {
                alive = false;
              }
              if (!alive && existsSync(evidencePath)) break;
              if (Date.now() >= deadline)
                throw new Error(
                  "Native publication/exit interleaving was not reached",
                );
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            published = JSON.parse(
              await realFiles.readFile(evidencePath, "utf8"),
            );
            interleaved = true;
            if (mode === "invalid") {
              // Corrupt actual published evidence only after native completion.
              await realFiles.writeFile(
                evidencePath,
                JSON.stringify({ reason: "exit", exitCode: 0 }),
              );
            } else if (mode === "missing") await realFiles.rm(evidencePath);
            // Deliver the actual earlier ENOENT after real publication and exit.
          }
          throw error;
        }
      });
      try {
        const outcome = runNativeFixture({
          executable: process.execPath,
          args: [
            "-e",
            `console.log('synthetic native stdout');console.error('synthetic native stderr');setTimeout(()=>process.exit(${mode === "failure" ? 7 : 0}),1500)`,
          ],
          root,
          timeout: 12_000,
          evidencePath,
        });
        if (mode === "invalid")
          await expect(outcome).rejects.toThrow(
            "Invalid native fixture supervisor outcome",
          );
        else if (mode === "missing")
          await expect(outcome).rejects.toThrow(
            "Native fixture supervisor disappeared without an outcome",
          );
        else expect(await outcome).toEqual(published);
        expect(interleaved).toBe(true);
        expect(published).toMatchObject({
          reason: "exit",
          exitCode: mode === "failure" ? 7 : 0,
          signal: null,
          cleanupErrors: [],
          stdout: "synthetic native stdout\n",
          stderr: "synthetic native stderr\n",
        });
        await expect(realFiles.access(root)).rejects.toThrow();
      } finally {
        vi.restoreAllMocks();
        // Do not rely on successful production cleanup or a retained profile.
        // Kill only identities independently captured before native completion.
        for (const row of [...known.values()].reverse())
          signalFixtureProcess(row, "SIGKILL");
        const deadline = Date.now() + 5_000;
        while (
          fixtureProcesses().some(
            (row) => known.get(row.pid)?.identity === row.identity,
          )
        ) {
          if (Date.now() >= deadline)
            throw new Error(`Emergency cleanup uncertain; retain ${base}`);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await realFiles.rm(base, { recursive: true, force: true });
      }
    },
    35_000,
  );
});
