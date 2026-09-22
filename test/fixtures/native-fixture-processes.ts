import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export function nativeFixtureEnvironment(root: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
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
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "exited";
    throw error;
  }
}

export async function terminateFixtureProcesses(
  owned: Map<number, FixtureProcess>,
): Promise<void> {
  // PTYs call setsid(): descend from the owned child, not only its group.
  // Freeze POSIX parents and rescan before killing, closing the spawn race.
  if (process.platform !== "win32") {
    for (let pass = 0; pass < 3; pass += 1) {
      for (const row of owned.values()) signalFixtureProcess(row, "SIGSTOP");
      collectFixtureDescendants(fixtureProcesses(), owned);
    }
  }
  const targets = [...owned.values()].reverse();
  if (process.platform === "win32") killWindowsFixtureProcesses(targets);
  else for (const row of targets) signalFixtureProcess(row, "SIGKILL");
  // This is a post-termination deadline, not a total-cleanup bound. It is
  // checked after each bounded inventory; an in-flight inventory may overrun it.
  // Freeze/rescan and signal operations above have separate command bounds.
  const deadline = Date.now() + 5_000;
  while (true) {
    const remaining = fixtureProcesses().filter(
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

function killWindowsFixtureProcesses(rows: readonly FixtureProcess[]): void {
  const encoded = Buffer.from(JSON.stringify(rows)).toString("base64");
  // Hold each process handle before rechecking CIM identity. Kill uses that
  // handle, not an unchecked PID or a broad taskkill /T selection.
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
        if ($c -and $c.CreationDate.ToUniversalTime().Ticks.ToString() -eq $target.identity) { $p.Kill() }
      } finally { $p.Dispose() }
    }
    exit 0
  `,
    ],
    { timeout: 5_000, windowsHide: true },
  );
}

export function signalFixtureProcess(
  row: FixtureProcess,
  signal: "SIGSTOP" | "SIGKILL",
): void {
  if (process.platform === "win32") {
    killWindowsFixtureProcesses([row]);
    return;
  }
  const current = fixtureProcesses().find(
    (candidate) => candidate.pid === row.pid,
  );
  if (current?.identity !== row.identity) return;
  try {
    process.kill(row.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}
