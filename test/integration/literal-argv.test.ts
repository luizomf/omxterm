import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { literalArguments } from "../fixtures/literal-argv";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { isNativeTestArchitecture } from "../fixtures/native-architecture";

const supported =
  ["darwin", "linux", "win32"].includes(process.platform) &&
  isNativeTestArchitecture();
const prefix = "__OMXTERM_LITERAL_ARGV__";

describe.skipIf(!supported)("literal explicit-command native argv", () => {
  it("round-trips quotes, whitespace, empty arguments and backslashes to a real child", async (testContext) => {
    testContext.signal.throwIfAborted();
    // Keep node-pty resolvable on the native filesystem, under supervision.
    await mkdir(path.resolve(".scratch"), { recursive: true });
    testContext.signal.throwIfAborted();
    const base = await mkdtemp(path.resolve(".scratch/literal-argv-"));
    let supervised = false;
    try {
      testContext.signal.throwIfAborted();
      const root = await mkdtemp(path.join(base, "profile-"));
      testContext.signal.throwIfAborted();
      const program = path.join(base, "fixture.mjs");
      supervised = true;
      const result = await runNativeFixture({
        executable: process.execPath,
        args: [program, path.join(root, "echo.cjs")],
        root,
        timeout: 20_000,
        testContext,
        prepare: async () => {
          await build({
            entryPoints: ["test/fixtures/literal-argv-main.ts"],
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
      const records = result.stdout
        .split("\n")
        .filter((line) => line.startsWith(prefix));
      expect(records).toHaveLength(1);
      expect(JSON.parse(records[0]!.slice(prefix.length)) as unknown).toEqual({
        argv: literalArguments,
        exit: { exitCode: 0, signal: 0 },
      });
      await expect(access(root)).rejects.toThrow();
      await rm(base, { recursive: true, force: true });
    } finally {
      // A supervisor failure retains its profile and evidence for diagnosis.
      if (!supervised) await rm(base, { recursive: true, force: true });
    }
  }, 45_000);
});
