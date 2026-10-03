import { buildFixture } from "../fixtures/restty-background-rendering-build";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { removeFailedFixture } from "../fixtures/remove-failed-fixture";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

it("composes one live tint beneath real WebGL text, explicit backgrounds, inverse, cursor, selection and images", async (testContext) => {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-background-"));
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
    const executable = createRequire(import.meta.url)("electron") as string;
    supervised = true;
    const result = await runNativeFixture({
      executable,
      args: [...args, root],
      root,
      timeout: 60_000,
      testContext,
      prepare: () => buildFixture(root, "runner"),
    });
    expect(result, result.stderr).toMatchObject({
      exitCode: 0,
      reason: "exit",
      cleanupErrors: [],
    });
    expect(result.stdout).toContain('"explicitBackgrounds":true');
    expect(result.stdout).toContain('"opaqueForeground":true');
    const prefix = "__OMXTERM_BACKGROUND_RESULT__";
    const line = result.stdout
      .split("\n")
      .find((entry) => entry.startsWith(prefix));
    expect(line).toBeDefined();
    const { phases } = JSON.parse(line!.slice(prefix.length)) as {
      phases: Array<{ transparency: number; pageAlpha: number }>;
    };
    expect(phases.map((phase) => phase.transparency)).toEqual([0, 0.5, 1]);
    // Native premultiplication rounds half alpha to 127 on Windows and 128 on
    // macOS/Linux. Keep the same one-byte tolerance as the actual pixel fixture.
    for (const phase of phases)
      expect(
        Math.abs(
          phase.pageAlpha -
            (process.platform === "win32"
              ? 255
              : (1 - phase.transparency) * 255),
        ),
      ).toBeLessThanOrEqual(1);
  } catch (error) {
    if (!supervised) await removeFailedFixture(root, error);
    throw error;
  }
}, 90_000);
