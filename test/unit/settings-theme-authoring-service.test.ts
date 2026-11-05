import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

it("serializes theme-file saves with Settings barriers without selecting until ordinary Use", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "omxterm-authoring-service-"),
  );
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let resume!: () => void;
  const held = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const reload = vi.fn(async () => {
    if (reload.mock.calls.length === 1) {
      entered();
      await held;
    }
    return { applied: true as const, notices: [] };
  });
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      getInstalledFontFamilyMetrics: async () => undefined,
      platform: process.platform,
    },
    reload,
  });
  try {
    const first = service.change({ path: "logLevel", value: "debug" });
    await started;
    let settled = false;
    const saved = service
      .themeDocumentFiles!.saveTheme({
        theme: { ...DEFAULT_TERMINAL_THEME, appearance: { paneDivider: null } },
        target: { newFilename: "local.json" },
      })
      .then((result) => {
        settled = true;
        return result;
      });
    const after = service.snapshot();
    await Promise.resolve();
    expect(settled).toBe(false);
    resume();
    expect((await first).status).toBe("saved");
    expect((await saved).status).toBe("saved");
    expect((await after).values["theme.path"]).toBe("");
    expect(reload).toHaveBeenCalledOnce();
    expect(
      await service.themeDocumentFiles!.openTheme("themes/local.json"),
    ).toMatchObject({
      status: "opened",
      theme: { appearance: { paneDivider: null } },
    });
    expect(
      await service.change({ path: "theme.path", value: "themes/local.json" }),
    ).toMatchObject({ status: "saved", application: { applied: true } });
    const current = await service.snapshot();
    expect(current.values["theme.path"]).toBe("themes/local.json");
    expect(current.values.logLevel).toBe("debug");
    expect(reload).toHaveBeenCalledTimes(2);
  } finally {
    resume();
    await rm(root, { recursive: true, force: true });
  }
});
