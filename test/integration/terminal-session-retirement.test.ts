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
const prefix = "__OMXTERM_RETIREMENT__";

describe.skipIf(!supported)("owned Unix native session retirement", () => {
  it.for(["Node", "Electron"])(
    "collects exited sessions during long-lived churn under %s",
    { timeout: 45_000 },
    async (runtime, testContext) => {
      testContext.signal.throwIfAborted();
      await mkdir(path.resolve(".scratch"), { recursive: true });
      testContext.signal.throwIfAborted();
      const base = await mkdtemp(
        path.resolve(".scratch/terminal-session-retirement-"),
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
              ? ["--expose-gc", program]
              : ["ELECTRON_RUN_AS_NODE=1", electron, "--expose-gc", program],
          root,
          timeout: 25_000,
          testContext,
          prepare: async () => {
            await build({
              entryPoints: [
                "test/fixtures/terminal-session-retirement-main.ts",
              ],
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
        expect(JSON.parse(records[0]!.slice(prefix.length))).toEqual({
          created: 100,
          batches: Array.from({ length: 4 }, () => ({
            sessions: 0,
            natives: 0,
          })),
          actualExits: 101,
          staleInteractions: 0,
          siblingUsable: true,
        });
        await expect(access(root)).rejects.toThrow();
        await rm(base, { recursive: true, force: true });
      } finally {
        if (!supervised) await rm(base, { recursive: true, force: true });
      }
    },
  );
});
