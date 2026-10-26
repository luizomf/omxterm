import { writeSync } from "node:fs";

const phases = [
  "pending-write",
  "pending-replacement",
  "completed-write",
  "completed-replacement",
  "ready-observation",
  "exit-observation",
] as const;
const codes = new Set([
  "EACCES",
  "EAGAIN",
  "EBUSY",
  "EDQUOT",
  "EEXIST",
  "EINTR",
  "EINVAL",
  "EIO",
  "EISDIR",
  "EMFILE",
  "ENAMETOOLONG",
  "ENFILE",
  "ENOENT",
  "ENOMEM",
  "ENOSPC",
  "ENOTDIR",
  "ENOTEMPTY",
  "ENOTSUP",
  "EPERM",
  "EROFS",
  "UNKNOWN",
]);
const syscalls = new Set(["open", "write", "close", "rename"]);

// Own primitive data only: never invoke getters, coercion or raw-error JSON.
function field(error: unknown, name: string): unknown {
  try {
    if (
      (typeof error !== "object" || error === null) &&
      typeof error !== "function"
    )
      return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(error, name);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

// The existing supervisor stderr transport retains this failure-only record.
// A completed-write phase includes writeFileSync's internal close; it does not
// assert that close failed unless the error's safe syscall actually says so.
// Observation phases retain callback failures without aborting native event
// dispatch. The pending ownership record, not this best-effort sink, blocks cleanup.
export function recordFixtureRegistrationFailure(
  branch: "normal" | "early-exit",
  phase: (typeof phases)[number],
  error: unknown,
): void {
  try {
    if (!["normal", "early-exit"].includes(branch) || !phases.includes(phase))
      return;
    const code = field(error, "code");
    const errno = field(error, "errno");
    const syscall = field(error, "syscall");
    // One bounded synchronous stderr write: no queued stream error can mask
    // the primary exception. There is deliberately no retry or alternate sink.
    writeSync(
      2,
      `__OMXTERM_FIXTURE_REGISTRATION_FAILURE__${JSON.stringify({
        version: 1,
        branch,
        phase,
        ...(typeof code === "string" && code.length <= 12 && codes.has(code)
          ? { code }
          : {}),
        ...(typeof errno === "number" &&
        Number.isInteger(errno) &&
        errno >= -2147483648 &&
        errno <= 2147483647
          ? { errno }
          : {}),
        ...(typeof syscall === "string" &&
        syscall.length <= 6 &&
        syscalls.has(syscall)
          ? { syscall }
          : {}),
      })}\n`,
    );
  } catch {
    // Evidence is best effort and must never replace the publication failure.
  }
}
