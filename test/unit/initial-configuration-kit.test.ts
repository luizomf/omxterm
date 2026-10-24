import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { createInitialConfigurationKit } from "../../src/main/initial-configuration-kit";
import { startWithUserConfiguration } from "../../src/main/configured-startup";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
} from "../../src/main/user-configuration";
import { loadTerminalSnippets } from "../../src/main/snippets";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

async function fixture(xdg = false) {
  const homeDirectory = await mkdtemp(path.join(tmpdir(), "omxterm-kit-"));
  onTestFinished(() => rm(homeDirectory, { recursive: true, force: true }));
  const environment = xdg
    ? { XDG_CONFIG_HOME: path.join(homeDirectory, "custom") }
    : {};
  const directory = path.join(
    environment.XDG_CONFIG_HOME ?? path.join(homeDirectory, ".config"),
    "omxterm",
  );
  return {
    directory,
    options: {
      homeDirectory,
      environment,
      getInstalledFontFamilyMetrics: async () => undefined,
    },
  };
}

describe("initial configuration kit", () => {
  it.each(["darwin", "linux", "win32"])(
    "starts with real default files for %s",
    async (platform) => {
      const { options, directory } = await fixture();
      const load = await startWithUserConfiguration(
        { ...options, platform },
        (result) => result,
      );
      const document: unknown = JSON.parse(
        await readFile(path.join(directory, "config.json"), "utf8"),
      );
      expect(document).toMatchObject({
        window: {
          alwaysOnTop: false,
          blur: false,
          transparency: 0,
          showTitleBar: true,
          showTabBar: true,
        },
      });
      expect(load.fallback).toBeUndefined();
      expect(load.warnings).toBeUndefined();
      expect(load.configuration).toEqual({
        ...DEFAULT_USER_CONFIGURATION,
        keybinds: terminalDefaultKeybinds(platform),
      });
      expect(load.selectedTerminalThemePath).toBe(
        path.join(directory, "themes", "omtheme.json"),
      );
      const snippets = await loadTerminalSnippets(options);
      expect(snippets.error).toBeUndefined();
      expect(snippets.snippets).toHaveLength(1);
      expect(snippets.snippets[0]).toEqual({
        name: "Print a message",
        body: "printf '%s\\n' \"Hello\"",
        execute: false,
      });
      expect(
        await readFile(path.join(directory, "snippets.yaml"), "utf8"),
      ).toContain("body: |-\n");
      expect(await readdir(directory)).toEqual([
        "config.json",
        "snippets.yaml",
        "themes",
      ]);
    },
  );

  it("honors XDG_CONFIG_HOME and leaves an existing invalid config and all siblings alone", async () => {
    const { options, directory } = await fixture(true);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "config.json"), "invalid user data");
    expect(await createInitialConfigurationKit(options)).toBeUndefined();
    expect(await readdir(directory)).toEqual(["config.json"]);
    expect(await readFile(path.join(directory, "config.json"), "utf8")).toBe(
      "invalid user data",
    );
  });

  it("does not replace preexisting snippets or theme bytes", async () => {
    const { options, directory } = await fixture();
    await mkdir(path.join(directory, "themes"), { recursive: true });
    for (const file of ["snippets.yaml", "themes/omtheme.json"])
      await writeFile(path.join(directory, file), "user bytes");
    expect(await createInitialConfigurationKit(options)).toBeUndefined();
    for (const file of ["snippets.yaml", "themes/omtheme.json"])
      expect(await readFile(path.join(directory, file), "utf8")).toBe(
        "user bytes",
      );
  });

  it.skipIf(process.platform === "win32")(
    "treats a dangling config symlink as existing",
    async () => {
      const { options, directory } = await fixture();
      await mkdir(directory, { recursive: true });
      await symlink("missing.json", path.join(directory, "config.json"));
      expect(await createInitialConfigurationKit(options)).toBeUndefined();
      expect(
        (await lstat(path.join(directory, "config.json"))).isSymbolicLink(),
      ).toBe(true);
      expect(await readdir(directory)).toEqual(["config.json"]);
    },
  );

  it("publishes complete files under concurrent startup and leaves no temporary files", async () => {
    const { options, directory } = await fixture(true);
    expect(
      await Promise.all(
        Array.from({ length: 8 }, () => createInitialConfigurationKit(options)),
      ),
    ).toEqual(Array(8).fill(undefined));
    expect((await loadUserConfiguration(options)).fallback).toBeUndefined();
    expect(await readdir(directory)).toEqual([
      "config.json",
      "snippets.yaml",
      "themes",
    ]);
    expect(await readdir(path.join(directory, "themes"))).toEqual([
      "omtheme.json",
    ]);
  });

  it("keeps startup usable with a nonblocking notice when creation fails", async () => {
    const { options, directory } = await fixture();
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "themes"), "not a directory");
    const result = await startWithUserConfiguration(options, (load) => load);
    expect(result.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
    expect(result.warnings).toEqual([
      expect.stringContaining("could not create"),
    ]);
  });

  it("ordinary reload does not create the kit", async () => {
    const { options, directory } = await fixture();
    await loadUserConfiguration(options);
    await expect(lstat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
