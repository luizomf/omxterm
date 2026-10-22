import { buildFixture } from "../fixtures/macos-window-blur-build";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { runNativeFixture } from "../fixtures/run-native-fixture";
import { isNativeTestArchitecture } from "../fixtures/native-architecture";

it.skipIf(process.platform !== "darwin" || !isNativeTestArchitecture())(
  "loads the production Node-API addon and validates live owned windows and main-thread calls",
  async (testContext) => {
    testContext.signal.throwIfAborted();
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-macos-blur-"));
    let supervised = false;
    try {
      testContext.signal.throwIfAborted();
      const executable = createRequire(import.meta.url)("electron") as string;
      supervised = true;
      const result = await runNativeFixture({
        executable,
        args: [
          root,
          ...(process.env.OMXTERM_TEST_MACOS_FULLSCREEN === "1"
            ? ["--fullscreen-control"]
            : []),
        ],
        root,
        timeout: 60_000,
        testContext,
        prepare: () => buildFixture(root, "runner"),
      });
      expect(result, result.stderr).toMatchObject({
        exitCode: 0,
        reason: "exit",
        cleanupErrors: [],
      });
      expect(result.stdout).toContain('"nativeApply":0,"nativeReset":0');
      expect(result.stdout).toContain('"workerRejected":true');
      expect(result.stdout).toContain('"productionLifecycle":true');
      expect(result.stdout).toContain('"sameCanvas":true');
    } catch (error) {
      if (!supervised) await removeFailedFixture(root, error);
      throw error;
    }
  },
  90_000,
);
