import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";

it.each([1, 2])(
  "keeps native WebGL cursor pixels inside the first cell at DPR %i through zoom, controlled content refit and reload",
  async (dpr) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-cursor-"));
    await Promise.all([
      build({
        entryPoints: ["test/fixtures/restty-cursor-main.ts"],
        outfile: path.join(root, "main.cjs"),
        bundle: true,
        external: ["electron"],
        format: "cjs",
        platform: "node",
        logLevel: "silent",
      }),
      build({
        entryPoints: ["test/fixtures/restty-cursor-renderer.ts"],
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
        path.join(root, "preload.cjs"),
        `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('cursorFonts',{load:()=>ipcRenderer.invoke('fonts')});`,
      ),
      writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "omxterm-cursor-fixture", main: "main.cjs" }),
      ),
    ]);
    const result = await runNativeFixture({
      executable: createRequire(import.meta.url)("electron") as string,
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
  },
  120_000,
);
