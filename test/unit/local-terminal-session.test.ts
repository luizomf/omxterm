import type { IDisposable, IPty } from "node-pty";
import { describe, expect, it, vi } from "vitest";
import {
  createLocalTerminalSession,
  type SpawnPty,
} from "../../src/main/local-terminal-session";
import { MAX_TERMINAL_PAYLOAD_BYTES } from "../../src/shared/terminal-contract";

function createPtyHarness() {
  let onData: ((data: string) => void) | undefined;
  let onExit:
    ((event: { exitCode: number; signal?: number }) => void) | undefined;
  const disposeData = vi.fn();
  const disposeExit = vi.fn();
  const pty = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData(listener: (data: string) => void): IDisposable {
      onData = listener;
      return { dispose: disposeData };
    },
    onExit(
      listener: (event: { exitCode: number; signal?: number }) => void,
    ): IDisposable {
      onExit = listener;
      return { dispose: disposeExit };
    },
  } as unknown as IPty;

  return {
    pty,
    emitData: (data: string) => onData?.(data),
    emitExit: (exitCode: number, signal = 0) => onExit?.({ exitCode, signal }),
    disposeData,
    disposeExit,
  };
}

describe("local PTY Adapter", () => {
  it("starts the configured shell as a login shell in home and carries bounded I/O", () => {
    const harness = createPtyHarness();
    const spawn = vi.fn<SpawnPty>(() => harness.pty);
    const onOutput = vi.fn();
    const onExit = vi.fn();
    const getVersion = vi.fn(() => "1.2.3");
    const session = createLocalTerminalSession(spawn, {
      shell: "/bin/example-shell",
      homeDirectory: "/Users/example",
      applicationVersionProvider: { getVersion },
      environment: {
        PATH: "/usr/bin",
        TERM: "inherited-term",
        COLORTERM: "inherited-color",
        TERM_PROGRAM: "InheritedTerminal",
        TERM_PROGRAM_VERSION: "0.0.1",
        ZDOTDIR: "/Users/example/.zsh",
        HTTPS_PROXY: "http://proxy.example.test:8080",
      },
      onOutput,
      onExit,
    });

    expect(getVersion).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledWith("/bin/example-shell", ["-l"], {
      cwd: "/Users/example",
      env: {
        PATH: "/usr/bin",
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "OMXTerm",
        TERM_PROGRAM_VERSION: "1.2.3",
        ZDOTDIR: "/Users/example/.zsh",
        HTTPS_PROXY: "http://proxy.example.test:8080",
      },
      cols: 80,
      rows: 24,
    });

    session.write("typed input");
    session.write("x".repeat(MAX_TERMINAL_PAYLOAD_BYTES + 1));
    harness.emitData("shell output");
    session.resize({ cols: 120, rows: 40 });
    session.resize({ cols: 0, rows: 40 });

    expect(harness.pty.write).toHaveBeenCalledOnce();
    expect(harness.pty.write).toHaveBeenCalledWith("typed input");
    expect(onOutput).toHaveBeenCalledWith("shell output");
    expect(harness.pty.resize).toHaveBeenCalledOnce();
    expect(harness.pty.resize).toHaveBeenCalledWith(120, 40);
  });

  it("releases the PTY and listeners exactly once", () => {
    const harness = createPtyHarness();
    const onExit = vi.fn();
    const session = createLocalTerminalSession(() => harness.pty, {
      shell: "/bin/example-shell",
      homeDirectory: "/Users/example",
      applicationVersionProvider: { getVersion: () => "1.2.3" },
      environment: {},
      onOutput: vi.fn(),
      onExit,
    });

    harness.emitExit(0);
    harness.emitExit(0);
    session.close();
    session.close();

    expect(onExit).toHaveBeenCalledOnce();
    expect(harness.disposeData).toHaveBeenCalledOnce();
    expect(harness.disposeExit).toHaveBeenCalledOnce();
    expect(harness.pty.kill).not.toHaveBeenCalled();
  });

  it("does not mutate or disclose the inherited environment when spawn fails", () => {
    const environment = {
      PATH: "/usr/bin",
      OMXTERM_TEST_SECRET: "must-not-appear",
    };

    expect(() =>
      createLocalTerminalSession(
        () => {
          throw new Error("native spawn failed");
        },
        {
          shell: "/bin/example-shell",
          homeDirectory: "/Users/example",
          applicationVersionProvider: { getVersion: () => "1.2.3" },
          environment,
          onOutput: vi.fn(),
          onExit: vi.fn(),
        },
      ),
    ).toThrow("Failed to start the Default Shell at /bin/example-shell");

    expect(environment).toEqual({
      PATH: "/usr/bin",
      OMXTERM_TEST_SECRET: "must-not-appear",
    });
    try {
      createLocalTerminalSession(
        () => {
          throw new Error("native spawn failed");
        },
        {
          shell: "/bin/example-shell",
          homeDirectory: "/Users/example",
          applicationVersionProvider: { getVersion: () => "1.2.3" },
          environment,
          onOutput: vi.fn(),
          onExit: vi.fn(),
        },
      );
    } catch (error) {
      expect(String(error)).not.toContain("must-not-appear");
    }
  });
});
