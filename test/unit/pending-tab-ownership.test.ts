// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IPty } from "node-pty";
import { startTerminalApplication } from "../../src/main/terminal-application";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { registerTerminalShutdown } from "../../src/main/terminal-shutdown";
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

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function harness(failure?: "rendering" | "spawn") {
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
    exit(signal?: number): void;
  }> = [];
  const gate = deferred();
  const acknowledgement = deferred();
  const acknowledgements: ReturnType<typeof deferred>[] = [];
  const showSessionFailure = vi.fn(() => {
    const pending =
      acknowledgements.length === 0 ? acknowledgement : deferred();
    acknowledgements.push(pending);
    return pending.promise;
  });
  const renderingFailures: Array<() => void> = [];
  const nativeQuitCompleted = vi.fn();
  let beforeQuit: (event: { preventDefault(): void }) => void = () => {};
  const native = {
    on(event: string, listener: typeof beforeQuit) {
      if (event === "before-quit") beforeQuit = listener;
    },
    quit() {
      let prevented = false;
      beforeQuit({
        preventDefault: () => {
          prevented = true;
        },
      });
      if (!prevented) nativeQuitCompleted();
    },
  };
  const quit = vi.fn(() => native.quit());
  let destroyed = false;
  let tabs!: TerminalTabs;
  let disposeWindow = () => {};
  const webContents = {
    mainFrame: {},
    isDestroyed: () => destroyed,
    send(_channel: string, payload: unknown) {
      // Electron delivery is asynchronous: main completes exit classification
      // before renderer tab-removal messages return through IPC.
      queueMicrotask(() => {
        if (!destroyed && isTerminalSessionExit(payload))
          for (const listener of [...exits])
            listener(payload.sessionId, payload);
      });
    },
  };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const bridge = {
    start: async () => handlers.get(terminalIpc.start)!(event),
    input: (sessionId: string, data: string) =>
      listeners.get(terminalIpc.input)!(event, { sessionId, data }),
    resize() {},
    acknowledgeOutput() {},
    close(sessionId: string, reason?: "rendering-failure") {
      listeners.get(terminalIpc.close)?.(event, {
        sessionId,
        ...(reason ? { reason } : {}),
      });
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
  const window = {
    isDestroyed: () => destroyed,
    close: vi.fn(() => disposeWindow()),
    isFullScreen: () => false,
    setFullScreen() {},
    isAlwaysOnTop: () => false,
    setAlwaysOnTop() {},
  };
  let mounts = 0;
  let completed = 0;
  let settledMounts = 0;
  let application!: ReturnType<typeof startTerminalApplication>;
  const shutdown = registerTerminalShutdown(native, {
    application: () => application,
    disposeSessions: () => disposeWindow(),
  });
  application = startTerminalApplication({
    confirmClose: false,
    createWindow(lifecycle) {
      const controllerOptions = {
        webContents,
        configuration: terminalRendererConfiguration(
          { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
          0,
        ),
        createSession: (
          callbacks: Parameters<
            Parameters<typeof router.registerController>[0]["createSession"]
          >[0],
        ) =>
          shutdown.createSession(
            () => {
              if (failure === "spawn" && ptys.length === 1)
                throw new Error("Controlled spawn failure");
              let emitExit:
                | ((exit: { exitCode: number; signal: number }) => void)
                | undefined;
              const pty = {
                kill: vi.fn(),
                write: vi.fn(),
                exit(signal = 0) {
                  emitExit?.({ exitCode: 7, signal });
                },
              };
              ptys.push(pty);
              return {
                kill: pty.kill,
                write: pty.write,
                resize() {},
                pause() {},
                resume() {},
                process: "shell",
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
        onTabsEmpty: lifecycle.onTabsEmpty,
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
      };
      const controller = router.registerController(controllerOptions);
      disposeWindow = () => {
        if (destroyed) return;
        destroyed = true;
        tabs.dispose();
        controller.dispose();
        lifecycle.onWindowClosed();
      };
      return {
        window,
        sessionActivity: controller,
        async load() {
          const options: Parameters<typeof createTerminalTabs>[1] = {
            createAdapter: () => createElectronTerminalAdapter(bridge),
            surfaceOptions: { onFatalError() {} },
            notifyEmpty(reason) {
              queueMicrotask(() =>
                listeners.get(terminalIpc.tabsEmpty)?.(event, reason),
              );
            },
            async mount(_container, adapter, surfaceOptions) {
              mounts += 1;
              try {
                const second = mounts === 2;
                if (second) await gate.promise;
                if (surfaceOptions.abortSignal?.aborted)
                  throw new Error("cancelled");
                if (second && failure === "rendering") {
                  surfaceOptions.onFatalError?.(
                    "Controlled rendering initialization failure",
                  );
                  adapter.close("rendering-failure");
                  throw new Error(
                    "Controlled rendering initialization failure",
                  );
                }
                const surface = {
                  ...createFakeSurface(),
                  inject: vi.fn(async (text: string) => {
                    adapter.write(text);
                  }),
                };
                surface.dispose.mockImplementation(() => adapter.close());
                renderingFailures.push(() => {
                  surfaceOptions.onFatalError?.("Controlled runtime failure");
                  adapter.close("rendering-failure");
                });
                await adapter.start({
                  onOutput() {},
                  onExit: () => {
                    surface.dispose();
                  },
                });
                completed += 1;
                return surface;
              } finally {
                settledMounts += 1;
              }
            },
          };
          tabs = createTerminalTabs({ strip, container }, options);
          await tabs.ready;
        },
      };
    },
    getSelectedWindow: () => window,
    showCloseTabConfirmation: async () => true,
    showCloseWindowConfirmation: async () => true,
    showQuitConfirmation: async () => true,
    showSessionFailure,
    sendTabCommand: (_window, command) => tabs.handleCommand(command),
    sendFontZoom() {},
    sendClipboardAction() {},
    sendSnippetsToggle() {},
    sendTabBarToggle() {},
    sendTitleBarToggle() {},
    sendLocalImageOpen() {},
    toggleDeveloperTools() {},
    quit,
  });
  await application.newWindow();
  application.newTabInSelectedWindow();
  expect(mounts).toBe(2);
  expect(ptys).toHaveLength(1);
  expect(container.children).toHaveLength(2);
  cleanups.push(() => {
    tabs.dispose();
    router.dispose();
  });
  return {
    application,
    tabs,
    gate,
    acknowledgement,
    acknowledgements,
    renderingFailures,
    ptys,
    window,
    container,
    quit,
    showSessionFailure,
    completed: () => completed,
    settledMounts: () => settledMounts,
    nativeQuitCompleted,
  };
}

// Production application/router/LocalTerminalSession/Adapter/tab ownership;
// native PTYs, Electron transport, dialogs and rendering are isolated adapters.
describe("failure acknowledgement ownership across sibling exits", () => {
  it.each(["signal", "spawn", "rendering"] as const)(
    "retains B's %s failure across ordinary A exit, then cleans up exactly once",
    async (failure) => {
      const h = await harness(failure === "spawn" ? "spawn" : undefined);
      h.gate.resolve();
      await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
      if (failure === "signal") h.ptys[1]!.exit(15);
      if (failure === "rendering") {
        h.renderingFailures[1]!();
        h.ptys[1]!.exit();
      }
      await vi.waitFor(() =>
        expect(h.showSessionFailure).toHaveBeenCalledOnce(),
      );
      h.ptys[0]!.exit();
      // Flush the real renderer removal and returned empty-owner notification.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(h.window.isDestroyed()).toBe(false);
      expect(h.window.close).not.toHaveBeenCalled();
      expect(h.nativeQuitCompleted).not.toHaveBeenCalled();
      h.acknowledgement.resolve();
      await vi.waitFor(() =>
        expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
      );
      expect(h.window.close).toHaveBeenCalledOnce();
      expect(h.quit).toHaveBeenCalledOnce();
      expect(h.container.children).toHaveLength(0);
    },
  );

  it("retains a runtime-failed B before its native exit while A exits ordinarily", async () => {
    const h = await harness();
    h.gate.resolve();
    await vi.waitFor(() => expect(h.completed()).toBe(2));
    h.renderingFailures[1]!();
    expect(h.ptys[1]!.kill).toHaveBeenCalledOnce();
    h.ptys[0]!.exit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.window.isDestroyed()).toBe(false);
    expect(h.showSessionFailure).not.toHaveBeenCalled();
    expect(h.nativeQuitCompleted).not.toHaveBeenCalled();
    h.ptys[1]!.exit();
    await vi.waitFor(() => expect(h.showSessionFailure).toHaveBeenCalledOnce());
    expect(h.window.isDestroyed()).toBe(false);
    h.acknowledgement.resolve();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.window.close).toHaveBeenCalledOnce();
    expect(h.container.children).toHaveLength(0);
  });

  it("acknowledging A cannot discard runtime-failed B awaiting native exit", async () => {
    const h = await harness();
    h.gate.resolve();
    await vi.waitFor(() => expect(h.completed()).toBe(2));
    h.renderingFailures[1]!();
    h.ptys[0]!.exit(15);
    await vi.waitFor(() => expect(h.showSessionFailure).toHaveBeenCalledOnce());
    h.acknowledgements[0]!.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.window.isDestroyed()).toBe(false);
    h.ptys[1]!.exit();
    await vi.waitFor(() =>
      expect(h.showSessionFailure).toHaveBeenCalledTimes(2),
    );
    h.acknowledgements[1]!.resolve();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.window.close).toHaveBeenCalledOnce();
  });

  it("keeps both signal acknowledgements when the last native session fails too", async () => {
    const h = await harness();
    h.gate.resolve();
    await vi.waitFor(() => expect(h.completed()).toBe(2));
    h.ptys[1]!.exit(15);
    h.ptys[0]!.exit(15);
    await vi.waitFor(() => expect(h.acknowledgements).toHaveLength(2));
    h.acknowledgements[1]!.resolve();
    await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
    expect(h.window.isDestroyed()).toBe(false);
    expect(h.quit).not.toHaveBeenCalled();
    h.acknowledgements[0]!.resolve();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.window.close).toHaveBeenCalledOnce();
    expect(h.container.children).toHaveLength(0);
  });

  it("retains each of multiple spawn failures until every acknowledgement completes", async () => {
    const h = await harness("spawn");
    h.gate.resolve();
    await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
    h.application.newTabInSelectedWindow();
    await vi.waitFor(() => expect(h.acknowledgements).toHaveLength(2));
    h.ptys[0]!.exit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.window.isDestroyed()).toBe(false);
    h.acknowledgements[1]!.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.window.isDestroyed()).toBe(false);
    h.acknowledgements[0]!.resolve();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.window.close).toHaveBeenCalledOnce();
  });

  it("does not close a still-mounting sibling after last-native-session acknowledgement", async () => {
    const h = await harness();
    h.ptys[0]!.exit(15);
    await vi.waitFor(() => expect(h.showSessionFailure).toHaveBeenCalledOnce());
    h.acknowledgement.resolve();
    await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
    expect(h.window.isDestroyed()).toBe(false);
    h.gate.resolve();
    await vi.waitFor(() => expect(h.completed()).toBe(2));
    h.tabs.injectText("survivor");
    expect(h.ptys[1]!.write).toHaveBeenCalledExactlyOnceWith("survivor");
    h.ptys[1]!.exit();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
  });

  it.each(["signal", "rendering"] as const)(
    "retains a last-session %s failure and closes once after acknowledgement",
    async (failure) => {
      const h = await harness();
      h.gate.resolve();
      await vi.waitFor(() => expect(h.completed()).toBe(2));
      h.ptys[0]!.exit();
      await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
      if (failure === "rendering") h.renderingFailures[1]!();
      h.ptys[1]!.exit(failure === "signal" ? 15 : 0);
      await vi.waitFor(() =>
        expect(h.showSessionFailure).toHaveBeenCalledOnce(),
      );
      expect(h.window.isDestroyed()).toBe(false);
      expect(h.nativeQuitCompleted).not.toHaveBeenCalled();
      h.acknowledgement.resolve();
      await vi.waitFor(() =>
        expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
      );
      expect(h.window.close).toHaveBeenCalledOnce();
      expect(h.container.children).toHaveLength(0);
    },
  );

  it("ignores late acknowledgements after explicit owner closure", async () => {
    const h = await harness();
    h.gate.resolve();
    await vi.waitFor(() => expect(h.completed()).toBe(2));
    h.ptys[1]!.exit(15);
    await vi.waitFor(() => expect(h.showSessionFailure).toHaveBeenCalledOnce());
    await h.application.closeSelectedWindow();
    expect(h.window.isDestroyed()).toBe(true);
    h.acknowledgement.resolve();
    h.ptys[0]!.exit();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.window.close).toHaveBeenCalledOnce();
    expect(h.quit).toHaveBeenCalledOnce();
  });
});

describe("automatic close while a Terminal Tab initializes", () => {
  it("keeps B while A exits ordinarily, then starts exactly one usable B PTY", async () => {
    const h = await harness();
    h.ptys[0]!.exit();
    expect(h.window.isDestroyed()).toBe(false);
    await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.ptys).toHaveLength(1);
    h.gate.resolve();
    await vi.waitFor(() => expect(h.completed()).toBe(2));
    expect(h.ptys).toHaveLength(2);
    h.tabs.injectText("usable");
    expect(h.ptys[1]!.write).toHaveBeenCalledExactlyOnceWith("usable");
    expect(h.ptys[1]!.kill).not.toHaveBeenCalled();
    h.ptys[1]!.exit();
    await vi.waitFor(() => expect(h.window.isDestroyed()).toBe(true));
    expect(h.quit).toHaveBeenCalledOnce();
    expect(h.showSessionFailure).not.toHaveBeenCalled();
  });

  it("closes after cancelling the final pending tab and never starts it late", async () => {
    const h = await harness();
    h.ptys[0]!.exit();
    await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
    expect(h.window.isDestroyed()).toBe(false);
    await h.application.closeSelectedTab();
    h.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(h.window.isDestroyed()).toBe(true));
    h.gate.resolve();
    await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
    expect(h.ptys).toHaveLength(1);
    expect(h.quit).toHaveBeenCalledOnce();
    expect(h.showSessionFailure).not.toHaveBeenCalled();
  });

  it("acknowledges final pending rendering failure before closing without spawning", async () => {
    const h = await harness("rendering");
    h.ptys[0]!.exit();
    await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
    expect(h.window.isDestroyed()).toBe(false);
    h.gate.resolve();
    await vi.waitFor(() => expect(h.showSessionFailure).toHaveBeenCalledOnce());
    expect(h.window.isDestroyed()).toBe(false);
    expect(h.ptys).toHaveLength(1);
    h.acknowledgement.resolve();
    await vi.waitFor(() => expect(h.window.isDestroyed()).toBe(true));
    expect(h.quit).toHaveBeenCalledOnce();
  });

  it("cancelling B while A lives leaves A usable and closes normally on A's later exit", async () => {
    const h = await harness();
    await h.application.closeSelectedTab();
    expect(h.window.isDestroyed()).toBe(false);
    h.gate.resolve();
    await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
    expect(h.ptys).toHaveLength(1);
    h.tabs.injectText("survivor");
    expect(h.ptys[0]!.write).toHaveBeenCalledExactlyOnceWith("survivor");
    h.ptys[0]!.exit();
    await vi.waitFor(() => expect(h.window.isDestroyed()).toBe(true));
    expect(h.showSessionFailure).not.toHaveBeenCalled();
  });

  it("retains the final B spawn failure for acknowledgement without a duplicate rendering failure", async () => {
    const h = await harness("spawn");
    h.ptys[0]!.exit();
    await vi.waitFor(() => expect(h.container.children).toHaveLength(1));
    expect(h.window.isDestroyed()).toBe(false);
    h.gate.resolve();
    await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
    expect(h.showSessionFailure).toHaveBeenCalledExactlyOnceWith(h.window, {
      reason: "spawn",
      launchKind: "default-shell",
    });
    expect(h.window.isDestroyed()).toBe(false);
    expect(h.ptys).toHaveLength(1);
    h.acknowledgement.resolve();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.window.isDestroyed()).toBe(true);
  });

  it("accepted Quit cancels B but waits for A's native exit independently of disposal", async () => {
    const h = await harness();
    await h.application.requestQuit();
    expect(h.window.isDestroyed()).toBe(true);
    expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
    expect(h.nativeQuitCompleted).not.toHaveBeenCalled();
    h.gate.resolve();
    await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
    expect(h.ptys).toHaveLength(1);
    expect(h.nativeQuitCompleted).not.toHaveBeenCalled();
    h.ptys[0]!.exit();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
    expect(h.showSessionFailure).not.toHaveBeenCalled();
  });

  it("explicit owner closure cancels B without waiting for rendering or starting late", async () => {
    const h = await harness();
    await h.application.closeSelectedWindow();
    expect(h.window.isDestroyed()).toBe(true);
    expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
    h.gate.resolve();
    await vi.waitFor(() => expect(h.settledMounts()).toBe(2));
    expect(h.ptys).toHaveLength(1);
    expect(h.showSessionFailure).not.toHaveBeenCalled();
    expect(h.nativeQuitCompleted).not.toHaveBeenCalled();
    h.ptys[0]!.exit();
    await vi.waitFor(() =>
      expect(h.nativeQuitCompleted).toHaveBeenCalledOnce(),
    );
  });
});
