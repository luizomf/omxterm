import { appendFileSync, statSync } from "node:fs";
import { open } from "node:fs/promises";

const stages = [
  "bootstrap",
  "producer-identity",
  "production-import",
  "relaunch-registration",
  "menu-observation",
  "observation-publication",
  "observation-published",
  "quit-request",
  "before-quit",
  "will-quit",
  "failure-exit",
  "window-created",
  "completion-publication",
  "startup-dialog",
  "watchdog",
] as const;
const roles = ["unknown", "initial", "replacement"] as const;
const categories = [
  "none",
  "inspection-timeout",
  "startup-timeout",
  "timeout",
  "filesystem-error",
  "unexpected-error",
] as const;
type AboutStage = (typeof stages)[number];
interface AboutDiagnostic {
  readonly version: 1;
  readonly stage: AboutStage;
  readonly role: (typeof roles)[number];
  readonly category: (typeof categories)[number];
  readonly pid: number;
}

/** Diagnostic metadata only: never a completion or process-ownership record. */
export function createAboutDiagnostics(file: string | undefined) {
  let stage: AboutStage = "bootstrap";
  let role: AboutDiagnostic["role"] = "unknown";
  let writes = 0;
  const record = (category: AboutDiagnostic["category"]) => {
    if (!file || writes >= 16) return;
    writes += 1;
    try {
      const value: AboutDiagnostic = {
        version: 1,
        stage,
        role,
        category,
        pid: process.pid,
      };
      const line = `${JSON.stringify(value)}\n`;
      let size = 0;
      try {
        size = statSync(file).size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (
        Buffer.byteLength(line) > 256 ||
        size + Buffer.byteLength(line) > 8192
      )
        return;
      appendFileSync(file, line);
    } catch {
      // Diagnostics must not replace the original startup failure or exit.
      // The caller reports missing/unreadable evidence rather than success.
    }
  };
  return {
    enter(next: AboutStage) {
      stage = next;
      record("none");
    },
    replacement(relaunched: boolean) {
      role = relaunched ? "replacement" : "initial";
    },
    failure(error: unknown) {
      let code: unknown;
      try {
        if (error && typeof error === "object" && "code" in error)
          code = error.code;
      } catch {
        /* An untrusted error getter is not diagnostic payload. */
      }
      record(
        code === "ETIMEDOUT"
          ? stage === "watchdog"
            ? "startup-timeout"
            : stage === "producer-identity" || stage === "relaunch-registration"
              ? "inspection-timeout"
              : "timeout"
          : typeof code === "string" &&
              ["ENOENT", "EACCES", "EPERM", "EEXIST", "EIO", "ENOSPC"].includes(
                code,
              )
            ? "filesystem-error"
            : "unexpected-error",
      );
    },
  };
}

/** Intended-phase evidence only; actual outcome and cleanup remain supervisor-owned. */
export function hasAboutPhaseEvidence(
  diagnostics: Awaited<ReturnType<typeof readAboutDiagnostics>>,
  mode:
    | "development"
    | "packaged"
    | "missing-result"
    | "published-hang"
    | "published-failure",
): boolean {
  if (
    diagnostics.status !== "available" ||
    diagnostics.records.some((record) => record.stage === "window-created")
  )
    return false;
  // A previous initial producer must not cover a replacement that stalled.
  const start = diagnostics.records.findLastIndex(
    (record) => record.stage === "producer-identity",
  );
  const identity = diagnostics.records[start];
  if (!identity || identity.role === "unknown") return false;
  const producer = diagnostics.records
    .slice(start)
    .filter(
      (record) => record.pid === identity.pid && record.role === identity.role,
    );
  if (
    producer.some(
      (record) =>
        record.category !== "none" ||
        record.stage === "startup-dialog" ||
        record.stage === "watchdog",
    )
  )
    return false;
  const required: AboutStage[] = [
    "producer-identity",
    "production-import",
    "menu-observation",
  ];
  if (mode !== "missing-result") required.push("observation-published");
  if (mode !== "missing-result" && mode !== "published-hang")
    required.push("quit-request", "before-quit", "will-quit");
  if (mode === "published-failure") required.push("failure-exit");
  let reached = 0;
  for (const record of producer)
    if (record.stage === required[reached]) reached += 1;
  return reached === required.length;
}

function isAboutDiagnostic(value: unknown): value is AboutDiagnostic {
  return Boolean(
    value &&
    typeof value === "object" &&
    Object.keys(value).sort().join(",") === "category,pid,role,stage,version" &&
    "version" in value &&
    value.version === 1 &&
    "stage" in value &&
    stages.some((stage) => stage === value.stage) &&
    "role" in value &&
    roles.some((role) => role === value.role) &&
    "category" in value &&
    categories.some((category) => category === value.category) &&
    "pid" in value &&
    typeof value.pid === "number" &&
    Number.isSafeInteger(value.pid) &&
    value.pid > 0,
  );
}

export async function readAboutDiagnostics(file: string): Promise<{
  readonly status: "available" | "missing" | "unreadable" | "invalid";
  readonly records: readonly AboutDiagnostic[];
}> {
  try {
    const handle = await open(file, "r");
    let text: string;
    try {
      const buffer = Buffer.alloc(16_385);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(
          buffer,
          length,
          buffer.length - length,
          length,
        );
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > 16_384) return { status: "invalid", records: [] };
      text = buffer.subarray(0, length).toString("utf8");
    } finally {
      await handle.close();
    }
    const lines = text.trim().split("\n");
    if (!text.trim() || lines.length > 64)
      return { status: "invalid", records: [] };
    const records: AboutDiagnostic[] = [];
    for (const line of lines) {
      const value: unknown = JSON.parse(line);
      if (!isAboutDiagnostic(value)) return { status: "invalid", records: [] };
      records.push(value);
    }
    return { status: "available", records };
  } catch (error) {
    return {
      status:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "missing"
          : error instanceof SyntaxError
            ? "invalid"
            : "unreadable",
      records: [],
    };
  }
}
