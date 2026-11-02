import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { launchLinuxPackagedProcess } from "../../scripts/linux-packaged-process.mjs";
import { until } from "../fixtures/packaged-inspector.js";

it.skipIf(process.platform !== "linux").each([
  ["stderr-limit", false],
  ["stderr-overflow", true],
] as const)(
  "reports bounded stderr completeness after actual process settlement (%s)",
  async (mode, truncated) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "linux-stderr-owner-"));
    let owner:
      Awaited<ReturnType<typeof launchLinuxPackagedProcess>> | undefined;
    try {
      owner = await launchLinuxPackagedProcess({
        executable: process.execPath,
        args: [
          path.resolve("test/fixtures/linux-packaged-process.mjs"),
          "main",
        ],
        env: {
          ...process.env,
          OMXTERM_FIXTURE_ROOT: root,
          OMXTERM_FIXTURE_MODE: mode,
        },
        expectedExecutable: process.execPath,
        readinessFile: path.join(root, "ready"),
        profileRoot: root,
      });
      await until(() => existsSync(path.join(root, "ready")), "fixture ready");
      await owner.verifyMain();
      await expect(owner.stop()).resolves.toEqual({ code: 0, signal: null });
      expect(owner.stderrText()).toBe("x".repeat(16384));
      expect(owner.stderrTruncated()).toBe(truncated);
      owner = undefined;
    } finally {
      await owner?.stop();
      await rm(root, { recursive: true, force: true });
    }
  },
);
