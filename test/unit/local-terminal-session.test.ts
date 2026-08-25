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
  let foregroundProcess: () => unknown = () => "example-shell";
  // Disposing really stops delivery, as node-pty's IDisposable does — a
  // harness that keeps delivering after dispose() hides suppressed events.
  const disposeData = vi.fn(() => {
    onData = undefined;
  });
  const disposeExit = vi.fn(() => {
    onExit = undefined;
  });
  const pty = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    get process() {
      return foregroundProcess();
    },
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
    setForegroundProcess: (value: unknown) => {
      foregroundProcess = () => value;
    },
    failForegroundProcess: () => {
      foregroundProcess = () => {
        throw new Error("foreground process unavailable");
      };
    },
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
      platform: "darwin",
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
});

describe("explicit-command local PTY Adapter", () => {
  it("forwards an explicit executable and literal argv with home, environment, and capability identity", () => {
    const harness = createPtyHarness();
    const spawn = vi.fn<SpawnPty>(() => harness.pty);
    const onExit = vi.fn();
    const session = createLocalTerminalSession(spawn, {
      shell: "/bin/default-shell",
      launchRequest: {
        kind: "explicit-command",
        executable: "/usr/bin/example",
        arguments: ["--option-looking", "-e", "two words", ""],
      },
      platform: "darwin",
      homeDirectory: "/Users/example",
      applicationVersionProvider: { getVersion: () => "1.2.3" },
      environment: {
        PATH: "/usr/bin",
        INHERITED_VALUE: "present",
        TERM: "inherited-term",
      },
      onOutput: vi.fn(),
      onExit,
    });

    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      "/usr/bin/example",
      ["--option-looking", "-e", "two words", ""],
      {
        cwd: "/Users/example",
        env: {
          PATH: "/usr/bin",
          INHERITED_VALUE: "present",
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          TERM_PROGRAM: "OMXTerm",
          TERM_PROGRAM_VERSION: "1.2.3",
        },
        cols: 80,
        rows: 24,
      },
    );
    harness.setForegroundProcess("/usr/bin/example");
    expect(session.hasForegroundChildProcess()).toBe(true);
    harness.emitExit(0);
    expect(onExit).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 0, signal: 0 },
      "explicit-command",
    );
  });
});

describe("local PTY Adapter lifecycle", () => {
  it("spawns Windows shells without the POSIX login flag", () => {
    const harness = createPtyHarness();
    const spawn = vi.fn<SpawnPty>(() => harness.pty);
    const session = createLocalTerminalSession(spawn, {
      shell: "C:\\Program Files\\Git\\bin\\bash.exe",
      platform: "win32",
      homeDirectory: "C:\\Users\\example",
      applicationVersionProvider: { getVersion: () => "1.2.3" },
      environment: {},
      onOutput: vi.fn(),
      onExit: vi.fn(),
    });

    expect(spawn).toHaveBeenCalledWith(
      "C:\\Program Files\\Git\\bin\\bash.exe",
      [],
      expect.objectContaining({ cwd: "C:\\Users\\example" }),
    );
    expect(session.fallbackTitle).toBe("bash.exe");
  });

  it("counts a live Windows session as Busy because ConPTY hides the foreground name", () => {
    const harness = createPtyHarness();
    const session = createLocalTerminalSession(
      vi.fn<SpawnPty>(() => harness.pty),
      {
        shell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        platform: "win32",
        homeDirectory: "C:\\Users\\example",
        applicationVersionProvider: { getVersion: () => "1.2.3" },
        environment: {},
        onOutput: vi.fn(),
        onExit: vi.fn(),
      },
    );

    harness.setForegroundProcess("Windows Shell");
    expect(session.hasForegroundChildProcess()).toBe(true);
    session.close();
    expect(session.hasForegroundChildProcess()).toBe(false);
  });

  // Regression for #85: closing a tab kills the PTY, but the session end must
  // still be reported when the process actually exits — a swallowed report
  // leaves the closed session counted as live and the window never follows
  // its last tab.
  it("reports the PTY exit that follows a requested close", () => {
    const harness = createPtyHarness();
    const onExit = vi.fn();
    const session = createLocalTerminalSession(() => harness.pty, {
      shell: "/bin/example-shell",
      platform: "darwin",
      homeDirectory: "/Users/example",
      applicationVersionProvider: { getVersion: () => "1.2.3" },
      environment: {},
      onOutput: vi.fn(),
      onExit,
    });

    session.close();
    expect(harness.pty.kill).toHaveBeenCalledOnce();
    expect(onExit).not.toHaveBeenCalled();

    harness.emitExit(0, 1);

    expect(onExit).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 0, signal: 1 },
      "default-shell",
    );
    expect(harness.disposeData).toHaveBeenCalledOnce();
    expect(harness.disposeExit).toHaveBeenCalledOnce();
  });

  it("releases the PTY and listeners exactly once", () => {
    const harness = createPtyHarness();
    const onExit = vi.fn();
    const session = createLocalTerminalSession(() => harness.pty, {
      shell: "/bin/example-shell",
      platform: "darwin",
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
          platform: "darwin",
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
          platform: "darwin",
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

  it("redacts an explicit executable, argv, environment, and native spawn detail", () => {
    const privateValues = [
      "/private/executable-canary",
      "argument-canary",
      "environment-canary",
      "native-canary",
    ];

    let failure: unknown;
    try {
      createLocalTerminalSession(
        () => {
          throw new Error("native-canary");
        },
        {
          shell: "/bin/default-shell",
          launchRequest: {
            kind: "explicit-command",
            executable: "/private/executable-canary",
            arguments: ["argument-canary"],
          },
          platform: "darwin",
          homeDirectory: "/Users/example",
          applicationVersionProvider: { getVersion: () => "1.2.3" },
          environment: { PRIVATE_VALUE: "environment-canary" },
          onOutput: vi.fn(),
          onExit: vi.fn(),
        },
      );
    } catch (cause) {
      failure = cause;
    }

    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toBe(
      "Error: Failed to start the requested command",
    );
    expect((failure as Error).cause).toBeUndefined();
    for (const privateValue of privateValues)
      expect(String(failure)).not.toContain(privateValue);
  });

  it("reports a Busy Session only while a foreground child process runs", () => {
    const harness = createPtyHarness();
    const session = createLocalTerminalSession(
      vi.fn<SpawnPty>(() => harness.pty),
      {
        shell: "/bin/example-shell",
        platform: "darwin",
        homeDirectory: "/Users/example",
        applicationVersionProvider: { getVersion: () => "1.2.3" },
        environment: {},
        onOutput: vi.fn(),
        onExit: vi.fn(),
      },
    );

    expect(session.hasForegroundChildProcess()).toBe(false);
    harness.setForegroundProcess("-example-shell");
    expect(session.hasForegroundChildProcess()).toBe(false);
    harness.setForegroundProcess("Example-Shell");
    expect(session.hasForegroundChildProcess()).toBe(false);
    harness.setForegroundProcess("htop");
    expect(session.hasForegroundChildProcess()).toBe(true);
    harness.setForegroundProcess("");
    expect(session.hasForegroundChildProcess()).toBe(true);
    harness.setForegroundProcess(42);
    expect(session.hasForegroundChildProcess()).toBe(true);
    harness.failForegroundProcess();
    expect(session.hasForegroundChildProcess()).toBe(true);
  });

  it("never reports a Busy Session after close or exit", () => {
    const harness = createPtyHarness();
    const options = {
      shell: "/bin/example-shell",
      platform: "darwin",
      homeDirectory: "/Users/example",
      applicationVersionProvider: { getVersion: () => "1.2.3" },
      environment: {},
      onOutput: vi.fn(),
      onExit: vi.fn(),
    };
    const closedSession = createLocalTerminalSession(
      vi.fn<SpawnPty>(() => harness.pty),
      options,
    );
    harness.setForegroundProcess("htop");
    closedSession.close();
    expect(closedSession.hasForegroundChildProcess()).toBe(false);

    const exitedHarness = createPtyHarness();
    const exitedSession = createLocalTerminalSession(
      vi.fn<SpawnPty>(() => exitedHarness.pty),
      options,
    );
    exitedHarness.setForegroundProcess("htop");
    exitedHarness.emitExit(0);
    expect(exitedSession.hasForegroundChildProcess()).toBe(false);
  });
});
