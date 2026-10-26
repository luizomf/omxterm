import { describe, expect, it, vi } from "vitest";
import {
  exportBoundary,
  registerTerminalExportIpc,
} from "../../src/main/terminal-export-ipc";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import {
  MAX_TERMINAL_EXPORT_BYTES,
  utf8ByteLength,
} from "../../src/shared/terminal-contract";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";

const invalidPayloads = () => [
  undefined,
  null,
  [],
  { kind: "screen", text: "x" },
  { kind: "selection" },
  { kind: "content", text: 1 },
  { kind: "content", text: "x", path: "/synthetic/x" },
  { kind: "content", text: "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2) + "a" },
  { kind: "content", overLimit: true },
  { notice: "too-large", text: "untrusted" },
  { notice: "too-large", kind: "selection" },
  { notice: "other" },
];

describe("terminal export save boundary", () => {
  it("measures UTF-8 bytes including Unicode and unpaired surrogates", () => {
    for (const [text, bytes] of [
      ["abc", 3],
      ["é", 2],
      ["日本", 6],
      ["👩‍💻", 11],
      ["\ud800", 3],
    ] as const)
      expect(utf8ByteLength(text)).toBe(bytes);
    for (const text of ["", "plain", "é日👩‍💻\ud800x", "\udc00\ud800"])
      expect(utf8ByteLength(text)).toBe(
        new TextEncoder().encode(text).byteLength,
      );
  });

  it("rejects invalid or oversized requests without invoking the save service", async () => {
    const exportText = vi.fn(async () => undefined);
    const reject = vi.fn();
    const save = exportBoundary({ exportText }, reject, () => true);
    for (const payload of invalidPayloads())
      await expect(save(payload)).rejects.toThrow(
        "Invalid terminal export request",
      );
    expect(exportText).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(invalidPayloads().length);
    expect(
      reject.mock.calls.every(
        (call) =>
          call.length === 2 &&
          call[0] === "ipc" &&
          call[1] === "invalid-payload",
      ),
    ).toBe(true);
  });

  it("rejects a missing save capability", async () => {
    const reject = vi.fn();
    await expect(
      exportBoundary({}, reject, () => true)({ notice: "too-large" }),
    ).rejects.toThrow("Invalid terminal export request");
    expect(reject).toHaveBeenCalledExactlyOnceWith("ipc", "invalid-payload");
  });

  it("does not start a validated save after owner loss", async () => {
    const exportText = vi.fn(async () => undefined);
    const reject = vi.fn();
    const save = exportBoundary({ exportText }, reject, () => false);
    await save({ kind: "content", text: "synthetic" });
    await save({ notice: "too-large" });
    expect(exportText).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
  });

  it("forwards exact-bound text and the small notice with the live owner predicate", async () => {
    let alive = true;
    const isOwnerAlive = () => alive;
    const exportText = vi.fn(
      async (_request: unknown, _alive: () => boolean) => undefined,
    );
    const save = exportBoundary({ exportText }, vi.fn(), isOwnerAlive);
    for (const text of [
      "a".repeat(MAX_TERMINAL_EXPORT_BYTES),
      "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2),
      "👩".repeat(MAX_TERMINAL_EXPORT_BYTES / 4),
    ]) {
      await save({ kind: "content", text });
      expect(exportText).toHaveBeenLastCalledWith(
        { kind: "content", text },
        isOwnerAlive,
      );
    }
    await save({ notice: "too-large" });
    expect(exportText).toHaveBeenLastCalledWith(
      { notice: "too-large" },
      isOwnerAlive,
    );
    const forwarded = exportText.mock.calls[0]![1];
    expect(forwarded()).toBe(true);
    alive = false;
    expect(forwarded()).toBe(false);
  });

  it("does not retry a failed save service", async () => {
    const exportText = vi.fn(async () => {
      throw new Error("synthetic failure");
    });
    await expect(
      exportBoundary(
        { exportText },
        vi.fn(),
        () => true,
      )({ kind: "selection", text: "synthetic" }),
    ).rejects.toThrow("synthetic failure");
    expect(exportText).toHaveBeenCalledTimes(1);
  });
});

describe("terminal export IPC registration", () => {
  it("owns only the save handler and removes it on disposal", async () => {
    const ipc = createIpcHarness();
    const saveExport = vi.fn(async () => undefined);
    const sender: TrustedWebContents = {
      mainFrame: {},
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const ownerFor = vi.fn(() => ({ saveExport }));
    const remove = registerTerminalExportIpc(ipc.ipcMain, ownerFor, vi.fn());
    expect([...ipc.handlers.keys()]).toEqual([terminalIpc.exportSave]);
    expect(ipc.listeners.size).toBe(0);
    const event = { sender, senderFrame: sender.mainFrame };
    await ipc.handlers.get(terminalIpc.exportSave)!(event, {
      notice: "too-large",
    });
    expect(ownerFor).toHaveBeenCalledExactlyOnceWith(event);
    expect(saveExport).toHaveBeenCalledExactlyOnceWith({ notice: "too-large" });
    remove();
    expect(ipc.handlers.size).toBe(0);
  });

  it("reports an untrusted sender without forwarding its payload", () => {
    const ipc = createIpcHarness();
    const rejectSender = vi.fn();
    registerTerminalExportIpc(ipc.ipcMain, () => undefined, rejectSender);
    const sender: TrustedWebContents = {
      mainFrame: {},
      isDestroyed: () => false,
      send: vi.fn(),
    };
    expect(() =>
      ipc.handlers.get(terminalIpc.exportSave)!(
        { sender, senderFrame: sender.mainFrame },
        { kind: "content", text: "private" },
      ),
    ).toThrow("untrusted sender");
    expect(rejectSender).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("terminal export owning-window routing", () => {
  it("saves validated requests only from the registered live main frame", async () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    let destroyed = false;
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => destroyed,
      send: vi.fn(),
    };
    const exportText = vi.fn(
      async (_request: unknown, _isOwnerAlive: () => boolean) => undefined,
    );
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const controller = router.registerController({
      ...clipboardOptions(),
      exportText,
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
    for (const event of [
      { sender: webContents, senderFrame: {} },
      { sender: webContents, senderFrame: null },
      { sender: { ...webContents }, senderFrame: mainFrame },
    ])
      expect(() => save(event, { kind: "content", text: "x" })).toThrow(
        "untrusted sender",
      );
    for (const payload of invalidPayloads())
      await expect(save(owner, payload)).rejects.toThrow(
        "Invalid terminal export request",
      );
    expect(exportText).not.toHaveBeenCalled();

    await save(owner, { kind: "selection", text: "日本語\n" });
    expect(exportText).toHaveBeenCalledExactlyOnceWith(
      { kind: "selection", text: "日本語\n" },
      expect.any(Function),
    );
    const isOwnerAlive = exportText.mock.calls[0]![1];
    expect(isOwnerAlive()).toBe(true);
    destroyed = true;
    expect(isOwnerAlive()).toBe(false);
    exportText.mockClear();
    // A destroyed renderer may be rejected at routing or become inert in the
    // controller; neither path may start another save.
    try {
      await save(owner, { kind: "content", text: "late" });
    } catch {
      /* Rejected owner. */
    }
    expect(exportText).not.toHaveBeenCalled();
    destroyed = false;
    await save(owner, { notice: "too-large" });
    expect(exportText).toHaveBeenCalledExactlyOnceWith(
      { notice: "too-large" },
      expect.any(Function),
    );
    controller.dispose();
    expect(isOwnerAlive()).toBe(false);
    exportText.mockClear();
    expect(() => save(owner, { kind: "content", text: "late" })).toThrow(
      "untrusted sender",
    );
    expect(exportText).not.toHaveBeenCalled();
    router.dispose();
    expect(ipc.handlers.has(terminalIpc.exportSave)).toBe(false);
  });
});
