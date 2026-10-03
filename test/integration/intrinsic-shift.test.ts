import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const executable = createRequire(import.meta.url)("electron") as string;

it("registers intrinsic-Shift native menus and consumes the shared fallback action exactly once", async (testContext) => {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-intrinsic-shift-"));
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
      timeout: 30_000,
      testContext,
      prepare: async () => {
        await build({
          absWorkingDir: projectRoot,
          bundle: true,
          entryPoints: ["test/fixtures/intrinsic-shift-main.ts"],
          external: ["electron"],
          format: "cjs",
          platform: "node",
          logLevel: "silent",
          outfile: path.join(root, "main.cjs"),
        });
        await writeFile(
          path.join(root, "package.json"),
          JSON.stringify({
            name: "omxterm-intrinsic-shift-fixture",
            main: "main.cjs",
          }),
        );
      },
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
    expect(execution.stdout).toContain("__OMXTERM_INTRINSIC_SHIFT__");
  } finally {
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}, 50_000);
