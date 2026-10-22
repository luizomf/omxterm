import path from "node:path";
import { parseSshTarget } from "../shared/saved-session-primitives";
import type { OperationalLogLevel } from "../shared/user-configuration";
import type { OperationalEventLog } from "./operational-events";

// OMXTerm's own options, read from the arguments before the first -e (every
// value after it is literal argv for the Launch Request). Anything else, such
// as a Chromium switch, is left for Electron.
export interface CommandLineOptions {
  readonly action: "run" | "help" | "version";
  // The first tab of the first window only, like the Launch Request.
  readonly startup: StartupOptions;
  // -e was given, so the first tab runs a program.
  readonly explicitCommand: boolean;
  readonly logLevel?: OperationalLogLevel;
}

export interface StartupOptions {
  readonly workingDirectory?: string;
  // Served once to the first window's renderer, which opens it like Quick
  // Connect (keeping a failed screen with Reconnect).
  readonly ssh?: string;
}

export class CommandLineOptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandLineOptionError";
  }
}

const LOG_LEVELS: readonly OperationalLogLevel[] = ["error", "info", "debug"];
const VALUE_OPTIONS: Readonly<Record<string, string>> = {
  "-w": "workingDirectory",
  "--working-directory": "workingDirectory",
  "--ssh": "ssh",
  "--log-level": "logLevel",
};

// -e, -w or --ssh: the first tab is not an ordinary shell, so a saved
// workspace is not reopened.
export function requestsStartupLaunch(options: CommandLineOptions): boolean {
  return (
    options.explicitCommand ||
    options.startup.ssh !== undefined ||
    options.startup.workingDirectory !== undefined
  );
}

export function commandLineUsage(executable = "omxterm"): string {
  return [
    `Usage: ${executable} [options] [-e <program> [arguments...]]`,
    "",
    "Options:",
    "  -w, --working-directory <dir>  Start the first tab in <dir>",
    "  --ssh <[user@]host[:port]>     Open the first tab as an SSH connection",
    "  --log-level <error|info|debug> Override logLevel for this run",
    "  --debug                        Same as --log-level debug",
    "  -e <program> [arguments...]    Run <program> with literal arguments in",
    "                                 the first tab instead of the shell",
    "  -v, --version                  Print the version and exit",
    "  -h, --help                     Print this help and exit",
    "",
  ].join("\n");
}

export function parseCommandLineOptions(
  applicationArguments: readonly string[],
  context: {
    readonly currentDirectory: string;
    readonly isDirectory: (directory: string) => boolean;
  },
): CommandLineOptions {
  const marker = applicationArguments.indexOf("-e");
  const own =
    marker === -1
      ? applicationArguments
      : applicationArguments.slice(0, marker);
  const values: Record<string, string> = {};
  let action: CommandLineOptions["action"] = "run";
  for (let index = 0; index < own.length; index += 1) {
    const argument = own[index]!;
    const equals = argument.indexOf("=");
    const name = equals > 0 ? argument.slice(0, equals) : argument;
    if (name === "-h" || name === "--help") action = "help";
    else if ((name === "-v" || name === "--version") && action !== "help")
      action = "version";
    else if (name === "--debug") values.logLevel = "debug";
    else if (VALUE_OPTIONS[name]) {
      const value = equals > 0 ? argument.slice(equals + 1) : own[(index += 1)];
      if (value === undefined || value === "")
        throw new CommandLineOptionError(`${name} requires a value.`);
      values[VALUE_OPTIONS[name]] = value;
    }
  }
  if (action !== "run") return { action, startup: {}, explicitCommand: false };
  return {
    action,
    startup: startupOptions(values, marker !== -1, context),
    explicitCommand: marker !== -1,
    ...(values.logLevel === undefined
      ? {}
      : { logLevel: logLevel(values.logLevel) }),
  };
}

function startupOptions(
  values: Readonly<Record<string, string>>,
  explicitCommand: boolean,
  context: Parameters<typeof parseCommandLineOptions>[1],
): StartupOptions {
  const { workingDirectory, ssh } = values;
  if (ssh !== undefined) {
    if (explicitCommand || workingDirectory !== undefined)
      throw new CommandLineOptionError(
        "--ssh cannot be combined with -e or --working-directory.",
      );
    if (parseSshTarget(ssh) === undefined)
      throw new CommandLineOptionError(
        "--ssh expects [user@]host[:port], for example admin@example.com:2222.",
      );
  }
  const directory =
    workingDirectory === undefined
      ? undefined
      : path.resolve(context.currentDirectory, workingDirectory);
  if (directory !== undefined && !context.isDirectory(directory))
    throw new CommandLineOptionError(
      "--working-directory must name an existing directory.",
    );
  return {
    ...(directory === undefined ? {} : { workingDirectory: directory }),
    ...(ssh === undefined ? {} : { ssh }),
  };
}

function logLevel(value: string): OperationalLogLevel {
  const level = LOG_LEVELS.find((candidate) => candidate === value);
  if (!level)
    throw new CommandLineOptionError(
      "--log-level must be error, info or debug.",
    );
  return level;
}

// The working directory is consumed by the first tab of the first window,
// once, like the Launch Request.
export function startupOptionsForWindow(
  windowId: number,
  options: StartupOptions,
): () => StartupOptions {
  let pending: StartupOptions =
    windowId === 1 && options.workingDirectory !== undefined
      ? { workingDirectory: options.workingDirectory }
      : {};
  return () => {
    const current = pending;
    pending = {};
    return current;
  };
}

// A --log-level override wins over logLevel from the configuration, also
// when the configuration is reloaded.
export function withLogLevelOverride(
  log: OperationalEventLog,
  level: OperationalLogLevel | undefined,
): OperationalEventLog {
  if (level === undefined) return log;
  log.setLevel(level);
  return {
    setLevel: () => {},
    write: (event) => log.write(event),
    flush: () => log.flush(),
  };
}
