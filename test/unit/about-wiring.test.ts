import { expect, it, vi } from "vitest";
import { startAbout } from "../../src/main/about-wiring";
import { aboutIpc } from "../../src/shared/about";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";
import type { IpcHandler, IpcEvent } from "../../src/main/terminal-ipc-types";

it("shares registered main-frame trust and revokes it when the controller closes", async () => {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const sender = { mainFrame: {}, isDestroyed: () => false, send: vi.fn() };
  const event = { sender, senderFrame: sender.mainFrame };
  const about = startAbout({
    ipcMain: ipc.ipcMain,
    isTrustedSender: router.isTrustedSender,
    getVersion: () => "1",
    openExternal: async () => {},
    selectedContents: () => sender,
  });
  const info = ipc.handlers.get(aboutIpc.info)!;
  await expect(info(event)).rejects.toThrow();
  const controller = router.registerController({
    ...clipboardOptions(),
    webContents: sender,
    createSession: () => {
      throw new Error("No PTY in About test");
    },
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
  });
  await expect(info(event)).resolves.toMatchObject({ version: "1" });
  await expect(info({ ...event, senderFrame: {} })).rejects.toThrow();
  await expect(info(event, "unexpected")).rejects.toThrow();
  controller.dispose();
  await expect(info(event)).rejects.toThrow();
  about.dispose();
  router.dispose();
});

it("supplies running metadata and accepts only fixed links from a live trusted owner", async () => {
  const handlers = new Map<string, IpcHandler>();
  const sender = { mainFrame: {}, isDestroyed: () => false, send: vi.fn() };
  const event: IpcEvent = { sender, senderFrame: sender.mainFrame };
  let trusted = true;
  const openExternal = vi.fn(async () => {});
  const about = startAbout({
    ipcMain: {
      handle: (name, handler) => {
        handlers.set(name, handler);
      },
      removeHandler: (name) => {
        handlers.delete(name);
      },
    },
    isTrustedSender: (e) =>
      trusted && e.sender === sender && e.senderFrame === sender.mainFrame,
    getVersion: () => "9.8.7",
    openExternal,
    selectedContents: () => sender,
  });
  expect(await handlers.get(aboutIpc.info)!(event)).toEqual({
    name: "OMXTerm",
    version: "9.8.7",
    copyright: "Copyright © 2026 Luiz Otávio Miranda",
  });
  const link = handlers.get(aboutIpc.openLink)!;
  for (const [key, url] of [
    ["website", "https://github.com/luizomf/omxterm"],
    [
      "contributors",
      "https://github.com/luizomf/omxterm/blob/main/CONTRIBUTORS.md",
    ],
    ["issues", "https://github.com/luizomf/omxterm/issues"],
    ["license", "https://github.com/luizomf/omxterm/blob/main/LICENSE"],
  ]) {
    await link(event, key);
    expect(openExternal).toHaveBeenLastCalledWith(url);
  }
  for (const invalid of [
    "https://example.org",
    "file:///tmp/a",
    "__proto__",
    {},
    null,
  ])
    await expect(link(event, invalid)).rejects.toThrow("Invalid About request");
  await expect(link({ ...event, senderFrame: {} }, "website")).rejects.toThrow(
    "Rejected About sender",
  );
  about.show();
  expect(sender.send).toHaveBeenCalledWith(aboutIpc.open, undefined);
  trusted = false;
  await expect(link(event, "website")).rejects.toThrow("Rejected About sender");
  sender.send.mockClear();
  about.show();
  expect(sender.send).not.toHaveBeenCalled();
  about.dispose();
  expect(handlers.size).toBe(0);
  await expect(link(event, "website")).rejects.toThrow();
});
