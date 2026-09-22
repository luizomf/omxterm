import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  fixtureProcesses,
  terminateFixtureProcesses,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";

// Like the interruption suite, this intentionally leaves a native PTY for
// cleanup. Run only in an authorized disposable VM with a recovery snapshot.
describe.skipIf(process.env["OMXTERM_TEST_NATIVE_INTERRUPTION"] !== "1")(
  "early native fixture exit",
  () => {
    it("cleans a registered real PTY after its leader exits early", async () => {
      // Keep external dependencies resolvable from the disposable fixture.
      const base = await mkdtemp(path.resolve(".scratch-early-pty-"));
      const root = await mkdtemp(path.join(base, "profile-"));
      const ready = path.join(base, "pty.json");
      try {
        const program = path.join(base, "fixture.cjs");
        await build({
          entryPoints: ["test/fixtures/native-fixture-early-exit.ts"],
          outfile: program,
          bundle: true,
          packages: "external",
          platform: "node",
          format: "cjs",
        });
        const result = await runNativeFixture({
          executable: process.execPath,
          args: [program, ready],
          root,
          timeout: 20_000,
          evidencePath: path.join(base, "outcome.json"),
        });
        const identity = JSON.parse(
          await readFile(ready, "utf8"),
        ) as FixtureProcess;
        expect(result.reason).toBe("exit");
        expect(result.exitCode).toBe(0);
        expect(result.cleanupErrors).toEqual([]);
        expect(
          fixtureProcesses().some(
            (row) =>
              row.pid === identity.pid && row.identity === identity.identity,
          ),
        ).toBe(false);
        await expect(access(root)).rejects.toThrow();
      } finally {
        const identity = await readFile(ready, "utf8").then(
          (text) => JSON.parse(text) as FixtureProcess,
          () => undefined,
        );
        if (identity)
          await terminateFixtureProcesses(new Map([[identity.pid, identity]]));
        await rm(base, { recursive: true, force: true });
      }
    }, 45_000);
  },
);
