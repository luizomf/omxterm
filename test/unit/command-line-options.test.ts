import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CommandLineOptionError,
  commandLineUsage,
  parseCommandLineOptions,
  startupOptionsForWindow,
  withLogLevelOverride,
} from "../../src/main/command-line-options";
import { readStartupCommandLine } from "../../src/main/command-line-startup";
import {
  startupFailureStage,
  terminalApplicationFailure,
  terminalApplicationFailureDisplay,
} from "../../src/main/terminal-application-failure";
import { MalformedLaunchRequestError } from "../../src/main/launch-request";
import { launchTerminalSession } from "../../src/main/session-launch";
import { registerSessionIpc } from "../../src/main/session-ipc";
import { sessionIpc } from "../../src/shared/session-ipc";
import type {
  IpcEvent,
  IpcHandler,
  IpcMainPort,
} from "../../src/main/terminal-ipc-types";
import type { SavedSessionService } from "../../src/main/saved-sessions";

const home = path.resolve("/home/me");
const directories = new Set([home, path.join(home, "work")]);
const context = {
  currentDirectory: home,
  isDirectory: (directory: string) => directories.has(directory),
};
const parse = (...args: string[]) => parseCommandLineOptions(args, context);

describe("command-line options", () => {
  it("leaves an ordinary launch, Chromium switches and -e argv alone", () => {
    expect(parse()).toEqual({
      action: "run",
      startup: {},
      explicitCommand: false,
    });
    expect(
      parse("--no-sandbox", "--ozone-platform=x11", "-e", "vim", "--help"),
    ).toEqual({ action: "run", startup: {}, explicitCommand: true });
  });

  it("prints help or the version instead of starting", () => {
    expect(parse("--version").action).toBe("version");
    expect(parse("-v", "--help").action).toBe("help");
    expect(parse("-h").action).toBe("help");
    expect(commandLineUsage()).toContain("--working-directory <dir>");
  });

  it("resolves the working directory and requires it to exist", () => {
    expect(parse("-w", "work").startup).toEqual({
      workingDirectory: path.join(home, "work"),
    });
    expect(parse(`--working-directory=${home}`).startup).toEqual({
      workingDirectory: home,
    });
    expect(parse("-w", "work", "-e", "htop").startup).toEqual({
      workingDirectory: path.join(home, "work"),
    });
    expect(() => parse("-w", "missing")).toThrow(/existing directory/u);
    expect(() => parse("-w")).toThrow(CommandLineOptionError);
    expect(() => parse("-w", "-e", "htop")).toThrow(/requires a value/u);
  });

  it("accepts an SSH target alone and validates it like Quick Connect", () => {
    expect(parse("--ssh", "admin@example.com:2222").startup).toEqual({
      ssh: "admin@example.com:2222",
    });
    expect(() => parse("--ssh", "-oProxyCommand=evil")).toThrow(
      /\[user@\]host/u,
    );
    expect(() => parse("--ssh", "host", "-e", "htop")).toThrow(
      /cannot be combined/u,
    );
    expect(() => parse("--ssh", "host", "-w", home)).toThrow(
      /cannot be combined/u,
    );
  });

  it("validates the log level and treats --debug as debug", () => {
    expect(parse("--log-level", "info").logLevel).toBe("info");
    expect(parse("--debug").logLevel).toBe("debug");
    expect(() => parse("--log-level=loud")).toThrow(/error, info or debug/u);
  });

  it("gives the working directory to the first tab of the first window only", () => {
    const first = startupOptionsForWindow(1, {
      workingDirectory: home,
      ssh: "host",
    });
    expect(first()).toEqual({ workingDirectory: home });
    expect(first()).toEqual({});
    expect(startupOptionsForWindow(2, { workingDirectory: home })()).toEqual(
      {},
    );
  });

  it("keeps a --log-level override when the configuration reloads", () => {
    const log = { setLevel: vi.fn(), write: vi.fn(() => true), flush: vi.fn() };
    const pinned = withLogLevelOverride(log, "debug");
    pinned.setLevel("error");
    expect(log.setLevel.mock.calls).toEqual([["debug"]]);
    pinned.write({ name: "application.started" });
    expect(log.write).toHaveBeenCalledOnce();
    expect(withLogLevelOverride(log, undefined)).toBe(log);
  });
});

describe("startup command line", () => {
  const app = (isPackaged = true) => ({
    isPackaged,
    getVersion: () => "1.2.3",
    exit: vi.fn(),
  });
  const io = () => ({
    currentDirectory: home,
    write: vi.fn(),
    writeError: vi.fn(),
  });

  it("prints help and the version and exits with status 0", () => {
    const application = app();
    const output = io();
    readStartupCommandLine(application, ["/opt/OMXTerm", "--version"], output);
    expect(output.write).toHaveBeenCalledWith("OMXTerm 1.2.3\n");
    expect(application.exit).toHaveBeenCalledWith(0);
    const development = app(false);
    readStartupCommandLine(
      development,
      ["/electron", "/project", "--help"],
      output,
    );
    expect(output.write).toHaveBeenLastCalledWith(commandLineUsage());
    expect(development.exit).toHaveBeenCalledWith(0);
  });

  it("reports an invalid option on standard error without exiting yet", () => {
    const application = app();
    const output = io();
    const result = readStartupCommandLine(
      application,
      ["/opt/OMXTerm", "--log-level", "loud"],
      output,
    );
    expect(result.action).toBe("invalid");
    expect(output.writeError).toHaveBeenCalledWith(
      "omxterm: --log-level must be error, info or debug.\nTry 'omxterm --help'.\n",
    );
    expect(application.exit).not.toHaveBeenCalled();
  });

  it("shows a fixed dialog message for an invalid option", () => {
    const cause = new CommandLineOptionError("--ssh requires a value.");
    expect(startupFailureStage(cause)).toBe("command-line");
    expect(startupFailureStage(new MalformedLaunchRequestError())).toBe(
      "launch-request",
    );
    expect(startupFailureStage(new Error("other"))).toBe("startup");
    expect(
      terminalApplicationFailureDisplay(
        terminalApplicationFailure("command-line", cause),
      ),
    ).toEqual({
      title: "OMXTerm could not start",
      message:
        "A command-line option is invalid. Run omxterm --help to see the supported options.",
    });
  });
});

describe("startup launch", () => {
  it("starts the first default tab in the requested directory", () => {
    const start = vi.fn((options: unknown) => options as never);
    const directory = process.cwd();
    let pending: { workingDirectory?: string } = {
      workingDirectory: directory,
    };
    const launch = () =>
      launchTerminalSession(
        { kind: "default" },
        { shell: "/bin/sh" } as never,
        {
          consumeLaunchRequest: () => ({ kind: "default-shell" }),
          consumeStartupOptions: () => {
            const current = pending;
            pending = {};
            return current;
          },
          savedSessions: {} as never,
          start,
        },
      );
    launch();
    launch();
    expect(start.mock.calls[0]![0]).toMatchObject({
      workingDirectory: directory,
    });
    expect(start.mock.calls[1]![0]).not.toHaveProperty("workingDirectory");
  });

  it("hands the --ssh target to the first trusted renderer that asks", async () => {
    const handlers = new Map<string, IpcHandler>();
    const ipcMain: IpcMainPort = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
      on: () => {},
      removeListener: () => {},
    };
    let target: string | undefined = "admin@example.com";
    registerSessionIpc(
      ipcMain,
      () => true,
      {} as SavedSessionService,
      { chooseOpenPath: vi.fn(), chooseSavePath: vi.fn() },
      undefined,
      () => {
        const current = target;
        target = undefined;
        return current;
      },
    );
    const frame = {};
    const event: IpcEvent = {
      sender: { mainFrame: frame, isDestroyed: () => false, send: () => {} },
      senderFrame: frame,
    };
    const ask = handlers.get(sessionIpc.startupConnection)!;
    expect(await ask(event)).toBe("admin@example.com");
    expect(await ask(event)).toBeNull();
  });
});
