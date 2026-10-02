import { buildFixture } from "../fixtures/pending-tab-ownership-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_PENDING_TAB_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Pending tab ownership through real Electron, Restty and native PTYs",
  () => {
    it("keeps B's held initialization alive through ordinary A exit and starts exactly one usable PTY", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-pending-tab-"));
      await buildFixture(root);
      let supervised = false;
      try {
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
          args: [...args, root],
          root,
          timeout: 90_000,
        });
        expect(
          execution,
          `Pending tab fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
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
          survivedOrdinaryExit: true,
          exactlyOnePty: true,
          usable: true,
          lastTabClosed: true,
        });
      } finally {
        if (!supervised) await rm(root, { recursive: true, force: true });
      }
    }, 110_000);
  },
);
