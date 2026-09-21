import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { loadTerminalFontData } from "../../src/main/terminal-font-data";
import { isTerminalFontData } from "../../src/shared/terminal-font-data";
import { terminalFontInputs } from "../../src/terminal-surface/terminal-font-stack";
import {
  installedFallbackFontData,
  installedFontData,
  installedFontFamilyMetrics,
} from "../../src/main/installed-font-family";

describe("native installed font-family availability", () => {
  it
    .runIf(process.platform === "win32")
    .for(["FiraCode Nerd Font Mono", "Cascadia Code"])(
    "applies an installed Windows %s family without configuration fallback",
    { timeout: 30_000 },
    async (family, context) => {
      // These optional native regression fixtures are not installed by the test.
      // GDI enumeration establishes availability independently of face resolution.
      const { stdout } = await promisify(execFile)(
        path.join(
          process.env["SystemRoot"] ?? "C:\\Windows",
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe",
        ),
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "Add-Type -AssemblyName System.Drawing; ConvertTo-Json -InputObject @((New-Object System.Drawing.Text.InstalledFontCollection).Families.Name) -Compress",
        ],
        { timeout: 10_000 },
      );
      const families = JSON.parse(stdout) as string[];
      if (!families.includes(family))
        context.skip(`Optional native font fixture ${family} is not installed`);
      const loaded = await loadUserConfiguration({
        environment: {},
        homeDirectory: process.cwd(),
        platform: process.platform,
        read: async () =>
          Buffer.from(
            JSON.stringify({ version: 1, font: { family, size: 20 } }),
          ) as never,
        getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
      });
      expect(loaded.fallback).toBeUndefined();
      expect(loaded.configuration.fontFamily).toBe(family);
      expect(loaded.configuration.fontSize).toBe(20);
    },
  );

  it("delivers native regular, bold, italic and bold-italic faces through the bounded font contract", async () => {
    const family =
      process.platform === "darwin"
        ? "Menlo"
        : process.platform === "win32"
          ? "Consolas"
          : "DejaVu Sans Mono";
    const data = await loadTerminalFontData(family);
    expect(data.configuredStyles?.bold).toBeDefined();
    expect(data.configuredStyles?.italic).toBeDefined();
    expect(data.configuredStyles?.boldItalic).toBeDefined();
    expect(isTerminalFontData(data)).toBe(true);
    const fonts = terminalFontInputs(data);
    expect(fonts.slice(0, 4).map((font) => [font.weight, font.style])).toEqual([
      [400, "normal"],
      [700, "normal"],
      [400, "italic"],
      [700, "italic"],
    ]);
    if (process.platform === "darwin") {
      expect(new Set(fonts.slice(0, 4).map((font) => font.data)).size).toBe(1);
      expect(
        new Set(fonts.slice(0, 4).map((font) => font.faceIndex)).size,
      ).toBe(4);
    }
  }, 30_000);
  it("accepts an exact built-in family and rejects a nonexistent family", async () => {
    const installedFamily =
      process.platform === "darwin"
        ? "Helvetica"
        : process.platform === "win32"
          ? "Consolas"
          : "DejaVu Sans";
    const metrics = await installedFontFamilyMetrics(installedFamily, 16);
    expect(metrics?.cellWidth).toBeGreaterThan(0);
    expect(metrics?.cellHeight).toBeGreaterThan(0);
    const bytes = await installedFontData(installedFamily);
    expect(bytes?.byteLength).toBeGreaterThan(12);
    const fallbacks = await installedFallbackFontData();
    expect(fallbacks.length).toBeGreaterThan(0);
    expect(fallbacks.every((face) => face.data.byteLength > 12)).toBe(true);
    await expect(
      installedFontFamilyMetrics("OMXTerm Definitely Missing Font 37", 16),
    ).resolves.toBeUndefined();
  }, 30_000);
});
