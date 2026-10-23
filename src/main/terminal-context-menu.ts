import { app, Menu, type BrowserWindow } from "electron";
import { createTranslator, resolveLocale } from "../shared/i18n";
import { terminalIpc } from "../shared/terminal-ipc";
import { terminalClipboardContextMenuTemplate } from "./application-menu";

// The terminal's right-click menu, translated: clipboard actions and Save
// Output to File, all carried out by the window's renderer.
export function showTerminalContextMenu(window: BrowserWindow): void {
  const send = (action: "copy" | "paste" | "select-all") =>
    window.webContents.send(terminalIpc.clipboardAction, action);
  const { t } = createTranslator(
    resolveLocale(app.getPreferredSystemLanguages()),
  );
  Menu.buildFromTemplate(
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
  ).popup({ window });
}
