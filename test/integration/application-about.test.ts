import { copyFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { build } from "esbuild";
import electron from "electron";
import { expect, it } from "vitest";

it.each([
  "development",
  "packaged",
  "missing-result",
  "published-failure",
  "published-hang",
])(
  "configures native About before the menu (%s), preserving macOS defaults",
  async (mode) => {
    await mkdir(".scratch", { recursive: true });
    const root = await mkdtemp(path.resolve(".scratch/about-startup-"));
    let supervised = false;
    try {
      const entry = path.join(root, "dist/main/index.mjs");
      const fixture = path.join(root, "fixture.mjs");
      const resultPath = path.join(root, "result.json");
      const resourcesPath = path.join(root, "resources");
      // Only the selected source exists, so packaged mode cannot accidentally
      // succeed by reading the development checkout's icon.
      const iconPath = path.join(
        root,
        mode === "packaged" ? "resources" : "assets",
        "application-icon.png",
      );
      await mkdir(path.dirname(iconPath), { recursive: true });
      await copyFile("assets/application-icon.png", iconPath);
      for (const [input, output] of [
        ["src/main/index.ts", entry],
        ["test/fixtures/application-about-main.ts", fixture],
      ] as const) {
        await build({
          entryPoints: [input],
          outfile: output,
          bundle: true,
          platform: "node",
          format: "esm",
          external: ["electron", "node-pty"],
        });
      }
      supervised = true;
      const execution = await runNativeFixture({
        executable: electron as unknown as string,
        args: [
          ...(process.platform === "linux" ? ["--no-sandbox"] : []),
          fixture,
          entry,
          resultPath,
          mode === "packaged" ? resourcesPath : "development",
          ...(!["development", "packaged"].includes(mode)
            ? [`--fixture-${mode}`]
            : []),
        ],
        root,
        completionFile: "result.json.completion",
        timeout:
          mode === "missing-result" || mode === "published-hang"
            ? 8_000
            : 25_000,
      });
      if (mode === "missing-result" || mode === "published-hang") {
        expect(execution).toMatchObject({
          reason: "timeout",
          cleanupErrors: [],
        });
        await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
        return;
      }
      if (mode === "published-failure") {
        expect(execution).toMatchObject({
          exitCode: 3,
          reason: "exit",
          cleanupErrors: [],
        });
        await expect(stat(root)).rejects.toMatchObject({ code: "ENOENT" });
        return;
      }
      expect(execution, JSON.stringify(execution)).toMatchObject({
        exitCode: 0,
        signal: null,
        reason: "exit",
        cleanupErrors: [],
      });
      const result = JSON.parse(execution.stdout) as {
        backend: string;
        relaunched: boolean;
        options: {
          applicationName: string;
          applicationVersion: string;
          copyright: string;
          iconPath: string;
        } | null;
        configuredWhileReady: boolean;
        version: string;
        nativeAboutRole: string;
        iconSize?: { width: number; height: number };
        iconEmpty?: boolean;
      };
      expect(result.nativeAboutRole).toBe("about");
      if (
        process.platform === "linux" &&
        process.env.ELECTRON_OZONE_PLATFORM_HINT !== undefined
      )
        expect(result.relaunched).toBe(false);
      if (
        process.platform === "linux" &&
        process.env.XDG_SESSION_TYPE === "wayland" &&
        process.env.ELECTRON_OZONE_PLATFORM_HINT === undefined
      )
        expect(result.relaunched).toBe(true);
      if (
        process.platform === "linux" &&
        process.env.ELECTRON_OZONE_PLATFORM_HINT === undefined
      )
        expect(result.backend).toBe("x11");
      if (process.platform === "linux" || process.platform === "win32") {
        expect(result.configuredWhileReady).toBe(true);
        expect(result.options).toEqual({
          applicationName: "OMXTerm",
          applicationVersion: result.version,
          copyright: "Copyright © 2026 Luiz Otávio Miranda",
          iconPath,
        });
        expect(result.iconEmpty).toBe(false);
        expect(result.iconSize?.width).toBeGreaterThan(0);
        expect(result.iconSize?.height).toBeGreaterThan(0);
      } else {
        expect(result.options).toBeNull();
      }
    } finally {
      if (!supervised) await rm(root, { recursive: true, force: true });
    }
  },
  35_000,
);
