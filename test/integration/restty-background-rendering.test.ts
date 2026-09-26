import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

it("composes one live tint beneath real WebGL text, explicit backgrounds, inverse, cursor, selection and images", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-background-"));
  await Promise.all([
    build({
      entryPoints: ["test/fixtures/restty-background-main.ts"],
      outfile: path.join(root, "main.cjs"),
      bundle: true,
      external: ["electron"],
      format: "cjs",
      platform: "node",
      logLevel: "silent",
    }),
    build({
      entryPoints: ["test/fixtures/restty-background-renderer.ts"],
      outfile: path.join(root, "index.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      loader: { ".ttf": "binary" },
      logLevel: "silent",
    }),
    readFile("src/renderer/index.html", "utf8").then((html) =>
      writeFile(path.join(root, "index.html"), html),
    ),
    writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "omxterm-background-fixture", main: "main.cjs" }),
    ),
  ]);
  const args: string[] = [];
  applyChromiumSandboxPolicy({
    appendSwitch: (name) => {
      args.push(`--${name}`);
    },
  });
  if (process.platform === "linux") args.push("--ozone-platform=x11");
  const result = await runNativeFixture({
    executable: createRequire(import.meta.url)("electron") as string,
    args: [...args, root],
    root,
    timeout: 60_000,
  });
  expect(result, result.stderr).toMatchObject({
    exitCode: 0,
    reason: "exit",
    cleanupErrors: [],
  });
  expect(result.stdout).toContain('"explicitBackgrounds":true');
  expect(result.stdout).toContain('"opaqueForeground":true');
  expect(result.stdout).toContain('"pageAlpha":128');
  expect(result.stdout).toContain('"pageAlpha":0');
}, 90_000);
