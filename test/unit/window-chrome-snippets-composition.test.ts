import { afterEach, expect, it, vi } from "vitest";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { IpcHandler } from "../../src/main/terminal-ipc-types";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  fixtureConfigurationApplier,
  fixtureSnippetsRouter,
} from "../fixtures/window-chrome-configuration";

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
});

it.each([
  ["linux", "arm64", true],
  ["darwin", "arm64", true],
  ["linux", "x64", true],
  ["win32", "x64", false],
] as const)(
  "%s %s preserves shipping optional=%s but explicitly qualifies built-in composition",
  (os, cpu, optional) => {
    Object.defineProperty(process, "platform", { value: os });
    Object.defineProperty(process, "arch", { value: cpu });
    for (const auxiliaryOnly of [false, true]) {
      const handlers = new Map<string, IpcHandler>();
      const nativeRouter = registerTerminalIpcRouter({
        handle: (channel, handler) => {
          handlers.set(channel, handler);
        },
        removeHandler: (channel) => {
          handlers.delete(channel);
        },
        on() {},
        removeListener() {},
      });
      const router = fixtureSnippetsRouter(nativeRouter, auxiliaryOnly);
      if (!auxiliaryOnly) expect(router).toBe(nativeRouter);
      const active = {
        configuration: DEFAULT_USER_CONFIGURATION,
        userFileErrors: [],
      };
      const shipping = terminalRendererConfiguration(active, 0);
      expect(shipping.optionalSnippets).toBe(optional);
      const webContents = {
        mainFrame: {},
        isDestroyed: () => false,
        send: vi.fn(),
      };
      router.registerController({
        configuration: shipping,
        webContents,
        createSession: vi.fn(),
        onSessionExit() {},
        onSessionStartError() {},
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
      const delivered = () =>
        handlers.get(terminalIpc.configuration)!({
          sender: webContents,
          senderFrame: webContents.mainFrame,
        });
      const expected = (configuration: typeof shipping) => ({
        ...configuration,
        fontConfigurationId: expect.any(String) as unknown,
        optionalSnippets: auxiliaryOnly ? false : optional,
      });
      try {
        // Read the real controller's configuration through authenticated IPC,
        // the same value startTerminalWindow uses to include/omit built-in UI.
        expect(delivered()).toEqual(expected(shipping));
        expect(shipping.optionalSnippets).toBe(optional);
        const applyConfiguration = vi.fn();
        const background = vi.fn();
        const application = { applyConfiguration } as unknown as Parameters<
          typeof fixtureConfigurationApplier
        >[2];
        const reload = fixtureConfigurationApplier(
          router,
          [],
          application,
          background,
        );
        for (const committed of [false, true]) {
          const updated = {
            configuration: {
              ...DEFAULT_USER_CONFIGURATION,
              fontSize: 19,
              language: "pt-BR" as const,
            },
            userFileErrors: [],
          };
          reload(updated, committed);
          expect(delivered()).toEqual(
            expected(
              terminalRendererConfiguration(updated, os === "darwin" ? 30 : 0),
            ),
          );
          expect(
            terminalRendererConfiguration(updated, 0).optionalSnippets,
          ).toBe(optional);
          expect(applyConfiguration).toHaveBeenCalledTimes(committed ? 1 : 0);
          expect(background).toHaveBeenCalledTimes(committed ? 1 : 0);
        }
      } finally {
        router.dispose();
      }
      expect(handlers.size).toBe(0);
    }
  },
);
