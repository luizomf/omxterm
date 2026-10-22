import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { TerminalSessionLaunch } from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

function paneHarness(
  options: {
    busy?: readonly boolean[];
    confirmBroadcast?: () => Promise<boolean>;
  } = {},
) {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const frame = {};
  const webContents: TrustedWebContents = {
    mainFrame: frame,
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const launches: TerminalSessionLaunch[] = [];
  const sessions: LocalTerminalSession[] = [];
  const onWorkingDirectory = vi.fn();
  const controller = router.registerController({
    ...clipboardOptions(),
    webContents,
    localHostNames: ["laptop"],
    onWorkingDirectory,
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    ...(options.confirmBroadcast
      ? { confirmBroadcast: options.confirmBroadcast }
      : {}),
    createSession(_callbacks, launch) {
      const index = sessions.length;
      launches.push(launch);
      const session: LocalTerminalSession = {
        write: vi.fn(),
        resize: vi.fn(),
        close: vi.fn(),
        hasForegroundChildProcess: () => options.busy?.[index] ?? false,
        workingDirectory: () => `/native/${index + 1}`,
      };
      sessions.push(session);
      return session;
    },
  });
  const owner = { sender: webContents, senderFrame: frame };
  const start = (launch?: unknown) =>
    ipc.handlers.get(terminalIpc.start)!(owner, undefined, launch) as string;
  const send = (channel: string, payload: unknown) =>
    ipc.listeners.get(channel)!(owner, payload);
  return {
    ipc,
    router,
    controller,
    owner,
    start,
    send,
    launches,
    onWorkingDirectory,
  };
}

describe("split-pane session decisions in main", () => {
  it("asks before closing a split tab when any of its panes is busy", () => {
    const harness = paneHarness({ busy: [false, true, false] });
    harness.start();
    harness.start();
    harness.start();
    harness.send(terminalIpc.tabSelected, { sessionId: "s1" });
    expect(harness.controller.hasBusySelectedSession()).toBe(false);
    harness.send(terminalIpc.tabSelected, {
      sessionId: "s1",
      tabSessionIds: ["s1", "s2"],
    });
    expect(harness.controller.hasBusySelectedSession()).toBe(true);
    expect(harness.controller.hasBusyFocusedSession()).toBe(false);
    harness.send(terminalIpc.tabSelected, {
      sessionId: "s3",
      tabSessionIds: ["s1", "s3"],
    });
    expect(harness.controller.hasBusySelectedSession()).toBe(false);
  });

  it("rejects malformed split selections", () => {
    const harness = paneHarness({ busy: [true] });
    harness.start();
    for (const payload of [
      { sessionId: "s1", tabSessionIds: [] },
      { sessionId: "s1", tabSessionIds: ["s2"] },
      { sessionId: "s1", tabSessionIds: ["s1", "s1"] },
      { sessionId: "s1", tabSessionIds: "s1" },
    ])
      harness.send(terminalIpc.tabSelected, payload);
    // No valid selection was recorded, so the window-wide decision applies.
    expect(harness.controller.hasBusySelectedSession()).toBe(true);
  });

  it("resolves inherit launches from OSC 7 reports, falling back to the native directory", () => {
    const harness = paneHarness();
    harness.start();
    harness.start({ kind: "inherit", sessionId: "s1" });
    expect(harness.launches[1]).toEqual({
      kind: "inherit",
      workingDirectory: "/native/1",
    });
    harness.send(terminalIpc.workingDirectory, {
      sessionId: "s1",
      uri: "file://laptop/home/me/project",
    });
    expect(harness.onWorkingDirectory).toHaveBeenCalledWith(
      "s1",
      "/home/me/project",
    );
    harness.start({ kind: "inherit", sessionId: "s1" });
    expect(harness.launches[2]).toEqual({
      kind: "inherit",
      workingDirectory: "/home/me/project",
    });
    // A remote shell's report is not a local directory and clears the hint.
    harness.send(terminalIpc.workingDirectory, {
      sessionId: "s1",
      uri: "file://server/srv",
    });
    harness.start({ kind: "inherit", sessionId: "s1" });
    expect(harness.launches[3]).toEqual({
      kind: "inherit",
      workingDirectory: "/native/1",
    });
  });

  it("passes saved and Quick Connect launches through and rejects anything else", () => {
    const harness = paneHarness();
    harness.start({ kind: "saved-session", id: "abc" });
    harness.start({ kind: "quick-ssh", target: "ops@db" });
    expect(harness.launches).toEqual([
      { kind: "saved-session", id: "abc" },
      { kind: "quick-ssh", target: "ops@db" },
    ]);
    expect(() => harness.start({ kind: "exec", program: "/bin/sh" })).toThrow(
      /Invalid terminal launch/u,
    );
    expect(harness.launches).toHaveLength(2);
  });

  it("confirms broadcasting through main and validates the target count", async () => {
    const confirmBroadcast = vi.fn(async () => true);
    const harness = paneHarness({ confirmBroadcast });
    const invoke = harness.ipc.handlers.get(terminalIpc.confirmBroadcast)!;
    await expect(invoke(harness.owner, 2)).resolves.toBe(true);
    expect(confirmBroadcast).toHaveBeenCalledWith(2);
    await expect(invoke(harness.owner, 0)).rejects.toThrow();
    expect(() => invoke({ ...harness.owner, senderFrame: {} }, 1)).toThrow(
      /untrusted/u,
    );
  });
});
