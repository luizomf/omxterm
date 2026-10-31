import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { registerWindowActionDelivery } from "../../src/main/window-action-delivery";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import { translatorFor } from "../../src/shared/i18n";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import {
  createCoreActionCatalog,
  coreActionForKeyboardInput,
  corePaletteActions,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { coreActionMenuTemplate } from "../../src/main/application-menu";
import { shortcutActionName } from "../../src/renderer/settings/settings-shortcuts";

it("delivers a remapped panel action through native window key routing, not when unbound", () => {
  const invoke = vi.fn();
  const actions = new Proxy({} as TerminalApplicationMenuActions, {
    get: () => invoke,
  });
  let bindings = {
    ...terminalDefaultKeybinds(process.platform),
    toggleAuxiliaryPanel: "Control+Alt+J" as string | null,
  };
  const contents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    isDestroyed: () => false,
  });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  registerWindowActionDelivery(
    window as unknown as BrowserWindow,
    () => createCoreActionCatalog("OMXTerm", actions, bindings),
    createKeybindCapture(process.platform),
    () => undefined,
  );
  const key = {
    type: "keyDown",
    key: "j",
    code: "KeyJ",
    control: true,
    alt: true,
    shift: false,
    meta: false,
  };
  const preventDefault = vi.fn();
  contents.emit("before-input-event", { preventDefault }, key);
  expect(invoke).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
  contents.emit(
    "before-input-event",
    { preventDefault },
    { ...key, type: "keyUp" },
  );
  bindings = { ...bindings, toggleAuxiliaryPanel: null };
  preventDefault.mockClear();
  contents.emit("before-input-event", { preventDefault }, key);
  expect(invoke).toHaveBeenCalledOnce();
  expect(preventDefault).not.toHaveBeenCalled();
});

it.each(["darwin", "linux", "win32"])(
  "keeps the panel action unbound by default and supports remap/null on %s",
  (platform) => {
    const defaults = terminalDefaultKeybinds(platform);
    expect(defaults.toggleAuxiliaryPanel).toBeNull();
    for (const value of [null, "Control+Alt+J"]) {
      const config = validateUserConfiguration(
        { version: 1, keybinds: { toggleAuxiliaryPanel: value } },
        "/synthetic/config.json",
        new Set(["SF Mono"]),
        defaults,
        platform,
      );
      expect(config.keybinds.toggleAuxiliaryPanel).toBe(value);
      expect(config.keybinds.toggleSnippets).toBe(defaults.toggleSnippets);
      const invoke = vi.fn();
      const actions = new Proxy({} as TerminalApplicationMenuActions, {
        get: () => invoke,
      });
      for (const language of ["en-US", "pt-BR"] as const) {
        const { t } = translatorFor(language);
        const catalog = createCoreActionCatalog(
          "OMXTerm",
          actions,
          config.keybinds,
          t,
        );
        const action = catalog.toggleAuxiliaryPanel;
        expect(action.label).toBe(t("menu.toggleAuxiliaryPanel"));
        expect(shortcutActionName("toggleAuxiliaryPanel", t)).toBe(
          action.label,
        );
        expect(corePaletteActions(catalog)).toContain(action);
        const view = coreActionMenuTemplate("OMXTerm", catalog, t).find(
          (item) => item.label === t("menu.view"),
        )!;
        if (!Array.isArray(view.submenu)) throw new Error("Missing View menu");
        const item = view.submenu.find(
          (candidate) => candidate.label === action.label,
        )!;
        expect(item.click).toBe(action.invoke);
        expect(item.accelerator ?? null).toBe(value);
        const match = coreActionForKeyboardInput(
          catalog,
          {
            key: "j",
            code: "KeyJ",
            control: true,
            alt: true,
            meta: false,
            shift: false,
          },
          platform,
        );
        expect(match).toBe(value === null ? undefined : action);
        action.invoke();
      }
      expect(invoke).toHaveBeenCalledTimes(2);
    }
    expect(() =>
      validateUserConfiguration(
        {
          version: 1,
          keybinds: { toggleAuxiliaryPanel: defaults.toggleSnippets },
        },
        "/synthetic/config.json",
        new Set(["SF Mono"]),
        defaults,
        platform,
      ),
    ).toThrow("conflicts");
  },
);
