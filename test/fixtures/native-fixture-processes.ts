import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import {
  MAX_CLEANUP_COMMAND_ELAPSED_MS,
  type NativeFixtureCleanupFailure,
} from "./native-fixture-outcome";

export interface FixtureCleanupCommandContext {
  readonly callsite: NativeFixtureCleanupFailure["callsite"];
  readonly onFailure: (failure: NativeFixtureCleanupFailure) => void;
}

function commandFailureCategory(
  error: unknown,
): NativeFixtureCleanupFailure["category"] {
  try {
    if (typeof error === "object" && error !== null) {
      const code = Object.getOwnPropertyDescriptor(error, "code");
      if (code && "value" in code && code.value === "ETIMEDOUT")
        return "timeout";
      const status = Object.getOwnPropertyDescriptor(error, "status");
      if (
        status &&
        "value" in status &&
        Number.isSafeInteger(status.value) &&
        status.value !== 0
      )
        return "command-failed";
    }
  } catch {
    // Only own data properties classify errors; never invoke error getters.
  }
  return "unknown";
}

function observeCleanupCommand<T>(
  context: FixtureCleanupCommandContext | undefined,
  command: () => T,
): T {
  if (!context) return command();
  const started = performance.now();
  try {
    return command();
  } catch (error) {
    try {
      context.onFailure({
        callsite: context.callsite,
        elapsedMs: Math.min(
          MAX_CLEANUP_COMMAND_ELAPSED_MS,
          Math.max(0, Math.floor(performance.now() - started)),
        ),
        category: commandFailureCategory(error),
      });
    } catch {
      // Diagnostics must never replace the original command exception.
    }
    throw error;
  }
}

export function nativeFixtureEnvironment(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OMXTERM_NATIVE_FIXTURE_ROOT: root,
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    npm_node_execpath: process.execPath,
    HOME: path.join(root, "home"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_STATE_HOME: path.join(root, "state"),
  };
}

export interface FixtureProcess {
  readonly pid: number;
  readonly parent: number;
  readonly identity: string;
}

// Inspect metadata only. Ownership is established by descent from the child
// we spawned, never by an executable name or a machine-wide kill pattern.
export function fixtureProcesses(
  failureContext?: FixtureCleanupCommandContext,
): FixtureProcess[] {
  if (process.platform === "win32") {
    const text = observeCleanupCommand(failureContext, () =>
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "@(Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; identity = $_.CreationDate.ToUniversalTime().Ticks.ToString() } }) | ConvertTo-Json -Compress",
        ],
        { encoding: "utf8", timeout: 5_000, windowsHide: true },
      ),
    );
    return JSON.parse(text) as FixtureProcess[];
  }
  return execFileSync("ps", ["-axo", "pid=,ppid=,lstart=,stat="], {
    encoding: "utf8",
    timeout: 5_000,
    env: { ...process.env, LC_ALL: "C" },
  })
    .trim()
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.*?)\s+(\S+)\s*$/u.exec(line);
      if (!match)
        throw new Error("Cannot parse native fixture process identity");
      if (match[4]!.startsWith("Z")) return [];
      return [
        {
          pid: Number(match[1]),
          parent: Number(match[2]),
          identity:
            process.platform === "linux"
              ? linuxStartTime(Number(match[1]))
              : match[3]!,
        },
      ];
    });
}

function linuxStartTime(pid: number): string {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]!;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Linux procfs can report either error when the ps snapshot outlives a task.
    if (code === "ENOENT" || code === "ESRCH") return "exited";
    throw error;
  }
}

export async function terminateFixtureProcesses(
  owned: Map<number, FixtureProcess>,
  collectRegistered: (
    rows?: readonly FixtureProcess[],
    context?: FixtureCleanupCommandContext,
  ) => void = () => {},
  onFailure?: FixtureCleanupCommandContext["onFailure"],
  onAssistance?: () => void,
): Promise<void> {
  const context = (callsite: NativeFixtureCleanupFailure["callsite"]) =>
    onFailure ? { callsite, onFailure } : undefined;
  collectRegistered(undefined, context("registration-before-kill"));
  // PTYs call setsid(): descend from the owned child, not only its group.
  // Freeze POSIX parents and rescan before killing, closing the spawn race.
  if (process.platform !== "win32") {
    for (let pass = 0; pass < 3; pass += 1) {
      for (const row of owned.values())
        signalFixtureProcess(row, "SIGSTOP", onAssistance);
      collectFixtureDescendants(fixtureProcesses(), owned);
      collectRegistered();
    }
  }
  const targets = [...owned.values()].reverse();
  if (process.platform === "win32")
    killWindowsFixtureProcesses(targets, context("termination"), onAssistance);
  else
    for (const row of targets)
      signalFixtureProcess(row, "SIGKILL", onAssistance);
  // This is a post-termination deadline, not a total-cleanup bound. It is
  // checked after each bounded inventory; an in-flight inventory may overrun it.
  // Freeze/rescan and signal operations above have separate command bounds.
  const deadline = Date.now() + 5_000;
  while (true) {
    collectRegistered(undefined, context("registration-after-kill"));
    const remaining = fixtureProcesses(context("survival")).filter(
      (row) => owned.get(row.pid)?.identity === row.identity,
    );
    if (remaining.length === 0) return;
    if (Date.now() >= deadline)
      throw new Error(
        `Fixture processes survived cleanup: ${remaining.map((row) => row.pid).join(",")}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function collectFixtureDescendants(
  rows: readonly FixtureProcess[],
  owned: Map<number, FixtureProcess>,
): void {
  let changed: boolean;
  do {
    changed = false;
    for (const row of rows) {
      const parent = owned.get(row.parent);
      if (
        !parent ||
        !rows.some(
          (candidate) =>
            candidate.pid === parent.pid &&
            candidate.identity === parent.identity,
        )
      )
        continue;
      // Windows retains an orphan's old parent PID after that PID is reused.
      // A live matching parent is insufficient: its child cannot predate it.
      // Numeric identities are Windows ticks or Linux start ticks; BigInt keeps
      // adjacent Windows creation ticks distinct beyond Number's safe range.
      if (
        /^\d+$/u.test(row.identity) &&
        /^\d+$/u.test(parent.identity) &&
        BigInt(row.identity) < BigInt(parent.identity)
      )
        continue;
      if (owned.get(row.pid)?.identity === row.identity) continue;
      owned.set(row.pid, row);
      changed = true;
    }
  } while (changed);
}

const assistanceMarker = "OMXTERM_CLEANUP_ASSISTANCE_ATTEMPTED";

function observeWindowsAssistance(output: unknown, onAssistance?: () => void) {
  if (
    (typeof output === "string" || Buffer.isBuffer(output)) &&
    output.toString().split(/\r?\n/u).includes(assistanceMarker)
  )
    onAssistance?.();
}

function killWindowsFixtureProcesses(
  rows: readonly FixtureProcess[],
  failureContext?: FixtureCleanupCommandContext,
  onAssistance?: () => void,
): void {
  const encoded = Buffer.from(JSON.stringify(rows)).toString("base64");
  // Hold each process handle before rechecking CIM identity. Kill uses that
  // handle, not an unchecked PID or a broad taskkill /T selection.
  try {
    const output = observeCleanupCommand(failureContext, () =>
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `
    $ErrorActionPreference = 'Stop'
    $targets = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json
    foreach ($target in $targets) {
      $p = Get-Process -Id $target.pid -ErrorAction SilentlyContinue
      if (!$p) { continue }
      try {
        $null = $p.Handle
        $c = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $target.pid)
        if ($c -and $c.CreationDate.ToUniversalTime().Ticks.ToString() -eq $target.identity) {
          [Console]::Out.WriteLine('${assistanceMarker}')
          [Console]::Out.Flush()
          $p.Kill()
        }
      } finally { $p.Dispose() }
    }
    exit 0
  `,
        ],
        { timeout: 5_000, windowsHide: true },
      ),
    );
    observeWindowsAssistance(output, onAssistance);
  } catch (error) {
    // A failed command may already have attempted some targets. Retain only the
    // fixed marker, never command output, and preserve the original exception.
    try {
      const stdout =
        error && typeof error === "object"
          ? Object.getOwnPropertyDescriptor(error, "stdout")
          : undefined;
      if (stdout && "value" in stdout)
        observeWindowsAssistance(stdout.value, onAssistance);
    } catch {
      // Observation must never replace the original command exception.
    }
    throw error;
  }
}

export function signalFixtureProcess(
  row: FixtureProcess,
  signal: "SIGSTOP" | "SIGKILL",
  onAssistance?: () => void,
): void {
  if (process.platform === "win32") {
    killWindowsFixtureProcesses([row], undefined, onAssistance);
    return;
  }
  const current = fixtureProcesses().find(
    (candidate) => candidate.pid === row.pid,
  );
  if (current?.identity !== row.identity) return;
  onAssistance?.();
  try {
    process.kill(row.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
