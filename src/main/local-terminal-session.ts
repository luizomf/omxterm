import path from "node:path";
import type { IPty, IPtyForkOptions, IDisposable } from "node-pty";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  splitTerminalPayload,
  type TerminalExit,
  type TerminalSize,
} from "../shared/terminal-contract";

export interface LocalTerminalSession {
  write(data: string): void;
  resize(size: TerminalSize): void;
  hasForegroundChildProcess(): boolean;
  close(): void;
}

export interface ApplicationVersionProvider {
  getVersion(): string;
}

export interface LocalTerminalSessionOptions {
  readonly shell: string;
  readonly homeDirectory: string;
  readonly applicationVersionProvider: ApplicationVersionProvider;
  readonly environment: NodeJS.ProcessEnv;
  readonly onOutput: (data: string) => void;
  readonly onExit: (exit: TerminalExit) => void;
}

export type SpawnPty = (
  file: string,
  args: string[],
  options: IPtyForkOptions,
) => IPty;

export function createLocalTerminalSession(
  spawnPty: SpawnPty,
  options: LocalTerminalSessionOptions,
): LocalTerminalSession {
  let pty: IPty;
  try {
    pty = spawnPty(options.shell, ["-l"], {
      cwd: options.homeDirectory,
      env: {
        ...options.environment,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "OMXTerm",
        TERM_PROGRAM_VERSION: options.applicationVersionProvider.getVersion(),
      },
      cols: 80,
      rows: 24,
    });
  } catch (error) {
    throw new Error(`Failed to start the Default Shell at ${options.shell}`, {
      cause: error,
    });
  }

  let closed = false;
  let exited = false;
  let dataSubscription: IDisposable | undefined;
  let exitSubscription: IDisposable | undefined;

  const releaseSubscriptions = () => {
    dataSubscription?.dispose();
    exitSubscription?.dispose();
    dataSubscription = undefined;
    exitSubscription = undefined;
  };

  dataSubscription = pty.onData((data) => {
    if (closed) return;
    for (const chunk of splitTerminalPayload(data)) options.onOutput(chunk);
  });
  exitSubscription = pty.onExit((exit) => {
    if (exited) return;
    exited = true;
    releaseSubscriptions();
    options.onExit({ exitCode: exit.exitCode, signal: exit.signal ?? 0 });
  });

  const shellProcessName = normalizeProcessName(options.shell);

  return {
    write(data) {
      if (!closed && !exited && isBoundedTerminalPayload(data)) pty.write(data);
    },
    resize(size) {
      if (!closed && !exited && isTerminalSize(size))
        pty.resize(size.cols, size.rows);
    },
    // Close confirmation asks only when the PTY's foreground process is not
    // the idle Default Shell. The name is compared in memory and never
    // logged, displayed, or transmitted (ADR 0017). When the name cannot be
    // read, the session counts as busy so closing still asks first.
    hasForegroundChildProcess() {
      if (closed || exited) return false;
      let foreground: unknown;
      try {
        foreground = pty.process;
      } catch {
        return true;
      }
      if (typeof foreground !== "string" || foreground.length === 0)
        return true;
      return normalizeProcessName(foreground) !== shellProcessName;
    },
    close() {
      if (closed) return;
      closed = true;
      releaseSubscriptions();
      if (!exited) pty.kill();
    },
  };
}

// A login shell may report itself with a leading dash (e.g. "-zsh").
function normalizeProcessName(value: string): string {
  return path.basename(value).replace(/^-/u, "").toLowerCase();
}
