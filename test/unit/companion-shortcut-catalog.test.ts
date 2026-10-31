import { expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import {
  createCoreActionCatalog,
  coreActionKeybinds,
  corePaletteActions,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { coreActionMenuTemplate } from "../../src/main/application-menu";
import { companionToolShortcut } from "../../src/main/extension-presentation";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { translatorFor } from "../../src/shared/i18n";
import { shortcutActionName } from "../../src/renderer/settings/settings-shortcuts";

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
    label: "Toggle Files",
    pt: "Alternar Files",
  },
  {
    id: "omxterm.ssh",
    action: "toggleSshConnect",
    title: "SSH Connect",
    label: "Toggle SSH Connect",
    pt: "Alternar SSH Connect",
  },
] as const;

it.each(tools)(
  "projects $id once with its captured callback and nullable core binding",
  (tool) => {
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
        for (const language of ["en-US", "pt-BR"] as const) {
          const { t } = translatorFor(language);
          expect(shortcutActionName(tool.action, t)).toBe(
            language === "en-US" ? tool.label : tool.pt,
          );
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
    }
    expect(invoke).toHaveBeenCalledTimes(12);
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
