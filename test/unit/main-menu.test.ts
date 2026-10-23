import { describe, expect, it, vi } from "vitest";
import type { IpcMain, MenuItemConstructorOptions } from "electron";
import {
  isMainMenuPosition,
  registerMainMenu,
  terminalMainMenuTemplate,
} from "../../src/main/main-menu";
import type { TerminalApplicationMenuActions } from "../../src/main/application-menu";
import type { IpcEvent } from "../../src/main/terminal-ipc-types";
import { DEFAULT_TERMINAL_KEYBINDS } from "../../src/shared/terminal-keybinds";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { createTranslator } from "../../src/shared/i18n";

// Every action is a distinct spy, so a click can be traced to its action.
function menuActions(): TerminalApplicationMenuActions {
  return new Proxy(
    {},
    {
      get(target: Record<string, unknown>, name: string) {
        target[name] ??= vi.fn();
        return target[name];
      },
    },
  ) as unknown as TerminalApplicationMenuActions;
}

function flatten(
  template: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  return template.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

function byLabel(template: MenuItemConstructorOptions[], label: string) {
  const item = flatten(template).find((candidate) => candidate.label === label);
  if (!item) throw new Error(`No menu item ${label}`);
  return item;
}

describe("header main menu", () => {
  it("translates its items and invokes the application menu actions", () => {
    const actions = menuActions();
    const template = terminalMainMenuTemplate(
      createTranslator("pt-BR"),
      actions,
      DEFAULT_TERMINAL_KEYBINDS,
      { outputHighlighting: true, restoreWorkspace: false },
    );
    const click = (label: string) =>
      (byLabel(template, label).click as () => void)();

    click("Nova Janela");
    expect(actions.newWindow).toHaveBeenCalledOnce();
    click("Paleta de Comandos…");
    expect(actions.toggleSelectedCommandPalette).toHaveBeenCalledOnce();
    click("Dividir à Direita");
    expect(actions.splitSelectedPane).toHaveBeenCalledWith("right");
    click("Fazer Backup das Configurações…");
    expect(actions.backUpSettings).toHaveBeenCalledOnce();
    expect(byLabel(template, "Destacar Saída").checked).toBe(true);
    expect(byLabel(template, "Restaurar Janelas ao Iniciar").checked).toBe(
      false,
    );
    click("Sobre o OMXTerm");
    expect(actions.showAbout).toHaveBeenCalledOnce();
    expect(byLabel(template, "Sobre o OMXTerm").accelerator).toBe(
      DEFAULT_TERMINAL_KEYBINDS.about,
    );
    expect(byLabel(template, "Nova Aba").accelerator).toBe(
      DEFAULT_TERMINAL_KEYBINDS.newTab,
    );
  });

  it("offers every clickable item a real action", () => {
    const template = terminalMainMenuTemplate(
      createTranslator("en"),
      menuActions(),
      DEFAULT_TERMINAL_KEYBINDS,
    );
    for (const item of flatten(template)) {
      if (item.type === "separator" || item.submenu || item.role) continue;
      expect(typeof item.click, String(item.label)).toBe("function");
    }
  });

  it("omits optional items whose actions are unavailable", () => {
    const actions = {
      ...Object.fromEntries(
        [
          "newWindow",
          "newTabInSelectedWindow",
          "requestQuit",
          "backUpSettings",
          "restoreSettings",
        ].map((name) => [name, vi.fn()]),
      ),
    } as unknown as TerminalApplicationMenuActions;
    const labels = flatten(
      terminalMainMenuTemplate(
        createTranslator("en"),
        actions,
        DEFAULT_TERMINAL_KEYBINDS,
      ),
    ).map((item) => item.label);
    expect(labels).not.toContain("Highlight Output");
    expect(labels).not.toContain("Highlight Rules…");
    expect(labels).not.toContain("Restore Windows at Startup");
    expect(labels).not.toContain("Preferences…");
  });

  it("accepts only window coordinates as a menu position", () => {
    expect(isMainMenuPosition({ x: 0, y: 34 })).toBe(true);
    for (const value of [
      null,
      [1, 2],
      { x: 1 },
      { x: -1, y: 0 },
      { x: 1.5, y: 0 },
      { x: 1, y: 40_000 },
      { x: "1", y: 0 },
      { x: 1, y: 2, action: "quit" },
    ])
      expect(isMainMenuPosition(value), JSON.stringify(value)).toBe(false);
  });

  it("shows the menu only for trusted main frames with a valid position", () => {
    let listener: ((event: IpcEvent, payload?: unknown) => void) | undefined;
    const ipcMain = {
      on: (channel: string, handler: typeof listener) => {
        if (channel === terminalIpc.mainMenu) listener = handler;
      },
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    const show = vi.fn();
    let trusted = true;
    const dispose = registerMainMenu(ipcMain, () => trusted, show);
    const frame = {};
    const event = {
      sender: { mainFrame: frame, isDestroyed: () => false, send: vi.fn() },
      senderFrame: frame,
    };
    listener!(event, { x: 10, y: 34 });
    listener!(event, { x: 10 });
    listener!({ ...event, senderFrame: {} }, { x: 10, y: 34 });
    trusted = false;
    listener!(event, { x: 10, y: 34 });
    expect(show).toHaveBeenCalledOnce();
    expect(show).toHaveBeenCalledWith(event.sender, { x: 10, y: 34 });
    dispose();
    expect(ipcMain.removeListener).toHaveBeenCalledWith(
      terminalIpc.mainMenu,
      listener,
    );
  });
});
