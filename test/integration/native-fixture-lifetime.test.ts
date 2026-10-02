import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { fixtureProcesses } from "../fixtures/native-fixture-processes";
import {
  runNativeFixture,
  type NativeFixtureResult,
} from "../fixtures/run-native-fixture";

// No Electron, PTY, user configuration or Windows setup: exercise the real
// POSIX owner with one disposable Node child blocked before completion.
it.skipIf(process.platform === "win32")(
  "cancels and settles the actual native owner before a timed-out context can launch again",
  async (testContext) => {
    const base = await mkdtemp(path.join(tmpdir(), "omxterm-lifetime-"));
    const root = await mkdtemp(path.join(base, "profile-"));
    const controller = new AbortController();
    const context = {
      signal: AbortSignal.any([testContext.signal, controller.signal]),
      onTestFinished: testContext.onTestFinished,
    };
    let execution: NativeFixtureResult | undefined;
    const operation = runNativeFixture({
      executable: process.execPath,
      args: [
        "-e",
        "require('node:fs').writeFileSync('blocked-startup.json', JSON.stringify({pid:process.pid,supervisorPid:process.ppid})); setInterval(() => {}, 1000)",
      ],
      root,
      evidencePath: path.join(base, "outcome.json"),
      timeout: 2_000,
      testContext: context,
    }).then((result) => {
      execution = result;
      return result;
    });
    try {
      await vi.waitFor(
        () =>
          expect(existsSync(path.join(root, "blocked-startup.json"))).toBe(
            true,
          ),
        { timeout: 1_000 },
      );
      const actor = JSON.parse(
        await readFile(path.join(root, "blocked-startup.json"), "utf8"),
      ) as { pid: number; supervisorPid: number };
      expect(fixtureProcesses().some((row) => row.pid === actor.pid)).toBe(
        true,
      );
      controller.abort();
      await expect(operation).resolves.toMatchObject({
        reason: "parent-disconnected",
        cleanupErrors: [],
      });
      expect(existsSync(root)).toBe(false);
      const after = fixtureProcesses();
      expect(
        after.some(
          (row) => row.pid === actor.pid || row.pid === actor.supervisorPid,
        ),
      ).toBe(false);
      const lateRoot = await mkdtemp(path.join(base, "late-profile-"));
      await expect(
        runNativeFixture({
          executable: process.execPath,
          args: [
            "-e",
            "require('node:fs').writeFileSync('late-launch', 'unexpected')",
          ],
          root: lateRoot,
          evidencePath: path.join(base, "late-outcome.json"),
          timeout: 2_000,
          testContext: context,
        }),
      ).rejects.toThrow();
      expect(existsSync(lateRoot)).toBe(true);
      expect(existsSync(path.join(lateRoot, "late-launch"))).toBe(false);
    } finally {
      controller.abort();
      await operation.catch(() => undefined);
      // Only reclaim this test's base after authoritative successful cleanup.
      // An uncertain outcome/profile remains available for owner investigation.
      if (execution?.cleanupErrors.length === 0 && !existsSync(root))
        await rm(base, { recursive: true, force: true });
    }
  },
);
