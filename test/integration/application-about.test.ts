import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import electron from "electron";
import { expect, it } from "vitest";

it.each(["development", "packaged"])(
  "configures Linux About before the native menu (%s), preserving other platforms",
  async (mode) => {
    await mkdir(".scratch", { recursive: true });
    const root = await mkdtemp(path.resolve(".scratch/about-startup-"));
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
      const environment = { ...process.env };
      delete environment.ELECTRON_RUN_AS_NODE;
      await promisify(execFile)(
        electron as unknown as string,
        [
          ...(process.platform === "linux" ? ["--no-sandbox"] : []),
          fixture,
          entry,
          resultPath,
          mode === "packaged" ? resourcesPath : "development",
        ],
        {
          env: {
            ...environment,
            XDG_CONFIG_HOME: path.join(root, "config"),
            XDG_STATE_HOME: path.join(root, "state"),
          },
          timeout: 25_000,
        },
      );
      const result = JSON.parse(await readFile(resultPath, "utf8")) as {
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
      if (process.platform === "linux") {
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
      await rm(root, { recursive: true, force: true });
    }
  },
  35_000,
);
