import {
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";

export function installApplicationMenu(
  template: MenuItemConstructorOptions[],
): Menu {
  // Retire a visible old menu before replacing its actions/accelerators.
  if (process.platform !== "darwin") Menu.getApplicationMenu()?.closePopup();
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  return menu;
}

export function applicationMenuForWindow(window: BrowserWindow) {
  return (position: { x: number; y: number }, callback: () => void) => {
    // Read on every opening: configuration reload replaces the native Menu.
    const menu = Menu.getApplicationMenu();
    if (!menu || window.isDestroyed()) return;
    menu.popup({ window, ...position, callback });
    return () => {
      if (!window.isDestroyed()) menu.closePopup(window);
    };
  };
}
