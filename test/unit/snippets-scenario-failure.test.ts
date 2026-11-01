import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
it.each(["darwin", "win32"])(
  "preserves the scenario failure when %s diagnostics fail",
  async (platform) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "snippets-diagnostic-"));
    const primary = new Error("scenario failure");
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )!;
    const scenarioPath = require.resolve("../fixtures/snippets-scenario.cjs");
    try {
      Object.defineProperty(process, "platform", {
        value: platform,
        configurable: true,
      });
      delete require.cache[scenarioPath];
      const { runScenario } = require(scenarioPath) as {
        runScenario(options: object): Promise<unknown>;
      };
      await mkdir(path.join(root, "config", "omxterm"), { recursive: true });
      await mkdir(path.join(root, "evidence"));
      await copyFile(
        platform === "win32"
          ? "test/fixtures/snippets-windows-catalog.json"
          : "test/fixtures/snippets-catalog.json",
        path.join(root, "config", "omxterm", "snippets.yaml"),
      );
      const capturePage = vi.fn(async () => {
        throw new Error("capture unavailable");
      });
      const executeJavaScript = vi.fn(async () => {
        throw new Error("DOM unavailable");
      });
      const window = {
        focus() {
          throw primary;
        },
        webContents: { on() {}, capturePage, executeJavaScript },
      };
      await expect(
        runScenario({
          window,
          fixture: { root, evidence: path.join(root, "evidence") },
          ptys: [],
          children: [],
          approvalCount: () => 0,
          archiveSha256: "digest",
        }),
      ).rejects.toBe(primary);
      expect(capturePage).toHaveBeenCalledOnce();
      expect(executeJavaScript).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(process, "platform", originalPlatform);
      delete require.cache[scenarioPath];
      await rm(root, { recursive: true, force: true });
    }
  },
);
