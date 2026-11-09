import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The report never presents resident set size as the memory metric. Every
// platform branch below reads a proportional or exclusive metric and the report
// names it next to the numbers. Plain RSS may appear only as a labelled
// reference reading.
export interface MemoryMetric {
  readonly name: "pss" | "phys_footprint" | "private_bytes";
  readonly source: string;
  // Proportional/exclusive metrics may be summed across processes; footprint
  // counts shared framework pages in every process that maps them.
  readonly addable: boolean;
  readonly qualification: string;
  // One reader invocation per sample; the fixture uses this cadence for peaks.
  readonly sampleIntervalMs: number;
}

export function memoryMetric(
  platform: NodeJS.Platform = process.platform,
): MemoryMetric {
  if (platform === "linux")
    return {
      name: "pss",
      source: "linux /proc/<pid>/smaps_rollup Pss",
      addable: true,
      qualification:
        "PSS is measured on Linux ARM64 by this lane and is the metric this report compares",
      sampleIntervalMs: 15,
    };
  if (platform === "darwin")
    return {
      name: "phys_footprint",
      source: "macOS footprint --json phys_footprint",
      addable: false,
      qualification:
        "the macOS reader is unit-tested against real footprint output, but no measured macOS run exists, so nothing is compared on macOS",
      sampleIntervalMs: 120,
    };
  return {
    name: "private_bytes",
    source: "Windows PrivateMemorySize64",
    addable: true,
    qualification:
      "the Windows reader targets Windows PowerShell 5.1 and has no measured Windows run, so nothing is compared on Windows",
    sampleIntervalMs: 150,
  };
}

export interface ProcessMemoryReading {
  readonly pid: number;
  readonly bytes: number;
}

function linuxPss(pid: number): number | null {
  try {
    const rollup = readFileSync(`/proc/${pid}/smaps_rollup`, "utf8");
    const match = /\nPss:\s+(\d+) kB/u.exec(`\n${rollup}`);
    return match ? Number(match[1]) * 1024 : null;
  } catch {
    // A process that exited between the metric snapshot and this read has no
    // allocation to attribute; never invent a value for it.
    return null;
  }
}

interface FootprintDocument {
  readonly unit?: string;
  readonly processes?: ReadonlyArray<{
    readonly pid?: number;
    readonly footprint?: number;
    readonly "page size"?: number;
    readonly auxiliary?: { readonly phys_footprint?: number };
  }>;
}

// One process, one reader invocation: a pid that exits mid-sample must degrade
// to "no reading", not abort the run. `footprint --json` avoids parsing
// human-formatted tables and reports phys_footprint in bytes.
export function parseFootprintJson(text: string): Map<number, number> {
  const readings = new Map<number, number>();
  let document: FootprintDocument;
  try {
    document = JSON.parse(text) as FootprintDocument;
  } catch {
    throw new Error("footprint produced unreadable output");
  }
  // `footprint --json` reports byte units; reason about the declared unit so a
  // future page-unit output is not silently mis-scaled.
  const unit = document.unit ?? "byte";
  if (unit !== "byte") throw new Error(`Unsupported footprint unit: ${unit}`);
  for (const entry of document.processes ?? []) {
    const bytes = entry.auxiliary?.phys_footprint ?? entry.footprint;
    if (!Number.isSafeInteger(entry.pid) || typeof bytes !== "number") continue;
    readings.set(entry.pid!, Math.round(bytes));
  }
  return readings;
}

function darwinFootprint(pids: readonly number[]): Map<number, number> {
  const readings = new Map<number, number>();
  if (pids.length === 0) return readings;
  const destination = path.join(
    tmpdir(),
    `omxterm-footprint-${process.pid}-${Date.now()}.json`,
  );
  try {
    try {
      execFileSync(
        "footprint",
        [
          "--json",
          destination,
          ...pids.flatMap((pid) => ["--pid", String(pid)]),
        ],
        { encoding: "utf8", timeout: 20_000, stdio: "ignore" },
      );
    } catch (error) {
      // 66 means "no matching process"; the JSON may still describe others.
      const status = (error as { status?: number }).status;
      if (status !== 66 && status !== 1) throw error;
    }
    let text: string;
    try {
      text = readFileSync(destination, "utf8");
    } catch {
      return readings;
    }
    for (const [pid, bytes] of parseFootprintJson(text))
      if (pids.includes(pid)) readings.set(pid, bytes);
    return readings;
  } finally {
    rmSync(destination, { force: true });
  }
}

// Windows PowerShell 5.1 compatible: `-AsArray` does not exist before
// PowerShell 6, and a single object is emitted without it, so both shapes are
// accepted by the parser.
export function windowsMemoryCommand(pids: readonly number[]): string {
  return `@(Get-Process -Id ${pids.join(",")} -ErrorAction SilentlyContinue) | ForEach-Object { @{ pid = $_.Id; bytes = $_.PrivateMemorySize64 } } | ConvertTo-Json -Compress`;
}

export function parseWindowsPrivateBytes(text: string): Map<number, number> {
  const readings = new Map<number, number>();
  const trimmed = text.trim();
  if (!trimmed) return readings;
  const parsed = JSON.parse(trimmed) as
    { pid?: number; bytes?: number } | Array<{ pid?: number; bytes?: number }>;
  for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!Number.isSafeInteger(row.pid) || typeof row.bytes !== "number")
      continue;
    readings.set(row.pid!, row.bytes);
  }
  return readings;
}

function windowsPrivateBytes(pids: readonly number[]): Map<number, number> {
  if (pids.length === 0) return new Map();
  const output = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", windowsMemoryCommand(pids)],
    { encoding: "utf8", timeout: 20_000, windowsHide: true },
  );
  return parseWindowsPrivateBytes(output);
}

export function readProcessMemory(
  pids: readonly number[],
  platform: NodeJS.Platform = process.platform,
): Map<number, number> {
  if (platform === "linux") {
    const readings = new Map<number, number>();
    for (const pid of pids) {
      const value = linuxPss(pid);
      if (value !== null) readings.set(pid, value);
    }
    return readings;
  }
  return platform === "darwin"
    ? darwinFootprint(pids)
    : windowsPrivateBytes(pids);
}

// CPU seconds for processes Electron does not report (extension runtime, PTY
// shells). Linux procfs only; other platforms report null and the report says
// so instead of substituting a different counter.
export function readProcessCpuSeconds(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): number | null {
  if (platform !== "linux") return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const ticks = Number(fields[11]) + Number(fields[12]);
    if (!Number.isFinite(ticks)) return null;
    // procfs reports USER_HZ (100 on every supported architecture here).
    return ticks / 100;
  } catch {
    return null;
  }
}

export interface GpuClass {
  readonly gpuClass: "hardware" | "virtualized" | "software" | "unknown";
  readonly gpuApi: string;
}

// A coarse class keeps comparability useful without publishing the vendor or
// hardware token of the machine that recorded a baseline.
export function gpuClass(renderer: string | null): GpuClass {
  if (!renderer) return { gpuClass: "unknown", gpuApi: "unknown" };
  const value = renderer.toLowerCase();
  const gpuApi = value.includes("angle")
    ? "angle"
    : value.includes("opengl")
      ? "opengl"
      : value.includes("vulkan")
        ? "vulkan"
        : value.includes("metal")
          ? "metal"
          : "unknown";
  if (/swiftshader|llvmpipe|softpipe|software/.test(value))
    return { gpuClass: "software", gpuApi };
  if (/virgl|vmware|svga|parallels|virtualbox|qemu|virtual/.test(value))
    return { gpuClass: "virtualized", gpuApi };
  return { gpuClass: "hardware", gpuApi };
}

export interface MachineIdentity {
  readonly platform: string;
  readonly arch: string;
  readonly logicalCpus: number;
  readonly gpuClass: GpuClass["gpuClass"];
  readonly gpuApi: GpuClass["gpuApi"];
  readonly class: string;
  // One-way digest of the raw host tuple, so a different machine cannot compare
  // while the committed baseline stays free of host-identifying strings.
  readonly identityHash: string;
}

export function machineIdentity(input: {
  readonly platform: string;
  readonly arch: string;
  readonly cpuModel: string | null;
  readonly logicalCpus: number;
  readonly totalMemoryBytes: number;
  readonly release: string;
  readonly gpuRenderer: string | null;
}): MachineIdentity {
  const gpu = gpuClass(input.gpuRenderer);
  // Identity covers the traits that change what the benchmark measures on a
  // machine class (CPU model/count, GPU class and API). Kernel release and RAM
  // are routine changes and are recorded locally, not hashed: they must not
  // force a reviewed re-record of an otherwise comparable baseline.
  const identityHash = createHash("sha256")
    .update(
      [
        input.platform,
        input.arch,
        input.cpuModel ?? "",
        String(input.logicalCpus),
        gpu.gpuClass,
        gpu.gpuApi,
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
  return {
    platform: input.platform,
    arch: input.arch,
    logicalCpus: input.logicalCpus,
    gpuClass: gpu.gpuClass,
    gpuApi: gpu.gpuApi,
    class: `${input.platform}-${input.arch}-${input.logicalCpus}cpu-${gpu.gpuClass}`,
    identityHash,
  };
}
