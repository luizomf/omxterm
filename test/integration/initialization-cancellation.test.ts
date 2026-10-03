import { buildFixture } from "../fixtures/initialization-cancellation-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_CANCELLATION_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Initialization cancellation through real Electron, Restty and native PTYs",
  () => {
    it.for(["fonts", "runtime"])(
      "closes B at real %s readiness without a failure or PTY and keeps A usable",
      { timeout: 110_000 },
      async (boundary, testContext) => {
        testContext.signal.throwIfAborted();
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-initialization-cancellation-"),
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
            args: [...args, root, `--fixture-boundary=${boundary}`],
            root,
            timeout: 90_000,
            testContext,
            prepare: () => buildFixture(root, "runner"),
          });
          expect(
            execution,
            `Initialization cancellation fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
          ).toMatchObject({
            exitCode: 0,
            signal: null,
            reason: "exit",
            cleanupErrors: [],
          });
          const result = execution.stdout
            .split("\n")
            .find((line) => line.startsWith(prefix));
          expect(result).toBeDefined();
          expect(JSON.parse(result!.slice(prefix.length)) as unknown).toEqual({
            heldBeforePty: true,
            cancelledWithoutFailure: true,
            exactlyOnePty: true,
            usable: true,
            lastTabClosed: true,
          });
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);
