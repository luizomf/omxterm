import { buildFixture } from "../fixtures/macos-window-blur-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";

import { runNativeFixture } from "../fixtures/run-native-fixture";

it.skipIf(process.platform !== "darwin" || process.arch !== "arm64")(
  "loads the production Node-API addon and validates live owned windows and main-thread calls",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-macos-blur-"));
    await buildFixture(root);
    let supervised = false;
    try {
      supervised = true;
      const result = await runNativeFixture({
        executable: createRequire(import.meta.url)("electron") as string,
        args: [
          root,
          ...(process.env.OMXTERM_TEST_MACOS_FULLSCREEN === "1"
            ? ["--fullscreen-control"]
            : []),
        ],
        root,
        timeout: 60_000,
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
    } finally {
      if (!supervised) await rm(root, { recursive: true, force: true });
    }
  },
  90_000,
);
