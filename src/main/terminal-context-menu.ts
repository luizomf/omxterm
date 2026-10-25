import {
  app,
  Menu,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";
import { createTranslator, resolveLocale } from "../shared/i18n";
import { terminalIpc } from "../shared/terminal-ipc";
import { terminalClipboardContextMenuTemplate } from "./application-menu";

// The terminal's right-click menu, translated: clipboard actions and Save
// Output to File, carried out by the window's renderer, and Close Pane for a
// split pane (the renderer focused the clicked pane first).
export function showTerminalContextMenu(
  window: BrowserWindow,
  closePane?: {
    readonly click: () => void;
    readonly accelerator: string | null;
  },
): void {
  const send = (action: "copy" | "paste" | "select-all") =>
    window.webContents.send(terminalIpc.clipboardAction, action);
  const { t } = createTranslator(
    resolveLocale(app.getPreferredSystemLanguages()),
  );
  Menu.buildFromTemplate(
    withClosePane(
      terminalClipboardContextMenuTemplate(
        {
          copy: () => send("copy"),
          paste: () => send("paste"),
          selectAll: () => send("select-all"),
          saveOutput: () =>
            window.webContents.send(terminalIpc.saveOutputRequest),
        },
        {
          copy: t("action.copy"),
          paste: t("action.paste"),
          selectAll: t("action.selectAll"),
          saveOutput: t("menu.saveOutput"),
        },
      ),
      t("action.closePane"),
      closePane,
    ),
  ).popup({ window });
}

// Appends Close Pane, showing its keybind when one is bound.
export function withClosePane(
  template: MenuItemConstructorOptions[],
  label: string,
  closePane?: {
    readonly click: () => void;
    readonly accelerator: string | null;
  },
): MenuItemConstructorOptions[] {
  if (!closePane) return template;
  return [
    ...template,
    { type: "separator" },
    {
      label,
      ...(closePane.accelerator === null
        ? {}
        : { accelerator: closePane.accelerator }),
      click: closePane.click,
    },
  ];
}
