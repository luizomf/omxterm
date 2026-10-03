import { buildFixture } from "../fixtures/production-shutdown-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { nativeFixturePlatform } from "../fixtures/restty-host-platform";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_PRODUCTION_SHUTDOWN_RESULT__";

// Windows-specific regression: explicit PowerShell first command, then two
// configured Node REPLs in two real production windows. Other platforms must
// not claim coverage of ConPTY startup/deferred termination.
describe.skipIf(process.platform !== "win32")(
  "production Windows native shutdown",
  () => {
    it.for([
      { action: "close", readiness: "started" },
      { action: "quit", readiness: "started" },
      { action: "close", readiness: "prompt" },
      { action: "quit", readiness: "prompt" },
    ])(
      "waits for native exits on $action at $readiness readiness",
      { timeout: 60_000 },
      async ({ action, readiness }, testContext) => {
        testContext.signal.throwIfAborted();
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-production-shutdown-"),
        );
        let supervised = false;
        try {
          testContext.signal.throwIfAborted();
          supervised = true;
          const execution = await runNativeFixture({
            executable,
            args: [
              root,
              ...(readiness === "prompt" ? ["--prompt-ready"] : []),
              ...(action === "quit" ? ["--quit-menu"] : []),
              "-e",
              nativeFixturePlatform.defaultShell,
              "-NoLogo",
              "-NoProfile",
              "-Command",
              "[Console]::ReadLine() | Out-Null",
            ],
            root,
            timeout: 40_000,
            testContext,
            prepare: () => buildFixture(root, "runner"),
          });
          expect(
            execution,
            `Production shutdown failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
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
          expect(
            JSON.parse(results[0]!.slice(prefix.length)) as unknown,
          ).toEqual({
            created: 3,
            exited: 3,
            windows: 2,
            surfaces: 3,
            readiness,
            action,
          });
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);
