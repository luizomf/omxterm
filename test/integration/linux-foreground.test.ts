import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { isNativeTestArchitecture } from "../fixtures/native-architecture";

const supported = process.platform === "linux" && isNativeTestArchitecture();

describe.skipIf(!supported)("Linux native foreground Busy detection", () => {
  it("keeps an ordinary pipeline Busy when its foreground group leader has exited", async (testContext) => {
    testContext.signal.throwIfAborted();
    await mkdir(path.resolve(".scratch"), { recursive: true });
    testContext.signal.throwIfAborted();
    const base = await mkdtemp(path.resolve(".scratch/linux-foreground-"));
    let supervised = false;
    try {
      testContext.signal.throwIfAborted();
      const root = await mkdtemp(path.join(base, "profile-"));
      testContext.signal.throwIfAborted();
      const program = path.join(base, "fixture.mjs");
      supervised = true;
      const result = await runNativeFixture({
        executable: process.execPath,
        args: [program],
        root,
        timeout: 15_000,
        testContext,
        prepare: async () => {
          await build({
            entryPoints: ["test/fixtures/linux-foreground-main.ts"],
            outfile: program,
            bundle: true,
            packages: "external",
            platform: "node",
            format: "esm",
          });
        },
      });
      expect(result, JSON.stringify(result)).toMatchObject({
        reason: "exit",
        exitCode: 0,
        signal: null,
        cleanupErrors: [],
      });
      expect(result.stdout.trim()).toBe("__OMXTERM_FOREGROUND_PASS__");
      await expect(access(root)).rejects.toThrow();
      await rm(base, { recursive: true, force: true });
    } finally {
      // Preserve supervisor failure evidence rather than erase uncertain ownership.
      if (!supervised) await rm(base, { recursive: true, force: true });
    }
  }, 30_000);
});
