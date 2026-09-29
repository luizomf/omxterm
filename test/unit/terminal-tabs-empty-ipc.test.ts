import { expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";

it("accepts only an owned main-frame empty notification and fixed failure reason", () => {
  const listeners = new Map<string, Parameters<IpcMainPort["on"]>[1]>();
  const router = registerTerminalIpcRouter({
    handle() {},
    removeHandler() {},
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    removeListener: (channel) => {
      listeners.delete(channel);
    },
  });
  let destroyed = false;
  const webContents = {
    mainFrame: {},
    isDestroyed: () => destroyed,
    send: vi.fn(),
  };
  const onTabsEmpty = vi.fn();
  const controller = router.registerController({
    configuration: terminalRendererConfiguration(
      { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
      0,
    ),
    webContents,
    onTabsEmpty,
    onSessionExit: vi.fn(),
    onSessionStartError: vi.fn(),
    createSession: vi.fn(),
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
  const owner = { sender: webContents, senderFrame: webContents.mainFrame };
  const send = listeners.get(terminalIpc.tabsEmpty)!;
  send({ ...owner, senderFrame: {} });
  send({ sender: { ...webContents }, senderFrame: webContents.mainFrame });
  for (const payload of [
    null,
    false,
    0,
    "arbitrary",
    {},
    { reason: "rendering-failure" },
  ])
    send(owner, payload);
  expect(onTabsEmpty).not.toHaveBeenCalled();
  send(owner);
  send(owner, "rendering-failure");
  expect(onTabsEmpty.mock.calls).toEqual([[undefined], ["rendering-failure"]]);
  destroyed = true;
  send(owner);
  controller.dispose();
  destroyed = false;
  send(owner);
  expect(onTabsEmpty).toHaveBeenCalledTimes(2);
  router.dispose();
  expect(listeners.has(terminalIpc.tabsEmpty)).toBe(false);
});
