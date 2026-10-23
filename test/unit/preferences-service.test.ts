import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { writeAtomically } from "../../src/main/application-data";
import { createPreferencesService } from "../../src/main/preferences-service";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  type LoadedUserConfiguration,
} from "../../src/main/user-configuration";
import { isPreferencesSnapshot } from "../../src/shared/preferences";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { terminalScheme } from "../../src/shared/terminal-schemes";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import { expectCompleteConfiguration } from "../fixtures/complete-configuration";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function setup(initialConfig?: string) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-preferences-"));
  roots.push(root);
  const directory = path.join(root, "omxterm");
  await mkdir(directory, { recursive: true });
  const configurationPath = path.join(directory, "config.json");
  if (initialConfig !== undefined)
    await writeFile(configurationPath, initialConfig);
  const loadOptions = {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    platform: "linux",
    getInstalledFontFamilyMetrics: async (family: string) =>
      family === "Mono Test" ? { cellWidth: 9, cellHeight: 18 } : undefined,
  };
  let active: LoadedUserConfiguration = (
    await loadUserConfiguration(loadOptions)
  ).configuration;
  const reload = vi.fn(async () => {
    active = (await loadUserConfiguration(loadOptions)).configuration;
  });
  const extras = {
    restoreWindows: false,
    highlightOutput: false,
  };
  const service = createPreferencesService({
    configurationPath,
    platform: "linux",
    files: {
      read: (filePath) => readFile(filePath),
      write: (filePath, text) =>
        writeAtomically({ mkdir, open, rename, rm }, filePath, text),
      list: (folder) => readdir(folder),
    },
    validate: (bytes) =>
      loadUserConfiguration({
        ...loadOptions,
        read: (async (filePath: string) =>
          filePath === configurationPath
            ? bytes
            : readFile(filePath)) as typeof readFile,
      }),
    active: () => ({ configuration: active, userFileErrors: [] }),
    reload,
    extras: {
      get: () => ({ ...extras }),
      setRestoreWindows: vi.fn(async (enabled: boolean) => {
        extras.restoreWindows = enabled;
      }),
      setHighlightOutput: vi.fn(async (enabled: boolean) => {
        extras.highlightOutput = enabled;
      }),
    },
    fontFamilies: async () => ["Mono Test"],
  });
  const config = async () =>
    JSON.parse(await readFile(configurationPath, "utf8")) as Record<
      string,
      unknown
    >;
  return { service, reload, config, configurationPath, directory, extras };
}

describe("Preferences service", () => {
  it("describes the defaults and every built-in scheme", async () => {
    const { service } = await setup();
    const snapshot = await service.snapshot();
    expect(isPreferencesSnapshot(snapshot)).toBe(true);
    expect(snapshot.values.scheme).toBe("omtheme");
    expect(snapshot.values.fontSize).toBe(DEFAULT_USER_CONFIGURATION.fontSize);
    expect(snapshot.values.keybinds).toEqual(terminalDefaultKeybinds("linux"));
    expect(snapshot.defaults).toEqual(snapshot.values);
    expect(snapshot.schemes.map((scheme) => scheme.id)).toContain("dracula");
    expect(snapshot.fontFamilies).toEqual(["Mono Test"]);
  });

  it("writes a valid change with every other setting and reloads it", async () => {
    const { service, reload, config, directory } = await setup();
    const result = await service.save({
      fontSize: 18,
      padding: { top: 4 },
      showTabBar: false,
    });
    expect(result.ok).toBe(true);
    const written = await config();
    expect(written).toMatchObject({
      font: { size: 18, lineHeight: 1, ligatures: true },
      terminal: { padding: { top: 4, right: 12, bottom: 8, left: 12 } },
      window: { showTabBar: false, showTitleBar: true },
      theme: { path: "themes/omtheme.json" },
      keybinds: terminalDefaultKeybinds("linux"),
    });
    expectCompleteConfiguration(written);
    expect(
      JSON.parse(
        await readFile(path.join(directory, "themes/omtheme.json"), "utf8"),
      ),
    ).toEqual(DEFAULT_TERMINAL_THEME);
    expect(reload).toHaveBeenCalledOnce();
    expect(result.snapshot.values.fontSize).toBe(18);
  });

  it("refuses what a reload would refuse and leaves the file alone", async () => {
    const original = '{\n  "version": 1,\n  "font": { "size": 14 }\n}\n';
    const { service, reload, configurationPath } = await setup(original);
    const result = await service.save({ fontFamily: "Missing Font" });
    expect(result).toMatchObject({
      ok: false,
      error: "font.family: must exactly name an installed font family",
    });
    expect(await readFile(configurationPath, "utf8")).toBe(original);
    expect(reload).not.toHaveBeenCalled();
    expect(result.snapshot.values.fontFamily).toBe("");
    expect((await service.save({ fontFamily: "Mono Test" })).ok).toBe(true);
  });

  it("writes a built-in scheme to themes/ and selects it", async () => {
    const { service, config, directory } = await setup();
    const result = await service.save({ scheme: "dracula" });
    expect(result.ok).toBe(true);
    expect(await config()).toMatchObject({
      theme: { path: "themes/dracula.json" },
    });
    expect(
      JSON.parse(
        await readFile(path.join(directory, "themes/dracula.json"), "utf8"),
      ),
    ).toEqual(terminalScheme("dracula")!.theme);
    expect(result.snapshot.values.scheme).toBe("dracula");
    expect((await service.save({ scheme: "omtheme" })).ok).toBe(true);
    expect(await config()).toMatchObject({
      theme: { path: "themes/omtheme.json" },
    });
  });

  it("keeps a user theme that has a built-in scheme's file name", async () => {
    const { service, config, directory } = await setup();
    const mine = {
      ...terminalScheme("dracula")!.theme,
      name: "My Dracula",
    };
    await mkdir(path.join(directory, "themes"));
    await writeFile(
      path.join(directory, "themes/dracula.json"),
      JSON.stringify(mine),
    );
    const result = await service.save({ scheme: "dracula" });
    expect(result.ok).toBe(true);
    expect(await config()).toMatchObject({
      theme: { path: "themes/dracula.builtin.json" },
    });
    const kept = JSON.parse(
      await readFile(path.join(directory, "themes/dracula.json"), "utf8"),
    ) as { readonly name: string };
    expect(kept.name).toBe("My Dracula");
    const custom = result.snapshot.schemes.find(
      (scheme) => scheme.id === "file:dracula.json",
    );
    expect(custom).toMatchObject({ name: "My Dracula", builtIn: false });
    const selected = await service.save({ scheme: "file:dracula.json" });
    expect(selected.snapshot.values.scheme).toBe("file:dracula.json");
  });

  it("writes every keybind, changed or default", async () => {
    const { service, config } = await setup();
    expect(
      (await service.save({ keybinds: { copy: "Control+Shift+J" } })).ok,
    ).toBe(true);
    expect(await config()).toMatchObject({
      keybinds: { copy: "Control+Shift+J" },
    });
    const conflict = await service.save({
      keybinds: { paste: "Control+Shift+J" },
    });
    expect(conflict).toMatchObject({ ok: false });
    expect(conflict.ok ? "" : conflict.error).toMatch(/conflicts/u);
    await service.save({
      keybinds: { copy: terminalDefaultKeybinds("linux").copy },
    });
    expect(await config()).toMatchObject({
      keybinds: terminalDefaultKeybinds("linux"),
    });
  });

  it("keeps settings it does not manage and backs up on reset", async () => {
    const original = JSON.stringify({
      version: 1,
      windowsShell: "C:\\Windows\\System32\\cmd.exe",
      font: { size: 20 },
    });
    const { service, config, configurationPath } = await setup(original);
    await service.save({ blur: true });
    expect(await config()).toMatchObject({
      windowsShell: "C:\\Windows\\System32\\cmd.exe",
      font: { size: 20 },
      window: { blur: true },
    });
    const reset = await service.reset();
    expect(reset.ok).toBe(true);
    const defaults = await config();
    expect(defaults).toMatchObject({
      windowsShell: "C:\\Windows\\System32\\cmd.exe",
      font: { size: 16 },
      window: { blur: false },
    });
    expectCompleteConfiguration(defaults);
    expect(
      JSON.parse(await readFile(`${configurationPath}.bak`, "utf8")),
    ).toMatchObject({ window: { blur: true } });
  });

  it("does not rewrite a config.json that is not JSON", async () => {
    const { service, configurationPath } = await setup("{ broken");
    const result = await service.save({ fontSize: 18 });
    expect(result.ok).toBe(false);
    expect(await readFile(configurationPath, "utf8")).toBe("{ broken");
    expect((await service.reset()).ok).toBe(true);
    const defaults: unknown = JSON.parse(
      await readFile(configurationPath, "utf8"),
    );
    expect(defaults).toMatchObject({ font: { size: 16 } });
    expectCompleteConfiguration(defaults);
    expect(await readFile(`${configurationPath}.bak`, "utf8")).toBe("{ broken");
  });

  it("applies the Application Data toggles without touching config.json", async () => {
    const { service, reload, extras, configurationPath } = await setup();
    const result = await service.save({
      restoreWindows: true,
      highlightOutput: true,
    });
    expect(result.ok).toBe(true);
    expect(extras).toEqual({ restoreWindows: true, highlightOutput: true });
    expect(result.snapshot.values.restoreWindows).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    await expect(readFile(configurationPath)).rejects.toThrow();
  });

  it("saves file previews in config.json and keeps them on by default", async () => {
    const { service, config } = await setup();
    expect((await service.snapshot()).values.filePreview).toBe(true);
    const result = await service.save({ filePreview: false });
    expect(result.ok).toBe(true);
    expect(await config()).toMatchObject({
      terminal: { filePreview: false },
    });
    expect(result.snapshot.values.filePreview).toBe(false);
  });

  it("edits config.json as text, validating it like a reload", async () => {
    const { service, reload, config, configurationPath } = await setup(
      '{"version":1,"font":{"size":20}}',
    );
    const file = await service.readFile();
    expect(file).toEqual({
      path: configurationPath,
      text: '{"version":1,"font":{"size":20}}',
    });

    const broken = await service.writeFile('{"version": 1,');
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/^JSON: /u);
    const invalid = await service.writeFile(
      '{"version": 1, "font": {"size": 2}}',
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toContain("font.size");
    expect(reload).not.toHaveBeenCalled();
    expect(await config()).toEqual({ version: 1, font: { size: 20 } });

    const text = '{\n  "version": 1,\n  "font": { "size": 22 }\n}';
    const saved = await service.writeFile(text);
    expect(saved.ok).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    const written = await config();
    expect(written).toMatchObject({ font: { size: 22 } });
    expectCompleteConfiguration(written);
    expect(await readFile(`${configurationPath}.bak`, "utf8")).toBe(
      '{"version":1,"font":{"size":20}}',
    );
    expect(saved.snapshot.values.fontSize).toBe(22);
  });
});
