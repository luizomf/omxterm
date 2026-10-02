import { buildFixture } from "../fixtures/restty-cursor-rendering-build";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";

it.each([1, 2])(
  "keeps native WebGL cursor pixels inside the first cell at DPR %i through zoom, controlled content refit and reload",
  async (dpr) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-cursor-"));
    await buildFixture(root);
    let supervised = false;
    try {
      const executable = createRequire(import.meta.url)("electron") as string;
      supervised = true;
      const result = await runNativeFixture({
        executable,
        args: [
          `--force-device-scale-factor=${dpr}`,
          ...(process.platform === "linux"
            ? ["--no-sandbox", "--ozone-platform=x11"]
            : []),
          root,
        ],
        root,
        timeout: 90_000,
      });
      expect(result, result.stderr).toMatchObject({
        exitCode: 0,
        reason: "exit",
        cleanupErrors: [],
      });
      const prefix = "__OMXTERM_CURSOR_RESULT__";
      const line = result.stdout
        .split("\n")
        .find((entry) => entry.startsWith(prefix));
      expect(line).toBeDefined();
      const observation = JSON.parse(line!.slice(prefix.length)) as {
        captures: { dpr: number }[];
      };
      expect(observation.captures).toHaveLength(64);
      expect(observation.captures.every((capture) => capture.dpr === dpr)).toBe(
        true,
      );
    } catch (error) {
      if (!supervised) await removeFailedFixture(root, error);
      throw error;
    }
  },
  120_000,
);
