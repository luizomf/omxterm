import {
  buildFixture,
  resultPrefix,
} from "../fixtures/restty-ligatures-rendering-build";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";

const electronExecutable = createRequire(import.meta.url)("electron") as string;

interface StageResult {
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly copiedText: string;
  readonly cursorReports: readonly string[];
  readonly starts: number;
  readonly closes: number;
  readonly sameCanvas: boolean;
  readonly fontAcquisitions: number;
}

interface Result {
  readonly defaultEnabled: StageResult;
  readonly liveDisabled: StageResult;
  readonly liveReenabled: StageResult;
  readonly newSurfaceDisabled: StageResult;
  readonly enabledDiffersFromDisabled: boolean;
  readonly reenabledMatchesDefault: boolean;
  readonly newDisabledMatchesLiveDisabled: boolean;
  readonly disabledRegularMatchesIndividualGlyphs: boolean;
  readonly disabledBoldMatchesIndividualGlyphs: boolean;
  readonly unicodePixelsPreserved: boolean;
  readonly glyphCoverage: readonly boolean[];
  readonly cellSpansPreserved: boolean;
  readonly security: {
    readonly contextIsolation: boolean;
    readonly nodeIntegration: boolean;
    readonly sandbox: boolean;
    readonly webSecurity: boolean;
  };
}

describe("Restty programming ligatures under production Electron policy", () => {
  it("renders bundled regular and bold operators as source glyphs when disabled, including live changes", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-restty-ligatures-"),
    );
    await buildFixture(root);
    try {
      const execution = await runFixture(root);
      const line = execution.stdout
        .split("\n")
        .find((entry) => entry.startsWith(resultPrefix));
      const result = line
        ? (JSON.parse(line.slice(resultPrefix.length)) as Result)
        : undefined;

      expect(
        execution.exitCode,
        `Ligature fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
      ).toBe(0);
      expect(result).toBeDefined();
      expect(result!.enabledDiffersFromDisabled).toBe(true);
      expect(result!.disabledRegularMatchesIndividualGlyphs).toBe(true);
      expect(result!.disabledBoldMatchesIndividualGlyphs).toBe(true);
      expect(result!.reenabledMatchesDefault).toBe(true);
      expect(result!.newDisabledMatchesLiveDisabled).toBe(true);

      expect(result!.defaultEnabled).toMatchObject({ starts: 1, closes: 0 });
      expect(result!.liveDisabled).toMatchObject({ starts: 1, closes: 0 });
      expect(result!.liveReenabled).toMatchObject({ starts: 1, closes: 0 });
      expect(result!.newSurfaceDisabled).toMatchObject({
        starts: 2,
        closes: 1,
      });
      expect(result!.defaultEnabled.sameCanvas).toBe(true);
      expect(result!.liveDisabled.sameCanvas).toBe(true);
      expect(result!.liveReenabled.sameCanvas).toBe(true);
      expect(result!.newSurfaceDisabled.sameCanvas).toBe(false);
      expect(result!.unicodePixelsPreserved).toBe(true);
      expect(result!.glyphCoverage).toEqual([true, true, true, true, true]);
      expect(result!.cellSpansPreserved).toBe(true);

      for (const stage of [
        result!.defaultEnabled,
        result!.liveDisabled,
        result!.liveReenabled,
        result!.newSurfaceDisabled,
      ]) {
        expect(stage.cellWidth).toBeGreaterThan(0);
        expect(stage.cellHeight).toBeGreaterThan(0);
        expect(stage.cursorReports.join("")).toBe("\u001b[15;15R");
        expect(stage.copiedText).toContain("source => text");
        for (const text of ["界|", "é|", "🙂|", "👩‍💻|"])
          expect(stage.copiedText).toContain(text);
        expect(stage.copiedText).toBe(result!.defaultEnabled.copiedText);
        expect(stage.fontAcquisitions).toBe(stage.starts);
      }
      expect(result!.liveDisabled.cellWidth).toBe(
        result!.defaultEnabled.cellWidth,
      );
      expect(result!.liveDisabled.cellHeight).toBe(
        result!.defaultEnabled.cellHeight,
      );
      expect(result!.security).toEqual({
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      });
    } finally {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  }, 120_000);
});

async function runFixture(root: string): Promise<{
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const chromiumArguments =
    process.platform === "linux" ? ["--ozone-platform=x11"] : [];
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
  }, 110_000);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearTimeout(timeout);
  return { exitCode, stderr, stdout };
}
