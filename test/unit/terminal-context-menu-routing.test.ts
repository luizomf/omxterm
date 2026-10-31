// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { terminalContextMenuTemplate } from "../../src/main/terminal-context-menu";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalContextMenuClipboardAction } from "../../src/shared/terminal-contract";
import { translatorFor } from "../../src/shared/i18n";
import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

afterEach(() => vi.restoreAllMocks());

async function popupHarness(busy = false) {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const exits = new Set<Parameters<TerminalBridge["onExit"]>[0]>();
  const sessions: SessionCallbacks[] = [];
  const nativeClose = vi.fn();
  const inspectBusy = vi.fn(() => busy);
  let destroyed = false;
  let menu: MenuItemConstructorOptions[] = [];
  let holdClipboard = false;
  const heldClipboard: unknown[] = [];
  let removeWindow = () => {};
  const deliverClipboard = (payload: unknown) => {
    if (typeof payload === "string")
      view.tabs.clipboardAction(payload as never);
    else {
      const { action, target } = payload as TerminalContextMenuClipboardAction;
      view.tabs.clipboardAction(action, target);
    }
  };
  const window = {
    isDestroyed: () => destroyed,
    close: vi.fn(),
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
    webContents: {
      mainFrame: {},
      isDestroyed: () => destroyed,
      send(channel: string, payload: unknown) {
        if (channel === terminalIpc.tabCommand)
          view.tabs.handleCommand(payload as never);
        if (channel === terminalIpc.clipboardAction) {
          if (holdClipboard) heldClipboard.push(payload);
          else deliverClipboard(payload);
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
    },
  };
  const owner = {
    sender: window.webContents,
    senderFrame: window.webContents.mainFrame,
  };
  const send = (channel: string, payload?: unknown) =>
    ipc.listeners.get(channel)?.(owner, payload);
  const bridge = {
    start: async () => ipc.handlers.get(terminalIpc.start)!(owner) as string,
    onOutput: () => () => {},
    onExit(listener: Parameters<TerminalBridge["onExit"]>[0]) {
      exits.add(listener);
      return () => {
        exits.delete(listener);
      };
    },
    resize: (sessionId: string, size: { cols: number; rows: number }) =>
      send(terminalIpc.resize, { sessionId, ...size }),
    close: (sessionId: string) => send(terminalIpc.close, { sessionId }),
  } satisfies Pick<
    TerminalBridge,
    "start" | "onOutput" | "onExit" | "resize" | "close"
  >;
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
    sendSnippetsToggle: vi.fn(),
    sendFind: vi.fn(),
    sendTabBarToggle: vi.fn(),
    sendAuxiliaryPanelToggle: vi.fn(),
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
    holdClipboard: () => {
      holdClipboard = true;
    },
    deliverClipboard() {
      holdClipboard = false;
      for (const payload of heldClipboard.splice(0)) deliverClipboard(payload);
    },
    open(index = 1) {
      const options = view.mountedSurfaceOptions[index]!;
      options.onContextMenu?.();
      options.clipboard!.requestContextMenu();
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

describe("retained terminal context menu callbacks", () => {
  it("retains main-frame validation and refuses unknown/dead session targets", async () => {
    const view = await popupHarness();
    const offer = { sessionId: "s2", menuId: 1, closePane: true };
    expect(view.requestMenu(offer, {})).toEqual([]);
    expect(view.requestMenu({ ...offer, sessionId: "s99" })).toEqual([]);
    view.sessions[1]!.onExit({ exitCode: 0, signal: 9 });
    expect(view.requestMenu(offer)).toEqual([]);
    expect(view.confirm).not.toHaveBeenCalled();
    view.dispose();
  });

  it("preserves the no-argument field menu without Close Pane", async () => {
    const view = await popupHarness();
    expect(view.requestMenu()).toEqual(["Copy", "Paste", "Select All"]);
    view.dispose();
  });

  it.each([
    ["Copy", "copy"],
    ["Paste", "paste"],
    ["Select All", "selectAll"],
    ["Close Pane", "dispose"],
  ] as const)(
    "delivers %s only to the clicked live pane, once",
    async (label, operation) => {
      const view = await popupHarness();
      const activate = view.open(0); // The other pane had focus before right-click.
      activate(label);
      activate(label);
      expect(view.surfaces[0]![operation]).toHaveBeenCalledOnce();
      expect(view.surfaces[1]![operation]).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it.each([
    "pane focus",
    "tab selection",
    "tab removal",
    "window change",
    "window destruction",
    "window removal",
    "controller disposal",
    "renderer disposal",
    "failed pane",
  ] as const)(
    "makes all retained popup actions inert after %s",
    async (change) => {
      const view = await popupHarness(true);
      const activate = view.open();
      if (change === "pane focus") {
        view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
        view.tabs.handleCommand({ action: "focus-pane", target: "next" });
      } else if (change === "tab selection" || change === "tab removal") {
        view.tabs.handleCommand({ action: "new" });
        await vi.waitFor(() => expect(view.surfaces).toHaveLength(3));
        if (change === "tab removal") {
          view.tabs.handleCommand({ action: "previous" });
          view.tabs.handleCommand({ action: "close" });
        } else view.tabs.handleCommand({ action: "previous" });
      } else if (change === "window change") await view.changeWindow();
      else if (change === "window destruction") view.destroy();
      else if (change === "window removal") view.removeWindow();
      else if (change === "controller disposal") view.disposeController();
      else if (change === "renderer disposal") view.tabs.dispose();
      else view.sessions[1]!.onExit({ exitCode: 0, signal: 9 });
      for (const surface of view.surfaces) {
        surface.copy.mockClear();
        surface.paste.mockClear();
        surface.selectAll.mockClear();
        surface.dispose.mockClear();
      }
      view.inspectBusy.mockClear();
      for (const action of ["Copy", "Paste", "Select All", "Close Pane"])
        activate(action);
      for (const surface of view.surfaces) {
        expect(surface.copy).not.toHaveBeenCalled();
        expect(surface.paste).not.toHaveBeenCalled();
        expect(surface.selectAll).not.toHaveBeenCalled();
        expect(surface.dispose).not.toHaveBeenCalled();
      }
      expect(view.otherWindow.webContents.send).not.toHaveBeenCalled();
      expect(view.inspectBusy).not.toHaveBeenCalled();
      expect(view.confirm).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it.each(["exit", "selection", "replacement popup", "disposal"] as const)(
    "rejects clipboard delivery held in transport across %s",
    async (change) => {
      const view = await popupHarness();
      const activate = view.open();
      view.holdClipboard();
      activate("Paste");
      if (change === "exit")
        view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
      else if (change === "selection")
        view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
      else if (change === "replacement popup") view.open();
      else view.tabs.dispose();
      view.deliverClipboard();
      for (const surface of view.surfaces)
        expect(surface.paste).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it("retains Busy close ownership and shares the existing Close Tab slot", async () => {
    const view = await popupHarness(true);
    let resolve!: (confirmed: boolean) => void;
    view.confirm.mockImplementationOnce(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    view.open()("Close Pane");
    const shared = view.application.closeSelectedTab();
    view.tabs.handleCommand({ action: "focus-pane", target: "previous" });
    expect(view.confirm).toHaveBeenCalledOnce();
    resolve(true);
    await shared;
    expect(view.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
    view.dispose();
  });

  it.each([false, true])(
    "a %s Busy decision never closes a replacement after target exit",
    async (confirmed) => {
      const view = await popupHarness(true);
      let resolve!: (confirmed: boolean) => void;
      view.confirm.mockImplementationOnce(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          }),
      );
      view.open()("Close Pane");
      const pending = view.application.closeSelectedPane();
      view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
      resolve(confirmed);
      await pending;
      expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
      view.dispose();
    },
  );

  it("does not inspect Busy state or confirm a superseded popup", async () => {
    const view = await popupHarness(true);
    const activateOld = view.open();
    view.open();
    view.inspectBusy.mockClear();
    activateOld("Close Pane");
    expect(view.inspectBusy).not.toHaveBeenCalled();
    expect(view.confirm).not.toHaveBeenCalled();
    view.dispose();
  });

  it("does not paste into a survivor when the popup's pane exits", async () => {
    const view = await popupHarness();
    const activate = view.open();
    view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
    activate("Paste");
    expect(view.surfaces[0]!.paste).not.toHaveBeenCalled();
    view.dispose();
  });

  it("does not close a survivor when the popup's pane exits before activation", async () => {
    const view = await popupHarness();
    const activate = view.open();
    view.sessions[1]!.onExit({ exitCode: 0, signal: 0 });
    activate("Close Pane");
    expect(view.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll("main")).toHaveLength(1);
    view.dispose();
  });
});
