import { buildFixture } from "../fixtures/startup-tab-titles-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_STARTUP_TITLES_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Startup titles through real Electron, Surfaces and PTYs",
  () => {
    it("displays first and additional silent-program fallback labels without OSC repair", async (testContext) => {
      testContext.signal.throwIfAborted();
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-startup-tab-titles-"),
      );
      let supervised = false;
      try {
        testContext.signal.throwIfAborted();
        const args: string[] = [];
        applyChromiumSandboxPolicy({
          appendSwitch(name) {
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
          prepare: () => buildFixture(root, "runner"),
        });
        expect(
          execution,
          `Startup titles fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
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
          fallbackLabels: true,
          nativeTitle: true,
          silentPrograms: 2,
          oscTitles: 0,
        });
      } finally {
        if (!supervised) await rm(root, { recursive: true, force: true });
      }
    }, 110_000);
  },
);
