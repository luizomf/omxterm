import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";

it.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "qualifies the production Snippets host layout, native action routing and retained Surfaces",
  { timeout: 150_000 },
  async (testContext) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-auxiliary-"));
    const execution = await runNativeFixture({
      executable: createRequire(import.meta.url)("electron") as string,
      args: [
        ...supportedFixtureChromiumArguments(),
        root,
        "--fixture-auxiliary-only",
      ],
      root,
      timeout: 130_000,
      testContext,
      prepare: () => buildFixture(root, "runner"),
    });
    expect(
      execution,
      `stdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
    ).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
    });
    const prefix = "__OMXTERM_WINDOW_CHROME_RESULT__";
    const lines = execution.stdout
      .split("\n")
      .filter((line) => line.startsWith(prefix));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!.slice(prefix.length))).toEqual({
      auxiliary: "layout-lifetime-input-overlays-verified",
      input: "synthetic-chromium-not-physical",
    });
  },
);
