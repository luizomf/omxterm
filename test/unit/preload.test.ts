import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { createTerminalWindowTitleController } from "../../src/main/terminal-window-title";

const electron = vi.hoisted(() => {
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();
  return {
    bridge: undefined as TerminalBridge | undefined,
    listeners,
    send: vi.fn(),
    invoke: vi.fn(async (_channel?: string): Promise<unknown> => undefined),
    removeListener: vi.fn((channel: string) => listeners.delete(channel)),
    getPathForFile: vi.fn((file: File) => {
      if (!("name" in file)) throw new TypeError("not a File");
      return process.platform === "win32"
        ? `C:\\Users\\me\\${file.name}`
        : `/Users/me/${file.name}`;
    }),
  };
});

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  webUtils: {
    getPathForFile: electron.getPathForFile,
  },
  ipcRenderer: {
    send: electron.send,
    invoke: electron.invoke,
    on(channel: string, listener: (event: unknown, payload: unknown) => void) {
      electron.listeners.set(channel, listener);
    },
    removeListener: electron.removeListener,
  },
}));

beforeAll(async () => {
  await import("../../src/preload/index");
});

describe("isolated preload terminal bridge requests", () => {
  it("validates outbound session-scoped input, resize, and close shapes", () => {
    const bridge = electron.bridge!;

    bridge.input("s1", "hello");
    bridge.resize("s1", { cols: 80, rows: 24 });
    bridge.close("s2");
    bridge.close("s2", "rendering-failure");
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.close, {
      sessionId: "s2",
      reason: "rendering-failure",
    });
    expect(() =>
      bridge.close("s2", "untrusted" as "rendering-failure"),
    ).toThrow(TypeError);
    expect(() => bridge.input("s1", "")).toThrow(TypeError);
    expect(() => bridge.input("session-1", "hello")).toThrow(TypeError);
    expect(() => bridge.resize("s1", { cols: 0, rows: 24 })).toThrow(TypeError);
    expect(() => bridge.resize("", { cols: 80, rows: 24 })).toThrow(TypeError);
    expect(() => bridge.close("s0")).toThrow(TypeError);

    expect(electron.send).toHaveBeenCalledWith(terminalIpc.input, {
      sessionId: "s1",
      data: "hello",
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.resize, {
      sessionId: "s1",
      cols: 80,
      rows: 24,
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.close, {
      sessionId: "s2",
    });
  });

  it("sends only a fixed empty-tab reason without renderer-supplied dialog content", () => {
    const bridge = electron.bridge!;
    bridge.notifyTabsEmpty();
    bridge.notifyTabsEmpty("rendering-failure");
    expect(electron.send).toHaveBeenCalledWith(
      terminalIpc.tabsEmpty,
      undefined,
    );
    expect(electron.send).toHaveBeenCalledWith(
      terminalIpc.tabsEmpty,
      "rendering-failure",
    );
    for (const reason of [null, "arbitrary", { reason: "rendering-failure" }])
      expect(() =>
        bridge.notifyTabsEmpty(reason as "rendering-failure"),
      ).toThrow(TypeError);
  });

  it("asks for the main menu with only integer window coordinates", () => {
    const bridge = electron.bridge!;
    bridge.openMainMenu({ x: 900, y: 34, extra: "quit" } as never);
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.mainMenu, {
      x: 900,
      y: 34,
    });
    for (const position of [null, { x: 1 }, { x: -1, y: 2 }, { x: 0.5, y: 2 }])
      expect(() => bridge.openMainMenu(position as never)).toThrow(TypeError);
  });

  it("requests title synchronization using only a validated session identity", () => {
    const bridge = electron.bridge!;
    bridge.syncTabTitle("s3");
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.tabTitleSync, {
      sessionId: "s3",
    });
    for (const id of ["", "s0", "session-1"])
      expect(() => bridge.syncTabTitle(id)).toThrow(TypeError);
  });

  it("sends only validated tab selection notices", () => {
    const bridge = electron.bridge!;

    bridge.notifyTabSelection("s3");
    expect(() => bridge.notifyTabSelection("")).toThrow(TypeError);
    expect(() => bridge.notifyTabSelection("session-1")).toThrow(TypeError);

    expect(electron.send).toHaveBeenCalledWith(terminalIpc.tabSelected, {
      sessionId: "s3",
    });
  });

  it("returns only a validated Live Terminal Session identifier from start", async () => {
    const bridge = electron.bridge!;

    electron.invoke.mockResolvedValueOnce("s7");
    await expect(bridge.start()).resolves.toBe("s7");
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.start);
    electron.invoke.mockResolvedValueOnce(undefined);
    await expect(bridge.start()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce("session-1");
    await expect(bridge.start()).rejects.toThrow(TypeError);
  });

  it("validates narrow Surface ownership identities before registration, start and release", async () => {
    const bridge = electron.bridge!;
    const configurationId = "11111111-1111-4111-8111-111111111111";
    const surfaceId = "22222222-2222-4222-8222-222222222222";
    for (const invalid of ["", "arbitrary family", "-".repeat(36)]) {
      await expect(bridge.retainSurface(invalid)).rejects.toThrow(TypeError);
      await expect(bridge.start(invalid)).rejects.toThrow(TypeError);
      expect(() => bridge.releaseSurface(invalid)).toThrow(TypeError);
    }
    electron.invoke.mockResolvedValueOnce(surfaceId);
    await expect(bridge.retainSurface(configurationId)).resolves.toBe(
      surfaceId,
    );
    expect(electron.invoke).toHaveBeenLastCalledWith(
      terminalIpc.retainSurface,
      configurationId,
    );
    electron.invoke.mockResolvedValueOnce("s1");
    await expect(bridge.start(surfaceId)).resolves.toBe("s1");
    expect(electron.invoke).toHaveBeenLastCalledWith(
      terminalIpc.start,
      surfaceId,
    );
    bridge.releaseSurface(surfaceId);
    expect(electron.send).toHaveBeenLastCalledWith(
      terminalIpc.releaseSurface,
      surfaceId,
    );
    electron.invoke.mockResolvedValueOnce({ fontLineHeight: 1 });
    await expect(bridge.retainSurface(configurationId)).rejects.toThrow(
      TypeError,
    );
  });

  it("exposes one-way session-scoped title and BEL signals", () => {
    const bridge = electron.bridge!;

    bridge.title("s1", "");
    bridge.title("s1", "terminal title");
    bridge.bell("s2");
    bridge.title("s1", "x".repeat(65_537));
    expect(() => bridge.title("session-1", "title")).toThrow(TypeError);
    expect(() => bridge.bell("")).toThrow(TypeError);

    expect(electron.send).toHaveBeenCalledWith(terminalIpc.title, {
      sessionId: "s1",
      title: "",
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.title, {
      sessionId: "s1",
      title: "terminal title",
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.bell, {
      sessionId: "s2",
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.title, {
      sessionId: "s1",
      title: "x".repeat(65_537),
    });
  });

  it("delivers only validated tab title updates from main", () => {
    const bridge = electron.bridge!;
    const onTabTitle = vi.fn();
    const remove = bridge.onTabTitle(onTabTitle);

    electron.listeners.get(terminalIpc.tabTitle)?.(
      {},
      { sessionId: "s1", title: "vim" },
    );
    electron.listeners.get(terminalIpc.tabTitle)?.({}, { sessionId: "s1" });
    electron.listeners.get(terminalIpc.tabTitle)?.({}, "vim");
    electron.listeners.get(terminalIpc.tabTitle)?.(
      {},
      { sessionId: "nope", title: "vim" },
    );
    remove();

    expect(onTabTitle.mock.calls).toEqual([["s1", "vim"]]);
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.tabTitle,
      expect.any(Function),
    );
    electron.removeListener.mockClear();
  });

  it("sends an exact bounded External Link request without exposing Electron", () => {
    const bridge = electron.bridge!;
    bridge.openExternalLink("https://example.test/path");
    expect(() => bridge.openExternalLink("")).toThrow(TypeError);
    expect(electron.send).toHaveBeenCalledWith(
      terminalIpc.externalLink,
      "https://example.test/path",
    );
    expect(Object.keys(bridge)).not.toEqual(
      expect.arrayContaining(["shell", "navigate", "openWindow"]),
    );
  });

  it("exposes only bounded local image requests and validated image bytes", async () => {
    const bridge = electron.bridge!;
    const selected = {
      name: "image.png",
      mime: "image/png" as const,
      width: 1,
      height: 1,
      data: new Uint8Array([1, 2, 3]),
    };
    const fileUrl = {
      source: "file-url",
      url: "file:///tmp/image.png",
    } as const;
    const nativePath = {
      source: "native-path",
      path: "/tmp/image%23#literal.png",
    } as const;
    const reference = {
      source: "path-reference",
      path: "'../an image.png':12",
    } as const;
    for (const source of [fileUrl, nativePath, reference]) {
      electron.invoke.mockResolvedValueOnce(selected);
      await expect(bridge.loadLocalImage(source)).resolves.toEqual(selected);
      expect(electron.invoke).toHaveBeenLastCalledWith(
        terminalIpc.localImage,
        source,
      );
    }
    electron.invoke.mockResolvedValueOnce(null);
    await expect(bridge.loadLocalImage()).resolves.toBeNull();
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.localImage, {
      source: "picker",
    });
    for (const source of ["native-path", "path-reference"] as const)
      for (const path of ["", "x".repeat(32_769)])
        expect(() => bridge.loadLocalImage({ source, path })).toThrow(
          TypeError,
        );
    electron.invoke.mockResolvedValueOnce({
      ...selected,
      mime: "image/svg+xml",
    });
    await expect(bridge.loadLocalImage()).rejects.toThrow(TypeError);
  });

  it("delivers only an empty native local-image menu signal", () => {
    const bridge = electron.bridge!;
    const listener = vi.fn();
    const remove = bridge.onLocalImageOpen(listener);
    electron.listeners.get(terminalIpc.localImageOpen)?.({}, undefined);
    electron.listeners.get(terminalIpc.localImageOpen)?.({}, "forged");
    remove();
    expect(listener).toHaveBeenCalledOnce();
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.localImageOpen,
      expect.any(Function),
    );
  });

  it("delivers an oversized parser title through preload and main to the safe native fallback", async () => {
    const handlers = new Map<
      string,
      (event: IpcEvent, payload?: unknown) => unknown
    >();
    const listeners = new Map<
      string,
      (event: IpcEvent, payload?: unknown) => void
    >();
    const ipcMain: IpcMainPort = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
      on: (channel, listener) => listeners.set(channel, listener),
      removeListener: (channel) => listeners.delete(channel),
    };
    const frame = {};
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const event = { sender: webContents, senderFrame: frame };
    const nativeTitles: string[] = [];
    const sessionTitles: string[] = [];
    const titleController = createTerminalWindowTitleController(
      {
        isFocused: () => true,
        setTitle: (title) => nativeTitles.push(title),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      {
        fallbackSessionTitle: "example-shell",
        requestAttention: vi.fn(() => vi.fn()),
        sendSessionTitle: (_sessionId, title) => sessionTitles.push(title),
      },
    );
    const router = registerTerminalIpcRouter(ipcMain);
    const routed = router.registerController({
      configuration: {
        fontSize: 16,
        fontLineHeight: 1,
        fontLigatures: true,
        terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10_000,
        optionKeyMode: "none",
        nativeTitleInset: 0,
        showTabBar: true,
        transparency: 0,
        terminalTheme: DEFAULT_TERMINAL_THEME,
        userFileErrors: [],
      },
      webContents,
      createSession: vi.fn(() => ({
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      })),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
      onSessionStarted: titleController.sessionStarted,
      onSessionSelected: titleController.selectSession,
      onTitleRequest: titleController.requestTitle,
      onBell: titleController.ringBell,
      onUserInteraction: titleController.resetAttention,
      openExternalLink: vi.fn(async () => {}),
      onExternalLinkOpenError: vi.fn(),
      writeClipboardText: vi.fn(),
      readClipboardText: vi.fn(() => ""),
      confirmPaste: vi.fn(async () => false),
      showClipboardContextMenu: vi.fn(),
      loadSnippets: vi.fn(async () => ({ snippets: [] })),
      loadLocalImage: vi.fn(async () => null),
    });
    electron.send.mockImplementation((channel: string, payload?: unknown) =>
      listeners.get(channel)?.(event, payload),
    );
    handlers.get(terminalIpc.start)!(event);
    electron.bridge!.notifyTabSelection("s1");
    const canary = `CANARY${"x".repeat(65_537)}`;

    electron.bridge!.title("s1", canary);

    // Window: startup fallback, selection mirror, then the rejected request
    // landing back on the Default Shell fallback — never the canary.
    expect(nativeTitles).toEqual(["OMXTerm", "example-shell", "example-shell"]);
    expect(sessionTitles).toEqual(["example-shell", "example-shell"]);
    expect(JSON.stringify(nativeTitles)).not.toContain("CANARY");
    expect(JSON.stringify(sessionTitles)).not.toContain("CANARY");

    routed.dispose();
    router.dispose();
    titleController.dispose();
    electron.send.mockReset();
  });
});

describe("isolated preload terminal bridge responses", () => {
  it("exposes only bounded font bytes for an exact family request", async () => {
    const bridge = electron.bridge!;
    electron.invoke.mockResolvedValueOnce({
      configured: {
        family: "Exact Família",
        data: new Uint8Array([0, 1, 0, 0]),
      },
      fallbacks: [
        { family: "Local Emoji", data: new Uint8Array([1, 2, 3, 4]) },
      ],
    });
    await expect(bridge.fontData("Exact Família")).resolves.toMatchObject({
      configured: { family: "Exact Família" },
    });
    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.fontData,
      "Exact Família",
    );
    await expect(bridge.fontData("bad\0family")).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      configured: { family: "Exact Família", path: "/tmp/font.ttf" },
      fallbacks: [],
    });
    await expect(bridge.fontData("Exact Família")).rejects.toThrow(TypeError);
  });

  it("exposes only a validated Snippets response and a payload-free toggle", async () => {
    const bridge = electron.bridge!;
    const valid = {
      snippets: [
        { name: "greet", body: "printf hi", execute: false },
        { name: "up", body: "brew update", description: "d", execute: true },
      ],
      error: "Snippets broke",
    };
    electron.invoke.mockResolvedValueOnce(valid);
    await expect(bridge.snippets()).resolves.toEqual(valid);
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.snippets);
    for (const invalid of [
      undefined,
      { snippets: [{ name: "a", body: "b" }] },
      { snippets: [{ name: "a", body: "b", execute: "yes" }] },
      { snippets: [], error: "" },
      { snippets: [], extra: true },
    ]) {
      electron.invoke.mockResolvedValueOnce(invalid);
      await expect(bridge.snippets()).rejects.toThrow(TypeError);
    }

    const onToggle = vi.fn();
    const remove = bridge.onSnippetsToggle(onToggle);
    electron.listeners.get(terminalIpc.snippetsToggle)?.({}, undefined);
    electron.listeners.get(terminalIpc.snippetsToggle)?.({}, "payload");
    remove();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.snippetsToggle,
      expect.any(Function),
    );
    electron.removeListener.mockClear();
  });

  it.each(["tabBarToggle", "titleBarToggle"] as const)(
    "accepts only payload-free %s notifications and removes the exact handler",
    (channel) => {
      const listener = vi.fn();
      const remove =
        channel === "tabBarToggle"
          ? electron.bridge!.onTabBarToggle(listener)
          : electron.bridge!.onTitleBarToggle(listener);
      const handler = electron.listeners.get(terminalIpc[channel])!;
      for (const payload of [null, false, 0, "", {}, []]) handler({}, payload);
      expect(listener).not.toHaveBeenCalled();
      handler({}, undefined);
      expect(listener).toHaveBeenCalledOnce();
      remove();
      expect(electron.removeListener).toHaveBeenCalledWith(
        terminalIpc[channel],
        handler,
      );
      electron.removeListener.mockClear();
    },
  );

  it("validates narrow Window Chrome commands and complete bounded snapshots", () => {
    const bridge = electron.bridge!;
    electron.send.mockClear();
    for (const command of [
      "sync",
      "toggle-title-bar",
      "minimize",
      "maximize",
      "close",
      "preview-active",
      "preview-inactive",
    ] as const) {
      bridge.windowChrome(command);
      expect(electron.send).toHaveBeenLastCalledWith(
        terminalIpc.windowChromeCommand,
        command,
      );
    }
    for (const command of [undefined, null, {}, true, "destroy"])
      expect(() => bridge.windowChrome(command as "close")).toThrow(TypeError);
    const listener = vi.fn();
    const remove = bridge.onWindowChrome(listener);
    expect(electron.send).toHaveBeenLastCalledWith(
      terminalIpc.windowChromeCommand,
      "sync",
    );
    const handler = electron.listeners.get(terminalIpc.windowChromeState)!;
    const state = {
      style: "native",
      titleBarVisible: false,
      fullScreen: false,
      maximized: true,
      handleVisible: true,
      title: "🔔 accepted title",
    };
    for (const payload of [
      null,
      {},
      { ...state, extra: true },
      { ...state, style: "unknown" },
      { ...state, handleVisible: 1 },
      { ...state, fullScreen: "false" },
      { ...state, titleBarVisible: undefined },
      { ...state, maximized: null },
      { ...state, title: "x".repeat(259) },
      { ...state, title: "bad\nline" },
      { ...state, title: "bad\u202e" },
    ])
      handler({}, payload);
    expect(listener).not.toHaveBeenCalled();
    handler({}, state);
    expect(listener).toHaveBeenCalledExactlyOnceWith(state);
    remove();
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.windowChromeState,
      handler,
    );
    electron.removeListener.mockClear();
  });

  it("delivers only valid bounded messages from main and removes subscriptions", () => {
    const bridge = electron.bridge!;
    const onOutput = vi.fn();
    const onExit = vi.fn();
    const removeOutput = bridge.onOutput(onOutput);
    const removeExit = bridge.onExit(onExit);

    electron.listeners.get(terminalIpc.output)?.(
      {},
      { sessionId: "s1", data: "output", end: 6 },
    );
    electron.listeners.get(terminalIpc.output)?.(
      {},
      { sessionId: "s1", data: "" },
    );
    electron.listeners.get(terminalIpc.output)?.({}, "output");
    electron.listeners.get(terminalIpc.exit)?.(
      {},
      { sessionId: "s2", exitCode: 0, signal: 0 },
    );
    electron.listeners.get(terminalIpc.exit)?.({}, { exitCode: 0, signal: 0 });
    electron.listeners.get(terminalIpc.exit)?.(
      {},
      { sessionId: "s2", exitCode: "0", signal: 0 },
    );
    removeOutput();
    removeExit();

    expect(onOutput).toHaveBeenCalledOnce();
    expect(onOutput).toHaveBeenCalledWith("s1", "output", 6);
    expect(onExit).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith("s2", { exitCode: 0, signal: 0 });
    expect(electron.removeListener).toHaveBeenCalledTimes(2);
  });

  it("delivers only valid tab commands from main", () => {
    const bridge = electron.bridge!;
    const onTabCommand = vi.fn();
    const remove = bridge.onTabCommand(onTabCommand);

    electron.listeners.get(terminalIpc.tabCommand)?.({}, { action: "new" });
    electron.listeners.get(terminalIpc.tabCommand)?.({}, { action: "close" });
    electron.listeners.get(terminalIpc.tabCommand)?.(
      {},
      { action: "select", position: 4 },
    );
    electron.listeners.get(terminalIpc.tabCommand)?.(
      {},
      { action: "close-session", sessionId: "s3" },
    );
    electron.listeners.get(terminalIpc.tabCommand)?.({}, { action: "detach" });
    electron.listeners.get(terminalIpc.tabCommand)?.(
      {},
      { action: "select", position: 10 },
    );
    electron.listeners.get(terminalIpc.tabCommand)?.({}, "new");
    remove();

    expect(onTabCommand.mock.calls).toEqual([
      [{ action: "new" }],
      [{ action: "close" }],
      [{ action: "select", position: 4 }],
      [{ action: "close-session", sessionId: "s3" }],
    ]);
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.tabCommand,
      expect.any(Function),
    );
    electron.removeListener.mockClear();
  });

  it("delivers only complete validated renderer configuration updates from main", () => {
    const bridge = electron.bridge!;
    const listener = vi.fn();
    const remove = bridge.onConfigurationUpdate(listener);
    const valid = {
      fontFamily: "SF Mono",
      fontSize: 24,
      fontLineHeight: 1.25,
      fontLigatures: true,
      terminalPadding: { top: 1, right: 2, bottom: 3, left: 4 },
      scrollbackLines: 500,
      optionKeyMode: "left",
      transparency: 0,
      nativeTitleInset: 30,
      showTabBar: true,
      terminalTheme: {
        ...DEFAULT_TERMINAL_THEME,
        name: "updated",
        colors: {
          ...DEFAULT_TERMINAL_THEME.colors,
          background: "#123456",
        },
      },
      userFileErrors: ["reload failed"],
    };

    electron.listeners.get(terminalIpc.configurationUpdate)?.({}, valid);
    electron.listeners.get(terminalIpc.configurationUpdate)?.(
      {},
      {
        ...valid,
        terminalTheme: {
          ...valid.terminalTheme,
          colors: { ...valid.terminalTheme.colors, background: "black" },
        },
      },
    );
    electron.listeners.get(terminalIpc.configurationUpdate)?.(
      {},
      { ...valid, fontLigatures: "false" },
    );
    for (const showTabBar of [undefined, null, "false", 0])
      electron.listeners.get(terminalIpc.configurationUpdate)?.(
        {},
        { ...valid, showTabBar },
      );
    electron.listeners.get(terminalIpc.configurationUpdate)?.(
      {},
      {
        ...valid,
        userFileErrors: ["x".repeat(65_537)],
      },
    );
    electron.listeners.get(terminalIpc.configurationUpdate)?.(
      {},
      {
        ...valid,
        extra: true,
      },
    );
    remove();
    electron.listeners.get(terminalIpc.configurationUpdate)?.({}, valid);

    expect(listener).toHaveBeenCalledExactlyOnceWith(valid);

    electron.listeners.get(terminalIpc.configurationUpdate)?.(
      {},
      { terminalTheme: DEFAULT_TERMINAL_THEME, userFileErrors: [] },
    );
  });

  it("reconciles fullscreen and reload updates while configuration is in flight", async () => {
    const bridge = electron.bridge!;
    const configuration = {
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      transparency: 0,
      nativeTitleInset: 30,
      showTabBar: true,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: ["startup warning"],
    } as const;
    const update = {
      ...configuration,
      nativeTitleInset: 0,
      fontSize: 25,
      scrollbackLines: 0,
      optionKeyMode: "both",
      terminalTheme: {
        ...DEFAULT_TERMINAL_THEME,
        name: "received during startup",
        colors: {
          ...DEFAULT_TERMINAL_THEME.colors,
          background: "#123456",
        },
      },
      userFileErrors: [],
    } as const;
    let resolveConfiguration: (value: unknown) => void = () => {};
    electron.invoke.mockReturnValueOnce(
      new Promise<unknown>((resolve) => {
        resolveConfiguration = resolve;
      }),
    );

    const pendingConfiguration = bridge.configuration();
    electron.listeners.get(terminalIpc.configurationUpdate)?.({}, update);
    resolveConfiguration(configuration);

    await expect(pendingConfiguration).resolves.toEqual(update);
    const listener = vi.fn();
    const remove = bridge.onConfigurationUpdate(listener);
    expect(listener).toHaveBeenCalledExactlyOnceWith(update);
    remove();

    electron.listeners.get(terminalIpc.configurationUpdate)?.(
      {},
      { terminalTheme: DEFAULT_TERMINAL_THEME, userFileErrors: [] },
    );
  });

  it("delivers only valid Window Font Zoom commands from main", () => {
    const bridge = electron.bridge!;
    const onFontZoom = vi.fn();
    const remove = bridge.onFontZoom(onFontZoom);

    electron.listeners.get(terminalIpc.fontZoom)?.({}, "in");
    electron.listeners.get(terminalIpc.fontZoom)?.({}, "application");
    electron.listeners.get(terminalIpc.fontZoom)?.({}, "reset");
    remove();

    expect(onFontZoom.mock.calls).toEqual([["in"], ["reset"]]);
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.fontZoom,
      expect.any(Function),
    );
  });

  it("exposes only a validated renderer configuration response", async () => {
    const bridge = electron.bridge!;
    const configuration = {
      fontFamily: "SF Mono",
      fontSize: 18,
      fontLineHeight: 1.15,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 12, bottom: 8, left: 12 },
      scrollbackLines: 500,
      optionKeyMode: "right",
      transparency: 0,
      nativeTitleInset: 30,
      showTabBar: true,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    };
    electron.invoke.mockResolvedValueOnce(configuration);
    await expect(bridge.configuration()).resolves.toEqual(configuration);
    for (const transparency of [
      undefined,
      null,
      "0.5",
      true,
      NaN,
      Infinity,
      -0.01,
      1.01,
    ]) {
      electron.invoke.mockResolvedValueOnce({ ...configuration, transparency });
      await expect(bridge.configuration()).rejects.toThrow(TypeError);
    }
    for (const transparency of [0, 0.375, 1]) {
      electron.invoke.mockResolvedValueOnce({ ...configuration, transparency });
      await expect(bridge.configuration()).resolves.toMatchObject({
        transparency,
      });
    }
    electron.invoke.mockResolvedValueOnce({ ...configuration, blurRadius: 10 });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      ...configuration,
      fontLigatures: 0,
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      ...configuration,
      nativeTitleInset: 1,
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({ fontSize: "18" });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      fontSize: 18,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 500,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      terminalTheme: {
        ...DEFAULT_TERMINAL_THEME,
        colors: { ...DEFAULT_TERMINAL_THEME.colors, background: "black" },
      },
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      fontSize: 18,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 129 },
      scrollbackLines: 500,
      optionKeyMode: "none",
      nativeTitleInset: 0,
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      fontSize: 18,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 500,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [42],
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.configuration);
  });

  it("extracts and formats only bounded dropped File objects through webUtils", () => {
    const bridge = electron.bridge!;
    const files = [
      new File([""], "A B.txt"),
      new File([""], "O'Brien $100.txt"),
    ];

    expect(bridge.droppedFilePathInsertion(files)).toBe(
      process.platform === "win32"
        ? "'C:\\Users\\me\\A B.txt' 'C:\\Users\\me\\O''Brien $100.txt'"
        : "'/Users/me/A B.txt' '/Users/me/O'\\''Brien $100.txt'",
    );
    expect(electron.getPathForFile.mock.calls.map(([file]) => file)).toEqual(
      files,
    );
    expect(bridge.droppedFilePathInsertion([])).toBe("");
    expect(() => bridge.droppedFilePathInsertion([{} as File])).not.toThrow();
    expect(bridge.droppedFilePathInsertion([{} as File])).toBe("");
    expect(Object.keys(bridge)).not.toEqual(
      expect.arrayContaining(["webUtils", "getPathForFile"]),
    );
  });

  it("exposes only text clipboard operations and validates both directions", async () => {
    const bridge = electron.bridge!;
    electron.invoke.mockImplementation(async (channel?: string) => {
      if (channel === terminalIpc.clipboardRead) return "pasted text";
      if (channel === terminalIpc.clipboardConfirmPaste) return true;
      return undefined;
    });

    await bridge.writeClipboardText("copied text");
    await expect(bridge.readClipboardText()).resolves.toBe("pasted text");
    await expect(bridge.confirmPaste("one\ntwo")).resolves.toBe(true);
    await expect(bridge.writeClipboardText("")).rejects.toThrow(TypeError);

    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.clipboardWrite,
      "copied text",
    );
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.clipboardRead);
    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.clipboardConfirmPaste,
      "one\ntwo",
    );
    expect(Object.keys(bridge)).not.toEqual(
      expect.arrayContaining(["readClipboardImage", "writeClipboardImage"]),
    );
  });
});
