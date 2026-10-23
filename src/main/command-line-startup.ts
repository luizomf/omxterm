import { statSync } from "node:fs";
import {
  CommandLineOptionError,
  commandLineUsage,
  parseCommandLineOptions,
  type CommandLineOptions,
} from "./command-line-options";
import { applicationArguments } from "./launch-request";

interface CommandLineApplication {
  readonly isPackaged: boolean;
  getVersion(): string;
  exit(code?: number): void;
}

export interface InvalidCommandLine {
  readonly action: "invalid";
  readonly error: CommandLineOptionError;
}

// Reads OMXTerm's options before the application starts. --help and
// --version print to standard output and exit without opening a window. An
// invalid option is written to standard error and returned, so startup can
// report it in a dialog as well.
export function readStartupCommandLine(
  app: CommandLineApplication,
  argv: readonly string[] = process.argv,
  io: {
    readonly currentDirectory: string;
    readonly write: (text: string) => void;
    readonly writeError: (text: string) => void;
  } = {
    currentDirectory: process.cwd(),
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
  },
): CommandLineOptions | InvalidCommandLine {
  let options: CommandLineOptions;
  try {
    options = parseCommandLineOptions(
      applicationArguments(argv, app.isPackaged),
      {
        currentDirectory: io.currentDirectory,
        isDirectory: (directory) => {
          try {
            return statSync(directory).isDirectory();
          } catch {
            return false;
          }
        },
      },
    );
  } catch (cause) {
    if (!(cause instanceof CommandLineOptionError)) throw cause;
    io.writeError(`omxterm: ${cause.message}\nTry 'omxterm --help'.\n`);
    return { action: "invalid", error: cause };
  }
  if (options.action === "help") {
    io.write(commandLineUsage());
    app.exit(0);
  } else if (options.action === "version") {
    io.write(`OMXTerm ${app.getVersion()}\n`);
    app.exit(0);
  }
  return options;
}
