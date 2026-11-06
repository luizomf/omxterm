import { EventEmitter } from "node:events";
import { ipcMain, type BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";
import { extensionsIpc } from "../../src/shared/extensions";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import { createSettingsExercise } from "../fixtures/settings-dialog-exercise";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
}));

it("owns a validated local synthetic Extensions snapshot without enabling operations", () => {
  const contents = Object.assign(new EventEmitter(), { mainFrame: {} });
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  const trusted = vi.fn(() => true);
  const settings = createSettingsExercise(
    "/unused-fixture-profile",
    { isTrustedSender: trusted } as unknown as TerminalIpcRouter,
    () => window as unknown as BrowserWindow,
    () => undefined,
  );
  const handle = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === extensionsIpc)![1] as (
    event: Electron.IpcMainInvokeEvent,
    ...args: unknown[]
  ) => unknown;
  const event = {
    sender: contents,
    senderFrame: contents.mainFrame,
  } as unknown as Electron.IpcMainInvokeEvent;
  try {
    expect(handle(event, { operation: "snapshot" })).toMatchObject({
      ok: true,
      entries: [{ id: "synthetic-layout", installed: true }],
      catalog: { loaded: true, entries: [{ id: "synthetic-layout" }] },
    });
    expect(handle(event, { operation: "install" })).toEqual({
      ok: false,
      error: "runtime-unavailable",
    });
    expect(() => handle(event, {})).toThrow("Invalid fixture");
    expect(() => handle(event, { operation: "snapshot" }, 1)).toThrow(
      "Invalid fixture",
    );
    expect(() =>
      handle({ ...event, senderFrame: null }, { operation: "snapshot" }),
    ).toThrow("Rejected fixture");
    trusted.mockReturnValue(false);
    expect(() => handle(event, { operation: "snapshot" })).toThrow(
      "Rejected fixture",
    );
  } finally {
    settings.dispose();
  }
  expect(ipcMain.removeHandler).toHaveBeenCalledWith(extensionsIpc);
});
