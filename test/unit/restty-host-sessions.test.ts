import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IPty } from "node-pty";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type {
  LocalTerminalSessionOptions,
  SpawnPty,
} from "../../src/main/local-terminal-session";
import { createResttyHostSessions } from "../fixtures/restty-host-sessions";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function nativePty() {
  let onExit: (exit: { exitCode: number }) => void = () => {};
  let onData: (data: string) => void = () => {};
  const pty = {
    process: "sh",
    kill: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    onData(listener: typeof onData) {
      onData = listener;
      return { dispose: vi.fn() };
    },
    onExit(listener: typeof onExit) {
      onExit = listener;
      return { dispose: vi.fn() };
    },
  };
  return {
    pty: pty as unknown as IPty,
    kill: pty.kill,
    write: pty.write,
    output: (data: string) => onData(data),
    exit: () => onExit({ exitCode: 0 }),
  };
}

function harness() {
  const app = Object.assign(new EventEmitter(), { exit: vi.fn() });
  const window = { isDestroyed: vi.fn(() => false), destroy: vi.fn() };
  const ptys: ReturnType<typeof nativePty>[] = [];
  const spawn = vi.fn<SpawnPty>(() => {
    const pty = nativePty();
    ptys.push(pty);
    return pty.pty;
  });
  const signals = Object.assign(new EventEmitter(), { send: vi.fn() });
  const reportError = vi.fn();
  const fixture = createResttyHostSessions({
    spawn,
    app,
    windows: () => [window],
    signals,
    reportError,
  });
  const sessionOptions: LocalTerminalSessionOptions = {
    shell: "/bin/sh",
    platform: "darwin",
    homeDirectory: "/owned/home",
    environment: {},
    applicationVersionProvider: { getVersion: () => "0.16.0" },
    onOutput: vi.fn(),
    onExit: vi.fn(),
  };
  return {
    fixture,
    app,
    window,
    spawn,
    ptys,
    sessionOptions,
    signals,
    reportError,
    start: (overrides: Partial<LocalTerminalSessionOptions> = {}) =>
      fixture.createSession({ ...sessionOptions, ...overrides }),
  };
}

const windowsShell = {
  shell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  platform: "win32",
  homeDirectory: "C:\\owned\\space and 'quote; $literal\\home",
};

it("missing isolation stays unready and cannot become successful completion after shell exit", async () => {
  const h = harness();
  h.start(windowsShell);
  h.ptys[0]!.output("PS C:\\owned> ");
  const predicate = vi.fn(() => true);
  const readiness = h.fixture.waitFor(predicate, "fixture input");
  const failure = expect(readiness).rejects.toThrow(
    "Timed out waiting for fixture input (owned PowerShell isolation not acknowledged)",
  );
  await vi.advanceTimersByTimeAsync(120_000);
  await failure;
  expect(predicate).not.toHaveBeenCalled();
  const complete = h.fixture.complete(0);
  h.ptys[0]!.exit();
  await complete;
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.reportError).toHaveBeenCalledWith(
    "Owned PowerShell isolation was not acknowledged",
  );
});

it("every owned PowerShell requires an executed isolation acknowledgement before fixture input", async () => {
  const h = harness();
  const first = h.start(windowsShell);
  h.start(windowsShell);
  for (const [file, args, options] of h.spawn.mock.calls) {
    expect(file).toBe(windowsShell.shell);
    expect(args.slice(0, 4)).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NoExit",
      "-EncodedCommand",
    ]);
    expect(options.env?.["OMXTERM_RESTTY_HISTORY"]).toBe(
      "C:\\owned\\space and 'quote; $literal\\home\\restty-history.txt",
    );
    // Literal paths travel in the environment, never as PowerShell source.
    expect(Buffer.from(args[4]!, "base64").toString("utf16le")).not.toContain(
      windowsShell.homeDirectory,
    );
  }
  const inputPhase = vi.fn(() => true);
  const ready = h.fixture.waitFor(inputPhase, "fixture input");
  h.ptys[0]!.output("__OMXTERM_RESTTY_SHELL_");
  await vi.advanceTimersByTimeAsync(25);
  expect(inputPhase).not.toHaveBeenCalled();
  h.ptys[0]!.output("ISOLATED__\r\n");
  await vi.advanceTimersByTimeAsync(25);
  expect(inputPhase).not.toHaveBeenCalled();
  h.ptys[1]!.output("__OMXTERM_RESTTY_SHELL_ISOLATED__\r\n");
  await vi.advanceTimersByTimeAsync(25);
  await ready;
  expect(inputPhase).toHaveBeenCalledOnce();
  first.write("\u0016");
  expect(h.ptys[0]!.write).toHaveBeenCalledExactlyOnceWith("\u0016");
});

it.each([
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const)(
  "%s drains actual exits and cannot be bypassed by native quit or last-window closure",
  async (signal, code) => {
    const h = harness();
    h.start();
    h.signals.emit(signal);
    expect(h.signals.send).toHaveBeenCalledWith(
      {
        type: "fixture-interrupted",
        signal,
      },
      expect.any(Function),
    );
    expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
    const event = { preventDefault: vi.fn() };
    h.app.emit("before-quit", event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(h.app.emit("window-all-closed")).toBe(true);
    expect(h.app.exit).not.toHaveBeenCalled();
    const complete = h.fixture.complete(0);
    h.ptys[0]!.exit();
    await complete;
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(code);
  },
);

it("interruption still drains when the supervisor IPC channel is already unavailable", async () => {
  const h = harness();
  h.start();
  h.signals.send.mockImplementation(() => {
    throw new Error("IPC unavailable");
  });
  expect(() => h.signals.emit("SIGTERM")).not.toThrow();
  expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
  expect(h.app.exit).not.toHaveBeenCalled();
  const complete = h.fixture.complete(0);
  h.ptys[0]!.exit();
  await complete;
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(143);
  expect(h.reportError).toHaveBeenCalledWith(
    "Restty fixture interruption notification failed",
  );
});

it("completion rejects starts immediately and reentrant completion shares one drain", async () => {
  const h = harness();
  h.start();
  let reentered: Promise<void> | undefined;
  h.ptys[0]!.kill.mockImplementation(() => {
    reentered = h.fixture.complete(0);
    h.ptys[0]!.exit();
  });
  const completed = h.fixture.complete(1);
  expect(() => h.start()).toThrow("Restty fixture is completing");
  expect(reentered).toBe(completed);
  await completed;
  expect(h.spawn).toHaveBeenCalledOnce();
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.fixture.complete(0)).toBe(completed);
  expect(() => h.start()).toThrow("Restty fixture is completing");
});

it("previously closed sessions remain owned after their window is destroyed", async () => {
  const h = harness();
  const closed = h.start();
  h.start();
  closed.close();
  h.window.isDestroyed.mockReturnValue(true);
  const complete = h.fixture.complete(1);
  h.ptys[1]!.exit();
  await Promise.resolve();
  expect(h.app.exit).not.toHaveBeenCalled();
  h.ptys[0]!.exit();
  await complete;
  expect(h.ptys.map((pty) => pty.kill.mock.calls.length)).toEqual([1, 1]);
  expect(h.window.destroy).not.toHaveBeenCalled();
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("already-exited sessions and zero-session completion need no synthetic exit", async () => {
  const h = harness();
  h.start();
  h.ptys[0]!.exit();
  await h.fixture.complete(0);
  expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
  const empty = harness();
  await empty.fixture.complete(0);
  expect(empty.app.exit).toHaveBeenCalledExactlyOnceWith(0);
  expect(empty.spawn).not.toHaveBeenCalled();
});

it("native exit during subscription can reenter completion before creation returns", async () => {
  const h = harness();
  const native = nativePty();
  h.spawn.mockReturnValueOnce({
    ...native.pty,
    onExit(listener) {
      listener({ exitCode: 0 });
      return { dispose() {} };
    },
  });
  let complete: Promise<void> | undefined;
  h.start({
    onExit: () => {
      complete = h.fixture.complete(0);
    },
  });
  await complete;
  expect(native.kill).not.toHaveBeenCalled();
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
});

it("completion during creation still closes the session once it becomes available", async () => {
  const h = harness();
  const native = nativePty();
  h.spawn.mockReturnValueOnce({
    ...native.pty,
    onData(listener) {
      listener("synthetic output");
      return { dispose() {} };
    },
  });
  let complete: Promise<void> | undefined;
  h.start({
    onOutput: () => {
      complete = h.fixture.complete(1);
    },
  });
  expect(native.kill).toHaveBeenCalledOnce();
  expect(h.app.exit).not.toHaveBeenCalled();
  native.exit();
  await complete;
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("spawn failure releases only its own pending completion record", async () => {
  const h = harness();
  h.start();
  h.spawn.mockImplementationOnce(() => {
    throw new Error("native spawn failed");
  });
  expect(() => h.start()).toThrow("Failed to start the Default Shell");
  const complete = h.fixture.complete(1);
  expect(h.app.exit).not.toHaveBeenCalled();
  h.ptys[0]!.exit();
  await complete;
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("a missing native callback stays pending beyond the external bound, never succeeding on a timer", async () => {
  const h = harness();
  h.start();
  let completed = false;
  void h.fixture.complete(0).then(() => {
    completed = true;
  });
  await vi.advanceTimersByTimeAsync(300_000);
  expect(completed).toBe(false);
  expect(h.window.destroy).not.toHaveBeenCalled();
  expect(h.app.exit).not.toHaveBeenCalled();
});

it("explicit commands retain literal argv and environment without default-shell setup", async () => {
  const h = harness();
  const args = ["-NoProfile", "-Command", "literal 'quoted' $value; Olá🙂"];
  const terminal = h.start({
    ...windowsShell,
    environment: { ORIGINAL: "retained" },
    launchRequest: {
      kind: "explicit-command",
      executable: windowsShell.shell,
      arguments: args,
    },
  });
  expect(h.spawn.mock.calls[0]!.slice(0, 2)).toEqual([
    windowsShell.shell,
    args,
  ]);
  expect(h.spawn.mock.calls[0]![2].env).toMatchObject({ ORIGINAL: "retained" });
  expect(h.spawn.mock.calls[0]![2].env).not.toHaveProperty(
    "OMXTERM_RESTTY_HISTORY",
  );
  expect(terminal.launchKind).toBe("explicit-command");
  await h.fixture.waitFor(() => true, "explicit command input");
});

it("POSIX default shells keep login argv and the prepared Linux isolation environment", async () => {
  const h = harness();
  h.start({
    platform: "linux",
    environment: { INPUTRC: "/owned/home/.inputrc", HOME: "/owned/home" },
  });
  expect(h.spawn.mock.calls[0]!.slice(0, 2)).toEqual(["/bin/sh", ["-l"]]);
  expect(h.spawn.mock.calls[0]![2].env).toMatchObject({
    INPUTRC: "/owned/home/.inputrc",
    HOME: "/owned/home",
  });
  await h.fixture.waitFor(() => true, "POSIX input");
});

it.skipIf(process.platform !== "win32")(
  "the exact owned PowerShell setup verifies process-local isolation without creating history",
  async () => {
    const home = mkdtempSync(path.join(tmpdir(), "omxterm-restty-shell-"));
    try {
      const h = harness();
      h.start({ ...windowsShell, homeDirectory: home });
      const [file, args, options] = h.spawn.mock.calls[0]!;
      // No interactive ReadLine in this probe. The host integration separately
      // uses the unchanged PTY/input route after this script acknowledges setup.
      const output = execFileSync(
        file,
        ["-NonInteractive", ...args.filter((arg) => arg !== "-NoExit")],
        {
          encoding: "utf8",
          env: { ...process.env, ...options.env },
        },
      );
      expect(output).toContain("__OMXTERM_RESTTY_SHELL_ISOLATED__");
      h.ptys[0]!.output(output);
      await h.fixture.waitFor(() => true, "native PowerShell setup");
      expect(existsSync(path.join(home, "restty-history.txt"))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  },
);

it("a close error does not skip other owned sessions or manufacture success", async () => {
  const h = harness();
  h.start();
  h.start();
  h.ptys[0]!.kill.mockImplementation(() => {
    throw new Error("unknown native detail");
  });
  const complete = h.fixture.complete(0);
  expect(h.ptys[1]!.kill).toHaveBeenCalledOnce();
  expect(h.app.exit).not.toHaveBeenCalled();
  h.ptys[0]!.exit();
  h.ptys[1]!.exit();
  await complete;
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.reportError).toHaveBeenCalledExactlyOnceWith(
    "Restty fixture session close failed",
  );
});

it("failure completion waits for actual PTY exit before destroying windows and exiting 1", async () => {
  const h = harness();
  h.start();
  const complete = h.fixture.complete(1);
  expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
  expect(h.window.destroy).not.toHaveBeenCalled();
  expect(h.app.exit).not.toHaveBeenCalled();
  h.ptys[0]!.exit();
  await complete;
  expect(h.window.destroy).toHaveBeenCalledOnce();
  expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(h.window.destroy.mock.invocationCallOrder[0]).toBeLessThan(
    h.app.exit.mock.invocationCallOrder[0]!,
  );
});
