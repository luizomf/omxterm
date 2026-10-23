// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IPty } from "node-pty";
import { startTerminalApplication } from "../../src/main/terminal-application";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import {
  createTerminalTabs,
  type TerminalTabs,
} from "../../src/renderer/terminal-tabs";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { isTerminalSessionExit } from "../../src/shared/terminal-contract";
import { createFakeSurface } from "../fixtures/terminal-tabs-harness";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function harness(confirmClose = true) {
  const handlers = new Map<string, Parameters<IpcMainPort["handle"]>[1]>();
  const listeners = new Map<string, Parameters<IpcMainPort["on"]>[1]>();
  const router = registerTerminalIpcRouter({
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    removeHandler: (channel) => {
      handlers.delete(channel);
    },
    removeListener: (channel) => {
      listeners.delete(channel);
    },
  });
  const exits = new Set<Parameters<TerminalBridge["onExit"]>[0]>();
  const ptys: Array<{
    kill: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    exit(): void;
    busy: boolean;
  }> = [];
  const decision = deferred<boolean>();
  const showCloseTabConfirmation = vi.fn(() => decision.promise);
  const closeRequests = vi.fn();
  let destroyed = false;
  let tabs!: TerminalTabs;
  const webContents = {
    mainFrame: {},
    isDestroyed: () => destroyed,
    send(_channel: string, payload: unknown) {
      if (isTerminalSessionExit(payload))
        for (const listener of [...exits]) listener(payload.sessionId, payload);
    },
  };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const bridge = {
    start: async () => handlers.get(terminalIpc.start)!(event),
    input: (sessionId: string, data: string) =>
      listeners.get(terminalIpc.input)!(event, { sessionId, data }),
    resize() {},
    acknowledgeOutput() {},
    close(sessionId: string) {
      closeRequests(sessionId);
      listeners.get(terminalIpc.close)?.(event, { sessionId });
    },
    onOutput: () => () => {},
    onExit(listener: Parameters<TerminalBridge["onExit"]>[0]) {
      exits.add(listener);
      return () => {
        exits.delete(listener);
      };
    },
  } as unknown as TerminalBridge;
  const container = document.createElement("div");
  const strip = document.createElement("nav");
  document.body.replaceChildren(strip, container);
  const surfaces: TerminalSurface[] = [];
  const window = {
    isDestroyed: () => destroyed,
    close: vi.fn(() => {
      destroyed = true;
    }),
    isFullScreen: () => false,
    setFullScreen() {},
    isAlwaysOnTop: () => false,
    setAlwaysOnTop() {},
  };
  let disposeWindow = () => {};
  const application = startTerminalApplication({
    confirmClose,
    createWindow(lifecycle) {
      const controller = router.registerController({
        webContents,
        configuration: terminalRendererConfiguration(
          { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
          0,
        ),
        createSession: (callbacks) =>
          createLocalTerminalSession(
            () => {
              let emitExit:
                | ((exit: { exitCode: number; signal: number }) => void)
                | undefined;
              const pty = {
                kill: vi.fn(),
                write: vi.fn(),
                busy: true,
                exit() {
                  emitExit?.({ exitCode: 0, signal: 0 });
                },
              };
              ptys.push(pty);
              return {
                kill: pty.kill,
                write: pty.write,
                resize() {},
                pause() {},
                resume() {},
                get process() {
                  return pty.busy ? "busy-child" : "shell";
                },
                onData: () => ({ dispose() {} }),
                onExit(listener: typeof emitExit) {
                  emitExit = listener;
                  return {
                    dispose() {
                      emitExit = undefined;
                    },
                  };
                },
              } as unknown as IPty;
            },
            {
              ...callbacks,
              shell: "/fixture/shell",
              homeDirectory: "/fixture",
              platform: "darwin",
              environment: {},
              applicationVersionProvider: { getVersion: () => "1.0.0" },
            },
          ),
        onSessionExit: lifecycle.onSessionExit,
        onSessionStartError: lifecycle.onSessionStartError,
        onSessionStarted() {},
        onSessionSelected() {},
        onTitleRequest() {},
        onBell() {},
        onUserInteraction() {},
        writeClipboardText() {},
        readClipboardText: () => "",
        confirmPaste: async () => false,
        showClipboardContextMenu() {},
        openExternalLink: async () => {},
        onExternalLinkOpenError() {},
        loadSnippets: async () => ({ snippets: [] }),
        loadLocalImage: async () => null,
      });
      disposeWindow = () => {
        destroyed = true;
        tabs.dispose();
        controller.dispose();
        lifecycle.onWindowClosed();
      };
      return {
        window,
        sessionActivity: controller,
        async load() {
          tabs = createTerminalTabs(
            { strip, container },
            {
              createAdapter: () => createElectronTerminalAdapter(bridge),
              surfaceOptions: {},
              notifySelection: (sessionId) =>
                listeners.get(terminalIpc.tabSelected)!(event, { sessionId }),
              async mount(_container, adapter) {
                const surface = {
                  ...createFakeSurface(),
                  inject: vi.fn(async (text: string) => adapter.write(text)),
                };
                surface.dispose.mockImplementation(() => adapter.close());
                await adapter.start({ onOutput() {}, onExit() {} });
                surfaces.push(surface);
                return surface;
              },
            },
          );
          await tabs.ready;
        },
      };
    },
    getSelectedWindow: () => window,
    showCloseTabConfirmation,
    showCloseWindowConfirmation: async () => true,
    showQuitConfirmation: async () => true,
    showSessionFailure: async () => {},
    sendTabCommand: (_window, command) => tabs.handleCommand(command),
    sendFontZoom() {},
    sendClipboardAction() {},
    sendSnippetsToggle() {},
    sendTabBarToggle() {},
    sendFind() {},
    sendTitleBarToggle() {},
    sendLocalImageOpen() {},
    toggleDeveloperTools() {},
    quit() {},
  });
  await application.newWindow();
  application.newTabInSelectedWindow();
  await vi.waitFor(() => expect(surfaces).toHaveLength(2));
  cleanups.push(() => {
    tabs.dispose();
    router.dispose();
  });
  return {
    application,
    tabs,
    decision,
    showCloseTabConfirmation,
    ptys,
    surfaces,
    closeRequests,
    container,
    disposeWindow,
  };
}

// Real application/router/LocalTerminalSession/renderer Adapter/tab ownership.
// Only native PTY, Electron transport/dialog and Surface rendering are replaced.
describe("Close Tab confirmation ownership", () => {
  it("does not close or kill A when B exits ordinarily before approval", async () => {
    const h = await harness();
    const request = h.application.closeSelectedTab();
    expect(h.showCloseTabConfirmation).toHaveBeenCalledOnce();
    h.ptys[1]!.exit();
    expect(h.container.children).toHaveLength(1);
    h.decision.resolve(true);
    await request;
    expect(h.container.children).toHaveLength(1);
    expect(h.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(h.closeRequests).not.toHaveBeenCalled();
    expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
    h.tabs.injectText("survivor");
    expect(h.surfaces[0]!.inject).toHaveBeenCalledWith("survivor");
    expect(h.ptys[0]!.write).toHaveBeenCalledExactlyOnceWith("survivor");
  });

  it("closes only the still-live B even after selection changes to A", async () => {
    const h = await harness();
    const request = h.application.closeSelectedTab();
    h.application.selectPreviousTab();
    h.decision.resolve(true);
    await request;
    expect(h.closeRequests).toHaveBeenCalledExactlyOnceWith("s2");
    expect(h.ptys[1]!.kill).toHaveBeenCalledOnce();
    expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
    expect(h.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(h.container.children).toHaveLength(1);
  });

  it("denial leaves both sessions intact and permits a fresh request", async () => {
    const h = await harness();
    const request = h.application.closeSelectedTab();
    h.application.selectPreviousTab();
    h.decision.resolve(false);
    await request;
    expect(h.closeRequests).not.toHaveBeenCalled();
    expect(h.ptys.every((pty) => pty.kill.mock.calls.length === 0)).toBe(true);
    expect(h.container.children).toHaveLength(2);
    h.showCloseTabConfirmation.mockResolvedValueOnce(true);
    await h.application.closeSelectedTab();
    expect(h.closeRequests).toHaveBeenCalledExactlyOnceWith("s1");
    expect(h.ptys[1]!.kill).not.toHaveBeenCalled();
  });

  it("coalesces duplicate requests even when the selected survivor is now idle", async () => {
    const h = await harness();
    const first = h.application.closeSelectedTab();
    h.ptys[1]!.exit();
    h.ptys[0]!.busy = false;
    const second = h.application.closeSelectedTab();
    expect(second).toBe(first);
    expect(h.showCloseTabConfirmation).toHaveBeenCalledOnce();
    h.decision.resolve(true);
    await Promise.all([first, second]);
    expect(h.closeRequests).not.toHaveBeenCalled();
    expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
  });

  it("coalesces repeated busy requests and closes only once", async () => {
    const h = await harness();
    const first = h.application.closeSelectedTab();
    const second = h.application.closeSelectedTab();
    expect(second).toBe(first);
    expect(h.showCloseTabConfirmation).toHaveBeenCalledOnce();
    h.decision.resolve(true);
    await Promise.all([first, second]);
    expect(h.closeRequests).toHaveBeenCalledExactlyOnceWith("s2");
    expect(h.ptys[1]!.kill).toHaveBeenCalledOnce();
    expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
  });

  it("releases the target after a rejected dialog and permits a new decision", async () => {
    const h = await harness();
    h.showCloseTabConfirmation.mockRejectedValueOnce(
      new Error("dialog unavailable"),
    );
    await expect(h.application.closeSelectedTab()).rejects.toThrow(
      "dialog unavailable",
    );
    expect(h.closeRequests).not.toHaveBeenCalled();
    h.application.selectPreviousTab();
    h.showCloseTabConfirmation.mockResolvedValueOnce(true);
    await h.application.closeSelectedTab();
    expect(h.closeRequests).toHaveBeenCalledExactlyOnceWith("s1");
    expect(h.ptys[1]!.kill).not.toHaveBeenCalled();
  });

  it("ignores approval after disposal instead of closing again", async () => {
    const h = await harness();
    const request = h.application.closeSelectedTab();
    h.disposeWindow();
    const closes = h.closeRequests.mock.calls.length;
    h.decision.resolve(true);
    await request;
    expect(h.closeRequests).toHaveBeenCalledTimes(closes);
    for (const pty of h.ptys) expect(pty.kill).toHaveBeenCalledOnce();
  });

  it("keeps immediate closure when confirmation is disabled", async () => {
    const h = await harness(false);
    await h.application.closeSelectedTab();
    expect(h.showCloseTabConfirmation).not.toHaveBeenCalled();
    expect(h.closeRequests).toHaveBeenCalledExactlyOnceWith("s2");
    expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
  });
});
