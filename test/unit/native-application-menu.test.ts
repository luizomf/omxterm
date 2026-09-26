import type { BrowserWindow, MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applicationMenuForWindow,
  installApplicationMenu,
} from "../../src/main/native-application-menu";

const native = vi.hoisted(() => {
  const createMenu = () => ({ popup: vi.fn(), closePopup: vi.fn() });
  let current: ReturnType<typeof createMenu> | null = null;
  return {
    createMenu,
    Menu: {
      getApplicationMenu: vi.fn(() => current),
      setApplicationMenu: vi.fn((menu: typeof current) => {
        current = menu;
      }),
      buildFromTemplate: vi.fn((_template: MenuItemConstructorOptions[]) =>
        createMenu(),
      ),
    },
  };
});
vi.mock("electron", () => ({ Menu: native.Menu }));
beforeEach(() => {
  native.Menu.setApplicationMenu(null);
  vi.clearAllMocks();
});

function owner() {
  return { isDestroyed: vi.fn(() => false) };
}

describe("current native application Menu", () => {
  it("opens the installed root itself, late-bound across reload, with unchanged action and shortcut definitions", () => {
    const window = owner();
    const popup = applicationMenuForWindow(window as unknown as BrowserWindow);
    const callback = vi.fn();
    const click = vi.fn();
    const initial = [
      {
        label: "File",
        submenu: [{ label: "New Tab", accelerator: "Control+Shift+T", click }],
      },
    ];
    const first = installApplicationMenu(initial);
    const dismissFirst = popup({ x: 8, y: 42 }, callback);
    expect(first.popup).toHaveBeenCalledExactlyOnceWith({
      window,
      x: 8,
      y: 42,
      callback,
    });
    expect(native.Menu.buildFromTemplate).toHaveBeenCalledExactlyOnceWith(
      initial,
    );
    const updated = [
      {
        label: "File",
        submenu: [{ label: "New Tab", accelerator: "Alt+X", click }],
      },
    ];
    const second = installApplicationMenu(updated);
    expect(first.closePopup).toHaveBeenCalledTimes(
      process.platform === "darwin" ? 0 : 1,
    );
    popup({ x: 8, y: 8 }, callback);
    expect(first.popup).toHaveBeenCalledOnce();
    expect(second.popup).toHaveBeenCalledExactlyOnceWith({
      window,
      x: 8,
      y: 8,
      callback,
    });
    expect(native.Menu.buildFromTemplate).toHaveBeenCalledTimes(2);
    expect(native.Menu.buildFromTemplate).toHaveBeenLastCalledWith(updated);
    // A retained closer belongs only to its original menu/window, not the replacement.
    dismissFirst!();
    expect(first.closePopup).toHaveBeenLastCalledWith(window);
    expect(second.closePopup).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("does nothing without a menu or after owner destruction", () => {
    const window = owner();
    const popup = applicationMenuForWindow(window as unknown as BrowserWindow);
    const callback = vi.fn();
    expect(popup({ x: 8, y: 8 }, callback)).toBeUndefined();
    const menu = installApplicationMenu([]);
    const close = popup({ x: 8, y: 42 }, callback);
    window.isDestroyed.mockReturnValue(true);
    expect(popup({ x: 8, y: 8 }, callback)).toBeUndefined();
    close!();
    expect(menu.popup).toHaveBeenCalledOnce();
    expect(menu.closePopup).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
});
