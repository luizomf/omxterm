import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverSettingsThemes,
  MAX_SETTINGS_THEME_DIRECTORY_ENTRIES,
  MAX_SETTINGS_THEME_FILE_BYTES,
} from "../../src/main/settings-themes";
import {
  createSettingsService,
  nodeSettingsFiles,
} from "../../src/main/settings-service";
import {
  MAX_SETTINGS_THEMES,
  SETTINGS_THEME_COLOR_KEYS,
} from "../../src/shared/settings-themes";
import { MAX_SETTINGS_TEXT_LENGTH } from "../../src/shared/settings";
import { TERMINAL_THEME_COLOR_KEYS } from "../../src/shared/terminal-theme";

const roots: string[] = [];
const colors = Object.fromEntries(
  TERMINAL_THEME_COLOR_KEYS.map((key, index) => [
    key,
    `#${(index + 1).toString(16).padStart(6, "0")}`,
  ]),
);
const theme = (name = "Synthetic") =>
  JSON.stringify({ version: 1, name, colors });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-theme-discovery-"));
  roots.push(root);
  const directory = path.join(root, "config", "omxterm");
  const config = path.join(directory, "config.json");
  const themes = path.join(directory, "themes");
  const service = createSettingsService({
    loadOptions: {
      environment: { XDG_CONFIG_HOME: path.dirname(directory) },
      homeDirectory: root,
      platform: "linux",
      getInstalledFontFamilyMetrics: async () => undefined,
    },
    reload: async () => ({ applied: true, notices: [] }),
  });
  return { root, directory, config, themes, service };
}

const configText = (value?: string) =>
  JSON.stringify({
    version: 1,
    ...(value === undefined ? {} : { theme: { path: value } }),
  });

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("bounded settings theme discovery", () => {
  it("distinguishes a missing directory, an empty directory and an unavailable one without creating files", async () => {
    const f = await fixture();
    expect(await discoverSettingsThemes(f.config)).toEqual({
      status: "missing",
      themes: [],
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
    });
    await mkdir(f.themes, { recursive: true });
    expect(await f.service.themes()).toEqual({
      status: "ok",
      themes: [],
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
    });
    await rm(f.themes, { recursive: true });
    await writeFile(f.themes, "not a directory");
    expect(await f.service.themes()).toEqual({
      status: "unavailable",
      themes: [],
      invalid: [],
      truncated: false,
      hasConfiguredTheme: false,
    });
  });

  it("keeps linked config and linked themes logical, matching paths instead of names or link targets", async () => {
    const f = await fixture();
    const managed = path.join(f.root, "managed");
    const paletteDir = path.join(f.root, "palettes");
    await mkdir(f.directory, { recursive: true });
    await mkdir(managed);
    await mkdir(paletteDir);
    await writeFile(path.join(paletteDir, "original.json"), theme("Same name"));
    await symlink(
      path.relative(managed, path.join(paletteDir, "original.json")),
      path.join(managed, "first.json"),
      "file",
    );
    await symlink(
      path.relative(managed, path.join(paletteDir, "original.json")),
      path.join(managed, "second.json"),
      "file",
    );
    await symlink(path.relative(f.directory, managed), f.themes, "dir");
    const target = path.join(f.root, "linked-config.json");
    await writeFile(target, configText("./themes/unused/../second.json"));
    await symlink(path.relative(f.directory, target), f.config, "file");

    const result = await f.service.themes();
    expect(result).toMatchObject({
      status: "ok",
      invalid: [],
      truncated: false,
      selectedPath: "themes/second.json",
    });
    expect(result.themes.map(({ path: value, name }) => [value, name])).toEqual(
      [
        ["themes/first.json", "Same name"],
        ["themes/second.json", "Same name"],
      ],
    );
    expect(Object.keys(result.themes[0]!.colors)).toEqual([
      ...SETTINGS_THEME_COLOR_KEYS,
    ]);
    expect(result.themes[0]!.colors.background).toBe(colors.background);

    await writeFile(target, configText(path.join(f.themes, "first.json")));
    expect((await f.service.themes()).selectedPath).toBe("themes/first.json");
    await mkdir(path.join(managed, "ordinary"));
    await writeFile(target, configText(`${f.themes}/ordinary/../first.json`));
    expect((await f.service.themes()).selectedPath).toBe("themes/first.json");
    await writeFile(target, configText(`${f.themes}/missing/../first.json`));
    expect((await f.service.themes()).selectedPath).toBeUndefined();
    const elsewhere = path.join(f.root, "elsewhere");
    await mkdir(path.join(elsewhere, "subdir"), { recursive: true });
    await writeFile(path.join(elsewhere, "first.json"), theme("Different"));
    await symlink(
      path.join(elsewhere, "subdir"),
      path.join(managed, "escape"),
      "dir",
    );
    await writeFile(target, configText(`${f.themes}/escape/../first.json`));
    expect((await f.service.themes()).selectedPath).toBeUndefined();
    await writeFile(target, configText(`${f.themes}/first.json/`));
    expect((await f.service.themes()).selectedPath).toBeUndefined();
    // The physical target is an alias, not the logical path of either entry.
    await writeFile(target, configText(path.join(paletteDir, "original.json")));
    expect((await f.service.themes()).selectedPath).toBeUndefined();
    await writeFile(target, configText());
    expect((await f.service.themes()).selectedPath).toBeUndefined();
    expect(await readFile(path.join(paletteDir, "original.json"), "utf8")).toBe(
      theme("Same name"),
    );
  });

  it("reports unreadable, invalid, oversized and non-regular candidates with safe reasons", async () => {
    const f = await fixture();
    await mkdir(f.themes, { recursive: true });
    await writeFile(f.config, configText("themes/invalid.json"));
    await writeFile(path.join(f.themes, "good.json"), theme());
    await writeFile(path.join(f.themes, "invalid.json"), "{");
    await writeFile(path.join(f.themes, "bad-utf8.json"), Buffer.from([0xff]));
    await writeFile(
      path.join(f.themes, "oversized.json"),
      Buffer.alloc(MAX_SETTINGS_THEME_FILE_BYTES + 1, 0x20),
    );
    await writeFile(path.join(f.themes, "bad-name.json"), theme("bad\nname"));
    await writeFile(
      path.join(f.themes, "unknown.json"),
      JSON.stringify({
        version: 1,
        name: "fine",
        colors,
        ["secret\n" + "x".repeat(500)]: true,
      }),
    );
    await writeFile(
      path.join(f.themes, "incomplete.json"),
      JSON.stringify({
        version: 1,
        name: "fine",
        colors: { ...colors, red: "red" },
      }),
    );
    await mkdir(path.join(f.themes, "directory.json"));
    await symlink("missing-target", path.join(f.themes, "broken.json"), "file");
    await mkdir(path.join(f.themes, "nested"));
    await writeFile(path.join(f.themes, "nested", "hidden.json"), theme());
    await writeFile(path.join(f.themes, "ignored.txt"), theme());

    const result = await f.service.themes();
    expect(result.status).toBe("ok");
    expect(result.themes.map((value) => value.path)).toEqual([
      "themes/good.json",
    ]);
    expect(result.selectedPath).toBeUndefined();
    const reasons = Object.fromEntries(
      result.invalid.map((value) => [value.path, value]),
    );
    expect(reasons["themes/invalid.json"]?.detail).toContain("valid JSON");
    expect(reasons["themes/bad-utf8.json"]?.detail).toContain("UTF-8");
    expect(reasons["themes/oversized.json"]?.reason).toBe("size");
    expect(reasons["themes/bad-name.json"]?.detail).toContain("name");
    expect(reasons["themes/incomplete.json"]?.detail).toContain("colors.red");
    expect(reasons["themes/directory.json"]?.reason).toBe("type");
    expect(reasons["themes/broken.json"]?.reason).toBe("read");
    expect(reasons["themes/unknown.json"]?.reason).toBe("unknown");
    expect(result.invalid).toHaveLength(8);
    for (const { detail = "" } of result.invalid) {
      expect(detail.length).toBeLessThanOrEqual(256);
      expect(detail).not.toMatch(/[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u);
      expect(detail).not.toContain(f.root);
      expect(detail).not.toContain("secret");
    }
  });

  it("makes failed configuration or broken directory links unavailable rather than guessing the default", async () => {
    const f = await fixture();
    await mkdir(f.directory, { recursive: true });
    await writeFile(f.config, "{ invalid");
    await mkdir(f.themes);
    expect((await f.service.themes()).status).toBe("unavailable");
    await rm(f.config);
    await symlink("absent-config", f.config, "file");
    expect((await f.service.themes()).status).toBe("unavailable");
    await rm(f.config);
    await rm(f.themes, { recursive: true });
    await symlink("absent-themes", f.themes, "dir");
    expect((await f.service.themes()).status).toBe("unavailable");
  });

  it("offers valid files when a parsed theme field is invalid and can be repaired", async () => {
    const f = await fixture();
    await mkdir(f.themes, { recursive: true });
    await writeFile(f.config, JSON.stringify({ version: 1, theme: {} }));
    await writeFile(path.join(f.themes, "good.json"), theme());
    const result = await f.service.themes();
    expect(result.status).toBe("ok");
    expect(result.hasConfiguredTheme).toBe(true);
    expect(result.themes.map((item) => item.path)).toEqual([
      "themes/good.json",
    ]);
    expect(
      (
        await f.service.change({
          path: "theme.path",
          value: "themes/good.json",
        })
      ).status,
    ).toBe("saved");
  });

  it.skipIf(process.platform !== "darwin")(
    "matches OS-equivalent names without conflating separate symlinks",
    async () => {
      const f = await fixture();
      await mkdir(f.themes, { recursive: true });
      await writeFile(path.join(f.themes, "café.json"), theme());
      // This only asserts case/Unicode equivalence on a volume that actually has it.
      try {
        await readFile(path.join(f.directory, "THEMES", "CAFE\u0301.JSON"));
      } catch {
        return;
      }
      await symlink("café.json", path.join(f.themes, "alias.json"), "file");
      await writeFile(f.config, configText("THEMES/CAFE\u0301.JSON"));
      expect((await f.service.themes()).selectedPath?.normalize("NFC")).toBe(
        "themes/café.json",
      );
      await writeFile(f.config, configText("themes/ALIAS.JSON"));
      expect((await f.service.themes()).selectedPath).toBe("themes/alias.json");
      await writeFile(f.config, configText(path.join(f.themes, "café.json")));
      expect((await f.service.themes()).selectedPath?.normalize("NFC")).toBe(
        "themes/café.json",
      );
    },
  );
});

describe("bounded discovery limits and ordering", () => {
  it("does not read an unbounded configuration document", async () => {
    const f = await fixture();
    await mkdir(f.themes, { recursive: true });
    await writeFile(
      f.config,
      Buffer.alloc(4 * MAX_SETTINGS_TEXT_LENGTH + 1, 0x20),
    );
    await writeFile(path.join(f.themes, "good.json"), theme());
    expect(await f.service.themes()).toEqual({
      status: "unavailable",
      themes: [],
      invalid: [],
      truncated: false,
    });
  });

  it("bounds candidate count and announces truncation", async () => {
    const f = await fixture();
    await mkdir(f.themes, { recursive: true });
    await Promise.all(
      Array.from({ length: MAX_SETTINGS_THEMES + 1 }, (_, index) =>
        writeFile(path.join(f.themes, `${index}.json`), theme()),
      ),
    );
    const result = await f.service.themes();
    expect(result.status).toBe("ok");
    expect(result.themes).toHaveLength(MAX_SETTINGS_THEMES);
    expect(result.invalid).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it("bounds scanning even when the directory has no matching files", async () => {
    const f = await fixture();
    await mkdir(f.themes, { recursive: true });
    for (
      let batch = 0;
      batch < MAX_SETTINGS_THEME_DIRECTORY_ENTRIES + 1;
      batch += 128
    ) {
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              128,
              MAX_SETTINGS_THEME_DIRECTORY_ENTRIES + 1 - batch,
            ),
          },
          (_, offset) =>
            writeFile(path.join(f.themes, `${batch + offset}.txt`), ""),
        ),
      );
    }
    expect(await f.service.themes()).toEqual({
      status: "ok",
      themes: [],
      invalid: [],
      truncated: true,
      hasConfiguredTheme: false,
    });
  });

  it.skipIf(process.platform === "win32")(
    "does not block on FIFOs or open an arbitrary configured theme",
    async () => {
      const f = await fixture();
      await mkdir(f.themes, { recursive: true });
      const fifo = path.join(f.root, "outside-fifo");
      execFileSync("mkfifo", [fifo]);
      await symlink(fifo, path.join(f.themes, "fifo.json"), "file");
      await writeFile(f.config, configText(fifo));
      await writeFile(path.join(f.themes, "good.json"), theme());
      const result = await f.service.themes();
      expect(result.status).toBe("ok");
      expect(result.themes.map((value) => value.path)).toEqual([
        "themes/good.json",
      ]);
      expect(result.invalid).toEqual([
        { path: "themes/fifo.json", reason: "type" },
      ]);
      expect(result.selectedPath).toBeUndefined();
    },
    5_000,
  );

  it("serializes discovery after a pending Settings write and its reload", async () => {
    const f = await fixture();
    await mkdir(f.themes, { recursive: true });
    await writeFile(f.config, configText());
    await writeFile(path.join(f.themes, "chosen.json"), theme());
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const reload = vi.fn(async () => {
      entered();
      await blocked;
      return { applied: true as const, notices: [] };
    });
    const service = createSettingsService({
      loadOptions: {
        environment: { XDG_CONFIG_HOME: path.dirname(f.directory) },
        homeDirectory: f.root,
        platform: "linux",
        getInstalledFontFamilyMetrics: async () => undefined,
      },
      files: nodeSettingsFiles,
      reload,
    });
    const save = service.change({
      path: "theme.path",
      value: "themes/chosen.json",
    });
    await started;
    let settled = false;
    const discovery = service.themes().then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    expect((await save).status).toBe("saved");
    expect((await discovery).selectedPath).toBe("themes/chosen.json");
    expect(reload).toHaveBeenCalledOnce();
  });
});
