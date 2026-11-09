import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, type MenuItem } from "electron";
import { translatorFor } from "../../src/shared/i18n";
import { fixtureProcesses } from "./native-fixture-processes";
import {
  memoryMetric,
  readProcessCpuSeconds,
  readProcessMemory,
} from "./performance-benchmark-memory";
import {
  PERFORMANCE_BENCHMARK,
  PERFORMANCE_BENCHMARK_PROTOCOL,
  performanceShell,
  streamMarker,
  streamPayloadBytes,
  varietyMarker,
  windowsWorkloadProgram,
  workloadEntryCommand,
  workloadProgram,
  workloadProgramPath,
} from "./performance-benchmark-workload";

const resultPrefix = "__OMXTERM_PERFORMANCE_BENCH__";
const root = path.dirname(fileURLToPath(import.meta.url));
const metric = memoryMetric();
const shell = performanceShell();
const translator = translatorFor("en-US");
const options = readArguments(process.argv);
let window: BrowserWindow;

type Role =
  | "main"
  | "renderer"
  | "gpu"
  | "utility"
  | "extension-runtime"
  | "shell"
  | "other";

interface CatalogEntry {
  readonly pid: number;
  readonly role: Role;
  readonly type: string | null;
  readonly creationTime: number | null;
  readonly identity: string | null;
}

interface Reading {
  readonly pid: number;
  readonly role: Role;
  readonly bytes: number | null;
  readonly workingSetKiB: number | null;
  readonly cpuSeconds: number | null;
}

interface MemorySample {
  readonly atMs: number;
  readonly readings: readonly Reading[];
  readonly mainProcessMemory: Readonly<Record<string, number>>;
}

interface SurfaceFrame {
  readonly tabIndex: number;
  readonly visible: boolean;
  readonly draws: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly characters: number;
  readonly contentHash: number;
  readonly session: string | null;
}

interface RendererSnapshot {
  readonly surfaces: readonly SurfaceFrame[];
  readonly devicePixelRatio: number;
  readonly visibilityState: string;
  readonly documentHasFocus: boolean;
  readonly outputBytes: readonly number[];
  readonly outputSessions: readonly string[];
  readonly configuration: {
    readonly fontSize: number;
    readonly fontLineHeight: number;
    readonly fontLigatures: boolean;
    readonly fontFamily: string | null;
    readonly scrollbackLines: number;
  } | null;
  readonly webglRenderer: string | null;
}

interface Quiescence {
  readonly windowMs: number;
  // "sampled-window" covers the interval the idle samples span;
  // "before-sampling" covers only the settle before a step's samples.
  readonly scope: "sampled-window" | "before-sampling";
  readonly draws: number;
  readonly gridChanged: boolean;
  readonly outputBytes: number;
  readonly verified: boolean;
}

interface StepResult {
  readonly name: string;
  readonly tabs: number;
  readonly durationMs: number;
  readonly memorySettleMs: number;
  readonly catalog: readonly CatalogEntry[];
  readonly samples: readonly MemorySample[];
  readonly frames: readonly SurfaceFrame[];
  readonly outputBytes: readonly number[];
  readonly quiescence: Quiescence;
}

interface IdleWindowResult {
  readonly name: string;
  readonly windowMs: number;
  readonly memorySettleMs: number;
  readonly catalog: readonly CatalogEntry[];
  readonly samples: readonly MemorySample[];
  readonly quiescence: Quiescence;
  readonly documentHasFocus: boolean;
  readonly visibilityState: string;
  readonly drawsDelta: number;
  readonly observerCostMs: number;
}

interface AttributionRun {
  readonly name: "ascii" | "variety" | "deep-history";
  readonly token: string;
  readonly command: string;
  readonly paintedDuringStream: boolean;
  readonly expectedBytes: number;
  readonly streams: readonly {
    readonly elapsedMs: number;
    readonly found: boolean;
    readonly bytes: number;
    readonly overheadBytes: number;
  }[];
  readonly pollCostMs: number;
  readonly catalog: readonly CatalogEntry[];
  readonly before: readonly MemorySample[];
  readonly samples: readonly MemorySample[];
  readonly streamEnds: readonly MemorySample[];
  readonly after: readonly MemorySample[];
  readonly settle: Quiescence;
}

interface InputSample {
  readonly keydownAtMs: number | null;
  readonly gridChangedAtMs: number | null;
  readonly gridToDrawMs: number | null;
  readonly pollCostMs: number;
  readonly error: string | null;
}

function readArguments(argv: readonly string[]) {
  const value = (name: string) => {
    const prefix = `--${name}=`;
    return argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length);
  };
  const scrollback = Number(value("fixture-performance-scrollback") ?? "10000");
  const truncate = value("fixture-performance-truncate-stream") === "1";
  return {
    scrollbackLines: Number.isSafeInteger(scrollback) ? scrollback : -1,
    truncateStream: truncate,
  };
}

function fail(error: unknown): never {
  const detail = error instanceof Error ? error.stack : String(error);
  process.stderr.write(`Performance benchmark failed: ${detail}\n`);
  app.exit(1);
  throw error;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Metadata-only phase evidence survives a supervisor timeout: counts, never
// terminal contents, settings paths or command payloads.
function trace(label: string, detail: string): void {
  process.stderr.write(`__OMXTERM_PERFORMANCE_PHASE__${label}:${detail}\n`);
}

async function evaluate<T = unknown>(script: string): Promise<T> {
  return (await window.webContents.executeJavaScript(script, true)) as T;
}

function benchmark<T>(expression: string): Promise<T> {
  return evaluate<T>(`window.performanceBenchmark.${expression}`);
}

async function surfaces(): Promise<RendererSnapshot> {
  return benchmark<RendererSnapshot>("frames()");
}

async function waitFor(
  label: string,
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (await predicate()) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function menuItems(items: readonly MenuItem[]): MenuItem[] {
  return items.flatMap((item) =>
    item.submenu ? menuItems(item.submenu.items) : [item],
  );
}

function invokeMenu(label: string): void {
  const menu = Menu.getApplicationMenu();
  if (!menu) throw new Error("Application menu is not installed");
  const item = menuItems(menu.items).find(
    (candidate) => candidate.label === label,
  );
  if (!item || typeof item.click !== "function")
    throw new Error(`Application menu action is unavailable: ${label}`);
  (
    item.click as (
      menuItem: MenuItem,
      focusedWindow: BrowserWindow,
      event: object,
    ) => void
  )(item, window, {});
}

function commandLines(): Map<number, string> {
  const commands = new Map<number, string>();
  if (process.platform === "win32") return commands;
  const listing = execFileSync("ps", ["-axo", "pid=,args="], {
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, LC_ALL: "C" },
  });
  for (const line of listing.split("\n")) {
    const match = /^\s*(\d+)\s+(.*)$/u.exec(line);
    if (match) commands.set(Number(match[1]), match[2]!);
  }
  return commands;
}

function roleOf(type: string | null, command: string): Role {
  if (type === "Browser") return "main";
  if (type === "Tab") return "renderer";
  if (type === "GPU") return "gpu";
  if (type === "Utility") return "utility";
  if (type !== null) return "other";
  if (command.includes("extension-runtime/bootstrap.mjs"))
    return "extension-runtime";
  if (command.includes(workloadProgramPath(root, shell))) return "shell";
  return "other";
}

function catalog(): CatalogEntry[] {
  const metrics = new Map(
    app.getAppMetrics().map((row) => [row.pid, row] as const),
  );
  const rows = fixtureProcesses();
  const owned = new Set<number>([process.pid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows)
      if (owned.has(row.parent) && !owned.has(row.pid)) {
        owned.add(row.pid);
        changed = true;
      }
  }
  const commands = commandLines();
  return [...owned]
    .map((pid) => {
      const electron = metrics.get(pid);
      return {
        pid,
        role: roleOf(electron?.type ?? null, commands.get(pid) ?? ""),
        type: electron?.type ?? null,
        creationTime: electron?.creationTime ?? null,
        identity: rows.find((row) => row.pid === pid)?.identity ?? null,
      };
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.pid - b.pid);
}

async function sampleMemory(
  entries: readonly CatalogEntry[],
): Promise<MemorySample> {
  const memory = readProcessMemory(entries.map((entry) => entry.pid));
  const metrics = new Map(
    app.getAppMetrics().map((row) => [row.pid, row] as const),
  );
  const info = (await process.getProcessMemoryInfo()) as unknown as Record<
    string,
    unknown
  >;
  return {
    atMs: performance.now(),
    mainProcessMemory: Object.fromEntries(
      Object.entries(info).filter(
        (entry): entry is [string, number] => typeof entry[1] === "number",
      ),
    ),
    readings: entries.map((entry) => {
      const electron = metrics.get(entry.pid);
      return {
        pid: entry.pid,
        role: entry.role,
        bytes: memory.get(entry.pid) ?? null,
        workingSetKiB: electron?.memory.workingSetSize ?? null,
        cpuSeconds:
          electron?.cpu.cumulativeCPUUsage ?? readProcessCpuSeconds(entry.pid),
      };
    }),
  };
}

function visibleFrame(snapshot: RendererSnapshot): SurfaceFrame | undefined {
  return snapshot.surfaces.find((surface) => surface.visible);
}

const grids = new Map<number, SurfaceFrame>();

async function settleVisibleFrame(tab: number): Promise<SurfaceFrame> {
  await waitFor(`grid geometry for Tab ${tab + 1}`, async () => {
    const frame = visibleFrame(await surfaces());
    return (
      frame !== undefined &&
      frame.tabIndex === tab &&
      frame.columns > 0 &&
      frame.rows > 0
    );
  });
  const frame = visibleFrame(await surfaces())!;
  grids.set(tab, frame);
  return frame;
}

async function write(tab: number, text: string): Promise<void> {
  const sent = await benchmark<boolean>(
    `write(${tab}, ${JSON.stringify(text)})`,
  );
  if (!sent) throw new Error(`Tab ${tab + 1} has no recorded session`);
}

async function waitForMarker(tab: number, marker: string): Promise<void> {
  const found = await benchmark<boolean>(
    `hasMarker(${tab}, ${JSON.stringify(marker)}, ${PERFORMANCE_BENCHMARK.markerTimeoutMs})`,
  );
  if (!found)
    throw new Error(
      `Tab ${tab + 1} never rendered ${marker}; the fixed workload did not complete`,
    );
}

async function prepareTab(tab: number): Promise<void> {
  await write(tab, `${workloadEntryCommand(root, shell)}\r`);
  await waitForMarker(tab, PERFORMANCE_BENCHMARK.markerReady);
  await settleVisibleFrame(tab);
}

// Every tab, including the first, receives exactly one fixed workload paint.
async function runWorkload(tab: number): Promise<void> {
  await write(tab, "paint\r");
  await waitForMarker(tab, PERFORMANCE_BENCHMARK.markerPainted);
}

async function selectTab(position: number): Promise<void> {
  invokeMenu(translator.t("menu.tab", { position }));
  await waitFor(`Tab ${position} selected`, async () => {
    const frame = visibleFrame(await surfaces());
    return frame?.tabIndex === position - 1;
  });
}

async function addTabs(until: number): Promise<void> {
  while (true) {
    const count = (await surfaces()).surfaces.length;
    if (count >= until) return;
    trace("new-tab", `begin:${count}`);
    invokeMenu(translator.t("menu.newTab"));
    await waitFor(
      `${count + 1} mounted Surfaces`,
      async () => (await surfaces()).surfaces.length >= count + 1,
    );
    await prepareTab(count);
    await runWorkload(count);
    trace("new-tab", `complete:${count}`);
  }
}

interface QuiescenceProbe {
  readonly atMs: number;
  readonly tabIndex: number;
  readonly draws: number;
  readonly outputBytes: number;
  readonly characters: number;
  readonly hash: number;
  readonly observerCostMs: number;
}

// One observation point for silence: cumulative output bytes, the visible
// surface's draw counter and its exported grid text. Window verification uses
// two probes that bracket the interval being measured.
async function probeActivity(): Promise<QuiescenceProbe> {
  const snapshot = await surfaces();
  const visible = visibleFrame(snapshot);
  if (!visible) throw new Error("No visible Surface to verify quiescence");
  const started = performance.now();
  const text = await benchmark<{ characters: number; hash: number }>(
    `textHash(${visible.tabIndex})`,
  );
  return {
    atMs: performance.now(),
    tabIndex: visible.tabIndex,
    draws: visible.draws,
    outputBytes: snapshot.outputBytes.reduce(
      (total, value) => total + value,
      0,
    ),
    characters: text.characters,
    hash: text.hash,
    observerCostMs: performance.now() - started,
  };
}

function quiescenceBetween(
  before: QuiescenceProbe,
  after: QuiescenceProbe,
  scope: Quiescence["scope"],
  windowMs: number,
): Quiescence {
  const gridChanged =
    after.hash !== before.hash || after.characters !== before.characters;
  const outputBytes = after.outputBytes - before.outputBytes;
  return {
    windowMs,
    scope,
    draws: after.draws - before.draws,
    gridChanged,
    outputBytes,
    verified: outputBytes === 0 && !gridChanged,
  };
}

// Quiescence is recorded evidence, not a precondition that hides a report.
async function measureQuiescence(windowMs: number): Promise<Quiescence> {
  const before = await probeActivity();
  await delay(windowMs);
  const after = await probeActivity();
  return quiescenceBetween(before, after, "before-sampling", windowMs);
}

function applicationBytes(sample: MemorySample): number {
  return sample.readings
    .filter(
      (reading) =>
        ["main", "renderer", "gpu", "utility", "extension-runtime"].includes(
          reading.role,
        ) && reading.bytes !== null,
    )
    .reduce((total, reading) => total + reading.bytes!, 0);
}

function rendererBytes(sample: MemorySample): number {
  return sample.readings
    .filter((reading) => reading.role === "renderer" && reading.bytes !== null)
    .reduce((total, reading) => total + reading.bytes!, 0);
}

// Memory settles after the workload: wait until two consecutive reads stop
// moving before the samples that define a state. Garbage collection otherwise
// dominates the per-tab column and makes "steady" mean "whichever moment we
// happened to sample".
async function collectRendererGarbage(): Promise<boolean> {
  // Both V8 instances in the measurement carry the flag: the renderer's heap
  // and the main process's own heap each swing by tens of MiB if left alone.
  const mainCollected = typeof globalThis.gc === "function";
  if (mainCollected) globalThis.gc!();
  const rendererCollected = await benchmark<boolean>("collectGarbage()");
  return mainCollected && rendererCollected;
}

async function settleMemory(
  entries: readonly CatalogEntry[],
  toleranceBytes = 4 * 1024 * 1024,
  maxMs = 15_000,
): Promise<number> {
  const started = performance.now();
  // Start from a collected heap: the steady reads are otherwise a race with the
  // renderer's garbage collector and swing by tens of MiB between runs.
  await collectRendererGarbage();
  await delay(200);
  let previous = await sampleMemory(entries);
  while (performance.now() - started < maxMs) {
    await delay(600);
    const current = await sampleMemory(entries);
    if (
      Math.abs(applicationBytes(current) - applicationBytes(previous)) <=
        toleranceBytes &&
      Math.abs(rendererBytes(current) - rendererBytes(previous)) <=
        toleranceBytes
    )
      return performance.now() - started;
    previous = current;
  }
  return performance.now() - started;
}

async function collectSamples(
  entries: readonly CatalogEntry[],
): Promise<MemorySample[]> {
  const samples: MemorySample[] = [];
  for (let index = 0; index < PERFORMANCE_BENCHMARK.settleSamples; index += 1) {
    if (index > 0) await delay(PERFORMANCE_BENCHMARK.settleIntervalMs);
    samples.push(await sampleMemory(entries));
  }
  return samples;
}

async function step(name: string, tabs: number): Promise<StepResult> {
  const started = performance.now();
  await selectTab(1);
  // Steady means quiet: settle the grid and then the memory before sampling.
  const quiescence = await measureQuiescence(
    PERFORMANCE_BENCHMARK.settleQuiescenceMs,
  );
  const entries = catalog();
  const memorySettleMs = await settleMemory(entries);
  const samples = await collectSamples(entries);
  const final = await surfaces();
  return {
    name,
    tabs,
    durationMs: performance.now() - started,
    memorySettleMs,
    catalog: entries,
    samples,
    frames: final.surfaces,
    outputBytes: final.outputBytes,
    quiescence,
  };
}

async function idleWindow(
  name: string,
  windowMs: number,
  expectedFocus?: boolean,
): Promise<IdleWindowResult> {
  const entries = catalog();
  const memorySettleMs = await settleMemory(entries);
  if (expectedFocus !== undefined)
    await waitFor(
      "the requested visible focus state before CPU sampling",
      async () => {
        const snapshot = await surfaces();
        return (
          snapshot.documentHasFocus === expectedFocus &&
          snapshot.visibilityState === "visible"
        );
      },
      5000,
    );
  // The quiescence probe brackets the same interval the samples cover.
  const before = await probeActivity();
  const samples: MemorySample[] = [await sampleMemory(entries)];
  const deadline = performance.now() + windowMs;
  while (performance.now() < deadline) {
    await delay(2000);
    samples.push(await sampleMemory(entries));
  }
  const after = await probeActivity();
  const snapshot = await surfaces();
  const elapsed = samples.at(-1)!.atMs - samples[0]!.atMs;
  return {
    name,
    windowMs: elapsed,
    catalog: entries,
    samples,
    quiescence: quiescenceBetween(before, after, "sampled-window", elapsed),
    documentHasFocus: snapshot.documentHasFocus,
    visibilityState: snapshot.visibilityState,
    memorySettleMs,
    drawsDelta: after.draws - before.draws,
    observerCostMs: before.observerCostMs + after.observerCostMs,
  };
}

let streamCounter = 0;
function nextToken(): string {
  streamCounter += 1;
  return `${process.pid.toString(36)}${streamCounter.toString(36)}`;
}

async function attributionRun(
  name: AttributionRun["name"],
  command: "flood" | "variety",
): Promise<AttributionRun> {
  const entries = catalog();
  const before = [await sampleMemory(entries)];
  const samples: MemorySample[] = [];
  const results: Array<{
    found: boolean;
    bytes: number;
    overheadBytes: number;
    drawsBefore: number;
    drawsAtFound: number;
    pollCostMs: number;
    elapsedMs: number;
  }> = [];
  let token = "";
  const streamEnds: MemorySample[] = [];
  // A single 20-50 ms stream measured 2x apart between identical runs, so the
  // throughput figure is the median of several streams of the same payload.
  // Every repetition is kept: a stream that fails must not shrink the sample.
  for (
    let repeat = 0;
    repeat < PERFORMANCE_BENCHMARK.streamRepeats;
    repeat += 1
  ) {
    token = nextToken();
    const marker =
      command === "variety" ? varietyMarker(token) : streamMarker(token);
    let settled = false;
    const pending = benchmark<{
      found: boolean;
      bytes: number;
      overheadBytes: number;
      drawsBefore: number;
      drawsAtFound: number;
      pollCostMs: number;
      elapsedMs: number;
    }>(
      `stream(0, ${JSON.stringify(command)}, ${JSON.stringify(token)}, ${JSON.stringify(marker)}, ${streamPayloadBytes()}, ${PERFORMANCE_BENCHMARK.markerTimeoutMs})`,
    ).finally(() => {
      settled = true;
    });
    while (!settled) {
      samples.push(await sampleMemory(entries));
      await delay(metric.sampleIntervalMs);
    }
    const current = await pending;
    results.push(current);
    streamEnds.push(await sampleMemory(entries));
  }
  if (results.length === 0) throw new Error("Stream produced no result");
  const settle = await measureQuiescence(
    PERFORMANCE_BENCHMARK.attributionSettleMs,
  );
  const after = await collectSamples(entries);
  const last = results.at(-1)!;
  return {
    name,
    token,
    command,
    paintedDuringStream: last.drawsAtFound > last.drawsBefore,
    expectedBytes: streamPayloadBytes(),
    streams: results,
    pollCostMs: results.reduce((total, result) => total + result.pollCostMs, 0),
    catalog: entries,
    before,
    samples,
    streamEnds,
    after,
    settle,
  };
}

async function keystrokeSample(): Promise<InputSample> {
  const armed = await benchmark<boolean>(
    `armInput(${PERFORMANCE_BENCHMARK.inputTimeoutMs})`,
  );
  if (!armed) throw new Error("No visible Surface accepted the input window");
  await delay(50);
  window.focus();
  for (const type of ["keyDown", "char", "keyUp"] as const)
    window.webContents.sendInputEvent({ type, keyCode: "x" });
  await waitFor(
    "the input window to settle",
    async () =>
      (await benchmark<{ settled: boolean }>("inputResult()")).settled,
    PERFORMANCE_BENCHMARK.inputTimeoutMs + 2000,
  );
  const result = await benchmark<InputSample & { settled: boolean }>(
    "inputResult()",
  );
  return {
    keydownAtMs: result.keydownAtMs,
    gridChangedAtMs: result.gridChangedAtMs,
    gridToDrawMs: result.gridToDrawMs,
    pollCostMs: result.pollCostMs,
    error: result.error,
  };
}

async function waitForWindow(): Promise<BrowserWindow> {
  let found: BrowserWindow | undefined;
  await waitFor(
    "the production window",
    () => {
      found = BrowserWindow.getAllWindows().find(
        (candidate) => !candidate.isDestroyed(),
      );
      return found !== undefined;
    },
    90_000,
  );
  return found!;
}

async function firstTab(): Promise<void> {
  await waitFor(
    "the first mounted Surface",
    async () => (await surfaces()).surfaces.length === 1,
  );
  await prepareTab(0);
  await runWorkload(0);
  await delay(500);
}

async function measureIdleCpuWindows(): Promise<IdleWindowResult[]> {
  const results: IdleWindowResult[] = [];
  for (const blink of ["off", "on"] as const) {
    await write(0, `blink-${blink}\r`);
    await delay(300);
    for (const focused of [true, false]) {
      if (focused) window.focus();
      else window.blur();
      await delay(400);
      results.push(
        await idleWindow(
          `blink-${blink}-${focused ? "focused" : "unfocused"}`,
          PERFORMANCE_BENCHMARK.idleCpuWindowMs,
          focused,
        ),
      );
    }
  }
  return results;
}

async function measureAttribution(): Promise<{
  runs: AttributionRun[];
  quiet: IdleWindowResult;
}> {
  window.focus();
  await selectTab(1);
  await write(0, "blink-off\r");
  await delay(300);
  const ascii = await attributionRun("ascii", "flood");
  const variety = await attributionRun("variety", "variety");
  // Repeat ASCII after the earlier streams have filled history. The token
  // keeps their earlier markers out of this run's wait.
  const deep = await attributionRun("deep-history", "flood");
  await delay(PERFORMANCE_BENCHMARK.attributionQuietMs);
  const quiet = await idleWindow(
    "sitting-still-after-history",
    PERFORMANCE_BENCHMARK.idleCpuWindowMs,
  );
  return { runs: [ascii, variety, deep], quiet };
}

async function measureInput(): Promise<InputSample[]> {
  const samples: InputSample[] = [];
  for (let index = 0; index < PERFORMANCE_BENCHMARK.keystrokes; index += 1)
    samples.push(await keystrokeSample());
  return samples;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function buildFingerprint(): Record<string, string> {
  const files = {
    main: "main/index.mjs",
    preload: "preload/index.cjs",
    rendererHtml: "renderer/index.html",
    rendererCss: "renderer/index.css",
    rendererBundle: "renderer/index.js",
    extensionIndex: "extension-runtime/index.mjs",
    extensionPackages: "extension-runtime/packages.mjs",
    extensionBootstrap: "extension-runtime/bootstrap.mjs",
    extensionLeases: "extension-runtime/extension-leases.node",
  };
  return Object.fromEntries(
    Object.entries(files).map(([name, file]) => [
      name,
      sha256(path.join(root, file)),
    ]),
  );
}

async function run(): Promise<void> {
  writeFileSync(
    workloadProgramPath(root, shell),
    shell === "windows"
      ? windowsWorkloadProgram({ truncateStream: options.truncateStream })
      : workloadProgram({ truncateStream: options.truncateStream }),
  );
  // Production startup is the composition under measurement: it owns windows,
  // sessions, menus and configuration. The extension runtime is a separate
  // application-owned instance measured by its own supervised fixture.
  await import(pathToFileURL(path.join(root, "main", "index.mjs")).href);
  await app.whenReady();
  window = await waitForWindow();
  window.setContentSize(
    PERFORMANCE_BENCHMARK.contentSize.width,
    PERFORMANCE_BENCHMARK.contentSize.height,
  );
  window.focus();
  await firstTab();
  const gcAvailable = await collectRendererGarbage();
  const gpu = await app.getGPUInfo("basic").catch(() => null);
  const steps: StepResult[] = [];
  const names = ["one", "three", "six"] as const;
  for (const [index, tabs] of PERFORMANCE_BENCHMARK.tabsPerStep.entries()) {
    trace("step", `${names[index]}:begin`);
    if (tabs > 1) await addTabs(tabs);
    steps.push(await step(names[index]!, tabs));
    trace("step", `${names[index]}:complete`);
  }
  trace("idle", "begin");
  const idle = await idleWindow(
    "full-tab-set",
    PERFORMANCE_BENCHMARK.idleWindowMs,
  );
  trace("idle", "complete");
  trace("idle-cpu", "begin");
  const idleCpu = await measureIdleCpuWindows();
  trace("idle-cpu", "complete");
  trace("attribution", "begin");
  const { runs: attribution, quiet } = await measureAttribution();
  trace("attribution", "complete");
  trace("input", "begin");
  const input = await measureInput();
  trace("input", "complete");
  const final = await surfaces();
  const settingsBytes = readFileSync(
    path.join(root, "config", "omxterm", "config.json"),
    "utf8",
  );
  // Synchronous write: the payload is large and app.exit() otherwise kills the
  // process before the pipe drains, truncating the receipt.
  writeSync(
    1,
    `${resultPrefix}${JSON.stringify({
      protocol: PERFORMANCE_BENCHMARK_PROTOCOL,
      variant: options,
      metric,
      shell,
      environment: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        versions: process.versions,
        cpuModel: os.cpus()[0]?.model ?? null,
        logicalCpus: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        gpu,
        webglRenderer: final.webglRenderer,
      },
      build: buildFingerprint(),
      measurementControl: { rendererGcAvailable: gcAvailable },
      workload: {
        constants: PERFORMANCE_BENCHMARK,
        entryCommand: workloadEntryCommand(root, shell),
      },
      identity: {
        requestedContentSize: PERFORMANCE_BENCHMARK.contentSize,
        contentSize: window.getContentBounds(),
        devicePixelRatio: final.devicePixelRatio,
        settings: {
          lines: (
            JSON.parse(settingsBytes) as { scrollback: { lines: number } }
          ).scrollback.lines,
          sha256: createHash("sha256").update(settingsBytes).digest("hex"),
        },
        applied: final.configuration,
      },
      grids: [...grids.entries()].map(([tab, frame]) => ({
        tab,
        columns: frame.columns,
        rows: frame.rows,
        cellWidth: frame.cellWidth,
        cellHeight: frame.cellHeight,
      })),
      steps,
      idle,
      idleCpu,
      attribution,
      quiet,
      input,
      final: final.surfaces,
    })}\n`,
  );
  app.exit(0);
}

void run().catch(fail);
