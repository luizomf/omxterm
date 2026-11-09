import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  runNativeFixture,
  type NativeFixtureResult,
  type NativeFixtureTestContext,
} from "./run-native-fixture";
import { buildPerformanceProfile } from "./performance-benchmark-build";
import type {
  RawBenchmarkRun,
  RawRuntimeRun,
} from "./performance-benchmark-report";

export const PERFORMANCE_RUN_PREFIX = "__OMXTERM_PERFORMANCE_BENCH__";
export const RUNTIME_RUN_PREFIX = "__OMXTERM_RUNTIME_BENCH__";
const require = createRequire(import.meta.url);

export interface BenchmarkRunOptions {
  readonly scratch: string;
  readonly scrollbackLines: number;
  /** Fault injection for the integrity path: one stream is cut short. */
  readonly truncateStream?: boolean;
  readonly extensionRuntime?: boolean;
  readonly testContext?: NativeFixtureTestContext;
}

function payloadLines(
  execution: NativeFixtureResult,
  prefix: string,
): string[] {
  return execution.stdout.split("\n").filter((line) => line.startsWith(prefix));
}

function parseSingle(execution: NativeFixtureResult, prefix: string): unknown {
  const lines = payloadLines(execution, prefix);
  if (lines.length !== 1)
    throw new Error(
      `Expected one ${prefix} payload, received ${lines.length}.\nstdout excerpt:\n${excerpt(execution.stdout)}\nstderr excerpt:\n${excerpt(execution.stderr)}`,
    );
  return JSON.parse(lines[0]!.slice(prefix.length)) as unknown;
}

function excerpt(value: string, limit = 2000): string {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}… [${value.length} chars]`;
}

function assertSettled(execution: NativeFixtureResult, label: string): void {
  if (
    execution.reason !== "exit" ||
    execution.exitCode !== 0 ||
    execution.signal !== null ||
    execution.cleanupErrors.length !== 0 ||
    execution.cleanupAssistance !== "none"
  )
    throw new Error(
      `${label} did not settle cleanly: ${JSON.stringify({ reason: execution.reason, exitCode: execution.exitCode, signal: execution.signal, cleanupErrors: execution.cleanupErrors, cleanupAssistance: execution.cleanupAssistance })}\nstdout excerpt:\n${excerpt(execution.stdout)}\nstderr excerpt:\n${excerpt(execution.stderr)}`,
    );
  if (execution.stderr.includes("built-in default settings instead"))
    throw new Error(
      `${label} ran with built-in default settings; the benchmark settings file was rejected.\nstderr excerpt:\n${excerpt(execution.stderr)}`,
    );
}

function supervisorReceipt(execution: NativeFixtureResult) {
  return {
    reason: execution.reason,
    exitCode: execution.exitCode,
    signal: execution.signal,
    cleanupErrors: execution.cleanupErrors,
    cleanupAssistance: execution.cleanupAssistance,
  };
}

function electronExecutable(): string {
  return require("electron") as string;
}

function launchArguments(): string[] {
  const args: string[] = [];
  if (process.platform === "linux")
    args.push("--no-sandbox", "--ozone-platform=x11");
  // Measurement control only: the renderer collects its heap before steady
  // reads so the retained floor is not a race with the garbage collector.
  args.push("--js-flags=--expose-gc");
  return args;
}

export async function runVariant(
  options: BenchmarkRunOptions,
): Promise<RawBenchmarkRun> {
  const root = await mkdtemp(path.join(options.scratch, "profile-"));
  const execution = await runNativeFixture({
    executable: electronExecutable(),
    args: [
      ...launchArguments(),
      path.join(root, "perf-main.mjs"),
      `--fixture-performance-scrollback=${options.scrollbackLines}`,
      `--fixture-performance-truncate-stream=${options.truncateStream ? 1 : 0}`,
    ],
    root,
    timeout: 600_000,
    ...(options.testContext ? { testContext: options.testContext } : {}),
    prepare: () =>
      buildPerformanceProfile(root, {
        scrollbackLines: options.scrollbackLines,
      }),
  });
  assertSettled(execution, `Scrollback ${options.scrollbackLines} variant`);
  const run = parseSingle(execution, PERFORMANCE_RUN_PREFIX) as RawBenchmarkRun;
  if (run.variant.scrollbackLines !== options.scrollbackLines)
    throw new Error(
      "The measured variant does not match the requested settings",
    );
  return { ...run, supervisor: supervisorReceipt(execution) };
}

export async function runExtensionRuntime(
  options: Pick<BenchmarkRunOptions, "scratch"> &
    Pick<Partial<BenchmarkRunOptions>, "testContext">,
): Promise<RawRuntimeRun> {
  const root = await mkdtemp(path.join(options.scratch, "runtime-"));
  const execution = await runNativeFixture({
    executable: electronExecutable(),
    args: [...launchArguments(), path.join(root, "perf-runtime.mjs")],
    root,
    timeout: 120_000,
    ...(options.testContext ? { testContext: options.testContext } : {}),
    prepare: () => buildPerformanceProfile(root, { scrollbackLines: 10_000 }),
  });
  assertSettled(execution, "Extension runtime");
  return {
    ...(parseSingle(execution, RUNTIME_RUN_PREFIX) as RawRuntimeRun),
    supervisor: supervisorReceipt(execution),
  };
}

export interface WrittenArtifacts {
  readonly reportPath: string;
  readonly summaryPath: string;
  readonly rawPath: string;
}

export async function writeBenchmarkArtifacts(
  directory: string,
  report: unknown,
  summary: string,
  raw: unknown,
): Promise<WrittenArtifacts> {
  await mkdir(directory, { recursive: true });
  const reportPath = path.join(directory, "report.json");
  const summaryPath = path.join(directory, "summary.md");
  const rawPath = path.join(directory, "raw-observations.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(summaryPath, summary);
  await writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`, {
    mode: 0o600,
  });
  return { reportPath, summaryPath, rawPath };
}

// A failed run still leaves evidence. Only the error name and a bounded first
// line are written: an assertion message can embed profile paths from the
// supervisor receipts, and this directory is disposable but still local.
export async function writeBenchmarkFailure(
  directory: string,
  stage: string,
  error: unknown,
): Promise<string> {
  await mkdir(directory, { recursive: true });
  const failurePath = path.join(directory, "failure.json");
  await writeFile(
    failurePath,
    `${JSON.stringify(
      {
        status: "fixture-failed",
        stage,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message.split("\n")[0]?.slice(0, 300) ?? ""}`
            : String(error).slice(0, 300),
      },
      null,
      2,
    )}\n`,
  );
  return failurePath;
}
