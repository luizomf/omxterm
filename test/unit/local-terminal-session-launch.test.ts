import type { IDisposable, IPty, IPtyForkOptions } from "node-pty";
import { describe, expect, it, vi } from "vitest";
import {
  createLocalTerminalSession,
  INITIAL_INPUT_SETTLE_MS,
} from "../../src/main/local-terminal-session";

function harness() {
  let onData: ((data: string) => void) | undefined;
  let onExit:
    ((event: { exitCode: number; signal?: number }) => void) | undefined;
  const pty = {
    pid: 4242,
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    kill: vi.fn(),
    process: "bash",
    onData(listener: (data: string) => void): IDisposable {
      onData = listener;
      return { dispose: () => (onData = undefined) };
    },
    onExit(
      listener: (event: { exitCode: number; signal?: number }) => void,
    ): IDisposable {
      onExit = listener;
      return { dispose: () => (onExit = undefined) };
    },
  } as unknown as IPty;
  const spawn = vi.fn(
    (_file: string, _args: string[], _options: IPtyForkOptions) => pty,
  );
  const scheduled: Array<{ callback: () => void; delay: number }> = [];
  const schedule = (callback: () => void, delay: number) =>
    scheduled.push({ callback, delay });
  return {
    pty,
    spawn,
    scheduled,
    schedule,
    emitData: (data: string) => onData?.(data),
    emitExit: (code: number) => onExit?.({ exitCode: code, signal: 0 }),
  };
}

const base = {
  shell: "/bin/bash",
  platform: "linux",
  homeDirectory: "/home/me",
  applicationVersionProvider: { getVersion: () => "1.0.0" },
  environment: { PATH: "/usr/bin" },
  onOutput: () => {},
  onExit: () => {},
};

describe("Saved Session launch options for local PTYs", () => {
  it("starts in the requested directory with extra environment, keeping the capability identity", () => {
    const pty = harness();
    createLocalTerminalSession(pty.spawn, {
      ...base,
      workingDirectory: "/srv/app",
      extraEnvironment: { APP_ENV: "staging", TERM: "dumb" },
    });
    const options = pty.spawn.mock.calls[0]![2];
    expect(options.cwd).toBe("/srv/app");
    expect(options.env).toMatchObject({
      APP_ENV: "staging",
      TERM: "xterm-256color",
      TERM_PROGRAM: "OMXTerm",
    });
  });

  it("types the initial command once, after the first output settles", () => {
    const pty = harness();
    createLocalTerminalSession(pty.spawn, {
      ...base,
      initialInput: "echo ready\r",
      schedule: pty.schedule,
    });
    expect(pty.pty.write).not.toHaveBeenCalled();
    pty.emitData("$ ");
    pty.emitData("more output");
    expect(pty.scheduled).toHaveLength(1);
    expect(pty.scheduled[0]!.delay).toBe(INITIAL_INPUT_SETTLE_MS);
    pty.scheduled[0]!.callback();
    expect(pty.pty.write).toHaveBeenCalledExactlyOnceWith("echo ready\r");
  });

  it("drops the initial command when the program has already exited", () => {
    const pty = harness();
    createLocalTerminalSession(pty.spawn, {
      ...base,
      initialInput: "echo late\r",
      schedule: pty.schedule,
    });
    pty.emitData("bye");
    pty.emitExit(0);
    pty.scheduled[0]!.callback();
    expect(pty.pty.write).not.toHaveBeenCalled();
  });

  it("uses the session name as fallback title and reads the Linux working directory", () => {
    const pty = harness();
    const readLink = vi.fn(() => "/home/me/project");
    const session = createLocalTerminalSession(pty.spawn, {
      ...base,
      title: "Project shell",
      readLink,
    });
    expect(session.fallbackTitle).toBe("Project shell");
    expect(session.workingDirectory?.()).toBe("/home/me/project");
    expect(readLink).toHaveBeenCalledWith("/proc/4242/cwd");
    const mac = harness();
    expect(
      createLocalTerminalSession(mac.spawn, {
        ...base,
        platform: "darwin",
      }).workingDirectory?.(),
    ).toBeUndefined();
  });
});
