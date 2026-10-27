import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { buildFixture } from "../fixtures/font-read-reload-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  assertOldPostReadRejection,
  fontReadReloadResultPrefix as prefix,
} from "../fixtures/font-read-reload-checks";

const executable = createRequire(import.meta.url)("electron") as string;
it
  .skipIf(!["darwin", "linux", "win32"].includes(process.platform))
  .for(["current", "old-post-read"] as const)(
  "checks a held native font read across reload with four mounted live Surfaces (%s)",
  { timeout: 110_000 },
  async (control, testContext) => {
    testContext.signal.throwIfAborted();
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-font-read-reload-"),
    );
    let supervised = false;
    try {
      testContext.signal.throwIfAborted();
      const args: string[] = [];
      applyChromiumSandboxPolicy({
        appendSwitch: (name) => {
          args.push(`--${name}`);
        },
      });
      if (process.platform === "linux") args.push("--ozone-platform=x11");
      supervised = true;
      const execution = await runNativeFixture({
        executable,
        args: [...args, root],
        root,
        timeout: 90_000,
        testContext,
        prepare: () => buildFixture(root, "runner", control),
      });
      if (control === "old-post-read") {
        assertOldPostReadRejection(execution);
        return;
      }
      expect(
        execution,
        `Font read/reload fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toMatchObject({
        exitCode: 0,
        signal: null,
        reason: "exit",
        cleanupErrors: [],
      });
      const results = execution.stdout
        .split("\n")
        .filter((line) => line.startsWith(prefix));
      expect(results).toHaveLength(1);
      expect(JSON.parse(results[0]!.slice(prefix.length)) as unknown).toEqual({
        acceptedA: true,
        queuedB: true,
        sessions: 4,
        mountedSurfaces: 4,
        handlesClosed: true,
      });
    } finally {
      if (!supervised) await rm(root, { recursive: true, force: true });
    }
  },
);
