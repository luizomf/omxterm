import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_RESTTY_HOST_RESULT__";

interface HostResult {
  readonly beforeDestroy: { readonly canvases: number; readonly tabs: number };
  readonly configuredFontFamily: string;
  readonly renderedFontFamily: string | null;
  readonly renderedPixels: {
    readonly blank: number;
    readonly configured: number;
    readonly cjk: number;
    readonly emojiAndSymbol: number;
  };
  readonly reloadState: {
    readonly fonts: readonly string[];
    readonly notice: string;
  };
  readonly clipboardReads: number;
  readonly clipboardWrites: number;
  readonly protectedPasteConfirmations: number;
  readonly contextMenus: number;
  readonly largePasteLength: number;
  readonly externalLinks: number;
  readonly titles: number;
  readonly bells: number;
  readonly navigations: number;
  readonly openedWindows: number;
  readonly permissionRequests: number;
  readonly ptyExits: number;
  readonly launchKinds: readonly string[];
  readonly output: readonly string[];
  readonly resizeCounts: readonly number[];
  readonly ended: ReadonlyArray<{
    readonly closeRequested: boolean;
    readonly liveSessions: number;
  }>;
  readonly sessionStarts: number;
}

describe.skipIf(process.platform !== "darwin")(
  "Restty through the OMXTerm host and a real macOS PTY",
  () => {
    it("preserves session lifecycle, isolation, focus, resize, and disabled routes", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-restty-host-"));
      try {
        await buildHostFixture(root);
        const execution = await runFixture(root);
        const resultLine = execution.stdout
          .split("\n")
          .find((line) => line.startsWith(resultPrefix));
        const result = resultLine
          ? (JSON.parse(resultLine.slice(resultPrefix.length)) as HostResult)
          : undefined;
        const evidencePath = process.env["OMXTERM_RESTTY_HOST_EVIDENCE_PATH"];
        if (evidencePath && result)
          await writeFile(evidencePath, `${JSON.stringify(result, null, 2)}\n`);

        expect(
          execution.exitCode,
          `Host fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
        ).toBe(0);
        if (!result) throw new Error("Host fixture returned no result");
        expect(result.sessionStarts).toBe(3);
        expect(result.renderedFontFamily).toBe(result.configuredFontFamily);
        expect(result.renderedPixels.configured).toBeGreaterThan(
          result.renderedPixels.blank,
        );
        expect(result.renderedPixels.cjk).toBeGreaterThan(
          result.renderedPixels.configured,
        );
        expect(result.renderedPixels.emojiAndSymbol).toBeGreaterThan(
          result.renderedPixels.cjk,
        );
        expect(result.reloadState.fonts).toEqual([
          "Helvetica",
          "Times New Roman",
        ]);
        expect(result.reloadState.notice).toContain(
          "font.family and font.lineHeight",
        );
        expect(result.reloadState.notice).toContain("Restart OMXTerm");
        expect(result.launchKinds).toEqual([
          "default-shell",
          "explicit-command",
          "default-shell",
        ]);
        expect(result.resizeCounts).toHaveLength(3);
        expect(result.resizeCounts.every((count) => count > 0)).toBe(true);
        expect(result.output[0]).toContain("__DEFAULT_INPUT__Olá🙂");
        expect(result.output[0]).toContain("__LARGE_PASTE__80000");
        expect(result.output[1]).toContain("__EXPLICIT_READY__Olá🙂");
        expect(result.output[1]).toContain("__EXPLICIT_INPUT__second🙂");
        expect(result.beforeDestroy).toEqual({ canvases: 1, tabs: 1 });
        expect(result.ended).toEqual([
          { closeRequested: true, liveSessions: 1 },
          { closeRequested: false, liveSessions: 0 },
        ]);
        expect(result).toMatchObject({
          clipboardReads: 1,
          clipboardWrites: 2,
          protectedPasteConfirmations: 1,
          contextMenus: 1,
          largePasteLength: 80_000,
          externalLinks: 0,
          titles: 0,
          bells: 0,
          navigations: 0,
          openedWindows: 0,
          permissionRequests: 0,
          ptyExits: 3,
        });
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }, 120_000);
  },
);

async function buildHostFixture(root: string): Promise<void> {
  await mkdir(path.join(root, "renderer", "fonts"), { recursive: true });
  await Promise.all([
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/restty-host-main.ts"],
      external: ["electron", "node-pty"],
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(root, "main.cjs"),
      platform: "node",
    }),
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["src/preload/index.ts"],
      external: ["electron"],
      format: "cjs",
      logLevel: "silent",
      outfile: path.join(root, "preload.cjs"),
      platform: "node",
    }),
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["src/renderer/index.ts"],
      external: ["./fonts/JetBrainsMonoNerdFontMono-Regular.woff2"],
      format: "iife",
      loader: { ".ttf": "binary" },
      logLevel: "silent",
      outfile: path.join(root, "renderer", "index.js"),
      platform: "browser",
    }),
    cp(
      path.join(projectRoot, "src", "renderer", "index.html"),
      path.join(root, "renderer", "index.html"),
    ),
    cp(
      path.join(
        projectRoot,
        "assets",
        "fonts",
        "JetBrainsMonoNerdFontMono-Regular.woff2",
      ),
      path.join(
        root,
        "renderer",
        "fonts",
        "JetBrainsMonoNerdFontMono-Regular.woff2",
      ),
    ),
    writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({ name: "omxterm-restty-host-fixture", main: "main.cjs" })}\n`,
    ),
    symlink(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    ),
  ]);
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
    detached: true,
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
    if (child.pid) process.kill(-child.pid, "SIGKILL");
  }, 110_000);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  return { exitCode, stderr, stdout };
}
