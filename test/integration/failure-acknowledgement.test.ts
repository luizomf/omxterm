import { buildFixture } from "../fixtures/failure-acknowledgement-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_FAILURE_ACK_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Failure acknowledgement through real Electron, Restty, PTY and native dialog",
  () => {
    it.for([
      "explicit-command",
      "default-shell",
      ...(process.platform === "win32" ? ["deferred-connect"] : []),
    ])(
      "retains failed %s B's native dialog through ordinary code-1 A exit and closes once after acknowledgement",
      { timeout: 110_000 },
      async (kind, testContext) => {
        testContext.signal.throwIfAborted();
        const root = await mkdtemp(path.join(tmpdir(), "omxterm-failure-ack-"));
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
            args: [
              ...args,
              root,
              ...(kind === "default-shell" ? ["--missing-default-shell"] : []),
              ...(kind === "deferred-connect"
                ? ["--deferred-connect-failure"]
                : []),
            ],
            root,
            timeout: 90_000,
            testContext,
            prepare: () => buildFixture(root, "runner"),
          });
          expect(
            execution,
            `Failure acknowledgement fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
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
            nativeSpawnFailure: true,
            nativeDialog: true,
            nativeSheet: process.platform === "darwin" ? true : null,
            survivedOrdinaryExit: true,
            acknowledged: true,
            cleanupExactlyOnce: true,
          });
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);
