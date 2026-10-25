import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";
import { settingsMessageText } from "../../src/shared/settings-messages";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";

it.each([false, true])(
  "preserves a configuration symlink (dangling: %s)",
  async (dangling) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-link-"));
    roots.push(root);
    const file = path.join(root, "omxterm", "config.json");
    const target = path.join(root, "target.json");
    await mkdir(path.dirname(file));
    if (!dangling) await writeFile(target, '{"version":1}');
    await symlink(target, file);
    const service = createSettingsService({
      loadOptions: loadOptionsFor(root),
      reload: vi.fn(),
    });
    const snapshot = await service.snapshot();
    expect(snapshot.problem).toEqual({ kind: "symlink" });
    expect(settingsMessageText(snapshot.problem!)).toMatch(/symlink.*manual/iu);
    expect(snapshot.revision).not.toBe("absent");
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({ status: "rejected" });
    expect(
      await service.saveText('{"version":1}', snapshot.revision),
    ).not.toMatchObject({ status: "saved" });
    expect((await lstat(file)).isSymbolicLink()).toBe(true);
    if (!dangling) expect(await readFile(target, "utf8")).toBe('{"version":1}');
  },
);

it("reports persistence even when the production reloader's consumer throws twice", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-settings-application-"),
  );
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  const loadOptions = loadOptionsFor(root);
  const initial = await loadUserConfiguration(loadOptions);
  const apply = vi.fn(() => {
    throw new Error("private consumer detail");
  });
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initial.configuration, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply,
  });
  const service = createSettingsService({
    loadOptions,
    reload: reloader.reload,
  });
  const result = await service.change({ path: "font.size", value: 18 });
  expect(result).toMatchObject({
    status: "saved",
    application: { applied: false },
  });
  expect(JSON.stringify(result)).not.toContain("private consumer detail");
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    version: 1,
    font: { size: 18 },
  });
  expect(apply).toHaveBeenCalledTimes(2);
});

it("reports changed effective lifetimes for mixed raw saves, removals and defaults", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-settings-lifetimes-"),
  );
  roots.push(root);
  const service = createSettingsService({
    loadOptions: { ...loadOptionsFor(root), platform: "win32" },
    reload: async () => ({ applied: true, notices: [] }),
  });
  const save = async (text: string) =>
    service.saveText(text, (await service.snapshot()).revision);
  expect(
    await save(
      '{"version":1,"font":{"lineHeight":1.2},"window":{"showTabBar":false},"logLevel":"debug"}',
    ),
  ).toMatchObject({ status: "saved", lifetimes: ["restart", "new-windows"] });
  expect(await save('{"version":1}')).toMatchObject({
    status: "saved",
    lifetimes: ["restart", "new-windows"],
  });
  expect(
    await save(
      '{"version":1,"font":{"lineHeight":1},"window":{"showTabBar":true}}',
    ),
  ).toMatchObject({ status: "saved", lifetimes: [] });
});

it("keeps a saved draft's revision distinct from an external edit during application", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-base-"));
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  const submitted = '{"version":1,"logLevel":"debug"}';
  const external = '{"version":1,"logLevel":"error"}';
  const service = createSettingsService({
    loadOptions: loadOptionsFor(root),
    reload: async () => {
      await writeFile(file, external);
      return { applied: true, notices: [] };
    },
  });
  const result = await service.saveText(submitted, "absent");
  expect(result).toMatchObject({
    status: "saved",
    snapshot: { text: submitted },
  });
  expect(
    await service.saveText('{"version":1}', result.snapshot.revision),
  ).toMatchObject({ status: "conflict" });
  expect(await readFile(file, "utf8")).toBe(external);
});

it.each(["win32", "linux"])(
  "reports Windows shell session lifetime only on %s",
  async (platform) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-shell-"));
    roots.push(root);
    const service = createSettingsService({
      loadOptions: {
        ...loadOptionsFor(root),
        platform,
        inspectWindowsShell: (async () => ({ isFile: () => true })) as never,
      },
      reload: async () => ({ applied: true, notices: [] }),
    });
    const text = JSON.stringify({
      version: 1,
      windowsShell: "C:\\synthetic\\shell.exe",
    });
    const result = await service.saveText(text, "absent");
    expect(result).toMatchObject({
      status: "saved",
      lifetimes: platform === "win32" ? ["new-tabs"] : [],
    });
    expect(
      await service.saveText('{"version":1}', result.snapshot.revision),
    ).toMatchObject({
      status: "saved",
      lifetimes: platform === "win32" ? ["new-tabs"] : [],
    });
  },
);

it("saves BOM-prefixed raw JSON with the loader's decoding semantics and a usable byte revision", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-bom-"));
  roots.push(root);
  const loadOptions = loadOptionsFor(root);
  const initial = await loadUserConfiguration(loadOptions);
  const apply = vi.fn();
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initial.configuration, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply,
  });
  const service = createSettingsService({
    loadOptions,
    reload: reloader.reload,
  });
  const text = '\uFEFF{"version":1,"logLevel":"debug"}';
  const result = await service.saveText(text, "absent");
  expect(result).toMatchObject({
    status: "saved",
    application: { applied: true },
    snapshot: {
      text: '{"version":1,"logLevel":"debug"}',
      values: { logLevel: "debug" },
    },
  });
  expect(
    await readFile(path.join(root, "omxterm", "config.json"), "utf8"),
  ).toBe(text);
  expect(reloader.current().configuration.logLevel).toBe("debug");
  expect(apply).toHaveBeenCalledOnce();
  expect((await service.snapshot()).revision).toBe(result.snapshot.revision);
  expect(
    await service.saveText(
      '\uFEFF{"version":1,"logLevel":"invalid"}',
      result.snapshot.revision,
    ),
  ).toMatchObject({ status: "rejected" });
  expect(
    await readFile(path.join(root, "omxterm", "config.json"), "utf8"),
  ).toBe(text);
  expect(apply).toHaveBeenCalledOnce();
  expect(
    await service.saveText(
      '{"version":1,"logLevel":"error"}',
      result.snapshot.revision,
    ),
  ).toMatchObject({
    status: "saved",
    snapshot: { values: { logLevel: "error" } },
  });
});

function loadOptionsFor(root: string) {
  return {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    getInstalledFontFamilyMetrics: async () => undefined,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it.each(["graphical", "raw"] as const)(
  "refuses an external edit during %s validation",
  async (route) => {
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-settings-lifetime-"),
    );
    roots.push(root);
    const file = path.join(root, "omxterm", "config.json");
    await mkdir(path.dirname(file));
    await writeFile(file, '{"version":1}');
    const entered = deferred();
    const resume = deferred();
    const reload = vi.fn(async () => ({ applied: true as const, notices: [] }));
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: root },
        homeDirectory: root,
        platform: "linux",
        getInstalledFontFamilyMetrics: async (family) => {
          entered.resolve();
          await resume.promise;
          return { family, cellWidth: 9, cellHeight: 18 } as never;
        },
      },
      reload,
    });
    const snapshot = await service.snapshot();
    const pending =
      route === "graphical"
        ? service.change({ path: "font.family", value: "Installed Mono" })
        : service.saveText(
            '{"version":1,"font":{"family":"Installed Mono"}}',
            snapshot.revision,
          );
    await entered.promise;
    const external = '{"version":1,"logLevel":"debug"}';
    await writeFile(file, external);
    resume.resolve();
    expect(await pending).toMatchObject({
      status: "conflict",
      snapshot: { text: external },
    });
    expect(await readFile(file, "utf8")).toBe(external);
    expect(reload).not.toHaveBeenCalled();
  },
);
