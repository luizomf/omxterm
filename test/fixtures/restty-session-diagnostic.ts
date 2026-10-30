import { readFileSync } from "node:fs";

export type ProcessObservation =
  | { status: "observed"; startTicks: string; state: string; parentPid: number }
  | { status: "absent" | "unreadable" | "unsupported" };

// Read only procfs metadata; never retain comm, argv, environment or paths.
// A missing PID is not an observed exit callback or proof of tree settlement.
export function observeResttyProcess(pid: number): ProcessObservation {
  if (process.platform !== "linux") return { status: "unsupported" };
  if (!Number.isSafeInteger(pid) || pid <= 0) return { status: "unreadable" };
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat
      .slice(stat.lastIndexOf(")") + 2)
      .trim()
      .split(/\s+/u);
    const state = fields[0];
    const parentPid = Number(fields[1]);
    const startTicks = fields[19];
    if (
      !stat.startsWith(`${pid} (`) ||
      !state ||
      !/^[A-Za-z]$/u.test(state) ||
      !Number.isSafeInteger(parentPid) ||
      parentPid < 0 ||
      !startTicks ||
      !/^\d+$/u.test(startTicks)
    )
      return { status: "unreadable" };
    return { status: "observed", startTicks, state, parentPid };
  } catch (error) {
    return {
      status:
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "absent"
          : "unreadable",
    };
  }
}

export function createResttySessionDiagnostic(
  pid: number,
  observe: (pid: number) => ProcessObservation = observeResttyProcess,
) {
  const birth = observe(pid);
  let closeCalls = 0;
  let closeReturns = 0;
  let closeThrows = 0;
  return {
    close(deliver: () => void) {
      closeCalls += 1;
      try {
        deliver();
        closeReturns += 1;
      } catch (error) {
        closeThrows += 1;
        throw error;
      }
    },
    snapshot() {
      const current = observe(pid);
      return {
        pid,
        closeCalls,
        closeReturns,
        closeThrows,
        birth,
        current,
        identity:
          birth.status === "observed" && current.status === "observed"
            ? birth.startTicks === current.startTicks
              ? "same"
              : "different"
            : "unknown",
      };
    },
  };
}
