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

// Real OS input is disruptive: opt in only on an owned disposable desktop with
// an active US International layout. Linux additionally needs sudo -n access to
// /dev/uinput. Ordinary portable checks do not synthesize desktop keyboard input.
it.skipIf(
  process.env.OMXTERM_TEST_ALTGR_NATIVE !== "1" ||
    process.platform === "darwin",
)(
  "distinguishes AltGr at the actual layout/menu/input boundary and preserves text and Alt-alone menu",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-altgr-"));
    let supervised = false;
    try {
      await build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: ["test/fixtures/altgr-native-main.ts"],
        external: ["electron"],
        format: "cjs",
        platform: "node",
        logLevel: "silent",
        outfile: path.join(root, "main.cjs"),
      });
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "omxterm-altgr-fixture", main: "main.cjs" }),
      );
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
        timeout: 60_000,
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
      expect(execution.stdout).toContain("__OMXTERM_ALTGR__");
    } finally {
      if (!supervised) await rm(root, { recursive: true, force: true });
    }
  },
  90_000,
);
