// @vitest-environment jsdom
import { Terminal, type ILink, type ILinkProvider } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalSessionAdapter } from "../../src/terminal-surface/terminal-session-adapter";
import {
  ignoreOscLinks,
  registerVisibleWebLinks,
} from "../../src/terminal-surface/visible-web-links";

const electron = vi.hoisted(() => ({
  bridge: undefined as TerminalBridge | undefined,
  send: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  ipcRenderer: {
    send: electron.send,
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

await import("../../src/preload/index");

function write(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

function providerLinks(provider: ILinkProvider, line = 1): Promise<ILink[]> {
  return new Promise((resolve) =>
    provider.provideLinks(line, (value) => resolve(value ?? [])),
  );
}

async function linksFor(
  data: string,
  cols = 120,
  activate: (value: string) => void = vi.fn(),
  platform = "MacIntel",
): Promise<{ links: ILink[]; activate: (value: string) => void }> {
  const terminal = new Terminal({ cols, rows: 8 });
  let provider: ILinkProvider | undefined;
  terminal.registerLinkProvider = vi.fn((value: ILinkProvider) => {
    provider = value;
    return { dispose: vi.fn() };
  });
  registerVisibleWebLinks(terminal, activate, platform);
  await write(terminal, data);
  const links = await new Promise<ILink[]>((resolve) =>
    provider!.provideLinks(1, (value) => resolve(value ?? [])),
  );
  terminal.dispose();
  return { links, activate };
}

describe("pinned @xterm/addon-web-links 0.12.0 visible span contract", () => {
  it.each([
    ["See https://example.test/path, now", "https://example.test/path"],
    ["[http://one.test/a]", "http://one.test/a"],
    ["(https://example.test/a(b)c)", "https://example.test/a"],
  ])("owns punctuation and bracket span for %s", async (data, expected) => {
    const { links } = await linksFor(data);
    expect(links.map((link) => link.text)).toEqual([expected]);
  });

  it("finds multiple nearby URLs and a URL across a soft wrap", async () => {
    const nearby = await linksFor("http://one.test/a https://two.test/b");
    expect(nearby.links.map((link) => link.text)).toEqual([
      "http://one.test/a",
      "https://two.test/b",
    ]);
    const wrapped = await linksFor("prefix https://example.test/wrapped", 18);
    expect(wrapped.links.map((link) => link.text)).toEqual([
      "https://example.test/wrapped",
    ]);
  });

  it("opens a provider-owned URL longer than 2,048 characters across soft wraps unchanged", async () => {
    const url = `https://example.test/${"a".repeat(2_100)}`;
    const opener = vi.fn(async () => {});
    const listeners = new Map<
      string,
      (event: IpcEvent, payload?: unknown) => void
    >();
    const ipcMain: IpcMainPort = {
      handle: vi.fn(),
      removeHandler: vi.fn(),
      on: (channel, listener) => listeners.set(channel, listener),
      removeListener: (channel) => listeners.delete(channel),
    };
    const frame = {};
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const router = registerTerminalIpcRouter(ipcMain);
    const controller = router.registerController({
      configuration: {
        fontSize: 16,
        fontLineHeight: 1,
        terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10_000,
        optionKeyMode: "none",
        nativeTitleInset: 0,
        terminalTheme: DEFAULT_TERMINAL_THEME,
        userFileErrors: [],
      },
      webContents,
      createSession: vi.fn(),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
      onSessionStarted: vi.fn(),
      onSessionSelected: vi.fn(),
      writeClipboardText: vi.fn(),
      readClipboardText: vi.fn(() => ""),
      confirmPaste: vi.fn(async () => false),
      showClipboardContextMenu: vi.fn(),
      onTitleRequest: vi.fn(),
      onBell: vi.fn(),
      onUserInteraction: vi.fn(),
      openExternalLink: opener,
      onExternalLinkOpenError: vi.fn(),
      loadSnippets: vi.fn(async () => ({ snippets: [] })),
    });
    electron.send.mockImplementation((channel: string, payload?: unknown) =>
      listeners.get(channel)?.(
        { sender: webContents, senderFrame: frame },
        payload,
      ),
    );

    let rendererExternalLink: ((url: string) => void) | undefined;
    const tabStrip = document.createElement("nav");
    tabStrip.hidden = true;
    const tabsContainer = document.createElement("div");
    document.body.append(tabStrip, tabsContainer);
    const host = mountTerminalWindowPage(
      { tabStrip, tabsContainer },
      {
        createAdapter: () => ({
          sessionId: () => undefined,
          start: vi.fn(async () => {}),
          write: vi.fn(),
          resize: vi.fn(),
          close: vi.fn(),
        }),
        onExternalLink: electron.bridge!.openExternalLink,
        mount: async (
          _container: HTMLElement,
          _adapter: TerminalSessionAdapter,
          options: unknown,
        ) => {
          rendererExternalLink = (
            options as { readonly onExternalLink?: (url: string) => void }
          ).onExternalLink;
          return {
            focus: vi.fn(),
            applyTheme: vi.fn(),
            applyConfiguration: vi.fn(),
            zoom: vi.fn(),
            copy: vi.fn(async () => {}),
            paste: vi.fn(async () => {}),
            inject: vi.fn(async () => {}),
            selectAll: vi.fn(),
            dispose: vi.fn(),
          };
        },
      },
    );
    await host.ready;

    const { links } = await linksFor(url, 80, rendererExternalLink);
    const link = links[0]!;

    expect(link.text).toBe(url);
    expect(() =>
      link.activate(
        new MouseEvent("click", { button: 0, metaKey: true }),
        link.text,
      ),
    ).not.toThrow();

    expect(opener).toHaveBeenCalledOnce();
    expect(opener).toHaveBeenCalledWith(url);

    host.dispose();
    controller.dispose();
    router.dispose();
    electron.send.mockReset();
  });

  it.each([
    ["ST", "\u001b]8;;https://hidden.test/path\u001b\\", "\u001b]8;;\u001b\\"],
    ["BEL", "\u001b]8;;https://hidden.test/path\u0007", "\u001b]8;;\u0007"],
  ])(
    "removes the native OSC 8 provider overlap for split %s controls while preserving the visible URL provider",
    async (_variant, start, end) => {
      const terminal = new Terminal({ cols: 120, rows: 8 });
      const ignoredOscLinks = ignoreOscLinks(terminal);
      const activate = vi.fn();
      const webLinks = registerVisibleWebLinks(terminal, activate, "MacIntel");
      await write(terminal, start.slice(0, -1));
      await write(terminal, `${start.slice(-1)}https://visible`);
      await write(terminal, ".test/path");
      await write(terminal, end.slice(0, -1));
      await write(terminal, end.slice(-1));

      const providers = (
        terminal as unknown as {
          _core: {
            _linkProviderService: { linkProviders: ILinkProvider[] };
          };
        }
      )._core._linkProviderService.linkProviders;
      expect(providers).toHaveLength(2);
      expect(await providerLinks(providers[0]!)).toEqual([]);
      const visibleLinks = await providerLinks(providers[1]!);
      expect(visibleLinks.map((link) => link.text)).toEqual([
        "https://visible.test/path",
      ]);

      const visibleLink = visibleLinks[0]!;
      visibleLink.activate(
        new MouseEvent("click", { button: 0, metaKey: true }),
        visibleLink.text,
      );
      expect(activate).toHaveBeenCalledOnce();
      expect(activate).toHaveBeenCalledWith("https://visible.test/path");

      webLinks.dispose();
      ignoredOscLinks.dispose();
      terminal.dispose();
    },
  );

  it.each([
    ["macOS", "MacIntel", true],
    ["Linux", "Linux aarch64", false],
  ])(
    "requires only the native primary-button modifier on %s",
    async (_name, platform, usesMeta) => {
      const { links, activate } = await linksFor(
        "https://example.test/a",
        120,
        vi.fn(),
        platform,
      );
      const link = links[0]!;
      link.activate(new MouseEvent("click", { button: 0 }), link.text);
      link.activate(
        new MouseEvent("click", { button: 0, metaKey: usesMeta }),
        link.text,
      );
      link.activate(
        new MouseEvent("click", { button: 0, ctrlKey: !usesMeta }),
        link.text,
      );
      link.activate(
        new MouseEvent("click", {
          button: 1,
          metaKey: usesMeta,
          ctrlKey: !usesMeta,
        }),
        link.text,
      );
      expect(activate).toHaveBeenCalledExactlyOnceWith(
        "https://example.test/a",
      );
    },
  );

  it("does not expose uppercase protocols as visible links", async () => {
    const { links } = await linksFor(
      "HTTP://upper.test HTTPS://upper.test http://lower.test",
    );
    expect(links.map((link) => link.text)).toEqual(["http://lower.test"]);
  });
});
