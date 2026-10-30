import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import { afterEach, expect, it, vi } from "vitest";
import { createResttyHostSessions } from "../fixtures/restty-host-sessions";
import { exerciseConcurrentResttyTabs } from "../fixtures/restty-host-concurrent-font";

// Controlled native observations, not a reproduction of the Fedora failure.
vi.mock("../fixtures/restty-session-diagnostic", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../fixtures/restty-session-diagnostic")
    >();
  return {
    ...actual,
    createResttySessionDiagnostic: (pid: number) =>
      actual.createResttySessionDiagnostic(pid, () => ({
        status: "observed",
        startTicks: String(pid * 10),
        state: "S",
        parentPid: 1,
      })),
  };
});
afterEach(() => vi.useRealTimers());

it.each([false, true])(
  "captures missing target before cleanup (close delivered: %s)",
  async (deliverMissingClose) => {
    vi.useFakeTimers();
    const app = Object.assign(new EventEmitter(), { exit: vi.fn() });
    const exits: Array<() => void> = [];
    const kills = vi.fn();
    const fixture = createResttyHostSessions({
      app,
      signals: new EventEmitter(),
      windows: () => [],
      reportError: vi.fn(),
      spawn() {
        const index = exits.length;
        return {
          pid: 100 + index,
          onData: () => ({ dispose() {} }),
          onExit(listener: (event: { exitCode: number }) => void) {
            exits.push(() => listener({ exitCode: 0 }));
            return { dispose() {} };
          },
          kill() {
            kills(index);
            if (index > 1) exits[index]!();
          },
        } as unknown as IPty;
      },
    });
    const exited = new Set<number>();
    const sessions: Array<ReturnType<typeof fixture.createSession>> = [];
    function start() {
      const index = sessions.length;
      sessions.push(
        fixture.createSession(
          {
            shell: "/bin/sh",
            platform: "linux",
            homeDirectory: "/synthetic",
            environment: {},
            applicationVersionProvider: { getVersion: () => "test" },
            onOutput() {},
            onExit() {
              exited.add(index);
            },
          },
          index,
        ),
      );
    }
    start(); // retained healthy peer
    let selected = 4;
    const snapshot = vi.fn(fixture.sessionDiagnostics);
    const outcome = exerciseConcurrentResttyTabs({
      window: {
        webContents: {
          send(_channel: string, command: { action: string }) {
            if (command.action === "new") start();
            else {
              if (selected !== 1 || deliverMissingClose)
                sessions[selected]!.close();
              selected -= 1;
            }
          },
          async executeJavaScript(script: string) {
            if (script.startsWith("({ hidden:"))
              return { hidden: true, text: "" };
            return true;
          },
        },
      } as unknown as BrowserWindow,
      beginFontLoad: () => ({
        release() {},
        physicalLoads: () => 1,
        requests: () => 4,
      }),
      sessionStarts: () => sessions.length,
      ptyExits: () => exited.size,
      sessionExited: (index) => exited.has(index),
      sessionDiagnostics: snapshot,
      waitFor: fixture.waitFor,
    }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(snapshot).not.toHaveBeenCalled();
    expect(app.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const error = (await outcome) as Error;
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).toContain(
      "Timed out waiting for concurrent fixture PTY cleanup",
    );
    expect(error.message).toContain('"pendingSessionIndices":[1]');
    expect(snapshot).toHaveBeenCalledExactlyOnceWith([1, 2, 3, 4, 0]);
    const captured = snapshot.mock.results[0]!.value as ReturnType<
      typeof fixture.sessionDiagnostics
    >;
    expect(captured[0]).toMatchObject({
      index: 1,
      pid: 101,
      closeCalls: Number(deliverMissingClose),
      closeReturns: Number(deliverMissingClose),
      closeThrows: 0,
      birth: { startTicks: "1010" },
      current: { state: "S" },
      identity: "same",
    });
    expect(captured[4]).toMatchObject({ index: 0, closeCalls: 0 });
    expect(kills).not.toHaveBeenCalledWith(0);
    expect(exited.has(1)).toBe(false);

    // The diagnostic neither completes ownership nor requests another close.
    // Explicit fixture cleanup still waits independently for both actual exits.
    const complete = fixture.complete(1);
    expect(app.exit).not.toHaveBeenCalled();
    exits[1]!();
    await Promise.resolve();
    expect(app.exit).not.toHaveBeenCalled();
    exits[0]!();
    await complete;
    expect(app.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(captured[0]!.closeCalls).toBe(Number(deliverMissingClose));
    expect(captured[4]!.closeCalls).toBe(0);
  },
);
