import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_DEVELOPER_TOOLS_RESULT__";

interface DeveloperToolsResult {
  readonly firstWindowOpened: boolean;
  readonly selectedWindowOpened: boolean;
  readonly selectedWindowClosed: boolean;
}

describe("Developer Tools through native Electron", () => {
  it("toggles only the selected Terminal Window through the application action", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-devtools-"));
    try {
      await build({
        entryPoints: [
          path.join(projectRoot, "test", "fixtures", "developer-tools-main.ts"),
        ],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(root, "main.cjs"),
        external: ["electron"],
      });
      await writeFile(
        path.join(root, "package.json"),
        `${JSON.stringify({ name: "omxterm-devtools-fixture", main: "main.cjs" })}\n`,
      );
      const execution = await runFixture(root);
      const resultLine = execution.stdout
        .split("\n")
        .find((line) => line.startsWith(resultPrefix));
      const result = resultLine
        ? (JSON.parse(
            resultLine.slice(resultPrefix.length),
          ) as DeveloperToolsResult)
        : undefined;

      expect(
        execution.exitCode,
        `Developer Tools fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result).toEqual({
        firstWindowOpened: false,
        selectedWindowOpened: true,
        selectedWindowClosed: true,
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
    if (process.platform !== "win32" && child.pid)
      process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  }, 15_000);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  return { exitCode, stderr, stdout };
}
