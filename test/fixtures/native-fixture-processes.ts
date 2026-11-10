import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

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
  // Start time, so a reused PID is never mistaken for an owned process.
  readonly identity: string;
}

export function fixtureProcesses(): FixtureProcess[] {
  if (process.platform === "win32") {
    const text = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "@(Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; identity = $_.CreationDate.ToUniversalTime().Ticks.ToString() } }) | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", timeout: 5_000, windowsHide: true },
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
      if (!match || match[4]!.startsWith("Z")) return [];
      const pid = Number(match[1]);
      return [
        {
          pid,
          parent: Number(match[2]),
          identity:
            process.platform === "linux" ? linuxStartTime(pid) : match[3]!,
        },
      ];
    });
}

// `ps lstart` has one-second resolution; procfs start ticks are exact.
function linuxStartTime(pid: number): string {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]!;
  } catch {
    return "exited";
  }
}

/** Add every live descendant of an owned process to `owned`. */
export function collectFixtureDescendants(
  rows: readonly FixtureProcess[],
  owned: Map<number, FixtureProcess>,
): void {
  const live = (row: FixtureProcess) =>
    rows.some(
      (candidate) =>
        candidate.pid === row.pid && candidate.identity === row.identity,
    );
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      const parent = owned.get(row.parent);
      if (owned.has(row.pid) || !parent || !live(parent)) continue;
      // Windows keeps an orphan's old parent PID after that PID is reused. A
      // child cannot predate its parent (numeric identities are start ticks).
      if (
        /^\d+$/u.test(row.identity) &&
        /^\d+$/u.test(parent.identity) &&
        BigInt(row.identity) < BigInt(parent.identity)
      )
        continue;
      owned.set(row.pid, row);
      changed = true;
    }
  }
}
