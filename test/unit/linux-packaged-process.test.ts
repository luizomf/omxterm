import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  writeFile,
  symlink,
  chmod,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  launchLinuxPackagedProcess,
  verifyLinuxWrapperPropagation,
} from "../../scripts/linux-packaged-process.mjs";
import { verifyPackagedStartupWithCleanup } from "../../scripts/verify-packaged-app.mjs";

const fixture = path.resolve("test/fixtures/linux-packaged-process.mjs");
const roots: string[] = [];
const owners: Awaited<ReturnType<typeof launchLinuxPackagedProcess>>[] = [];
interface ProcessResult {
  outcome: { code: number | null; signal: string | null };
  closed: boolean;
  remaining: unknown[];
  failures: string[];
}
async function resultAt(root: string): Promise<ProcessResult> {
  return JSON.parse(
    await readFile(path.join(root, "linux-process-result.json"), "utf8"),
  ) as ProcessResult;
}
async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 3_000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("fixture deadline exceeded");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function exists(file: string) {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}
async function setup(wrapper = false, mode = "normal", timeoutMs = 500) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-linux-owner-test-"));
  roots.push(root);
  await symlink(process.execPath, path.join(root, "omxterm"));
  const launcher = path.join(root, "AppImage");
  await writeFile(
    launcher,
    '#!/bin/sh\nexec "$OMXTERM_FIXTURE_NODE" "$OMXTERM_FIXTURE_ENTRY" wrapper "$@"\n',
  );
  await chmod(launcher, 0o700);
  vi.stubEnv("OMXTERM_FIXTURE_NODE", process.execPath);
  vi.stubEnv("OMXTERM_FIXTURE_ENTRY", fixture);
  vi.stubEnv("OMXTERM_FIXTURE_ROOT", root);
  vi.stubEnv("OMXTERM_FIXTURE_MODE", mode);
  const launch = () =>
    launchLinuxPackagedProcess({
      executable: wrapper ? launcher : process.execPath,
      args: wrapper ? [] : [fixture, "main"],
      env: { ...process.env },
      expectedExecutable: process.execPath,
      readinessFile: path.join(root, "ready"),
      profileRoot: root,
      wrapper,
      timeoutMs,
    });
  return { root, launcher, launch };
}
async function start(wrapper = false, mode = "normal", timeoutMs = 500) {
  const setup_ = await setup(wrapper, mode, timeoutMs);
  const owner = await setup_.launch();
  owners.push(owner);
  await until(() => exists(path.join(setup_.root, "ready")));
  await owner.verifyMain();
  return { ...setup_, owner };
}

describe.skipIf(process.platform !== "linux")(
  "Linux packaged process actual shutdown seam",
  () => {
    afterEach(async () => {
      // stop() is called once per fixture, including assertion failure recovery.
      for (const owner of owners.splice(0))
        await owner.stop().catch(() => undefined);
      vi.unstubAllEnvs();
      for (const root of roots.splice(0))
        await rm(root, { recursive: true, force: true });
    });

    it.each([false, true])(
      "signals actual main first (wrapper=%s), retains wrapper to reap and settles a separate-session PTY",
      async (wrapper) => {
        const { root, owner } = await start(wrapper);
        owners.pop();
        await expect(owner.stop()).resolves.toEqual({ code: 0, signal: null });
        const ordering = (await readFile(path.join(root, "ordering"), "utf8"))
          .trim()
          .split("\n");
        const shutdown = ordering.slice(wrapper ? 3 : 0);
        expect(shutdown[0]).toBe("main-term");
        expect(shutdown.slice(1, 3).sort()).toEqual(["gpu-term", "probe-term"]);
        expect(shutdown.slice(3)).toEqual(wrapper ? ["wrapper-reaped"] : []);
      },
    );

    it.each([false, true])(
      "fails exit 3 after readiness even when cleanup settles (wrapper=%s)",
      async (wrapper) => {
        const { root, owner } = await start(wrapper);
        await writeFile(path.join(root, "fail"), "");
        await until(async () => owner.child.exitCode !== null);
        owners.pop();
        const removeProfile = vi.fn();
        await expect(
          verifyPackagedStartupWithCleanup({
            verify: async () => 7,
            stop: () => owner.stop(),
            removeProfile,
          }),
        ).rejects.toThrow("native failure (exit 3");
        expect(removeProfile).not.toHaveBeenCalled();
        const result = await resultAt(root);
        expect(result.outcome).toEqual({ code: 3, signal: null });
        expect(result.closed).toBe(true);
        expect(result.remaining).toEqual([]);
      },
    );

    it("preserves the wrapper while it reaps an already-exited main and propagates its failure", async () => {
      const { root, owner } = await start(true, "delayed-reap");
      await writeFile(path.join(root, "fail"), "");
      await until(async () =>
        (await readFile(path.join(root, "ordering"), "utf8")).includes(
          "wrapper-child-exited",
        ),
      );
      expect(owner.child.exitCode).toBeNull();
      owners.pop();
      await expect(owner.stop()).rejects.toThrow("native failure (exit 3");
      expect((await resultAt(root)).outcome).toEqual({ code: 3, signal: null });
    });

    it("detects the original group-first teardown with real main/Chromium-child ordering", async () => {
      const { owner } = await start();
      process.kill(-owner.child.pid!, "SIGTERM");
      await until(async () => owner.child.exitCode !== null);
      owners.pop();
      await expect(owner.stop()).rejects.toThrow("native failure (exit 3");
    });

    it("rejects killing only the wrapper and cleans the still-live main as failure recovery", async () => {
      const { root, owner } = await start(true);
      owner.child.kill("SIGTERM");
      await until(async () => owner.child.signalCode !== null);
      owners.pop();
      await expect(owner.stop()).rejects.toThrow("signal SIGTERM");
      const result = await resultAt(root);
      expect(result.remaining).toEqual([]);
    });

    it("refuses stale start identity at the actual pidfd signaling boundary", async () => {
      const fields = (await readFile(`/proc/${process.pid}/stat`, "utf8"))
        .split(") ")[1]!
        .split(" ");
      const result = spawnSync(
        "python3",
        ["-I", path.resolve("scripts/linux-packaged-signal.py")],
        {
          input: JSON.stringify({
            signal: "SIGTERM",
            targets: [
              {
                pid: process.pid,
                parent: process.ppid,
                group: Number(fields[2]),
                start: "0",
              },
            ],
          }),
          encoding: "utf8",
          timeout: 2_000,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("identity changed; refusing signal");
    });

    it("preserves a startup failure together with real signal-helper and unsettled-cleanup failures", async () => {
      const { root, owner } = await start(false, "hang", 200);
      const originalPath = process.env.PATH;
      vi.stubEnv("PATH", "/missing-python-for-negative-control");
      const startup = new Error("startup failed");
      try {
        await expect(
          verifyPackagedStartupWithCleanup({
            verify: async () => {
              throw startup;
            },
            stop: () => owner.stop(),
            removeProfile: vi.fn(),
          }),
        ).rejects.toMatchObject({
          errors: [
            startup,
            expect.objectContaining({
              message: expect.stringContaining(
                "identity-checked SIGTERM failed",
              ) as unknown,
            }) as unknown,
          ],
        });
        const result = await resultAt(root);
        expect(result.failures).toEqual(
          expect.arrayContaining([
            expect.stringContaining("failure cleanup did not settle"),
          ]),
        );
        expect(result.remaining.length).toBeGreaterThan(0);
      } finally {
        // Explicit test recovery after restoring the deliberately broken helper.
        vi.stubEnv("PATH", originalPath);
      }
    });

    it.each([false, true])(
      "does not mask a native signal after readiness (wrapper=%s)",
      async (wrapper) => {
        const { root, owner } = await start(wrapper, "signal");
        await writeFile(path.join(root, "fail"), "");
        await until(
          async () =>
            owner.child.signalCode !== null || owner.child.exitCode !== null,
        );
        owners.pop();
        await expect(owner.stop()).rejects.toThrow(
          wrapper ? "exit 127" : "signal SIGKILL",
        );
      },
    );

    it("rejects an exact wrapper which returns zero for a failing child before GUI/main launch", async () => {
      const { root, launch } = await setup(true, "mask");
      await expect(launch()).rejects.toThrow(
        "masks or fails nonzero outcome control",
      );
      expect(await exists(path.join(root, "ready"))).toBe(false);
    });

    it("checks signal propagation independently of ordinary nonzero propagation", async () => {
      const { launcher } = await setup(true, "mask-signal");
      await expect(verifyLinuxWrapperPropagation(launcher)).rejects.toThrow(
        "masks or fails signal outcome control",
      );
    });

    it.each(["hang", "streams"])(
      "keeps %s timeout a failure after bounded cleanup and preserves startup failure too",
      async (mode) => {
        const { root, owner } = await start(false, mode, 200);
        owners.pop();
        const startup = new Error("startup privacy assertion failed");
        const removeProfile = vi.fn();
        await expect(
          verifyPackagedStartupWithCleanup({
            verify: async () => {
              throw startup;
            },
            stop: () => owner.stop(),
            removeProfile,
          }),
        ).rejects.toMatchObject({
          errors: [
            startup,
            expect.objectContaining({
              message: expect.stringContaining("deadline exceeded") as unknown,
            }) as unknown,
          ],
        });
        expect(removeProfile).not.toHaveBeenCalled();
        const result = await resultAt(root);
        expect(result.remaining).toEqual([]);
        expect(result.closed).toBe(true);
      },
    );

    it.each(["foreign", "wrong-executable", "changed-main", "stale-probe"])(
      "rejects %s readiness identity without using it as signal authority",
      async (mode) => {
        const { root, owner } = await start();
        const ready = path.join(root, "ready");
        const receipt = JSON.parse(await readFile(ready, "utf8")) as {
          mainPid: number;
          probePid: number;
        };
        if (mode === "foreign") receipt.mainPid = process.pid;
        if (mode === "changed-main") receipt.mainPid = receipt.probePid;
        if (mode === "stale-probe") receipt.probePid = 2147483647;
        // An identity-validated launch with different inspected executable bytes.
        if (mode === "wrong-executable") {
          owners.pop();
          await owner.stop();
          const next = await setup();
          const different = path.join(next.root, "different-executable");
          await writeFile(different, "not the runtime");
          const wrong = await launchLinuxPackagedProcess({
            executable: process.execPath,
            args: [fixture, "main"],
            env: { ...process.env },
            expectedExecutable: different,
            readinessFile: path.join(next.root, "ready"),
            profileRoot: next.root,
            timeoutMs: 200,
          });
          owners.push(wrong);
          await until(() => exists(path.join(next.root, "ready")));
          await expect(wrong.verifyMain()).rejects.toThrow(
            "differs from the inspected package",
          );
          return;
        }
        await writeFile(ready, JSON.stringify(receipt));
        await expect(owner.verifyMain()).rejects.toThrow(
          "owned launch lineage",
        );
        owners.pop();
        // The invalid new claim never replaces the retained valid main identity.
        await expect(owner.stop()).resolves.toEqual({ code: 0, signal: null });
      },
    );
  },
);
