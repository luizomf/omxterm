import { buildFixture, PNG_1X1 } from "../fixtures/local-image-native-build";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { supportedFixtureChromiumArguments } from "../fixtures/supported-fixture-chromium-arguments";

const electronExecutable = createRequire(import.meta.url)("electron") as string;
const resultPrefix = "__OMXTERM_LOCAL_IMAGE_RESULT__";

describe("local image boundary through native Electron", () => {
  it.each([
    { label: "native display scale", scaleFactor: undefined },
    { label: "fractional display scale", scaleFactor: 2.5 },
  ])(
    "decodes validated bytes and keeps previews contained at $label",
    async ({ scaleFactor }) => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-local-image-"));
      await buildFixture(root);
      try {
        const execution = await runFixture(root, scaleFactor);
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
        const devicePixelRatio =
          typeof result === "object" &&
          result !== null &&
          "devicePixelRatio" in result
            ? result.devicePixelRatio
            : undefined;
        expect(devicePixelRatio).toBeTypeOf("number");
        if (scaleFactor !== undefined)
          expect(devicePixelRatio).toBe(scaleFactor);
        expect(result).toEqual({
          devicePixelRatio,
          references: {
            loaded: 9,
            directorySelections: 2,
            cancellation: true,
            actualWebpRejected: true,
            disguisedPngAccepted: true,
          },
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
          layouts: Array.from({ length: 20 }, () => ({
            contained: true,
            proportional: true,
            visible: true,
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
        // Windows can retain Chromium profile handles briefly after child exit.
        await rm(root, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    },
    20_000,
  );
});

async function runFixture(
  root: string,
  scaleFactor?: number,
): Promise<{
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
}> {
  const chromiumArguments = supportedFixtureChromiumArguments();
  if (scaleFactor !== undefined)
    chromiumArguments.push(`--force-device-scale-factor=${scaleFactor}`);
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
