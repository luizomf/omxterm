import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";
import { isSettingsChange } from "../../src/shared/settings";

it("edits only the exact supported language preference and removes it to inherit en-US", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-language-"));
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      getInstalledFontFamilyMetrics: async () => undefined,
    },
    reload: async () => ({ applied: true, notices: [] }),
  });
  try {
    expect((await service.snapshot()).values).toMatchObject({
      language: "en-US",
    });
    expect(isSettingsChange({ path: "language", value: "pt-BR" })).toBe(true);
    for (const value of ["pt-br", "en", "", "fr-FR"])
      expect(isSettingsChange({ path: "language", value })).toBe(false);
    expect(isSettingsChange({ path: "language", value: null })).toBe(true);
    await service.change({ path: "logLevel", value: "debug" });
    expect(
      await service.change({ path: "language", value: "pt-BR" }),
    ).toMatchObject({
      status: "saved",
      lifetimes: [],
      snapshot: { values: { language: "pt-BR" } },
    });
    expect(
      JSON.parse(
        await readFile(path.join(root, "omxterm/config.json"), "utf8"),
      ),
    ).toEqual({ version: 1, logLevel: "debug", language: "pt-BR" });
    expect(
      await service.change({ path: "language", value: null }),
    ).toMatchObject({
      status: "saved",
      snapshot: { values: { language: "en-US" } },
    });
    expect(
      JSON.parse(
        await readFile(path.join(root, "omxterm/config.json"), "utf8"),
      ),
    ).toEqual({ version: 1, logLevel: "debug" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
