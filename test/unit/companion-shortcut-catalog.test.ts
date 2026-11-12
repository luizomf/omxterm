import { expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import {
  createCoreActionCatalog,
  coreActionForKeyboardInput,
  coreActionKeybinds,
  corePaletteActions,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { coreActionMenuTemplate } from "../../src/main/application-menu";
import { companionToolShortcut } from "../../src/main/extension-presentation";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { translatorFor } from "../../src/shared/i18n";

function flatten(
  items: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}
const tools = [
  {
    id: "omxterm.files",
    action: "toggleFiles",
    title: "Files",
  },
  {
    id: "omxterm.ssh",
    action: "toggleSshConnect",
    title: "SSH Connect",
  },
] as const;

it.each(tools)(
  "projects $id once with its captured callback and nullable core binding",
  (tool) => {
    const { t } = translatorFor("en-US");
    const invoke = vi.fn();
    const metadata = {
      id: tool.id,
      view: {
        action: `${tool.id}.open`,
        title: tool.title,
        entry: "index.html",
      },
    };
    expect(companionToolShortcut(metadata)).toBe(tool.action);
    for (const platform of ["darwin", "linux", "win32"]) {
      const defaults = terminalDefaultKeybinds(platform);
      expect(defaults[tool.action]).toBeNull();
      for (const value of [null, "Control+Alt+J"]) {
        const configured = validateUserConfiguration(
          { version: 1, keybinds: { [tool.action]: value } },
          "/synthetic/config.json",
          new Set(["SF Mono"]),
          defaults,
          platform,
        ).keybinds;
        expect(configured.toggleSnippets).toBe(defaults.toggleSnippets);
        expect(configured.toggleAuxiliaryPanel).toBeNull();
        const catalog = createCoreActionCatalog(
          "OMXTerm",
          new Proxy({} as TerminalApplicationMenuActions, {
            get: () => vi.fn(),
          }),
          configured,
          t,
          [
            {
              id: metadata.view.action,
              shortcut: tool.action,
              extension: true,
              label: tool.title,
              accelerator: "F9",
              palette: true,
              invoke,
            },
          ],
        );
        const projected = catalog[tool.action];
        expect(projected.invoke).toBe(invoke);
        expect(projected.label).toBe(tool.title);
        expect(projected.accelerator).toBe(value);
        expect(catalog[metadata.view.action]).toBeUndefined();
        expect(coreActionKeybinds(catalog)[tool.action]).toBe(value);
        expect(
          corePaletteActions(catalog).filter(
            (entry) => entry.invoke === invoke,
          ),
        ).toEqual([projected]);
        const items = flatten(
          coreActionMenuTemplate("OMXTerm", catalog, t),
        ).filter((entry) => entry.click === invoke);
        expect(items).toHaveLength(1);
        expect(items[0]?.label).toBe(tool.title);
        expect(items[0]?.accelerator ?? null).toBe(value);
        projected.invoke();
      }
    }
    expect(invoke).toHaveBeenCalledTimes(6);
  },
);

it("retains absent-tool configuration and collision validation without runtime actions", () => {
  const defaults = terminalDefaultKeybinds("linux");
  const configured = validateUserConfiguration(
    {
      version: 1,
      keybinds: {
        toggleFiles: "Control+Alt+J",
        toggleSshConnect: "Control+Alt+K",
      },
    },
    "/synthetic/config.json",
    new Set(["SF Mono"]),
    defaults,
    "linux",
  ).keybinds;
  const catalog = createCoreActionCatalog(
    "OMXTerm",
    new Proxy({} as TerminalApplicationMenuActions, { get: () => vi.fn() }),
    configured,
  );
  expect(configured.toggleFiles).toBe("Control+Alt+J");
  expect(configured.toggleSshConnect).toBe("Control+Alt+K");
  for (const tool of tools) {
    expect(coreActionKeybinds(catalog)[tool.action]).toBeNull();
    expect(corePaletteActions(catalog)).not.toContain(catalog[tool.action]);
    expect(
      flatten(coreActionMenuTemplate("OMXTerm", catalog)).some(
        (entry) => entry.click === catalog[tool.action].invoke,
      ),
    ).toBe(false);
  }
  for (const binding of [defaults.toggleSnippets, "Control+Alt+K"]) {
    expect(() =>
      validateUserConfiguration(
        {
          version: 1,
          keybinds: { toggleFiles: binding, toggleSshConnect: "Control+Alt+K" },
        },
        "/synthetic/config.json",
        new Set(["SF Mono"]),
        defaults,
        "linux",
      ),
    ).toThrow("conflicts");
  }
});

it("does not assign core shortcut slots by title, unrelated package or mismatched action", () => {
  for (const [id, action] of [
    ["example.files", "example.files.open"],
    ["omxterm.files", "omxterm.files.other"],
    ["example.ssh", "omxterm.ssh.open"],
    ["omxterm.snippets", "omxterm.snippets.open"],
    ["example.mirror", "omxterm.mirror-typing.open"],
    ["omxterm.mirror-typing", "omxterm.mirror-typing.setup"],
  ]) {
    expect(
      companionToolShortcut({
        id: id!,
        view: { action: action!, entry: "index.html", title: "Files" },
      }),
    ).toBeUndefined();
  }
  expect(companionToolShortcut({ id: "omxterm.files" })).toBeUndefined();
});

it.each([
  ["darwin", "CommandOrControl+Shift+M", { meta: true, control: false }],
  ["linux", "Control+Shift+M", { meta: false, control: true }],
  ["win32", "Control+Shift+M", { meta: false, control: true }],
] as const)(
  "makes Mirror Typing's one entry its rebindable toggle on %s",
  (platform, binding, modifiers) => {
    const { t } = translatorFor("en-US");
    const invoke = vi.fn();
    const metadata = {
      id: "omxterm.mirror-typing",
      view: {
        action: "omxterm.mirror-typing.open",
        title: "Mirror Typing",
        entry: "index.html",
      },
    };
    expect(companionToolShortcut(metadata)).toBe("toggleMirrorTyping");
    const defaults = terminalDefaultKeybinds(platform);
    expect(defaults.toggleMirrorTyping).toBe(binding);
    const actions = new Proxy({} as TerminalApplicationMenuActions, {
      get: () => vi.fn(),
    });
    const entry = {
      id: metadata.view.action,
      shortcut: "toggleMirrorTyping" as const,
      extension: true,
      label: "Mirror Typing",
      accelerator: null,
      palette: true,
      invoke,
    };
    const catalog = createCoreActionCatalog("OMXTerm", actions, defaults, t, [
      entry,
    ]);
    const toggle = catalog.toggleMirrorTyping;
    expect(toggle).toMatchObject({ label: "Mirror Typing", invoke });
    expect(toggle.accelerator).toBe(binding);
    expect(catalog[metadata.view.action]).toBeUndefined();
    expect(
      corePaletteActions(catalog).filter((action) => action.invoke === invoke),
    ).toEqual([toggle]);
    const items = flatten(coreActionMenuTemplate("OMXTerm", catalog, t)).filter(
      (item) => item.click === invoke,
    );
    expect(items).toEqual([
      expect.objectContaining({ label: "Mirror Typing", accelerator: binding }),
    ]);
    expect(
      coreActionForKeyboardInput(
        catalog,
        { key: "M", alt: false, shift: true, ...modifiers },
        platform,
      ),
    ).toBe(toggle);
    const rebound = createCoreActionCatalog(
      "OMXTerm",
      actions,
      { ...defaults, toggleMirrorTyping: "Control+Alt+M" },
      t,
      [entry],
    );
    expect(rebound.toggleMirrorTyping.accelerator).toBe("Control+Alt+M");
    // Missing or disabled: no entry, and the key stays with the terminal.
    const absent = createCoreActionCatalog("OMXTerm", actions, defaults, t);
    expect(absent.toggleMirrorTyping.accelerator).toBeNull();
    expect(corePaletteActions(absent)).not.toContain(absent.toggleMirrorTyping);
  },
);

it.each([
  ["darwin", "CommandOrControl+Shift+L", { meta: true, control: false }],
  ["linux", "Control+Shift+L", { meta: false, control: true }],
  ["win32", "Control+Shift+L", { meta: false, control: true }],
] as const)(
  "gives Save layout its own entry beside the Saved Layout page on %s",
  (platform, binding, modifiers) => {
    const { t } = translatorFor("en-US");
    const save = vi.fn();
    const open = vi.fn();
    const defaults = terminalDefaultKeybinds(platform);
    expect(defaults.saveLayout).toBe(binding);
    const actions = new Proxy({} as TerminalApplicationMenuActions, {
      get: () => vi.fn(),
    });
    const entries = [
      {
        id: "omxterm.restoration.save",
        shortcut: "saveLayout" as const,
        extension: true,
        label: "Save Layout",
        accelerator: null,
        palette: true,
        invoke: save,
      },
      {
        id: "omxterm.restoration.open",
        extension: true,
        label: "Saved Layout",
        accelerator: null,
        palette: true,
        invoke: open,
      },
    ];
    const catalog = createCoreActionCatalog(
      "OMXTerm",
      actions,
      defaults,
      t,
      entries,
    );
    expect(catalog.saveLayout).toMatchObject({
      label: "Save Layout",
      invoke: save,
      accelerator: binding,
    });
    // The page keeps its own entry, without a shortcut.
    expect(catalog["omxterm.restoration.open"]).toMatchObject({
      invoke: open,
      accelerator: null,
    });
    const palette = corePaletteActions(catalog);
    expect(palette).toContain(catalog.saveLayout);
    expect(palette).toContain(catalog["omxterm.restoration.open"]);
    expect(
      flatten(coreActionMenuTemplate("OMXTerm", catalog, t))
        .filter((item) => item.click === save || item.click === open)
        .map((item) => item.label),
    ).toEqual(["Saved Layout", "Save Layout"]);
    expect(
      coreActionForKeyboardInput(
        catalog,
        { key: "L", alt: false, shift: true, ...modifiers },
        platform,
      ),
    ).toBe(catalog.saveLayout);
    const absent = createCoreActionCatalog("OMXTerm", actions, defaults, t);
    expect(absent.saveLayout.accelerator).toBeNull();
    expect(corePaletteActions(absent)).not.toContain(absent.saveLayout);
  },
);
