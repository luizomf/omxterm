import { BrowserWindow } from "electron";
import type { TerminalContextMenuRequest } from "../../src/shared/terminal-contract";
import type { UserConfiguration } from "../../src/shared/user-configuration";
import { translatorFor } from "../../src/shared/i18n";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { terminalContextMenuTemplate } from "../../src/main/terminal-context-menu";
import type { TerminalIpcController } from "../../src/main/terminal-ipc-types";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { resttyExportEvidence } from "./restty-host-export";

// Reuse the fixture window/controller with the production application's source-
// window claim. Fixture supervision still owns native completion and renderer load.
export async function createResttyExportOwner(
  window: BrowserWindow,
  controller: TerminalIpcController,
  onClosed: () => void,
  configuration: () => Pick<UserConfiguration, "language" | "keybinds">,
) {
  const notify = (channel: string) => () => window.webContents.send(channel);
  const application = startTerminalApplication<BrowserWindow>({
    createWindow(lifecycle) {
      registerTerminalWindowHost(window, controller, () => {
        onClosed();
        lifecycle.onWindowClosed();
      });
      return { window, sessionActivity: controller, load: async () => {} };
    },
    getSelectedWindow: () => BrowserWindow.getFocusedWindow() ?? undefined,
    showQuitConfirmation: async () => false,
    showCloseWindowConfirmation: async () => false,
    showCloseTabConfirmation: async () => false,
    showSessionFailure: async () => {
      throw new Error("Unexpected application session failure");
    },
    sendFontZoom: (owner, command) =>
      owner.webContents.send(terminalIpc.fontZoom, command),
    sendClipboardAction: (owner, action, target) =>
      owner.webContents.send(
        terminalIpc.clipboardAction,
        target ? { action, target } : action,
      ),
    sendExportRequest: (owner, context) =>
      owner.webContents.send(terminalIpc.exportRequest, context),
    sendSnippetsToggle: notify(terminalIpc.snippetsToggle),
    sendFind: notify(terminalIpc.find),
    sendTabBarToggle: notify(terminalIpc.tabBarToggle),
    sendTitleBarToggle: notify(terminalIpc.titleBarToggle),
    sendLocalImageOpen: notify(terminalIpc.localImageOpen),
    toggleDeveloperTools: () => {},
    sendTabCommand: (owner, command) =>
      owner.webContents.send(terminalIpc.tabCommand, command),
    quit: () => {},
  });
  await application.newWindow();
  return {
    showContextMenu(request?: TerminalContextMenuRequest) {
      const current = configuration();
      const t = translatorFor(current.language).t;
      const template = terminalContextMenuTemplate(
        window,
        application,
        request,
        current.keybinds.closePane,
        t,
      );
      const click = request
        ? template.find(
            (item) =>
              item.label ===
              t(
                request.hasSelection
                  ? "menu.exportSelection"
                  : "menu.exportContent",
              ),
          )?.click
        : undefined;
      resttyExportEvidence.contextMenuRequests.push(request);
      // Programmatic native-template callback, not an OS popup-widget check.
      resttyExportEvidence.exportMenuChoices.push(
        click ? () => click({} as never, window, {} as never) : undefined,
      );
    },
  };
}
