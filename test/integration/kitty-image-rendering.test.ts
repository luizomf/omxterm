import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureEntry = path.join(
  projectRoot,
  "test",
  "fixtures",
  "kitty-image-renderer.ts",
);
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_KITTY_RESULT__";

interface FixtureResult {
  readonly ok: boolean;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly cellSizeResponse?: string;
  readonly largeFixture?: {
    readonly decodedBytes: number;
    readonly encodedCharacters: number;
  };
  readonly memory?: {
    readonly method: string;
    readonly beforeLargeFixture: number;
    readonly afterLargeFixture: number;
  };
  readonly rendererProcessMemory?: {
    readonly architecture: string;
    readonly electronVersion: string;
    readonly method: string;
    readonly peakWorkingSetKilobytes: number;
    readonly platform: string;
  };
  readonly error?: string;
}

describe("Kitty images in production Chromium", () => {
  it("renders and releases Pi-shaped images under the production CSP without blocking output", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "omxterm-kitty-electron-"),
    );
    try {
      await buildFixture(fixtureRoot);
      const execution = await runElectronFixture(fixtureRoot);
      const resultLine = execution.stdout
        .split("\n")
        .find((line) => line.startsWith(resultPrefix));
      const result = resultLine
        ? (JSON.parse(resultLine.slice(resultPrefix.length)) as FixtureResult)
        : undefined;
      if (process.env["OMXTERM_REPORT_KITTY_MEMORY"] === "1")
        process.stdout.write(
          `Kitty Electron characterization: ${JSON.stringify({ jsHeap: result?.memory, rendererProcess: result?.rendererProcessMemory })}\n`,
        );

      expect(
        execution.exitCode,
        `Electron fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result?.error).toBeUndefined();
      expect(result?.ok).toBe(true);
      expect(Object.values(result?.checks ?? {})).not.toContain(false);
      expect(result?.cellSizeResponse).toMatch(/^\u001b\[6;\d+;\d+t$/u);
      expect(result?.largeFixture).toEqual({
        decodedBytes: 16_003_288,
        encodedCharacters: 21_337_720,
      });
      expect(result?.memory?.method).toBe(
        "Chromium performance.memory.usedJSHeapSize",
      );
      expect(result?.memory?.beforeLargeFixture).toBeGreaterThanOrEqual(-1);
      expect(result?.memory?.afterLargeFixture).toBeGreaterThanOrEqual(-1);
      expect(result?.rendererProcessMemory).toMatchObject({
        architecture: process.arch,
        electronVersion: "43.1.1",
        method: "Electron app.getAppMetrics renderer workingSetSize",
        platform: process.platform,
      });
      expect(
        result?.rendererProcessMemory?.peakWorkingSetKilobytes,
      ).toBeGreaterThan(0);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }, 180_000);
});

async function buildFixture(fixtureRoot: string): Promise<void> {
  const rendererOutput = path.join(fixtureRoot, "renderer.js");
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: [fixtureEntry],
    format: "iife",
    logLevel: "silent",
    outfile: rendererOutput,
    platform: "browser",
  });

  const productionHtml = await readFile(
    path.join(projectRoot, "src", "renderer", "index.html"),
    "utf8",
  );
  const policy = productionHtml.match(/content="(?<policy>[^"]+)"/u)?.groups
    ?.policy;
  if (!policy) throw new Error("Production renderer CSP is missing");

  await Promise.all([
    writeFile(
      path.join(fixtureRoot, "index.html"),
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />
    <style>
      @font-face {
        font-family: "JetBrainsMono Nerd Font Mono";
        src: url("./JetBrainsMonoNerdFontMono-Regular.woff2") format("woff2");
        font-weight: 400;
        font-style: normal;
      }
    </style>
    <link rel="stylesheet" href="./renderer.css" />
  </head>
  <body>
    <main id="terminal"></main>
    <script src="./renderer.js"></script>
  </body>
</html>
`,
    ),
    writeFile(
      path.join(fixtureRoot, "package.json"),
      `${JSON.stringify({ name: "omxterm-kitty-fixture", main: "main.cjs" })}\n`,
    ),
    writeFile(path.join(fixtureRoot, "main.cjs"), electronMainSource()),
    copyFile(
      path.join(
        projectRoot,
        "assets",
        "fonts",
        "JetBrainsMonoNerdFontMono-Regular.woff2",
      ),
      path.join(fixtureRoot, "JetBrainsMonoNerdFontMono-Regular.woff2"),
    ),
    mkdir(path.join(fixtureRoot, "home"), { recursive: true }),
  ]);
}

function electronMainSource(): string {
  return `
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

app.commandLine.appendSwitch("enable-precise-memory-info");
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1_000,
    height: 700,
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  await window.loadFile(path.join(__dirname, "index.html"));
  const deadline = Date.now() + 165_000;
  const rendererPid = window.webContents.getOSProcessId();
  let peakWorkingSetKilobytes = 0;
  let result;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(
      "({ result: globalThis.__omxtermKittyResult ?? null, stage: globalThis.__omxtermKittyMemoryStage ?? null })",
      true,
    );
    if (state.stage === "large-fixture") {
      const metric = app.getAppMetrics().find((entry) => entry.pid === rendererPid);
      peakWorkingSetKilobytes = Math.max(
        peakWorkingSetKilobytes,
        metric ? metric.memory.workingSetSize : 0,
      );
    }
    result = state.result;
    if (result) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!result) result = { ok: false, error: "Electron fixture timed out" };
  result.rendererProcessMemory = {
    architecture: process.arch,
    electronVersion: process.versions.electron,
    method: "Electron app.getAppMetrics renderer workingSetSize",
    peakWorkingSetKilobytes,
    platform: process.platform,
  };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(result) + "\\n");
  app.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  app.exit(1);
});
`;
}

async function runElectronFixture(fixtureRoot: string): Promise<{
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const child = spawn(electronExecutable, [fixtureRoot], {
    cwd: fixtureRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      HOME: path.join(fixtureRoot, "home"),
      XDG_CONFIG_HOME: path.join(fixtureRoot, "config"),
      XDG_STATE_HOME: path.join(fixtureRoot, "state"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout = (stdout + chunk).slice(-1_000_000);
  });
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-1_000_000);
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    if (process.platform !== "win32" && child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
  }, 175_000);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  if (timedOut) stderr += "\nElectron fixture exceeded its timeout.";
  return { exitCode, stderr, stdout };
}
