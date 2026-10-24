import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { MAX_TERMINAL_EXPORT_BYTES } from "../../src/shared/terminal-contract";
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
    const saveTerminalExport = vi.fn(
      async (_request: unknown, _isOwnerAlive: () => boolean) => undefined,
    );
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const controller = router.registerController({
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
      {
        kind: "content",
        text: "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2) + "a",
      },
      { notice: "too-large", text: "untrusted" },
      { notice: "other" },
    ])
      await expect(save(owner, payload)).rejects.toThrow(
        "Invalid terminal export request",
      );
    expect(saveTerminalExport).not.toHaveBeenCalled();

    await save(owner, { kind: "selection", text: "日本語\n" });
    expect(saveTerminalExport).toHaveBeenCalledExactlyOnceWith(
      {
        kind: "selection",
        text: "日本語\n",
      },
      expect.any(Function),
    );
    const isOwnerAlive = vi.mocked(saveTerminalExport).mock.calls[0]![1];
    expect(isOwnerAlive()).toBe(true);
    saveTerminalExport.mockClear();
    const text = "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2);
    await save(owner, { kind: "content", text });
    expect(saveTerminalExport).toHaveBeenCalledExactlyOnceWith(
      { kind: "content", text },
      expect.any(Function),
    );
    saveTerminalExport.mockClear();
    await save(owner, { notice: "too-large" });
    expect(saveTerminalExport).toHaveBeenCalledExactlyOnceWith(
      { notice: "too-large" },
      expect.any(Function),
    );
    controller.dispose();
    expect(isOwnerAlive()).toBe(false);
    saveTerminalExport.mockClear();
    expect(() => save(owner, { kind: "content", text: "late" })).toThrow(
      "untrusted sender",
    );
    expect(saveTerminalExport).not.toHaveBeenCalled();
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
      { target: "terminal", hasSelection: true, contextId: 1 },
    );
    contextMenu(owner);
    contextMenu(owner, { target: "terminal", hasSelection: "yes" });
    contextMenu(owner, { target: "field", hasSelection: true });
    contextMenu(owner, { hasSelection: false });
    expect(options.showClipboardContextMenu).not.toHaveBeenCalled();

    contextMenu(owner, {
      target: "terminal",
      hasSelection: false,
      contextId: 1,
    });
    contextMenu(owner, { target: "field" });
    expect(options.showClipboardContextMenu.mock.calls).toEqual([
      [{ target: "terminal", hasSelection: false, contextId: 1 }],
      [{ target: "field" }],
    ]);
  });
});
