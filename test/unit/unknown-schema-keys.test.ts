import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTerminalSnippets } from "../../src/main/snippets";
import { validateTerminalTheme } from "../../src/main/terminal-theme";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
} from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

const canary = "PRIVATE-UNKNOWN-VALUE";
const variants = [
  { name: "valid control", keys: [] },
  { name: "ordinary unknown", keys: ["typo"] },
  { name: "empty alone", keys: [""] },
  { name: "empty before unknown", keys: ["", "typo"] },
  { name: "empty after unknown", keys: ["typo", ""] },
  { name: "escaped unknown before empty", keys: ['line\n"break', ""] },
];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-unknown-keys-"));
  roots.push(root);
  const directory = path.join(root, "omxterm");
  await mkdir(directory);
  const configurationPath = path.join(directory, "config.json");
  const themePath = path.join(directory, "theme.json");
  const snippetsPath = path.join(directory, "snippets.json");
  const options = {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  const load = () => loadUserConfiguration(options);
  const theme = {
    ...DEFAULT_TERMINAL_THEME,
    name: "selected-theme",
    colors: { ...DEFAULT_TERMINAL_THEME.colors, background: "#123456" },
  };
  await writeFile(themePath, JSON.stringify(theme));
  await writeFile(
    configurationPath,
    JSON.stringify({
      version: 1,
      font: { size: 20 },
      theme: { path: "theme.json" },
    }),
  );
  const initial = await load();
  expect(initial.fallback).toBeUndefined();
  const apply = vi.fn();
  const write = vi.fn(() => true);
  const setLevel = vi.fn();
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initial.configuration, userFileErrors: [] },
    load,
    apply,
    operationalEvents: { write, setLevel },
  });
  return {
    configurationPath,
    themePath,
    snippetsPath,
    options,
    load,
    theme,
    initial,
    apply,
    write,
    setLevel,
    reloader,
  };
}

function addKeys(object: Record<string, unknown>, keys: string[]) {
  for (const key of keys) object[key] = canary;
}

async function assertReload(
  f: Awaited<ReturnType<typeof fixture>>,
  invalid: boolean,
) {
  await f.reloader.reload();
  expect(f.apply).toHaveBeenCalledExactlyOnceWith(
    f.reloader.current(),
    !invalid,
  );
  if (invalid) {
    expect(f.reloader.current().configuration).toBe(f.initial.configuration);
    expect(f.reloader.current().userFileErrors).toEqual([
      expect.stringContaining("is unknown"),
    ]);
    expect(f.setLevel).not.toHaveBeenCalled();
    const events = JSON.stringify(f.write.mock.calls);
    expect(events).toContain("configuration.reload.rejected");
    for (const privateValue of [
      canary,
      f.configurationPath,
      f.themePath,
      "typo",
      "line",
    ]) {
      expect(events).not.toContain(privateValue);
    }
  } else {
    expect(f.reloader.current().configuration.fontSize).toBe(24);
    expect(f.reloader.current().userFileErrors).toEqual([]);
  }
}

const configurationObjects = [
  "$",
  "font",
  "terminal",
  "terminal.padding",
  "scrollback",
  "keyboard",
  "window",
  "theme",
  "keybinds",
];

describe.each(configurationObjects)(
  "configuration unknown keys at %s",
  (location) => {
    it.each(variants)("$name: startup and atomic reload", async ({ keys }) => {
      const f = await fixture();
      const document = {
        version: 1,
        confirmClose: false,
        logLevel: "debug",
        font: { size: 24 },
        terminal: { padding: { left: 12 } },
        scrollback: { lines: 17 },
        keyboard: { optionAsAlt: "left" },
        window: { alwaysOnTop: true },
        theme: { path: "theme.json" },
        keybinds: {},
      };
      let target: Record<string, unknown> = document;
      if (location !== "$") {
        for (const part of location.split("."))
          target = target[part] as Record<string, unknown>;
      }
      addKeys(target, keys);
      const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
      await writeFile(f.configurationPath, bytes);
      const themeBytes = await readFile(f.themePath);
      const loaded = await f.load();
      if (keys.length > 0) {
        expect(loaded.fallback).toMatchObject({
          surface: "configuration",
          error: { location: `${location}.${keys[0]}`, reason: "is unknown" },
        });
        expect(loaded.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
        expect(loaded.fallback?.error.message).toContain(
          JSON.stringify(`${location}.${keys[0]}`),
        );
        expect(loaded.fallback?.error.message).not.toContain(canary);
      } else {
        expect(loaded.fallback).toBeUndefined();
        expect(loaded.configuration).toMatchObject({
          fontSize: 24,
          confirmClose: false,
          logLevel: "debug",
          terminalTheme: f.theme,
        });
      }
      await assertReload(f, keys.length > 0);
      expect(await readFile(f.configurationPath)).toEqual(bytes);
      expect(await readFile(f.themePath)).toEqual(themeBytes);
    });
  },
);

describe.each(["$", "colors"])("theme unknown keys at %s", (location) => {
  it.each(variants)(
    "$name: validation, startup fallback and atomic reload",
    async ({ keys }) => {
      const f = await fixture();
      const document = structuredClone(f.theme);
      addKeys(location === "$" ? document : document.colors, keys);
      const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
      await writeFile(f.themePath, bytes);
      const configurationBytes = Buffer.from(
        JSON.stringify({
          version: 1,
          font: { size: 24 },
          theme: { path: "theme.json" },
        }),
      );
      await writeFile(f.configurationPath, configurationBytes);
      const loaded = await f.load();
      if (keys.length > 0) {
        expect(() => validateTerminalTheme(document, f.themePath)).toThrow(
          expect.objectContaining({
            location: `${location}.${keys[0]}`,
            reason: "is unknown",
          }),
        );
        expect(loaded.fallback?.surface).toBe("theme");
        expect(loaded.configuration).toEqual({
          ...DEFAULT_USER_CONFIGURATION,
          fontSize: 24,
        });
        expect(loaded.fallback?.error.message).not.toContain(canary);
      } else {
        expect(validateTerminalTheme(document, f.themePath)).toEqual(f.theme);
        expect(loaded.fallback).toBeUndefined();
        expect(loaded.configuration.terminalTheme).toEqual(f.theme);
      }
      await assertReload(f, keys.length > 0);
      expect(await readFile(f.configurationPath)).toEqual(configurationBytes);
      expect(await readFile(f.themePath)).toEqual(bytes);
    },
  );
});

describe.each(["$", "snippets[1]"])(
  "snippet unknown keys at %s",
  (location) => {
    it.each(variants)(
      "$name: rejects the entire list without rewriting",
      async ({ keys }) => {
        const f = await fixture();
        const entry = {
          name: "second",
          body: "PRIVATE-SNIPPET-BODY",
          execute: true,
        };
        const document = {
          version: 1,
          snippets: [{ name: "first", body: "first body" }, entry],
        };
        addKeys(location === "$" ? document : entry, keys);
        const bytes = Buffer.from(`${JSON.stringify(document, null, 2)}\n`);
        await writeFile(f.snippetsPath, bytes);
        const loaded = await loadTerminalSnippets(f.options);
        if (keys.length > 0) {
          expect(loaded.snippets).toEqual([]);
          expect(loaded.error).toContain(f.snippetsPath);
          expect(loaded.error).toContain(
            JSON.stringify(`${location}.${keys[0]}`),
          );
          expect(loaded.error).toContain("is unknown");
          expect(loaded.error).toContain("reopen the Snippets Sidebar");
          expect(loaded.error).not.toContain(canary);
          expect(loaded.error).not.toContain(entry.body);
        } else {
          expect(loaded).toEqual({
            snippets: [
              { name: "first", body: "first body", execute: false },
              entry,
            ],
          });
        }
        expect(await readFile(f.snippetsPath)).toEqual(bytes);
      },
    );
  },
);

it.each([
  '{ "version": 1, "typo": true, "font": { "size": 24 } }',
  '{ "version": 1, "": true, "typo": true, "font": { "size": 24 } }',
])("rejects the exact reported configuration: %s", async (bytes) => {
  const f = await fixture();
  await writeFile(f.configurationPath, bytes);
  const loaded = await f.load();
  expect(loaded.fallback?.surface).toBe("configuration");
  expect(loaded.configuration).toEqual(DEFAULT_USER_CONFIGURATION);
  expect(await readFile(f.configurationPath, "utf8")).toBe(bytes);
});

it.each(["configuration root", "configuration font", "theme colors"])(
  "retains the last valid snapshot on an empty-key reload: %s",
  async (target) => {
    const f = await fixture();
    const unknown = { "": canary, typo: canary };
    const document = {
      version: 1,
      font: { size: 24, ...(target === "configuration font" ? unknown : {}) },
      theme: { path: "theme.json" },
      ...(target === "configuration root" ? unknown : {}),
    };
    const configurationBytes = JSON.stringify(document);
    const themeBytes = JSON.stringify({
      ...f.theme,
      colors: {
        ...f.theme.colors,
        ...(target === "theme colors" ? unknown : {}),
      },
    });
    await writeFile(f.configurationPath, configurationBytes);
    await writeFile(f.themePath, themeBytes);
    await assertReload(f, true);
    expect(await readFile(f.configurationPath, "utf8")).toBe(
      configurationBytes,
    );
    expect(await readFile(f.themePath, "utf8")).toBe(themeBytes);
  },
);

it.each(variants)("empty snippet array root: $name", async ({ keys }) => {
  const f = await fixture();
  const document = { version: 1, snippets: [] };
  addKeys(document, keys);
  const bytes = JSON.stringify(document);
  await writeFile(f.snippetsPath, bytes);
  const loaded = await loadTerminalSnippets(f.options);
  expect(loaded.snippets).toEqual([]);
  if (keys.length > 0) expect(loaded.error).toContain("is unknown");
  else expect(loaded.error).toBeUndefined();
  expect(await readFile(f.snippetsPath, "utf8")).toBe(bytes);
});
