import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";

describe("terminal export IPC", () => {
  it("saves only validated export requests from the owning window", async () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const saveTerminalExport = vi.fn(async () => undefined);
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      saveTerminalExport,
      webContents,
      createSession: () => ({
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      }),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const save = ipc.handlers.get(terminalIpc.exportSave)!;
    const owner = { sender: webContents, senderFrame: mainFrame };

    expect(() =>
      save(
        { sender: webContents, senderFrame: {} },
        { kind: "content", text: "x" },
      ),
    ).toThrow("untrusted sender");
    for (const payload of [
      undefined,
      { kind: "screen", text: "x" },
      { kind: "content", text: 1 },
      { kind: "content", text: "x", path: "/tmp/x" },
      { kind: "content", text: "é".repeat(8 * 1024 * 1024 + 1) },
    ])
      await expect(save(owner, payload)).rejects.toThrow(
        "Invalid terminal export request",
      );
    expect(saveTerminalExport).not.toHaveBeenCalled();

    await save(owner, { kind: "selection", text: "日本語\n" });
    expect(saveTerminalExport).toHaveBeenCalledExactlyOnceWith({
      kind: "selection",
      text: "日本語\n",
    });
  });

  it("forwards only owned, well-formed context-menu requests", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const options = clipboardOptions();
    registerTerminalIpcRouter(ipc.ipcMain).registerController({
      ...options,
      webContents,
      createSession: () => ({
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      }),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const contextMenu = ipc.listeners.get(terminalIpc.clipboardContextMenu)!;
    const owner = { sender: webContents, senderFrame: mainFrame };

    contextMenu(
      { sender: webContents, senderFrame: {} },
      { hasSelection: true },
    );
    contextMenu(owner);
    contextMenu(owner, { hasSelection: "yes" });
    contextMenu(owner, { hasSelection: false, kind: "content" });
    expect(options.showClipboardContextMenu).not.toHaveBeenCalled();

    contextMenu(owner, { hasSelection: false });
    expect(options.showClipboardContextMenu).toHaveBeenCalledExactlyOnceWith({
      hasSelection: false,
    });
  });
});
