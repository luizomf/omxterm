import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_LOCAL_IMAGE_RESULT__";
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

describe("local image boundary through native Electron", () => {
  it("decodes validated extensionless bytes with isolated Electron state", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-local-image-"));
    try {
      await build({
        entryPoints: [
          path.join(projectRoot, "test", "fixtures", "local-image-main.ts"),
        ],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(root, "main.cjs"),
        external: ["electron"],
      });
      await build({
        entryPoints: [
          path.join(projectRoot, "test/fixtures/local-image-renderer.ts"),
        ],
        bundle: true,
        platform: "browser",
        format: "iife",
        outfile: path.join(root, "preview.js"),
      });
      const productionHtml = await readFile(
        path.join(projectRoot, "src/renderer/index.html"),
        "utf8",
      );
      const policy = productionHtml.match(/content="(?<policy>[^"]+)"/u)?.groups
        ?.policy;
      if (!policy) throw new Error("Production renderer CSP is missing");
      await Promise.all([
        writeFile(
          path.join(root, "preview.html"),
          `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./preview.css"></head><body><textarea aria-label="Terminal input"></textarea><script src="./preview.js"></script></body></html>`,
        ),
        copyFile(
          path.join(projectRoot, "src/renderer/terminal-window.css"),
          path.join(root, "preview.css"),
        ),
        writeFile(
          path.join(root, "package.json"),
          `${JSON.stringify({ name: "omxterm-local-image-fixture", main: "main.cjs" })}\n`,
        ),
        writeFile(path.join(root, "fixture%23#literal.data"), PNG_1X1),
      ]);
      const execution = await runFixture(root);
      const line = execution.stdout
        .split("\n")
        .find((candidate) => candidate.startsWith(resultPrefix));
      const result = line
        ? (JSON.parse(line.slice(resultPrefix.length)) as unknown)
        : undefined;
      expect(
        execution.exitCode,
        `Local image fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result).toEqual({
        preview: [0, 1].map(() => ({
          opened: {
            open: true,
            decoded: true,
            hasSource: true,
            terminalFocused: false,
          },
          dismissed: {
            open: false,
            decoded: false,
            hasSource: false,
            terminalFocused: true,
          },
        })),
        isolatedProfiles: true,
        mime: "image/png",
        width: 1,
        height: 1,
        bytes: PNG_1X1.byteLength,
        jpegMime: "image/jpeg",
        jpegWidth: 1,
        jpegHeight: 1,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});

async function runFixture(root: string): Promise<{
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const chromiumArguments: string[] = [];
  applyChromiumSandboxPolicy({
    appendSwitch(name) {
      chromiumArguments.push(`--${name}`);
    },
  });
  const child = spawn(electronExecutable, [...chromiumArguments, root], {
    cwd: root,
    detached: process.platform !== "win32",
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.on("data", (chunk: string) => (stderr += chunk));
  const timeout = setTimeout(() => {
    try {
      if (process.platform !== "win32" && child.pid)
        process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH")
        child.emit("error", error);
    }
  }, 15_000);
  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    return { exitCode, stderr, stdout };
  } finally {
    clearTimeout(timeout);
  }
}
