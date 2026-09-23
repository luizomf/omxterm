import { execFileSync, spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { loadTerminalSnippets } from "../../src/main/snippets";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

const root = fileURLToPath(new URL("../../docs/quick-start/", import.meta.url));
const platforms = [
  { name: "macos", runtime: "darwin" },
  { name: "linux", runtime: "linux" },
  { name: "windows", runtime: "win32" },
] as const;

async function fakeHome() {
  const home = await mkdtemp(path.join(tmpdir(), "omxterm-quick-start-"));
  onTestFinished(async () => rm(home, { recursive: true, force: true }));
  return home;
}

async function installExamples(platform: string, configRoot: string) {
  const destination = path.join(configRoot, "omxterm");
  await mkdir(destination, { recursive: true });
  await cp(
    path.join(root, "files", platform, "config.json"),
    path.join(destination, "config.json"),
  );
  await cp(
    path.join(root, "files", platform, "snippets.json"),
    path.join(destination, "snippets.json"),
  );
  await mkdir(path.join(destination, "themes"));
  await cp(
    path.join(root, "files", platform, "themes", "omtheme.json"),
    path.join(destination, "themes", "omtheme.json"),
  );
  return destination;
}

describe("checked-in platform quick starts", () => {
  it.each(platforms)(
    "loads $name configuration, external theme and all seven snippets through the real loaders",
    async ({ name, runtime }) => {
      const home = await fakeHome();
      const xdg = path.join(home, "selected-xdg");
      const destination = await installExamples(name, xdg);
      const configText = await readFile(
        path.join(destination, "config.json"),
        "utf8",
      );
      const source = JSON.parse(configText) as {
        font: { family?: string };
        theme: { path: string };
        keybinds: Record<string, string>;
        windowsShell?: string;
        terminal: { padding: { top: number } };
      };
      const loaded = await loadUserConfiguration({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
        platform: runtime,
        getInstalledFontFamilyMetrics: async () => {
          throw new Error("examples must use bundled fonts");
        },
        // The Windows path cannot exist on this host; inspect a real fixture file.
        inspectWindowsShell: (async () =>
          stat(
            path.join(root, "files", name, "config.json"),
          )) as unknown as typeof stat,
      });
      expect(loaded.fallback).toBeUndefined();
      expect(loaded.warnings).toBeUndefined();
      expect(source.font.family).toBeUndefined();
      expect(source.theme.path).toBe("./themes/omtheme.json");
      expect(loaded.selectedTerminalThemePath).toBe(
        path.join(destination, "themes", "omtheme.json"),
      );
      expect(loaded.configuration.terminalTheme).toEqual(
        DEFAULT_TERMINAL_THEME,
      );
      expect(loaded.configuration.fontFamily).toBeUndefined();
      expect(source.terminal.padding.top).toBe(0);
      expect(source.keybinds).toEqual(terminalDefaultKeybinds(runtime));
      expect(loaded.configuration.keybinds).toEqual(
        terminalDefaultKeybinds(runtime),
      );
      expect(source.windowsShell).toBe(
        name === "windows"
          ? "C:\\Program Files\\Git\\bin\\bash.exe"
          : undefined,
      );
      const snippets = await loadTerminalSnippets({
        environment: { XDG_CONFIG_HOME: xdg },
        homeDirectory: home,
      });
      expect(snippets.error).toBeUndefined();
      expect(snippets.snippets).toHaveLength(7);
      for (const snippet of snippets.snippets) {
        expect(snippet.body).toMatch(/^ [^\r\n]+$/);
        expect(snippet.execute).toBe(false);
      }
      expect(snippets.snippets.at(-1)?.body).toContain("{0..255}");
    },
  );

  it.each(["macos", "linux"])(
    "copies $name instructions into a fake XDG home with recoverable backups and no directory/symlink clobber",
    async (platform) => {
      const home = await fakeHome();
      const xdg = path.join(home, "xdg space");
      const destination = path.join(xdg, "omxterm");
      await mkdir(destination, { recursive: true });
      await writeFile(path.join(destination, "config.json"), "old preferences");
      const guide = await readFile(path.join(root, `${platform}.md`), "utf8");
      const script = guide.match(/```(?:sh|bash)\n(example=.*?)\n```/s)?.[1];
      expect(script).toBeDefined();
      const command = script!.replace(
        /^example=.*$/m,
        `example="${path.join(root, "files", platform)}"`,
      );
      const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg };
      const output = execFileSync("bash", ["-c", command], {
        env,
        encoding: "utf8",
      });
      const backup = output.match(
        /Backup \(including only files that already existed\): (.+)/,
      )?.[1];
      expect(backup).toBeDefined();
      expect(await readFile(path.join(backup!, "config.json"), "utf8")).toBe(
        "old preferences",
      );
      expect(
        await readFile(path.join(destination, "config.json"), "utf8"),
      ).toContain('"version": 1');
      const isolatedHome = await fakeHome();
      const isolatedXdg = path.join(isolatedHome, "xdg");
      const isolatedDestination = path.join(isolatedXdg, "omxterm");
      await mkdir(isolatedDestination, { recursive: true });
      await writeFile(path.join(isolatedHome, "original"), "untouched");
      await symlink(
        path.join(isolatedHome, "original"),
        path.join(isolatedDestination, "snippets.json"),
      );
      const refused = spawnSync("bash", ["-c", command], {
        env: {
          ...process.env,
          HOME: isolatedHome,
          XDG_CONFIG_HOME: isolatedXdg,
        },
        encoding: "utf8",
      });
      expect(refused.status).toBe(1);
      expect(refused.stdout).toContain("Refusing");
      expect(
        await readlink(path.join(isolatedDestination, "snippets.json")),
      ).toBe(path.join(isolatedHome, "original"));
      expect(await readFile(path.join(isolatedHome, "original"), "utf8")).toBe(
        "untouched",
      );
    },
  );
});
