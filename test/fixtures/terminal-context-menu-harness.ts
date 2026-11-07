import { expect, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { terminalContextMenuTemplate } from "../../src/main/terminal-context-menu";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type {
  TerminalContextMenuClipboardAction,
  TerminalExportContext,
  TerminalExportSaveRequest,
  TerminalTabCommand,
} from "../../src/shared/terminal-contract";
import { translatorFor } from "../../src/shared/i18n";
import { createIpcHarness, clipboardOptions } from "./terminal-ipc-harness";
import { createTabsHarness } from "./terminal-tabs-harness";

function sessionBridgeFor(
  start: TerminalBridge["start"],
  send: (channel: string, payload?: unknown) => void,
  exits: Set<Parameters<TerminalBridge["onExit"]>[0]>,
): Pick<TerminalBridge, "start" | "onOutput" | "onExit" | "resize" | "close"> {
  return {
    start,
    onOutput: () => () => {},
    onExit(listener) {
      exits.add(listener);
      return () => {
        exits.delete(listener);
      };
    },
    resize: (sessionId, size) =>
      send(terminalIpc.resize, { sessionId, ...size }),
    close: (sessionId) => send(terminalIpc.close, { sessionId }),
  };
}

function nativeWindowFor(
  isDestroyed: () => boolean,
  send: (channel: string, payload: unknown) => void,
) {
  return {
    isDestroyed,
    close: vi.fn(),
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
    webContents: { mainFrame: {}, isDestroyed, send },
  };
}

// Production menu/application/controller and renderer owner, with held transport.
export async function popupHarness(busy = false) {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const exits = new Set<Parameters<TerminalBridge["onExit"]>[0]>();
  const sessions: SessionCallbacks[] = [];
  const nativeClose = vi.fn();
  const inspectBusy = vi.fn(() => busy);
  let destroyed = false;
  let menu: MenuItemConstructorOptions[] = [];
  let interactionBlocked = false;
  let holdCommands = false;
  const heldCommands: TerminalTabCommand[] = [];
  let holdClipboard = false;
  const heldClipboard: unknown[] = [];
  let holdExport = false;
  const heldExports: TerminalExportContext[] = [];
  const sentExports: TerminalExportContext[] = [];
  const save = vi.fn(async (_request: TerminalExportSaveRequest) => {});
  const saveIpc = vi.fn((request: TerminalExportSaveRequest) =>
    ipc.handlers.get(terminalIpc.exportSave)!(owner, request),
  );
  const deliverExport = (context: TerminalExportContext) => {
    const request = view.tabs.exportRequest(context, true);
    if (request) void saveIpc(request);
  };
  let removeWindow = () => {};
  const deliverClipboard = (payload: unknown) => {
    if (typeof payload === "string")
      view.tabs.clipboardAction(payload as never);
    else {
      const { action, target } = payload as TerminalContextMenuClipboardAction;
      view.tabs.clipboardAction(action, target);
    }
  };
  const window = nativeWindowFor(
    () => destroyed,
    (channel, payload) => {
      if (channel === terminalIpc.tabCommand) {
        if (holdCommands) heldCommands.push(payload as TerminalTabCommand);
        else view.tabs.handleCommand(payload as TerminalTabCommand);
      }
      if (channel === terminalIpc.clipboardAction) {
        if (holdClipboard) heldClipboard.push(payload);
        else deliverClipboard(payload);
      }
      if (channel === terminalIpc.exportRequest) {
        const context = payload as TerminalExportContext;
        sentExports.push(context);
        if (holdExport) heldExports.push(context);
        else deliverExport(context);
      }
      if (channel === terminalIpc.exit) {
        const { sessionId, ...exit } = payload as {
          sessionId: string;
          exitCode: number;
          signal: number;
        };
        for (const listener of exits) listener(sessionId, exit);
      }
    },
  );
  const owner = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  const send = (channel: string, payload?: unknown) =>
    ipc.listeners.get(channel)?.(owner, payload);
  const bridge = sessionBridgeFor(
    async () => ipc.handlers.get(terminalIpc.start)!(owner) as string,
    send,
    exits,
  );
  // This adapter test exercises only the session-facing bridge operations.
  const sessionBridge = bridge as unknown as TerminalBridge;
  const otherWindow = {
    ...window,
    webContents: { ...window.webContents, mainFrame: {}, send: vi.fn() },
  };
  let windowCount = 0;
  let selected = window;
  const confirm = vi.fn(async () => true);
  const application = startTerminalApplication({
    createWindow(lifecycle) {
      const ownedWindow = windowCount++ === 0 ? window : otherWindow;
      if (ownedWindow === window) removeWindow = lifecycle.onWindowClosed;
      const controller = router.registerController({
        ...clipboardOptions(),
        exportText: save,
        webContents: ownedWindow.webContents,
        createSession(callbacks) {
          sessions.push(callbacks);
          return {
            write: vi.fn(),
            resize: vi.fn(),
            close: nativeClose,
            hasForegroundChildProcess: inspectBusy,
          };
        },
        onSessionStartError: lifecycle.onSessionStartError,
        onSessionExit: lifecycle.onSessionExit,
        showClipboardContextMenu(request) {
          menu = terminalContextMenuTemplate(
            ownedWindow,
            application,
            request,
            null,
            translatorFor("en-US").t,
          );
        },
      });
      return {
        window: ownedWindow,
        sessionActivity: controller,
        load: async () => {},
      };
    },
    getSelectedWindow: () => selected,
    showQuitConfirmation: confirm,
    showCloseWindowConfirmation: confirm,
    showCloseTabConfirmation: confirm,
    showClosePaneConfirmation: confirm,
    showSessionFailure: async () => {},
    sendFontZoom: vi.fn(),
    sendClipboardAction: (window, action, target) => {
      window.webContents.send(
        terminalIpc.clipboardAction,
        target ? { action, target } : action,
      );
    },
    sendExportRequest: (window, context) => {
      window.webContents.send(terminalIpc.exportRequest, context);
    },
    sendSnippetsToggle: vi.fn(),
    sendFind: vi.fn(),
    sendTabBarToggle: vi.fn(),
    sendAuxiliaryPanelToggle: vi.fn(),
    sendAuxiliaryPanelSideToggle: vi.fn(),
    sendTitleBarToggle: vi.fn(),
    sendLocalImageOpen: vi.fn(),
    toggleDeveloperTools: vi.fn(),
    sendTabCommand: (target, command) => {
      target.webContents.send(terminalIpc.tabCommand, command);
    },
    quit: vi.fn(),
  });
  await application.newWindow();
  const view = createTabsHarness({
    surfaceOptions: {
      clipboard: {
        writeText: async () => {},
        readText: async () => "",
        confirmPaste: async () => false,
        requestContextMenu: (request) =>
          send(terminalIpc.clipboardContextMenu, request),
      },
    },
    tabsOptions: {
      canFocus: () => !interactionBlocked,
      createAdapter: () => createElectronTerminalAdapter(sessionBridge),
      notifySelection: (sessionId, tabSessionIds) =>
        send(terminalIpc.tabSelected, { sessionId, tabSessionIds }),
    },
  });
  await view.tabs.ready;
  view.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
  view.tabs.handleCommand({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(view.surfaces).toHaveLength(2));
  for (const [index, surface] of view.surfaces.entries())
    surface.dispose.mockImplementation(() =>
      view.sessionAdapters[index]!.close(),
    );
  return {
    ...view,
    sessions,
    save,
    saveIpc,
    sentExports,
    confirm,
    nativeClose,
    inspectBusy,
    application,
    otherWindow,
    removeWindow: () => removeWindow(),
    disposeController: () => router.dispose(),
    requestMenu(payload?: unknown, senderFrame = owner.senderFrame) {
      ipc.listeners.get(terminalIpc.clipboardContextMenu)!(
        { ...owner, senderFrame },
        payload,
      );
      return menu.map((item) => item.label).filter(Boolean);
    },
    clickCurrent(label: string) {
      menu.find((entry) => entry.label === label)!.click!(
        {} as never,
        undefined,
        {} as never,
      );
    },
    setInteractionBlocked(value: boolean) {
      interactionBlocked = value;
    },
    holdCommands: () => {
      holdCommands = true;
    },
    pendingCommands: () => [...heldCommands],
    deliverCommands() {
      holdCommands = false;
      for (const command of heldCommands.splice(0))
        view.tabs.handleCommand(command);
    },
    holdClipboard: () => {
      holdClipboard = true;
    },
    deliverClipboard() {
      holdClipboard = false;
      for (const payload of heldClipboard.splice(0)) deliverClipboard(payload);
    },
    holdExport: () => {
      holdExport = true;
    },
    deliverExports() {
      holdExport = false;
      for (const context of heldExports.splice(0)) deliverExport(context);
    },
    open(index = 1, hasSelection = false) {
      view.mountedSurfaceOptions[index]!.onContextMenu?.();
      view.mountedSurfaceOptions[index]!.clipboard!.requestContextMenu({
        target: "terminal",
        hasSelection,
      });
      const capturedMenu = menu;
      return (label: string) => {
        const item = capturedMenu.find((entry) => entry.label === label)!;
        item.click!({} as never, undefined, {} as never);
      };
    },
    destroy: () => {
      destroyed = true;
    },
    async changeWindow() {
      await application.newWindow();
      selected = otherWindow;
    },
    dispose() {
      view.tabs.dispose();
      router.dispose();
    },
  };
}
