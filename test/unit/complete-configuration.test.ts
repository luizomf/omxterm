import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  completeConfigurationDocument,
  completeConfigurationFile,
  fillConfiguration,
  missesSettings,
} from "../../src/main/complete-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { expectCompleteConfiguration } from "../fixtures/complete-configuration";

// Built with the host's separators, as main builds them.
const configPath = path.join("/home/me/.config/omxterm", "config.json");
const themePath = path.join(path.dirname(configPath), "themes", "omtheme.json");

function memoryFiles(initial: Record<string, string>) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    access: {
      read: vi.fn(async (filePath: string) => {
        const text = files.get(filePath);
        if (text === undefined) throw new Error("ENOENT");
        return new TextEncoder().encode(text);
      }),
      write: vi.fn(async (filePath: string, text: string) => {
        files.set(filePath, text);
      }),
    },
  };
}

describe("complete config.json", () => {
  it("lists every setting in reference order", () => {
    const document = completeConfigurationDocument(
      DEFAULT_USER_CONFIGURATION,
      "themes/omtheme.json",
    );
    expectCompleteConfiguration(document);
    expect(Object.keys(document)).toEqual([
      "version",
      "confirmClose",
      "logLevel",
      "font",
      "terminal",
      "scrollback",
      "keyboard",
      "window",
      "theme",
      "keybinds",
    ]);
    expect(document.font).not.toHaveProperty("family");
  });

  it("keeps written values and unknown keys while filling the rest", () => {
    const complete = completeConfigurationDocument(
      DEFAULT_USER_CONFIGURATION,
      undefined,
    );
    const written = {
      window: { transparency: 0.30000000001, extra: "kept" },
      keybinds: { copy: "CmdOrCtrl+C" },
      future: { option: true },
      version: 1,
    };
    expect(missesSettings(complete, written)).toBe(true);
    const filled = fillConfiguration(complete, written);
    expect(filled).toMatchObject({
      window: { transparency: 0.30000000001, extra: "kept", blur: false },
      keybinds: { copy: "CmdOrCtrl+C" },
      future: { option: true },
    });
    expect(Object.keys(filled)[0]).toBe("version");
    expect(missesSettings(complete, filled)).toBe(false);
  });

  it("completes a short file once and names the bundled theme", async () => {
    const { files, access } = memoryFiles({
      [configPath]: '{"version":1,"window":{"cornerRadius":4}}',
    });
    expect(
      await completeConfigurationFile(
        configPath,
        DEFAULT_USER_CONFIGURATION,
        access,
      ),
    ).toBe(true);
    const written = JSON.parse(files.get(configPath)!) as {
      window: { cornerRadius: number };
    };
    expectCompleteConfiguration(written);
    expect(written.window.cornerRadius).toBe(4);
    expect(JSON.parse(files.get(themePath)!)).toEqual(DEFAULT_TERMINAL_THEME);
    expect(
      await completeConfigurationFile(
        configPath,
        DEFAULT_USER_CONFIGURATION,
        access,
      ),
    ).toBe(false);
  });

  it("names no theme when omtheme.json was changed, and skips invalid JSON", async () => {
    const { files, access } = memoryFiles({
      [configPath]: '{"version":1}',
      [themePath]: JSON.stringify({ ...DEFAULT_TERMINAL_THEME, name: "Mine" }),
    });
    await completeConfigurationFile(
      configPath,
      DEFAULT_USER_CONFIGURATION,
      access,
    );
    expect(JSON.parse(files.get(configPath)!)).not.toHaveProperty("theme");
    expect(JSON.parse(files.get(themePath)!)).toMatchObject({ name: "Mine" });

    const broken = memoryFiles({ [configPath]: "{ broken" });
    expect(
      await completeConfigurationFile(
        configPath,
        DEFAULT_USER_CONFIGURATION,
        broken.access,
      ),
    ).toBe(false);
    expect(broken.access.write).not.toHaveBeenCalled();
  });
});
