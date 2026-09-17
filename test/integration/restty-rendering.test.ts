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
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_RESTTY_RESULT__";

interface FixtureResult {
  readonly available: {
    readonly backend?: string;
    readonly font?: string;
    readonly ptyStarts: number;
    readonly clipboardReads?: number;
    readonly clipboardWrites?: number;
    readonly terminalReplies?: number;
    readonly resize?: { readonly cols: number; readonly rows: number };
  };
  readonly unavailable: {
    readonly error?: string;
    readonly fatal?: string;
    readonly ptyStarts: number;
  };
  readonly visibleForegroundPixels: number;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

describe("Restty under production Electron policy", () => {
  it("renders bundled-font text and refuses to start a PTY without a backend", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-restty-electron-"));
    try {
      await buildFixture(root);
      const execution = await runFixture(root);
      const line = execution.stdout
        .split("\n")
        .find((entry) => entry.startsWith(resultPrefix));
      const result = line
        ? (JSON.parse(line.slice(resultPrefix.length)) as FixtureResult)
        : undefined;
      const evidencePath = process.env["OMXTERM_RESTTY_EVIDENCE_PATH"];
      if (evidencePath && result)
        await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);

      expect(
        execution.exitCode,
        `Restty fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(
        result,
        `Restty fixture produced no result.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBeDefined();
      expect(result?.available).toMatchObject({
        backend: "webgl2",
        font: "JetBrainsMono Nerd Font Mono",
        ptyStarts: 1,
        clipboardReads: 0,
        clipboardWrites: 0,
        terminalReplies: 0,
      });
      expect(result?.available.resize?.cols).toBeGreaterThan(1);
      expect(result?.available.resize?.rows).toBeGreaterThan(0);
      expect(result?.visibleForegroundPixels).toBeGreaterThan(20);
      expect(result?.unavailable.error).toBe(
        "Failed to mount the Restty Terminal Surface",
      );
      expect(result?.unavailable.fatal).toContain("rendering backend");
      expect(result?.unavailable.ptyStarts).toBe(0);
      expect(result?.security).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 90_000);
});

async function buildFixture(root: string): Promise<void> {
  await build({
    absWorkingDir: projectRoot,
    bundle: true,
    entryPoints: ["test/fixtures/restty-renderer.ts"],
    format: "iife",
    loader: { ".ttf": "binary" },
    logLevel: "silent",
    outfile: path.join(root, "renderer.js"),
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
      path.join(root, "index.html"),
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./renderer.css"></head><body><main id="terminal"></main><script src="./renderer.js"></script></body></html>`,
    ),
    writeFile(
      path.join(root, "renderer.css"),
      "html,body,#terminal,.pane-split,.pane{width:100%;height:100%;margin:0;overflow:hidden;background:#000}.pane-split{display:flex}.pane{position:relative;flex:1}.pane-canvas{display:block;width:100%;height:100%}",
    ),
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "omxterm-restty-fixture", main: "main.cjs" })}\n`,
    ),
    writeFile(path.join(root, "main.cjs"), electronMainSource()),
    copyFile(path.join(projectRoot, "LICENSE"), path.join(root, "LICENSE")),
    mkdir(path.join(root, "home"), { recursive: true }),
  ]);
}

function electronMainSource(): string {
  return `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
for (const name of ["userData", "sessionData"]) {
  const directory = path.join(__dirname, name);
  fs.mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
async function waitForResult(window) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const result = await window.webContents.executeJavaScript("globalThis.__omxtermResttyResult ?? null", true);
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Restty renderer fixture timed out");
}
async function open(search = "") {
  const window = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false },
  });
  if (process.platform === "linux" || process.platform === "win32") window.showInactive();
  await window.loadFile(path.join(__dirname, "index.html"), { search });
  return window;
}
app.whenReady().then(async () => {
  const availableWindow = await open();
  const available = await waitForResult(availableWindow);
  const image = await availableWindow.webContents.capturePage();
  const bitmap = image.toBitmap();
  if (process.env.OMXTERM_RESTTY_SCREENSHOT_PATH)
    fs.writeFileSync(process.env.OMXTERM_RESTTY_SCREENSHOT_PATH, image.toPNG());
  let visibleForegroundPixels = 0;
  for (let offset = 0; offset < bitmap.length; offset += 4) {
    if (Math.max(bitmap[offset], bitmap[offset + 1], bitmap[offset + 2]) > 100) visibleForegroundPixels += 1;
  }
  const preferences = availableWindow.webContents.getLastWebPreferences();
  const unavailableWindow = await open("unavailable=1");
  const unavailable = await waitForResult(unavailableWindow);
  availableWindow.destroy();
  unavailableWindow.destroy();
  const result = {
    available,
    unavailable,
    visibleForegroundPixels,
    security: {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
      webSecurity: preferences.webSecurity,
    },
  };
  process.stdout.write(${JSON.stringify(resultPrefix)} + JSON.stringify(result) + "\\n");
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + "\\n");
  app.exit(1);
});
`;
}

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
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      HOME: path.join(root, "home"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    },
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
  }, 80_000);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  return { exitCode, stderr, stdout };
}
