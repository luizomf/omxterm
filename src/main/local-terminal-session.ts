import { readlinkSync } from "node:fs";
import path from "node:path";
import type { IPty, IPtyForkOptions, IDisposable } from "node-pty";
import type { LaunchRequest } from "./launch-request";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  splitTerminalPayload,
  type TerminalExit,
  type TerminalSize,
} from "../shared/terminal-contract";

export type TerminalSessionLaunchKind = LaunchRequest["kind"];
export type TerminalResizeFailureReason = "closed-pty" | "native-failure";

export const TERMINAL_OUTPUT_PAUSE_BYTES = 64 * 1024;
export const TERMINAL_OUTPUT_RESUME_BYTES = 16 * 1024;

export interface TerminalOutputFlowMetrics {
  readonly pendingBytes: number;
  readonly maxPendingBytes: number;
  readonly largestNativeReadBytes: number;
  readonly pauseCount: number;
  readonly resumeCount: number;
}

export interface LocalTerminalSession {
  readonly launchKind?: TerminalSessionLaunchKind;
  readonly fallbackTitle?: string;
  write(data: string): void;
  resize(size: TerminalSize): void;
  acknowledgeOutput?(bytes: number): boolean;
  outputFlowMetrics?(): TerminalOutputFlowMetrics;
  hasForegroundChildProcess(): boolean;
  // The shell's current directory when the platform exposes it (Linux /proc).
  workingDirectory?(): string | undefined;
  close(): void;
}

export class LocalTerminalSessionStartError extends Error {
  readonly launchKind: TerminalSessionLaunchKind;

  constructor(
    launchKind: TerminalSessionLaunchKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "Error";
    this.launchKind = launchKind;
  }
}

export interface ApplicationVersionProvider {
  getVersion(): string;
}

export interface LocalTerminalSessionOptions {
  readonly shell: string;
  readonly launchRequest?: LaunchRequest;
  readonly platform: NodeJS.Platform | string;
  readonly homeDirectory: string;
  readonly applicationVersionProvider: ApplicationVersionProvider;
  readonly environment: NodeJS.ProcessEnv;
  // A validated existing directory; defaults to the account home directory.
  readonly workingDirectory?: string;
  // Variables added for a Saved Session (never overriding the capability
  // identity below).
  readonly extraEnvironment?: Readonly<Record<string, string>>;
  // Typed into the PTY once after spawn, exactly as if the user typed it.
  readonly initialInput?: string;
  readonly title?: string;
  readonly readLink?: (path: string) => string;
  readonly onOutput: (data: string) => void;
  readonly onResizeFailure?: (reason: TerminalResizeFailureReason) => void;
  readonly onExit: (
    exit: TerminalExit,
    launchKind: TerminalSessionLaunchKind,
  ) => void;
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
  const launchRequest = options.launchRequest;
  const explicitCommand = launchRequest?.kind === "explicit-command";
  const executable = explicitCommand ? launchRequest.executable : options.shell;
  // POSIX keeps the interactive Default Shell contract through "-l". An
  // explicit executable receives only the literal arguments the user supplied.
  const arguments_ = explicitCommand
    ? [...launchRequest.arguments]
    : options.platform === "win32"
      ? []
      : ["-l"];
  let pty: IPty;
  try {
    pty = spawnPty(executable, arguments_, {
      cwd: options.workingDirectory ?? options.homeDirectory,
      env: {
        ...options.environment,
        ...options.extraEnvironment,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "OMXTerm",
        TERM_PROGRAM_VERSION: options.applicationVersionProvider.getVersion(),
      },
      cols: 80,
      rows: 24,
      // The OS-provided ConPTY can consume Kitty APCs before they reach Restty.
      // Use the already-packaged ConPTY runtime that preserves this payload.
      ...(options.platform === "win32" ? { useConptyDll: true } : {}),
    });
  } catch (error) {
    if (explicitCommand)
      throw new LocalTerminalSessionStartError(
        "explicit-command",
        "Failed to start the requested command",
      );
    throw new LocalTerminalSessionStartError(
      "default-shell",
      `Failed to start the Default Shell at ${options.shell}`,
      { cause: error },
    );
  }

  let closed = false;
  let exited = false;
  let pendingOutputBytes = 0;
  let maxPendingOutputBytes = 0;
  let largestNativeReadBytes = 0;
  let outputPauseCount = 0;
  let outputResumeCount = 0;
  let outputPaused = false;
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
    largestNativeReadBytes = Math.max(
      largestNativeReadBytes,
      Buffer.byteLength(data, "utf8"),
    );
    for (const chunk of splitTerminalPayload(data)) {
      pendingOutputBytes += Buffer.byteLength(chunk, "utf8");
      maxPendingOutputBytes = Math.max(
        maxPendingOutputBytes,
        pendingOutputBytes,
      );
      options.onOutput(chunk);
      if (!outputPaused && pendingOutputBytes >= TERMINAL_OUTPUT_PAUSE_BYTES) {
        outputPaused = true;
        outputPauseCount += 1;
        pty.pause();
      }
    }
  });
  exitSubscription = pty.onExit((exit) => {
    if (exited) return;
    exited = true;
    releaseSubscriptions();
    options.onExit(
      {
        exitCode: exit.exitCode,
        signal: exit.signal ?? 0,
        ...((exit as typeof exit & { execFailed?: boolean }).execFailed === true
          ? { startupFailed: true as const }
          : {}),
      },
      explicitCommand ? "explicit-command" : "default-shell",
    );
  });
  // An exit delivered during subscription cannot dispose the returned handle
  // until registration finishes.
  if (exited) releaseSubscriptions();

  const shellProcessName = normalizeProcessName(options.shell);
  if (options.initialInput && !exited) {
    // Typed-ahead input is buffered by the terminal driver until the shell
    // reads it, so it runs once the shell's line editor is ready.
    for (const chunk of splitTerminalPayload(options.initialInput))
      pty.write(chunk);
  }

  return {
    launchKind: explicitCommand ? "explicit-command" : "default-shell",
    fallbackTitle:
      options.title ??
      (options.platform === "win32"
        ? path.win32.basename(options.shell)
        : path.posix.basename(options.shell)),
    workingDirectory() {
      if (closed || exited || options.platform !== "linux") return undefined;
      try {
        const directory = (options.readLink ?? readlinkSync)(
          `/proc/${pty.pid}/cwd`,
        );
        return path.posix.isAbsolute(directory) ? directory : undefined;
      } catch {
        return undefined;
      }
    },
    write(data) {
      if (!closed && !exited && isBoundedTerminalPayload(data)) pty.write(data);
    },
    resize(size) {
      if (closed || exited || !isTerminalSize(size)) return;
      try {
        pty.resize(size.cols, size.rows);
      } catch (error) {
        // Pinned Unix node-pty can close its descriptor before delivering exit.
        // Only that exact native error is an expected teardown race. Neither
        // failure completes the session: the real exit subscription still owns it.
        const closedPty =
          (options.platform === "darwin" || options.platform === "linux") &&
          error instanceof Error &&
          error.message === "ioctl(2) failed, EBADF";
        options.onResizeFailure?.(closedPty ? "closed-pty" : "native-failure");
      }
    },
    acknowledgeOutput(bytes) {
      if (
        closed ||
        exited ||
        !Number.isSafeInteger(bytes) ||
        bytes <= 0 ||
        bytes > pendingOutputBytes
      )
        return false;
      pendingOutputBytes -= bytes;
      if (outputPaused && pendingOutputBytes <= TERMINAL_OUTPUT_RESUME_BYTES) {
        outputPaused = false;
        outputResumeCount += 1;
        pty.resume();
      }
      return true;
    },
    outputFlowMetrics() {
      return {
        pendingBytes: pendingOutputBytes,
        maxPendingBytes: maxPendingOutputBytes,
        largestNativeReadBytes,
        pauseCount: outputPauseCount,
        resumeCount: outputResumeCount,
      };
    },
    // Close confirmation asks only when the PTY's foreground process is not
    // the idle Default Shell. The name is compared in memory and never
    // logged, displayed, or transmitted (ADR 0017). When the name cannot be
    // read, the session counts as busy so closing still asks first.
    hasForegroundChildProcess() {
      if (closed || exited) return false;
      // An explicit command has no idle Default Shell state and remains Busy
      // for its complete live lifetime, independent of its reported name.
      if (explicitCommand) return true;
      // ConPTY reports a static console title through pty.process, never
      // the foreground process name, so on Windows the name cannot be read
      // and a live session always counts as Busy (#61).
      if (options.platform === "win32") return true;
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
      // Only output stops at close. The exit subscription stays until the
      // process really ends: the exit report is what lets the window follow
      // its last tab, and a kill only requests that end (#85).
      dataSubscription?.dispose();
      dataSubscription = undefined;
      if (outputPaused) {
        outputPaused = false;
        outputResumeCount += 1;
        pty.resume();
      }
      pendingOutputBytes = 0;
      if (!exited) pty.kill();
    },
  };
}

// A login shell may report itself with a leading dash (e.g. "-zsh").
function normalizeProcessName(value: string): string {
  return path.basename(value).replace(/^-/u, "").toLowerCase();
}
