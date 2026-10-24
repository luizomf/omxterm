import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSettingsService,
  nodeSettingsFiles,
  setField,
} from "../../src/main/settings-service";
import type { UserConfigurationReloadOutcome } from "../../src/main/user-configuration-reloader";

const roots: string[] = [];

async function setup(contents?: string) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-"));
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  if (contents !== undefined) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  const reload = vi.fn(async (): Promise<UserConfigurationReloadOutcome> => ({
    applied: true,
    notices: [],
  }));
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      platform: "linux",
      getInstalledFontFamilyMetrics: async (family) =>
        family === "Installed Mono"
          ? ({ family, cellWidth: 9, cellHeight: 18 } as never)
          : undefined,
    },
    reload,
  });
  const read = async () => readFile(file, "utf8");
  return { root, file, reload, service, read };
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("settings snapshot", () => {
  it("reads an absent file without creating one", async () => {
    const { service, root } = await setup();
    const snapshot = await service.snapshot();
    expect(snapshot).toMatchObject({
      revision: "absent",
      text: null,
      values: { "font.size": 16, confirmClose: true, "theme.path": "" },
    });
    expect(snapshot.problem).toBeUndefined();
    expect(await readdir(root)).toEqual([]);
  });

  it("reports an unparseable file instead of replacing it", async () => {
    const { service, read, reload } = await setup("{ broken");
    const snapshot = await service.snapshot();
    expect(snapshot.problem).toBe("config.json is not valid JSON");
    const result = await service.change({ path: "font.size", value: 18 });
    expect(result).toMatchObject({ status: "rejected" });
    expect(await read()).toBe("{ broken");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("graphical settings changes", () => {
  it("creates a minimal document only when the user changes a setting", async () => {
    const { service, read, reload } = await setup();
    const result = await service.change({ path: "font.size", value: 20 });
    expect(result).toMatchObject({
      status: "saved",
      application: { applied: true },
      snapshot: { values: { "font.size": 20 } },
    });
    expect(JSON.parse(await read())).toEqual({
      version: 1,
      font: { size: 20 },
    });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("changes one field and keeps every other entry and its order", async () => {
    const original = {
      version: 1,
      logLevel: "debug",
      keybinds: { copy: "Alt+C", find: null },
      font: { ligatures: false },
    };
    const { service, read } = await setup(JSON.stringify(original));
    await service.change({ path: "font.size", value: 14 });
    const saved = await read();
    expect(JSON.parse(saved)).toEqual({
      ...original,
      font: { ligatures: false, size: 14 },
    });
    expect(Object.keys(JSON.parse(saved) as object)).toEqual([
      "version",
      "logLevel",
      "keybinds",
      "font",
    ]);
    expect(saved.endsWith("}\n")).toBe(true);
  });

  it("removes a field and emptied groups when it inherits its default again", async () => {
    const { service, read } = await setup(
      JSON.stringify({ version: 1, window: { showTabBar: false } }),
    );
    await service.change({ path: "window.showTabBar", value: null });
    expect(JSON.parse(await read())).toEqual({ version: 1 });
  });

  it("rejects an invalid candidate without writing or reloading", async () => {
    const original = JSON.stringify({ version: 1 });
    const { service, read, reload } = await setup(original);
    const result = await service.change({
      path: "font.family",
      value: "Missing Font",
    });
    expect(result).toMatchObject({ status: "rejected" });
    expect(result.status === "rejected" && result.message).toMatch(
      /font\.family.*must exactly name an installed font family/u,
    );
    expect(await read()).toBe(original);
    expect(reload).not.toHaveBeenCalled();
  });

  it("lets a change repair a parsed but invalid document", async () => {
    const { service, read } = await setup(
      JSON.stringify({ version: 1, font: { size: 4 } }),
    );
    expect((await service.snapshot()).problem).toMatch(/font\.size/u);
    expect(
      await service.change({ path: "font.ligatures", value: false }),
    ).toMatchObject({ status: "rejected" });
    expect(
      await service.change({ path: "font.size", value: 12 }),
    ).toMatchObject({ status: "saved" });
    expect(JSON.parse(await read())).toEqual({
      version: 1,
      font: { size: 12 },
    });
  });

  it("keeps an external edit made after the editor opened", async () => {
    const { service, file, read } = await setup(JSON.stringify({ version: 1 }));
    await service.snapshot();
    await writeFile(file, JSON.stringify({ version: 1, logLevel: "error" }));
    await service.change({ path: "confirmClose", value: false });
    expect(JSON.parse(await read())).toEqual({
      version: 1,
      logLevel: "error",
      confirmClose: false,
    });
  });

  it("applies rapid changes in request order", async () => {
    const { service, read } = await setup();
    const results = await Promise.all([
      service.change({ path: "font.size", value: 18 }),
      service.change({ path: "scrollback.lines", value: 500 }),
      service.change({ path: "font.size", value: 19 }),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      "saved",
      "saved",
      "saved",
    ]);
    expect(JSON.parse(await read())).toEqual({
      version: 1,
      font: { size: 19 },
      scrollback: { lines: 500 },
    });
  });

  it("reports a saved change whose application failed", async () => {
    const { service, reload } = await setup();
    reload.mockResolvedValueOnce({ applied: false, notice: "reload failed" });
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({
      status: "saved",
      application: { applied: false, notice: "reload failed" },
    });
  });

  it("reports a failed write and leaves the file untouched", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-"));
    roots.push(root);
    const reload = vi.fn();
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: root },
        homeDirectory: root,
        platform: "linux",
        getInstalledFontFamilyMetrics: async () => undefined,
      },
      reload,
      files: {
        read: nodeSettingsFiles.read,
        replace: async () => {
          throw new Error("EACCES");
        },
      },
    });
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({ status: "failed" });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("raw JSON saves", () => {
  it("saves only from the current revision and validates first", async () => {
    const { service, file, read } = await setup(JSON.stringify({ version: 1 }));
    const opened = await service.snapshot();

    expect(await service.saveText("{ nope", opened.revision)).toMatchObject({
      status: "rejected",
    });
    expect(await read()).toBe(JSON.stringify({ version: 1 }));

    await writeFile(file, JSON.stringify({ version: 1, logLevel: "debug" }));
    const conflict = await service.saveText(
      '{ "version": 1, "confirmClose": false }\n',
      opened.revision,
    );
    expect(conflict).toMatchObject({ status: "conflict" });
    expect(JSON.parse(await read())).toEqual({ version: 1, logLevel: "debug" });

    const current = await service.snapshot();
    const draft = "{\n  // not JSON\n}";
    expect(await service.saveText(draft, current.revision)).toMatchObject({
      status: "rejected",
    });
    const text = '{ "version": 1, "confirmClose": false }\n';
    expect(await service.saveText(text, current.revision)).toMatchObject({
      status: "saved",
    });
    expect(await read()).toBe(text);
  });
});

describe("settings file helpers", () => {
  it("replaces atomically, keeps the existing mode and leaves no temporary file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-"));
    roots.push(root);
    const file = path.join(root, "config.json");
    await writeFile(file, "{}", { mode: 0o600 });
    await nodeSettingsFiles.replace(file, '{ "version": 1 }\n');
    expect(await readFile(file, "utf8")).toBe('{ "version": 1 }\n');
    if (process.platform !== "win32")
      expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(root)).toEqual(["config.json"]);
  });

  it("sets and removes dotted paths", () => {
    const document: Record<string, unknown> = { version: 1 };
    setField(document, "terminal.padding.top", 4);
    expect(document).toEqual({ version: 1, terminal: { padding: { top: 4 } } });
    setField(document, "terminal.padding.top", null);
    expect(document).toEqual({ version: 1 });
    setField(document, "theme.path", null);
    expect(document).toEqual({ version: 1 });
  });
});
