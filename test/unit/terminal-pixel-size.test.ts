import type { IPty } from "node-pty";
import { describe, expect, it, vi } from "vitest";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import type { OperationalEvent } from "../../src/main/operational-events";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { surfaceTransport } from "../../src/terminal-surface/surface-transport";
import type { TerminalSessionAdapter } from "../../src/terminal-surface/terminal-session-adapter";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

function ptyHarness(start?: object) {
  const ipc = createIpcHarness();
  const mainFrame = {};
  const webContents = { mainFrame, isDestroyed: () => false, send: vi.fn() };
  const trusted = { sender: webContents, senderFrame: mainFrame };
  const pty = {
    resize: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    onData: () => ({ dispose() {} }),
    onExit: () => ({ dispose() {} }),
  };
  const spawn = vi.fn(() => pty as unknown as IPty);
  const events: OperationalEvent[] = [];
  const router = registerTerminalIpcRouter(ipc.ipcMain, {
    write(event) {
      events.push(event);
      return true;
    },
  });
  router.registerController({
    ...clipboardOptions(),
    windowId: 1,
    webContents,
    createSession: (callbacks, _cwd, _ssh, _restored, _id, size) =>
      createLocalTerminalSession(spawn, {
        shell: "/bin/example-shell",
        initialSize: size,
        platform: "linux",
        homeDirectory: "/example",
        environment: {},
        applicationVersionProvider: { getVersion: () => "test" },
        ...callbacks,
      }),
    onSessionExit: vi.fn(),
    onSessionStartError: vi.fn(),
  });
  try {
    ipc.handlers.get(terminalIpc.start)!(trusted, start);
  } catch {
    // A refused start is observed through spawn and the operational events.
  }
  return {
    pty,
    spawn,
    events,
    resize: (payload: object) =>
      ipc.listeners.get(terminalIpc.resize)!(trusted, {
        sessionId: "s1",
        ...payload,
      }),
  };
}

describe("terminal pixel size", () => {
  it("starts the PTY at the Surface's size so a program that runs at once reads it", () => {
    const h = ptyHarness({
      size: { cols: 118, rows: 37, pixelWidth: 944, pixelHeight: 592 },
    });
    expect(h.spawn).toHaveBeenCalledExactlyOnceWith(
      "/bin/example-shell",
      ["-l"],
      expect.objectContaining({ cols: 118, rows: 37 }),
    );
    // Spawning leaves winsize pixels at 0×0; they're set before start returns.
    expect(h.pty.resize).toHaveBeenCalledExactlyOnceWith(118, 37, {
      width: 944,
      height: 592,
    });
  });

  it("starts at 80×24 when the Surface hasn't measured a grid", () => {
    const h = ptyHarness();
    expect(h.spawn).toHaveBeenCalledExactlyOnceWith(
      "/bin/example-shell",
      ["-l"],
      expect.objectContaining({ cols: 80, rows: 24 }),
    );
    expect(h.pty.resize).not.toHaveBeenCalled();
  });

  it.each([
    ["no rows", { cols: 118 }],
    ["zero columns", { cols: 0, rows: 37 }],
    ["a lone pixel width", { cols: 118, rows: 37, pixelWidth: 944 }],
    ["an unknown field", { cols: 118, rows: 37, dpr: 2 }],
  ])("refuses a start whose size has %s", (_label, size) => {
    const h = ptyHarness({ size });
    expect(h.spawn).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({
      name: "boundary.rejected",
      boundary: "ipc",
      reason: "invalid-payload",
    });
  });

  it("gives the PTY the grid's pixel size so TIOCGWINSZ is not 0×0", () => {
    const h = ptyHarness();
    h.resize({ cols: 118, rows: 37, pixelWidth: 944, pixelHeight: 592 });
    expect(h.pty.resize).toHaveBeenLastCalledWith(118, 37, {
      width: 944,
      height: 592,
    });

    h.resize({ cols: 80, rows: 24 });
    expect(h.pty.resize).toHaveBeenLastCalledWith(80, 24);
  });

  it.each([
    ["a lone width", { pixelWidth: 944 }],
    ["zero pixels", { pixelWidth: 0, pixelHeight: 592 }],
    ["more than a winsize short", { pixelWidth: 65_536, pixelHeight: 592 }],
    ["fractional pixels", { pixelWidth: 944.5, pixelHeight: 592 }],
    ["an unknown field", { pixelWidth: 944, pixelHeight: 592, dpr: 2 }],
  ])("rejects a resize with %s", (_label, pixels) => {
    const h = ptyHarness();
    h.resize({ cols: 118, rows: 37, ...pixels });
    expect(h.pty.resize).not.toHaveBeenCalled();
    expect(h.events).toContainEqual({
      name: "boundary.rejected",
      boundary: "ipc",
      reason: "invalid-payload",
    });
  });

  it("derives pixels from Restty's device-pixel cell size, padding excluded", () => {
    const adapter = {
      start: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    } satisfies TerminalSessionAdapter;
    const recorded = vi.fn();
    const { transport } = surfaceTransport(
      adapter,
      () => true,
      () => true,
      recorded,
    );

    // A HiDPI canvas: 16×32 device-pixel cells plus a sub-cell remainder.
    transport.resize(118, 37, {
      widthPx: 1_900,
      heightPx: 1_200,
      cellW: 16,
      cellH: 32,
    });
    const sized = {
      cols: 118,
      rows: 37,
      pixelWidth: 1_888,
      pixelHeight: 1_184,
    };
    expect(adapter.resize).toHaveBeenLastCalledWith(sized);
    expect(recorded).toHaveBeenLastCalledWith(sized, expect.anything());

    // The post-start replay carries no metadata and keeps the cell size.
    transport.resize(100, 30);
    expect(adapter.resize).toHaveBeenLastCalledWith({
      cols: 100,
      rows: 30,
      pixelWidth: 1_600,
      pixelHeight: 960,
    });

    // A grid too large for winsize falls back to cells only.
    transport.resize(1_000, 30, { cellW: 66, cellH: 32 });
    expect(adapter.resize).toHaveBeenLastCalledWith({ cols: 1_000, rows: 30 });
  });

  it("sends cells only before Restty reports a cell size", () => {
    const adapter = {
      start: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    } satisfies TerminalSessionAdapter;
    const { transport } = surfaceTransport(
      adapter,
      () => true,
      () => true,
      vi.fn(),
    );
    transport.resize(80, 24);
    expect(adapter.resize).toHaveBeenLastCalledWith({ cols: 80, rows: 24 });
  });
});
