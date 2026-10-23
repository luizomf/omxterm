import { hasExactKeys, isNonnegativeSafeInteger } from "./event-validation";
import {
  isConfigurationEvent,
  type ConfigurationFailureReason,
} from "./configuration-events";
import {
  isApplicationDataEvent,
  type ApplicationDataRecoveredEvent,
} from "./application-data-events";
import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import type { OperationalLogLevel } from "../shared/user-configuration";
import {
  MAX_TERMINAL_COLUMNS,
  MAX_TERMINAL_ROWS,
} from "../shared/terminal-contract";

export const MAX_OPERATIONAL_LOG_BYTES = 5 * 1024 * 1024;
export const CURRENT_OPERATIONAL_LOG_FILE = "omxterm.jsonl";
export const PREVIOUS_OPERATIONAL_LOG_FILE = "omxterm.previous.jsonl";

const operationalLogLevels = ["error", "info", "debug"] as const;
const levelPriority: Record<OperationalLogLevel, number> = {
  error: 0,
  info: 1,
  debug: 2,
};

export type OperationalEvent =
  | { readonly name: "application.started" }
  | {
      readonly name: "application.failure";
      readonly stage:
        | "launch-request"
        | "command-line"
        | "startup"
        | "new-window"
        | "renderer-load"
        | "external-link-open";
    }
  | { readonly name: "configuration.validated" }
  | {
      readonly name: "configuration.rejected";
      readonly reason: ConfigurationFailureReason;
    }
  | {
      readonly name:
        "configuration.reload.requested" | "configuration.reload.succeeded";
      readonly trigger: "manual";
      readonly durationMs: number;
    }
  | {
      readonly name: "configuration.reload.rejected";
      readonly trigger: "manual";
      readonly durationMs: number;
      readonly reason: ConfigurationFailureReason | "unexpected-failure";
    }
  | { readonly name: "window.opened"; readonly windowId: number }
  | {
      readonly name: "window.closed";
      readonly windowId: number;
      readonly durationMs: number;
    }
  | {
      readonly name: "pty.control";
      readonly windowId: number;
      readonly action: "started" | "close-requested";
    }
  | {
      readonly name: "pty.resize";
      readonly windowId: number;
      readonly cols: number;
      readonly rows: number;
    }
  | {
      readonly name: "pty.resize-failed";
      readonly windowId: number;
      readonly reason: "closed-pty" | "native-failure";
    }
  | {
      readonly name: "pty.exit";
      readonly windowId: number;
      readonly outcome: "clean" | "spawn-failure" | "signal";
      readonly code: number | null;
      readonly durationMs: number;
    }
  | ApplicationDataRecoveredEvent
  | {
      readonly name: "boundary.rejected";
      readonly boundary: "ipc" | "title" | "external-link" | "clipboard";
      readonly reason:
        | "untrusted-sender"
        | "invalid-payload"
        | "invalid-value"
        | "too-long"
        | "invalid-characters"
        | "unknown-session"
        | "invalid-progress";
    };

export interface OperationalEventLog {
  setLevel(level: OperationalLogLevel): void;
  write(event: OperationalEvent): boolean;
  flush(): void;
}

interface PersistedOperationalEvent extends Record<string, unknown> {
  readonly version: 1;
  readonly timestamp: string;
  readonly level: OperationalLogLevel;
  readonly name: OperationalEvent["name"];
}

export interface CreateOperationalEventLogOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  readonly now?: () => Date;
}

export function resolveOperationalLogDirectory(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const root =
    environment.XDG_STATE_HOME || path.join(homeDirectory, ".local", "state");
  return path.join(root, "omxterm", "logs");
}

export function createOperationalEventLog(
  options: CreateOperationalEventLogOptions,
): OperationalEventLog {
  try {
    return new JsonlOperationalEventLog(options);
  } catch {
    return unavailableOperationalEventLog;
  }
}

class JsonlOperationalEventLog implements OperationalEventLog {
  readonly #directory: string;
  readonly #currentFile: string;
  readonly #previousFile: string;
  readonly #now: () => Date;
  #level: OperationalLogLevel = "info";

  constructor(options: CreateOperationalEventLogOptions) {
    this.#directory = resolveOperationalLogDirectory(
      options.environment,
      options.homeDirectory,
    );
    this.#currentFile = path.join(
      this.#directory,
      CURRENT_OPERATIONAL_LOG_FILE,
    );
    this.#previousFile = path.join(
      this.#directory,
      PREVIOUS_OPERATIONAL_LOG_FILE,
    );
    this.#now = options.now ?? (() => new Date());
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
    this.#removeOlderFiles();
    this.#repairFile(this.#currentFile);
    this.#repairFile(this.#previousFile);
  }

  setLevel(level: OperationalLogLevel): void {
    if (!operationalLogLevels.includes(level))
      throw new TypeError("Invalid Operational Event log level");
    this.#level = level;
  }

  write(candidate: OperationalEvent): boolean {
    if (!isOperationalEvent(candidate)) return false;
    const level = eventLevel(candidate);
    if (levelPriority[level] > levelPriority[this.#level]) return false;

    const timestamp = this.#now().toISOString();
    const record: PersistedOperationalEvent = {
      version: 1,
      timestamp,
      level,
      ...candidate,
    };
    if (!isPersistedOperationalEvent(record)) return false;
    const line = `${JSON.stringify(record)}\n`;
    const bytes = Buffer.byteLength(line, "utf8");
    if (bytes > MAX_OPERATIONAL_LOG_BYTES) return false;

    try {
      const currentBytes = existingFileSize(this.#currentFile);
      if (currentBytes + bytes > MAX_OPERATIONAL_LOG_BYTES) this.#rotate();
      appendFileSync(this.#currentFile, line, {
        encoding: "utf8",
        mode: 0o600,
      });
      this.#assertBounds();
      return true;
    } catch {
      this.#recoverAfterFailure();
      return false;
    }
  }

  flush(): void {
    try {
      this.#repairFile(this.#currentFile);
      this.#repairFile(this.#previousFile);
      this.#assertBounds();
    } catch {
      this.#recoverAfterFailure();
    }
  }

  #rotate(): void {
    unlinkIfPresent(this.#previousFile);
    if (existingFileSize(this.#currentFile) > 0)
      renameSync(this.#currentFile, this.#previousFile);
  }

  #removeOlderFiles(): void {
    for (const entry of readdirSync(this.#directory)) {
      if (
        entry !== CURRENT_OPERATIONAL_LOG_FILE &&
        entry !== PREVIOUS_OPERATIONAL_LOG_FILE &&
        /^omxterm(?:\..+)?\.jsonl$/u.test(entry)
      )
        unlinkIfPresent(path.join(this.#directory, entry));
    }
  }

  #repairFile(file: string): void {
    let metadata;
    try {
      metadata = lstatSync(file);
    } catch (cause) {
      if (isNotFound(cause)) return;
      throw cause;
    }
    if (!metadata.isFile() || metadata.size > MAX_OPERATIONAL_LOG_BYTES) {
      unlinkIfPresent(file);
      return;
    }
    const bytes = readFileSync(file);
    if (bytes.length === 0) {
      unlinkIfPresent(file);
      return;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      unlinkIfPresent(file);
      return;
    }
    if (!text.endsWith("\n")) {
      unlinkIfPresent(file);
      return;
    }
    const lines = text.slice(0, -1).split("\n");
    if (
      lines.some((line) => {
        if (line.length === 0) return true;
        try {
          return !isPersistedOperationalEvent(JSON.parse(line) as unknown);
        } catch {
          return true;
        }
      })
    )
      unlinkIfPresent(file);
  }

  #assertBounds(): void {
    if (
      existingFileSize(this.#currentFile) > MAX_OPERATIONAL_LOG_BYTES ||
      existingFileSize(this.#previousFile) > MAX_OPERATIONAL_LOG_BYTES
    )
      throw new Error("Operational Event file exceeded its byte cap");
  }

  #recoverAfterFailure(): void {
    try {
      this.#repairFile(this.#currentFile);
      this.#repairFile(this.#previousFile);
    } catch {
      // A logger persistence failure must not create a new application UX policy.
    }
  }
}

const unavailableOperationalEventLog: OperationalEventLog = Object.freeze({
  setLevel(level: OperationalLogLevel) {
    if (!operationalLogLevels.includes(level))
      throw new TypeError("Invalid Operational Event log level");
  },
  write: () => false,
  flush: () => {},
});

function eventLevel(event: OperationalEvent): OperationalLogLevel {
  if (
    event.name === "application.failure" ||
    event.name === "configuration.rejected" ||
    event.name === "configuration.reload.rejected" ||
    event.name === "application-data.recovered" ||
    (event.name === "pty.exit" && event.outcome !== "clean") ||
    (event.name === "pty.resize-failed" && event.reason === "native-failure")
  )
    return "error";
  if (
    event.name === "pty.resize" ||
    event.name === "pty.resize-failed" ||
    event.name === "boundary.rejected"
  )
    return "debug";
  return "info";
}

function isResizeFailureEvent(value: Record<string, unknown>): boolean {
  return (
    hasExactKeys(value, ["name", "windowId", "reason"]) &&
    isId(value.windowId) &&
    ["closed-pty", "native-failure"].includes(value.reason as string)
  );
}

// Event families validated by their own functions.
function eventFamilyValidator(
  name: string,
): ((value: Record<string, unknown>) => boolean) | undefined {
  if (name.startsWith("configuration.")) return isConfigurationEvent;
  return name.startsWith("application-data.")
    ? isApplicationDataEvent
    : undefined;
}

function isOperationalEvent(value: unknown): value is OperationalEvent {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  const family = eventFamilyValidator(value.name);
  if (family) return family(value);
  switch (value.name) {
    case "application.started":
      return hasExactKeys(value, ["name"]);
    case "application.failure":
      return (
        hasExactKeys(value, ["name", "stage"]) &&
        [
          "launch-request",
          "command-line",
          "startup",
          "new-window",
          "renderer-load",
          "external-link-open",
        ].includes(value.stage as string)
      );
    case "window.opened":
      return hasExactKeys(value, ["name", "windowId"]) && isId(value.windowId);
    case "window.closed":
      return (
        hasExactKeys(value, ["name", "windowId", "durationMs"]) &&
        isId(value.windowId) &&
        isNonnegativeSafeInteger(value.durationMs)
      );
    case "pty.control":
      return (
        hasExactKeys(value, ["name", "windowId", "action"]) &&
        isId(value.windowId) &&
        ["started", "close-requested"].includes(value.action as string)
      );
    case "pty.resize":
      return (
        hasExactKeys(value, ["name", "windowId", "cols", "rows"]) &&
        isId(value.windowId) &&
        isPositiveSafeInteger(value.cols) &&
        value.cols <= MAX_TERMINAL_COLUMNS &&
        isPositiveSafeInteger(value.rows) &&
        value.rows <= MAX_TERMINAL_ROWS
      );
    case "pty.resize-failed":
      return isResizeFailureEvent(value);
    case "pty.exit":
      return (
        hasExactKeys(value, [
          "name",
          "windowId",
          "outcome",
          "code",
          "durationMs",
        ]) &&
        isId(value.windowId) &&
        ["clean", "spawn-failure", "signal"].includes(
          value.outcome as string,
        ) &&
        (value.code === null || isNonnegativeSafeInteger(value.code)) &&
        isNonnegativeSafeInteger(value.durationMs)
      );
    case "boundary.rejected":
      return (
        hasExactKeys(value, ["name", "boundary", "reason"]) &&
        ["ipc", "title", "external-link", "clipboard"].includes(
          value.boundary as string,
        ) &&
        [
          "untrusted-sender",
          "invalid-payload",
          "invalid-value",
          "too-long",
          "invalid-characters",
          "unknown-session",
          "invalid-progress",
        ].includes(value.reason as string)
      );
    default:
      return false;
  }
}

function isPersistedOperationalEvent(
  value: unknown,
): value is PersistedOperationalEvent {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isTimestamp(value.timestamp) ||
    !operationalLogLevels.includes(value.level as OperationalLogLevel)
  )
    return false;
  const { version: _version, timestamp: _timestamp, level, ...event } = value;
  return isOperationalEvent(event) && level === eventLevel(event);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 24) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is number {
  return isPositiveSafeInteger(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function existingFileSize(file: string): number {
  try {
    return statSync(file).size;
  } catch (cause) {
    if (isNotFound(cause)) return 0;
    throw cause;
  }
}

function unlinkIfPresent(file: string): void {
  try {
    unlinkSync(file);
  } catch (cause) {
    if (!isNotFound(cause)) throw cause;
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}
