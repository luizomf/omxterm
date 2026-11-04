import { execFileSync } from "node:child_process";
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  createSettingsService,
  nodeSettingsFiles,
} from "../../src/main/settings-service";
import { loadTerminalSnippets } from "../../src/main/snippets";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import { settingsMessageText } from "../../src/shared/settings-messages";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

it("saves through a relative config link without replacing it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-links-"));
  roots.push(root);
  const directory = path.join(root, "omxterm");
  const target = path.join(root, "dotfiles", "config.json");
  const file = path.join(directory, "config.json");
  await mkdir(directory);
  await mkdir(path.dirname(target));
  await writeFile(target, '{"version":1,"logLevel":"debug"}');
  await symlink("../dotfiles/config.json", file);
  const linkText = await readlink(file);
  const reload = vi.fn(async () => ({ applied: true as const, notices: [] }));
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: root },
      homeDirectory: root,
      platform: "linux",
      getInstalledFontFamilyMetrics: async () => undefined,
    },
    reload,
  });

  expect((await service.snapshot()).values.logLevel).toBe("debug");
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "saved",
  });
  expect((await lstat(file)).isSymbolicLink()).toBe(true);
  expect(await readlink(file)).toBe(linkText);
  expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
    version: 1,
    logLevel: "debug",
    font: { size: 18 },
  });
  expect(reload).toHaveBeenCalledOnce();
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-settings-links-"));
  roots.push(root);
  const file = path.join(root, "omxterm", "config.json");
  const loadOptions = {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    platform: "linux",
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  const reload = vi.fn(async () => ({ applied: true as const, notices: [] }));
  const service = createSettingsService({ loadOptions, reload });
  return { root, file, loadOptions, reload, service };
}

it("saves raw and shortcut changes through linked parents and a relative chain", async () => {
  const { root, file, service, reload } = await fixture();
  const configDir = path.join(root, "profile", "config");
  const chain = path.join(root, "profile", "links");
  const target = path.join(root, "dotfiles", "config.json");
  await mkdir(configDir, { recursive: true });
  await mkdir(chain);
  await mkdir(path.dirname(target));
  await writeFile(target, '{"version":1}', { mode: 0o640 });
  if (process.platform !== "win32") await chmod(target, 0o640);
  await symlink("profile/config", path.join(root, "omxterm"), "dir");
  await symlink("../links/next.json", path.join(configDir, "config.json"));
  await symlink("../../dotfiles/config.json", path.join(chain, "next.json"));
  const links = [
    path.join(root, "omxterm"),
    file,
    path.join(chain, "next.json"),
  ];
  const linkTexts = await Promise.all(links.map((entry) => readlink(entry)));

  const opened = await service.snapshot();
  const raw = '{"version":1,"logLevel":"debug"}';
  const saved = await service.saveText(raw, opened.revision);
  expect(saved).toMatchObject({ status: "saved", snapshot: { text: raw } });
  expect((await service.snapshot()).revision).toBe(saved.snapshot.revision);
  expect(
    await service.changeKeybind({
      action: "copy",
      choice: { state: "unbound" },
    }),
  ).toMatchObject({ status: "saved" });
  expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
    version: 1,
    logLevel: "debug",
    keybinds: { copy: null },
  });
  expect(await Promise.all(links.map((entry) => readlink(entry)))).toEqual(
    linkTexts,
  );
  if (process.platform !== "win32")
    expect((await stat(target)).mode & 0o777).toBe(0o640);
  expect(await readdir(path.dirname(target))).toEqual(["config.json"]);
  expect(reload).toHaveBeenCalledTimes(2);
});

it("detects a raw draft's retargeting even when both targets have identical bytes", async () => {
  const { root, file, service, reload } = await fixture();
  await mkdir(path.dirname(file));
  const first = path.join(root, "first.json");
  const second = path.join(root, "second.json");
  await writeFile(first, '{"version":1}');
  await writeFile(second, '{"version":1}');
  await symlink("../first.json", file);
  const opened = await service.snapshot();
  await rm(file);
  await symlink("../second.json", file);
  expect((await service.snapshot()).revision).not.toBe(opened.revision);
  expect(
    await service.saveText('{"version":1,"logLevel":"debug"}', opened.revision),
  ).toMatchObject({ status: "conflict", message: { kind: "conflict" } });
  expect(await readFile(first, "utf8")).toBe('{"version":1}');
  expect(await readFile(second, "utf8")).toBe('{"version":1}');
  expect(path.normalize(await readlink(file))).toBe(
    path.normalize("../second.json"),
  );
  expect(reload).not.toHaveBeenCalled();
});

it("creates a missing configuration inside an existing linked directory", async () => {
  const { root, file, service, loadOptions } = await fixture();
  await mkdir(path.join(root, "dotfiles"));
  await symlink("dotfiles", path.dirname(file), "dir");
  const absent = await loadUserConfiguration(loadOptions);
  expect(absent.fallback).toBeUndefined();
  expect(absent.configuration.logLevel).toBe("info");
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "saved",
  });
  expect(
    JSON.parse(
      await readFile(path.join(root, "dotfiles", "config.json"), "utf8"),
    ),
  ).toEqual({ version: 1, font: { size: 18 } });
  expect(path.normalize(await readlink(path.dirname(file)))).toBe("dotfiles");
  expect(await readdir(path.join(root, "dotfiles"))).toEqual(["config.json"]);
});

it("detects retargeting an absent configuration directory before raw save", async () => {
  const { root, service, reload } = await fixture();
  await mkdir(path.join(root, "one"));
  await mkdir(path.join(root, "two"));
  const directory = path.join(root, "omxterm");
  await symlink("one", directory, "dir");
  const opened = await service.snapshot();
  await rm(directory);
  await symlink("two", directory, "dir");
  expect(
    await service.saveText('{"version":1}', opened.revision),
  ).toMatchObject({ status: "conflict" });
  expect(await readdir(path.join(root, "one"))).toEqual([]);
  expect(await readdir(path.join(root, "two"))).toEqual([]);
  expect(reload).not.toHaveBeenCalled();
});

it.each([
  "dangling-file",
  "dangling-parent",
  "chain",
  "cycle",
  "directory",
] as const)(
  "refuses the %s target without inventing a file or losing links",
  async (kind) => {
    const { root, file, service, reload } = await fixture();
    if (kind === "dangling-parent") {
      await symlink("missing-directory", path.dirname(file), "dir");
    } else {
      await mkdir(path.dirname(file));
      if (kind === "directory") await mkdir(file);
      else if (kind === "chain") {
        await symlink("next", file);
        await symlink("missing.json", path.join(path.dirname(file), "next"));
      } else if (kind === "cycle") {
        await symlink("next", file);
        await symlink("config.json", path.join(path.dirname(file), "next"));
      } else await symlink("../missing.json", file);
    }
    const opened = await service.snapshot();
    const problem = kind === "directory" ? "target" : "symlink";
    expect(opened.problem).toEqual({ kind: problem });
    expect(settingsMessageText(opened.problem!)).toMatch(
      kind === "directory" ? /regular file/iu : /dangling or cyclic/iu,
    );
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({ status: "rejected", message: { kind: problem } });
    expect(
      await service.saveText('{"version":1}', opened.revision),
    ).toMatchObject({ status: "rejected", message: { kind: problem } });
    expect(
      (await lstat(kind === "dangling-parent" ? path.dirname(file) : file))[
        kind === "directory" ? "isDirectory" : "isSymbolicLink"
      ](),
    ).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual(["omxterm"]);
  },
);

it.skipIf(process.platform === "win32")(
  "refuses a FIFO without opening or replacing it",
  async () => {
    const { file, service, reload } = await fixture();
    await mkdir(path.dirname(file));
    execFileSync("mkfifo", [file]);
    expect((await service.snapshot()).problem).toEqual({ kind: "target" });
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({ status: "rejected", message: { kind: "target" } });
    expect((await lstat(file)).isFIFO()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  },
);

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "reports an actual unwritable target directory without replacing a link or target",
  async () => {
    const { root, file, service, reload } = await fixture();
    await mkdir(path.dirname(file));
    const directory = path.join(root, "dotfiles");
    const target = path.join(directory, "config.json");
    await mkdir(directory);
    await writeFile(target, '{"version":1}');
    await symlink("../dotfiles/config.json", file);
    await chmod(directory, 0o500);
    try {
      const result = await service.change({ path: "font.size", value: 18 });
      expect(result).toMatchObject({
        status: "failed",
        message: { kind: "write" },
      });
      expect(await readFile(target, "utf8")).toBe('{"version":1}');
      expect(path.normalize(await readlink(file))).toBe(
        path.normalize("../dotfiles/config.json"),
      );
      expect(reload).not.toHaveBeenCalled();
    } finally {
      await chmod(directory, 0o700);
    }
  },
);

it("reports read permission failures without allowing a raw overwrite", async () => {
  const { root, file, loadOptions, reload } = await fixture();
  await mkdir(path.dirname(file));
  await writeFile(file, '{"version":1}');
  const service = createSettingsService({
    loadOptions,
    reload,
    files: {
      read: async () => {
        throw Object.assign(new Error("private path"), { code: "EACCES" });
      },
      replace: nodeSettingsFiles.replace,
    },
  });
  const opened = await service.snapshot();
  expect(opened.problem).toEqual({ kind: "read" });
  expect(settingsMessageText(opened.problem!)).toMatch(/permissions/iu);
  expect(
    await service.saveText('{"version":1,"font":{"size":18}}', opened.revision),
  ).toMatchObject({ status: "rejected", message: { kind: "read" } });
  expect(await readFile(file, "utf8")).toBe('{"version":1}');
  expect(await readdir(root)).toEqual(["omxterm"]);
  expect(reload).not.toHaveBeenCalled();
});

it.skipIf(process.platform === "win32")(
  "saves through a link to a long but valid target basename",
  async () => {
    const { root, file, service } = await fixture();
    await mkdir(path.dirname(file));
    const target = path.join(root, "a".repeat(250));
    await writeFile(target, '{"version":1}');
    await symlink(target, file);
    expect(
      await service.change({ path: "font.size", value: 18 }),
    ).toMatchObject({ status: "saved" });
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({
      version: 1,
      font: { size: 18 },
    });
    expect((await lstat(file)).isSymbolicLink()).toBe(true);
  },
);

it("retains active settings when manual reload encounters a dangling linked parent", async () => {
  const { root, file, loadOptions } = await fixture();
  const target = path.join(root, "dotfiles");
  await mkdir(target);
  await writeFile(
    path.join(target, "config.json"),
    '{"version":1,"logLevel":"debug"}',
  );
  await symlink("dotfiles", path.dirname(file), "dir");
  const initial = await loadUserConfiguration(loadOptions);
  expect(initial.configuration.logLevel).toBe("debug");
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initial.configuration, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply: vi.fn(),
  });
  await rm(path.dirname(file));
  await symlink("missing-directory", path.dirname(file), "dir");
  const result = await reloader.reload();
  expect(result).toMatchObject({ applied: false });
  expect(reloader.current().configuration.logLevel).toBe("debug");
  expect(reloader.current().userFileErrors.join()).toMatch(
    /could not be read/iu,
  );
  expect((await lstat(path.dirname(file))).isSymbolicLink()).toBe(true);
});

it("documents atomic replacement semantics for hard links", async () => {
  const { root, file, service } = await fixture();
  await mkdir(path.dirname(file));
  await writeFile(file, '{"version":1}');
  const alias = path.join(root, "hardlink.json");
  await link(file, alias);
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "saved",
  });
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({
    version: 1,
    font: { size: 18 },
  });
  expect(await readFile(alias, "utf8")).toBe('{"version":1}');
});

it("keeps themes and snippets beside the logical configuration and manual reload working", async () => {
  const { root, file, loadOptions } = await fixture();
  const directory = path.dirname(file);
  await mkdir(directory);
  await mkdir(path.join(root, "dotfiles"));
  await mkdir(path.join(root, "theme-links"));
  await mkdir(path.join(root, "colors"));
  await copyFile("docs/omtheme.json", path.join(root, "colors", "theme.json"));
  await symlink("../theme-links", path.join(directory, "themes"), "dir");
  await symlink(
    "../colors/theme.json",
    path.join(root, "theme-links", "custom.json"),
  );
  const snippets =
    "version: 1\nsnippets:\n  - name: example\n    body: hello\n";
  await writeFile(path.join(root, "dotfiles", "snippets.yaml"), snippets);
  await symlink(
    "../dotfiles/snippets.yaml",
    path.join(directory, "snippets.yaml"),
  );
  const target = path.join(root, "dotfiles", "config.json");
  await writeFile(
    target,
    '{"version":1,"theme":{"path":"themes/custom.json"}}',
  );
  await symlink("../dotfiles/config.json", file);
  const loaded = await loadUserConfiguration(loadOptions);
  expect(loaded.fallback).toBeUndefined();
  expect(loaded.selectedTerminalThemePath).toBe(
    path.join(directory, "themes", "custom.json"),
  );
  expect(await loadTerminalSnippets(loadOptions)).toMatchObject({
    snippets: [{ name: "example", body: "hello" }],
  });
  const reloader = createUserConfigurationReloader({
    initial: { configuration: loaded.configuration, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply: vi.fn(),
  });
  const service = createSettingsService({
    loadOptions,
    reload: reloader.reload,
  });
  expect(await service.change({ path: "font.size", value: 18 })).toMatchObject({
    status: "saved",
    application: { applied: true },
  });
  expect(reloader.current().configuration.fontSize).toBe(18);
  await writeFile(
    target,
    '{"version":1,"logLevel":"error","theme":{"path":"themes/custom.json"}}',
  );
  expect(await reloader.reload()).toMatchObject({ applied: true });
  expect(reloader.current().configuration.logLevel).toBe("error");
  expect(
    await readFile(path.join(root, "dotfiles", "snippets.yaml"), "utf8"),
  ).toBe(snippets);
  for (const entry of [
    file,
    path.join(directory, "themes"),
    path.join(directory, "snippets.yaml"),
    path.join(root, "theme-links", "custom.json"),
  ])
    expect((await lstat(entry)).isSymbolicLink()).toBe(true);
});
