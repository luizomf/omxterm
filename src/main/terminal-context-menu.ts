import type { MenuItemConstructorOptions } from "electron";
import type {
  TerminalContextMenuRequest,
  TerminalContextMenuTarget,
} from "../shared/terminal-contract";
import type { Translator } from "../shared/i18n";
import { terminalIpc } from "../shared/terminal-ipc";
import { terminalClipboardContextMenuTemplate } from "./application-menu";
import type {
  NativeTerminalWindow,
  TerminalApplication,
} from "./terminal-application";
import type { TrustedWebContents } from "./terminal-ipc-types";

// The native popup's callbacks belong to its source window.
export function terminalContextMenuTemplate<
  Window extends NativeTerminalWindow & {
    readonly webContents: TrustedWebContents;
  },
>(
  window: Window,
  application: TerminalApplication<Window>,
  request: TerminalContextMenuRequest | undefined,
  closePaneAccelerator: string | null,
  t: Translator["t"],
): MenuItemConstructorOptions[] {
  // Copy only correlation data into callbacks; never retain a mutable request.
  const target = request
    ? { sessionId: request.sessionId, menuId: request.menuId }
    : undefined;
  const kind = request?.hasSelection ? "selection" : "content";
  const send = (action: "copy" | "paste" | "select-all") => {
    if (target) application.clipboardPane(window, action, target);
    else if (!window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send(terminalIpc.clipboardAction, action);
  };
  return terminalClipboardContextMenuTemplate(
    {
      copy: () => send("copy"),
      paste: () => send("paste"),
      selectAll: () => send("select-all"),
      ...(target
        ? {
            exportText: {
              kind,
              click: () => application.exportPane(window, { kind, target }),
            },
          }
        : {}),
      ...(request?.closePane && target
        ? {
            closePane: {
              click: () => void application.closePane(window, target),
              accelerator: closePaneAccelerator,
            },
          }
        : {}),
    },
    t,
  );
}

// Correlation is consumed only after checking the controller's actual live
// selection. A token cannot grant ownership or bypass the main-frame router.
export function createTerminalContextMenuTarget(options: {
  readonly isOwnerAlive: () => boolean;
  readonly isFocusedSession: (sessionId: string) => boolean;
  readonly show: (request?: TerminalContextMenuRequest) => void;
}) {
  let captured: TerminalContextMenuTarget | undefined;
  return {
    show(request?: TerminalContextMenuRequest) {
      captured = undefined;
      if (!options.isOwnerAlive()) return;
      if (request) {
        if (!options.isFocusedSession(request.sessionId)) return;
        captured = { sessionId: request.sessionId, menuId: request.menuId };
      }
      options.show(request);
    },
    claim(target: TerminalContextMenuTarget) {
      if (
        !captured ||
        captured.menuId !== target.menuId ||
        captured.sessionId !== target.sessionId
      )
        return false;
      captured = undefined;
      return (
        options.isOwnerAlive() && options.isFocusedSession(target.sessionId)
      );
    },
    selectionChanged() {
      if (
        captured &&
        (!options.isOwnerAlive() ||
          !options.isFocusedSession(captured.sessionId))
      )
        captured = undefined;
    },
  };
}
