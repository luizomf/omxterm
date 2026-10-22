import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { isNativeTestArchitecture } from "../fixtures/native-architecture";

const supported =
  ["darwin", "linux"].includes(process.platform) && isNativeTestArchitecture();
const electron = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_RESIZE_RACE__";

describe.skipIf(!supported)("owned Unix native resize/exit race", () => {
  it.for(["Node", "Electron"])(
    "contains genuine closure failures through production IPC under %s",
    { timeout: 45_000 },
    async (runtime, testContext) => {
      testContext.signal.throwIfAborted();
      await mkdir(path.resolve(".scratch"), { recursive: true });
      testContext.signal.throwIfAborted();
      const base = await mkdtemp(
        path.resolve(".scratch/terminal-resize-race-"),
      );
      let supervised = false;
      try {
        testContext.signal.throwIfAborted();
        const root = await mkdtemp(path.join(base, "profile-"));
        testContext.signal.throwIfAborted();
        const program = path.join(base, "fixture.mjs");
        supervised = true;
        const result = await runNativeFixture({
          executable: runtime === "Node" ? process.execPath : "/usr/bin/env",
          args:
            runtime === "Node"
              ? [program]
              : ["ELECTRON_RUN_AS_NODE=1", electron, program],
          root,
          timeout: 25_000,
          testContext,
          prepare: async () => {
            await build({
              entryPoints: ["test/fixtures/terminal-resize-race-main.ts"],
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
        const record = JSON.parse(records[0]!.slice(prefix.length)) as {
          failures: number;
          diagnostics: number;
        };
        expect(record).toMatchObject({
          sessions: 100,
          escaped: 0,
          exits: 101,
          siblingUsable: true,
        });
        expect(record.failures).toBeGreaterThan(0);
        expect(record.diagnostics).toBe(record.failures);
        await expect(access(root)).rejects.toThrow();
        await rm(base, { recursive: true, force: true });
      } finally {
        if (!supervised) await rm(base, { recursive: true, force: true });
      }
    },
  );
});
