// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { harness as runtime } from "../fixtures/restty-surface-harness";
import { deferred } from "../fixtures/initialization-cancellation-harness";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import {
  createUserConfigurationReloader,
  terminalSurfaceFontBaseline,
} from "../../src/main/user-configuration-reloader";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { TerminalFontData } from "../../src/shared/terminal-font-data";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";

const cleanups: Array<() => void> = [];
beforeEach(() => {
  runtime.instances.length = 0;
  runtime.setInitError(undefined);
  runtime.setInitGate(undefined);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  runtime.setInitGate(undefined);
});

function fixture(family?: string) {
  const handlers = new Map<string, Parameters<IpcMainPort["handle"]>[1]>();
  const listeners = new Map<string, Parameters<IpcMainPort["on"]>[1]>();
  const router = registerTerminalIpcRouter(
    {
      handle: (key, value) => {
        handlers.set(key, value);
      },
      on: (key, value) => {
        listeners.set(key, value);
      },
      removeHandler: (key) => {
        handlers.delete(key);
      },
      removeListener: (key) => {
        listeners.delete(key);
      },
    },
    undefined,
    async (fontFamily) => ({
      ...(fontFamily
        ? { configured: { family: fontFamily, data: new Uint8Array([1]) } }
        : {}),
      fallbacks: [],
    }),
  );
  const updates = new Set<
    (configuration: TerminalRendererConfiguration) => void
  >();
  const webContents = {
    mainFrame: {},
    isDestroyed: () => false,
    send(channel: string, payload: unknown) {
      if (channel === terminalIpc.configurationUpdate)
        for (const update of updates)
          update(payload as TerminalRendererConfiguration);
    },
  };
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  const initial = {
    configuration: {
      ...DEFAULT_USER_CONFIGURATION,
      ...(family ? { fontFamily: family } : {}),
    },
    userFileErrors: [],
  };
  const createSession = vi.fn(() => ({
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    hasForegroundChildProcess: () => false,
  }));
  router.registerController({
    webContents,
    configuration: terminalRendererConfiguration(initial, 0),
    createSession,
    onSessionStartError() {},
    onSessionExit() {},
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
  const bridge = {
    retainSurface: async (id: string) =>
      handlers.get(terminalIpc.retainSurface)!(event, id),
    releaseSurface: (id: string) =>
      listeners.get(terminalIpc.releaseSurface)!(event, id),
    start: async (id?: string) => handlers.get(terminalIpc.start)!(event, id),
    close: (sessionId: string, reason?: "rendering-failure") =>
      listeners.get(terminalIpc.close)!(event, {
        sessionId,
        ...(reason ? { reason } : {}),
      }),
    onOutput: () => () => {},
    onExit: () => () => {},
    resize() {},
    acknowledgeOutput() {},
  } as unknown as TerminalBridge;
  let requested = initial.configuration;
  let command: (value: TerminalTabCommand) => void = () => {
    throw new Error("Host not ready");
  };
  const reloader = createUserConfigurationReloader({
    initial,
    ...terminalSurfaceFontBaseline(initial.configuration),
    load: async () => ({ configuration: requested }),
    activeTerminalSurfaceFontConfigurations:
      router.activeTerminalSurfaceFontConfigurations,
    apply: (state) =>
      router.applyConfiguration(terminalRendererConfiguration(state, 0)),
  });
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  const banner = document.createElement("aside");
  document.body.replaceChildren(tabStrip, tabsContainer, banner);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration: handlers.get(terminalIpc.configuration)!(
        event,
      ) as TerminalRendererConfiguration,
      createAdapter: (id) => createElectronTerminalAdapter(bridge, id),
      mount: mountResttyTerminalSurface,
      userFileErrorBanner: banner,
      loadFontData: async (fontFamily) =>
        (await handlers.get(terminalIpc.fontData)!(
          event,
          fontFamily,
        )) as TerminalFontData,
      subscribeToTabCommands(listener) {
        command = listener;
        return () => {};
      },
      subscribeToConfigurationUpdates(listener) {
        updates.add(listener);
        return () => {
          updates.delete(listener);
        };
      },
    },
  );
  cleanups.push(() => {
    host.dispose();
    router.dispose();
  });
  return {
    host,
    router,
    banner,
    createSession,
    command: (value: TerminalTabCommand) => command(value),
    async reload(lineHeight: number, fontFamily?: string) {
      requested = {
        ...DEFAULT_USER_CONFIGURATION,
        fontLineHeight: lineHeight,
        ...(fontFamily ? { fontFamily } : {}),
      };
      await reloader.reload();
    },
  };
}

it("retains actual creation-time line height and restart notice across startup and repeated reload", async () => {
  const gate = deferred();
  runtime.setInitGate(gate.promise);
  const app = fixture();
  await vi.waitFor(() => expect(runtime.instances).toHaveLength(1));
  expect(runtime.instances[0]!.options.terminal.lineHeight).toBe(1);
  expect(app.createSession).not.toHaveBeenCalled();
  await app.reload(1.5);
  expect(app.banner.textContent).toContain("font.lineHeight");
  gate.resolve();
  await app.host.ready;
  await app.reload(1.5);
  expect(runtime.instances[0]!.options.terminal.lineHeight).toBe(1);
  expect
    .soft(app.router.activeTerminalSurfaceFontConfigurations())
    .toEqual([{ fontLineHeight: 1 }]);
  expect.soft(app.banner.textContent).toContain("font.lineHeight");
  expect(app.createSession).toHaveBeenCalledOnce();
});

it("retains the configured family captured before runtime initialization", async () => {
  const gate = deferred();
  runtime.setInitGate(gate.promise);
  const app = fixture("First Family");
  await vi.waitFor(() => expect(runtime.instances).toHaveLength(1));
  expect(runtime.instances[0]!.options.terminal.fonts?.[0]).toMatchObject({
    name: "First Family",
  });
  await app.reload(1, "Second Family");
  gate.resolve();
  await app.host.ready;
  await app.reload(1, "Second Family");
  expect(runtime.instances[0]!.options.terminal.fonts?.[0]).toMatchObject({
    name: "First Family",
  });
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontFamily: "First Family", fontLineHeight: 1 },
  ]);
  expect(app.banner.textContent).toContain("font.family");
  app.command({ action: "new" });
  await vi.waitFor(() => expect(app.createSession).toHaveBeenCalledTimes(2));
  expect(runtime.instances[1]!.options.terminal.fonts?.[0]).toMatchObject({
    name: "Second Family",
  });
  app.command({ action: "select", position: 1 });
  app.command({ action: "close" });
  await app.reload(1, "Second Family");
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontFamily: "Second Family", fontLineHeight: 1 },
  ]);
  expect(app.banner.textContent).toBe("");
});

it("counts multiple pending and existing Surfaces and releases cancelled old owners", async () => {
  const app = fixture();
  await app.host.ready;
  const gate = deferred();
  runtime.setInitGate(gate.promise);
  app.command({ action: "new" });
  app.command({ action: "new" });
  await vi.waitFor(() => expect(runtime.instances).toHaveLength(3));
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontLineHeight: 1 },
    { fontLineHeight: 1 },
    { fontLineHeight: 1 },
  ]);
  await app.reload(1.5);
  app.command({ action: "close" });
  runtime.setInitGate(undefined);
  app.command({ action: "new" });
  await vi.waitFor(() => expect(app.createSession).toHaveBeenCalledTimes(2));
  expect(runtime.instances[3]!.options.terminal.lineHeight).toBe(1.5);
  gate.resolve();
  await vi.waitFor(() => expect(app.createSession).toHaveBeenCalledTimes(3));
  await app.reload(1.5);
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontLineHeight: 1 },
    { fontLineHeight: 1 },
    { fontLineHeight: 1.5 },
  ]);
  expect(app.banner.textContent).toContain("font.lineHeight");
  app.command({ action: "select", position: 1 });
  app.command({ action: "close" });
  await app.reload(1.5);
  expect(app.banner.textContent).toContain("font.lineHeight");
  app.command({ action: "select", position: 1 });
  app.command({ action: "close" });
  await app.reload(1.5);
  expect(app.router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontLineHeight: 1.5 },
  ]);
  expect(app.banner.textContent).toBe("");
  expect(runtime.instances[2]!.destroy).toHaveBeenCalledOnce();
  expect(runtime.instances[3]!.destroy).not.toHaveBeenCalled();
});
