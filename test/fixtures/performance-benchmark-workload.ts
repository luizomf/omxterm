import { createHash } from "node:crypto";

// Every measured input lives here so the fixture program, the expected byte
// counts and the report quote one source. The protocol identity is derived from
// these values, so changing a measured constant cannot keep an old baseline
// comparable.
const PROTOCOL_NAME = "application-tabs-scrollback-idle-input-attribution";

const LINE_BYTES = 80;
const PATTERN = "omxterm performance benchmark fixed deterministic row ";

function fixedLine(): string {
  let line = PATTERN;
  while (line.length < LINE_BYTES) line += PATTERN;
  return line.slice(0, LINE_BYTES);
}

const VARIETY_GLYPHS = [
  "\u{1F389}\u6F22\u5B57\u00E1\u00E9\u00ED\u00F3\u00FA",
  "\u{1F9EA}\uB098\uB77C\u00E2\u00EA\u00EE\u00F4\u00FB",
  "\u{1F680}\u4F60\u597D\u00C4\u00D6\u00DC\u00DF\u00F1",
  "\u{1F9FF}\u3053\u3093\u306B\u3061\u306F\u00E7\u00E8",
];

function colour(index: number): string {
  return `\u001b[38;5;${196 + index * 24}m`;
}

// Four distinct lines, each exactly 80 bytes, so the variety workload moves the
// same byte volume as the plain ASCII one while changing glyphs, weight and
// colour in the visible output. Only code points are appended or removed, so a
// line stays valid UTF-8 and its reset sequence stays intact.
function varietyLine(index: number): string {
  const prefix = `\u001b[1m${colour(index)}`;
  const suffix = "\u001b[0m";
  const budget = LINE_BYTES - Buffer.byteLength(suffix);
  let line = prefix + VARIETY_GLYPHS[index]!;
  while (Buffer.byteLength(line) < budget) line += "abcdefghij";
  while (Buffer.byteLength(line) > budget) {
    const characters = [...line];
    characters.pop();
    line = characters.join("");
  }
  const finished = line + suffix;
  if (!finished.endsWith(suffix) || Buffer.byteLength(finished) !== LINE_BYTES)
    throw new Error("Variety workload line cannot keep its fixed byte length");
  return finished;
}

// Built lazily so a broken payload fails inside the supervised run and exits,
// instead of throwing while Electron is still importing the fixture entry.
let varietyLines: string[] | undefined;
export function varietyLinesBuilt(): string[] {
  varietyLines ??= [0, 1, 2, 3].map(varietyLine);
  return varietyLines;
}

const MEASURED_CONSTANTS = {
  workloadLinesPerTab: 10000,
  streamLines: 4000,
  streamRepeats: 3,
  keystrokes: 7,
  contentSize: { width: 960, height: 640 },
  settleSamples: 5,
  settleIntervalMs: 1000,
  settleQuiescenceMs: 800,
  attributionSettleMs: 1500,
  attributionQuietMs: 3000,
  idleWindowMs: 12000,
  idleCpuWindowMs: 4000,
  inputTimeoutMs: 5000,
  markerTimeoutMs: 30000,
  tabsPerStep: [1, 3, 6],
} as const;

// The digest covers the measurement semantics as well as the workload: a change
// to how a value is derived (steady, idle growth, marginal, throughput,
// latency) must invalidate a recorded baseline instead of silently
// comparing new numbers against old semantics.
export const MEASUREMENT_SEMANTICS = Object.freeze({
  schema: 4,
  steady: "retained-floor-of-5-settled-samples-after-explicit-collection",
  peak: "observed-max-at-metric-sampling-cadence",
  idleGrowth: "endpoint-delta-over-the-sampled-window",
  marginal: "per-tab-second-difference-with-role-floor",
  throughput: "renderer-clock-write-to-marker-per-stream",
  streamCpu: "application-processes-over-entire-stream-group",
  idleCpu: "median-of-per-window-application-totals",
  latency: "median-keydown-to-grid-change-minus-observed-export-cost",
  streamDelivery: "payload-bytes-equal-expected-with-echo-allowance",
});

export const PERFORMANCE_BENCHMARK = Object.freeze({
  ...MEASURED_CONSTANTS,
  line: fixedLine(),
  markerReady: "OMXTERM_PERF_READY",
  markerPainted: "OMXTERM_PERF_PAINTED",
  markerFlood: "OMXTERM_PERF_FLOOD_END",
  markerVariety: "OMXTERM_PERF_VARIETY_END",
});

export type PerformanceShell = "posix" | "windows";

export function performanceShell(
  platform: NodeJS.Platform = process.platform,
): PerformanceShell {
  return platform === "win32" ? "windows" : "posix";
}

export function lineBytes(): number {
  return Buffer.byteLength(PERFORMANCE_BENCHMARK.line) + 2;
}

export function workloadPayloadBytes(): number {
  return PERFORMANCE_BENCHMARK.workloadLinesPerTab * lineBytes();
}

export function streamPayloadBytes(): number {
  return PERFORMANCE_BENCHMARK.streamLines * lineBytes();
}

// Each stream carries a caller-supplied token in its end marker, so a marker
// left in retained scrollback by an earlier stream can never satisfy a later
// wait.
export function streamMarker(token: string): string {
  return `${PERFORMANCE_BENCHMARK.markerFlood}:${token}`;
}

export function varietyMarker(token: string): string {
  return `${PERFORMANCE_BENCHMARK.markerVariety}:${token}`;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// The workload program is written by the session runner and executed inside the
// real Default Shell session through the application's own input channel. It
// resets the terminal, leaves a steady (non-blinking) cursor and then emits a
// fixed payload per command. Nothing in it depends on user shell files.
export function workloadProgram(
  options: { readonly truncateStream?: boolean } = {},
): string {
  const { workloadLinesPerTab } = PERFORMANCE_BENCHMARK;
  // Fault injection for the integrity path: a short payload still completes,
  // so the report prints an arrival below the declared bytes instead of
  // pretending the stream succeeded.
  const streamLines = options.truncateStream
    ? PERFORMANCE_BENCHMARK.streamLines / 4
    : PERFORMANCE_BENCHMARK.streamLines;
  const varietyGroup = varietyLinesBuilt()
    .map((line, index) => `v${index + 1}=${quote(line)}`)
    .join("\n");
  return [
    "# OMXTerm performance benchmark workload program",
    "LC_ALL=C",
    "export LC_ALL",
    // Keep CRLF as CRLF: the PTY's ONLCR would otherwise add one byte per line
    // and make the measured payload differ from the fixed constant.
    "stty -opost 2>/dev/null || true",
    "printf '\\033c\\033[2 q'",
    `printf '%s\\n' '${PERFORMANCE_BENCHMARK.markerReady}'`,
    `line=${quote(PERFORMANCE_BENCHMARK.line)}`,
    varietyGroup,
    `paint=$(i=0; while [ "$i" -lt ${workloadLinesPerTab} ]; do printf '%s\\r\\n' "$line"; i=$((i+1)); done)`,
    `stream=$(i=0; while [ "$i" -lt ${streamLines} ]; do printf '%s\\r\\n' "$line"; i=$((i+1)); done)`,
    `variety=$(i=0; while [ "$i" -lt ${streamLines / 4} ]; do printf '%s\\r\\n' "$v1" "$v2" "$v3" "$v4"; i=$((i+1)); done)`,
    "while IFS= read -r command; do",
    '  case "$command" in',
    `    paint) printf '%s\\r\\n' "$paint"; printf '%s\\n' '${PERFORMANCE_BENCHMARK.markerPainted}' ;;`,
    `    flood\\ *) token=\${command#flood }; printf '%s\\r\\n' "$stream"; printf '%s\\n' "${PERFORMANCE_BENCHMARK.markerFlood}:$token" ;;`,
    `    variety\\ *) token=\${command#variety }; printf '%s\\r\\n' "$variety"; printf '%s\\n' "${PERFORMANCE_BENCHMARK.markerVariety}:$token" ;;`,
    "    blink-on) printf '\\033[1 q' ;;",
    "    blink-off) printf '\\033[2 q' ;;",
    "    quit) exit 0 ;;",
    "  esac",
    "done",
    "",
  ].join("\n");
}

export function windowsWorkloadProgram(
  options: { readonly truncateStream?: boolean } = {},
): string {
  const { workloadLinesPerTab } = PERFORMANCE_BENCHMARK;
  const streamLines = options.truncateStream
    ? PERFORMANCE_BENCHMARK.streamLines / 4
    : PERFORMANCE_BENCHMARK.streamLines;
  const varietyGroup = varietyLinesBuilt()
    .map((line, index) => `$v${index + 1} = '${line.replaceAll("'", "''")}'`)
    .join("\r\n");
  return [
    "\uFEFF$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)",
    "$esc = [char]27",
    '[Console]::Write("$esc[2 q")',
    `[Console]::WriteLine('${PERFORMANCE_BENCHMARK.markerReady}')`,
    `$line = '${PERFORMANCE_BENCHMARK.line}'`,
    varietyGroup,
    `$paint = ((1..${workloadLinesPerTab}) | ForEach-Object { $line + "\`r\`n" }) -join ''`,
    `$stream = ((1..${streamLines}) | ForEach-Object { $line + "\`r\`n" }) -join ''`,
    `$variety = ((1..${streamLines / 4}) | ForEach-Object { "$v1\`r\`n$v2\`r\`n$v3\`r\`n$v4\`r\`n" }) -join ''`,
    "while ($null -ne ($command = [Console]::ReadLine())) {",
    "  switch -Wildcard ($command) {",
    `    'paint' { [Console]::Write($paint); [Console]::WriteLine('${PERFORMANCE_BENCHMARK.markerPainted}') }`,
    `    'flood *' { $token = $command.Substring(6); [Console]::Write($stream); [Console]::WriteLine("${PERFORMANCE_BENCHMARK.markerFlood}:$token") }`,
    `    'variety *' { $token = $command.Substring(8); [Console]::Write($variety); [Console]::WriteLine("${PERFORMANCE_BENCHMARK.markerVariety}:$token") }`,
    `    'blink-on' { [Console]::Write("$esc[1 q") }`,
    `    'blink-off' { [Console]::Write("$esc[2 q") }`,
    "    'quit' { exit 0 }",
    "  }",
    "}",
    "",
  ].join("\r\n");
}

export function workloadProgramPath(
  root: string,
  shell = performanceShell(),
): string {
  const name = shell === "windows" ? "workload.ps1" : "workload.sh";
  return `${root.replace(/[\\/]+$/u, "")}/${name}`;
}

// The Default Shell is production's own (an interactive login shell). The
// fixture types one short command that replaces it with the fixed program, so
// every tab runs byte-identical work regardless of shell configuration.
export function workloadEntryCommand(
  root: string,
  shell = performanceShell(),
): string {
  const program = workloadProgramPath(root, shell);
  return shell === "windows"
    ? `& '${program.replaceAll("'", "''")}'`
    : `/bin/sh ${quote(program)}`;
}

// Function declarations are hoisted, so the digest can hash the program
// text even though it is declared below.
const workloadProgramText = workloadProgram();
const protocolDigest = createHash("sha256")
  .update(
    JSON.stringify({
      ...MEASURED_CONSTANTS,
      measurement: MEASUREMENT_SEMANTICS,
      // The program text is part of the measured workload: a preamble or stty
      // change alters delivered bytes and must invalidate a baseline.
      program: workloadProgramText,
      windowsProgram: windowsWorkloadProgram(),
      line: fixedLine(),
      variety: varietyLinesBuilt(),
      markers: {
        ready: "OMXTERM_PERF_READY",
        painted: "OMXTERM_PERF_PAINTED",
        flood: "OMXTERM_PERF_FLOOD_END",
        variety: "OMXTERM_PERF_VARIETY_END",
      },
    }),
  )
  .digest("hex")
  .slice(0, 12);

export const PERFORMANCE_BENCHMARK_PROTOCOL = `${PROTOCOL_NAME}:${protocolDigest}`;
