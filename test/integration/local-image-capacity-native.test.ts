import { createRequire } from "node:module";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { capacityPng } from "../fixtures/local-image-capacity-png";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electron = createRequire(import.meta.url)("electron") as string;
// Expensive native capacity/resource qualification is explicit, not run in every
// ordinary suite. It uses the same real loader/preload/overlay on each platform.
describe.skipIf(process.env.OMXTERM_TEST_IMAGE_CAPACITY !== "1")(
  "native local-image capacity",
  () => {
    it("displays bounded large PNG/JPEG and records settled preview cycles", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-capacity-"));
      await mkdir(".scratch", { recursive: true });
      for (const [entry, output, platform] of [
        ["test/fixtures/local-image-capacity-main.ts", "main.cjs", "node"],
        ["src/preload/index.ts", "preload.cjs", "node"],
        [
          "test/fixtures/local-image-capacity-renderer.ts",
          "preview.js",
          "browser",
        ],
      ] as const)
        await build({
          entryPoints: [path.join(projectRoot, entry)],
          outfile: path.join(root, output),
          platform,
          format: platform === "node" ? "cjs" : "iife",
          bundle: true,
          external: platform === "node" ? ["electron"] : [],
        });
      const html = await readFile(
        path.join(projectRoot, "src/renderer/index.html"),
        "utf8",
      );
      const policy = html.match(/content="(?<policy>[^"]+)"/u)?.groups?.policy;
      if (!policy) throw new Error("Production CSP missing");
      await writeFile(
        path.join(root, "preview.html"),
        `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="preview.css"></head><body><textarea aria-label="Terminal input"></textarea><script src="preview.js"></script></body></html>`,
      );
      await copyFile(
        path.join(projectRoot, "src/renderer/terminal-window.css"),
        path.join(root, "preview.css"),
      );
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "omxterm-capacity-fixture", main: "main.cjs" }),
      );
      for (const [name, width, height, noise, bytes, animated] of [
        ["sample-a.png", 7680, 3215, 0.03, 2_804_358, false],
        ["sample-b.png", 7036, 3960, 0.74, 64_398_930, false],
        ["pixel-ceiling.png", 8000, 4000, 0, undefined, false],
        ["byte-ceiling.png", 7036, 3960, 0.74, 64 * 1024 * 1024, false],
        ["over-pixels.png", 8001, 4000, 0, undefined, false],
        ["over-side.png", 8193, 1, 0, undefined, false],
        ["animated.png", 1, 1, 0, undefined, true],
      ] as const)
        await writeFile(
          path.join(root, name),
          capacityPng(width, height, noise, bytes, animated),
        );
      await writeFile(
        path.join(root, "corrupt.png"),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      await writeFile(path.join(root, "unsupported.webp"), "unsupported");
      await writeFile(
        path.join(root, "over-bytes.png"),
        Buffer.alloc(64 * 1024 * 1024 + 1),
      );
      const args: string[] = [];
      applyChromiumSandboxPolicy({
        appendSwitch: (name) => {
          args.push(`--${name}`);
        },
      });
      if (process.platform === "linux") args.push("--ozone-platform=x11");
      args.push(root);
      const execution = await runNativeFixture({
        executable: electron,
        args,
        root,
        timeout: 120_000,
      });
      const line = execution.stdout
        .split("\n")
        .find((row) => row.startsWith("__OMXTERM_CAPACITY_RESULT__"));
      await mkdir(".scratch", { recursive: true });
      if (line)
        await writeFile(
          ".scratch/local-image-capacity.json",
          line.slice("__OMXTERM_CAPACITY_RESULT__".length),
        );
      expect(execution, execution.stderr).toMatchObject({
        exitCode: 0,
        reason: "exit",
        cleanupErrors: [],
      });
      expect(line).toBeDefined();
      const result = JSON.parse(
        line!.slice("__OMXTERM_CAPACITY_RESULT__".length),
      ) as {
        displayed: Array<{
          filename: string;
          state: Record<string, unknown>;
          latencyMs: number;
          greenPixels: number;
        }>;
        snapshots: Array<{ dismissed: Record<string, unknown> }>;
        cycles: Array<{
          opened: Record<string, unknown>;
          dismissed: Record<string, unknown>;
        }>;
        errors: Array<{ filename: string; state: Record<string, unknown> }>;
        sourceFilesUnchanged: boolean;
        disposed: unknown;
        peakWorkingSetKiB: number;
      };
      for (const [index, dimensions] of [
        [7680, 3215],
        [7036, 3960],
        [8000, 4000],
        [7036, 3960],
        [7680, 3215],
      ].entries()) {
        const observation = result.displayed[index]!;
        expect(observation.state).toMatchObject({
          open: true,
          visible: true,
          width: dimensions[0],
          height: dimensions[1],
          hasSource: true,
          activeUrls: 1,
          error: "",
        });
        expect(observation.greenPixels).toBeGreaterThan(1000);
        expect(observation.latencyMs).toBeGreaterThan(0);
      }
      for (const observation of [...result.snapshots, ...result.cycles])
        expect(observation.dismissed).toMatchObject({
          open: false,
          hasSource: false,
          activeUrls: 0,
          terminalFocused: true,
        });
      expect(result.cycles).toHaveLength(12);
      for (const cycle of result.cycles)
        expect(cycle.opened).toMatchObject({
          open: true,
          visible: true,
          activeUrls: 1,
        });
      for (const control of result.errors)
        expect(control.state).toMatchObject({
          open: true,
          visible: false,
          hasSource: false,
          activeUrls: 0,
          error:
            control.filename === "unsupported.webp"
              ? "Unsupported image format. Choose a static PNG or JPEG; WebP is not supported."
              : "Could not preview this image. The file may be unavailable, invalid or over the static PNG/JPEG limits (64 MiB, 8192 per side, 32 million pixels).",
        });
      expect(result.sourceFilesUnchanged).toBe(true);
      expect(result.disposed).toBeNull();
      expect(result.peakWorkingSetKiB).toBeGreaterThan(0);
    }, 180_000);
  },
);
