import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// One entry for the report and the record path. The measurement lives in the
// bundled runner, so this script only decides where artifacts land, whether a
// baseline may be written, and whether an invalid run exits non-zero.
const record = process.argv.includes("--record");
const replace = process.argv.includes("--replace");
// Report mode is the default: the run prints numbers and exits zero no matter
// what they are. This flag only rejects a run that is not a valid observation
// (missing metric, short stream, unverified quiescence, unexpected skip).
const failOnInvalid = process.argv.includes("--fail-on-invalid");
// Fault injection for the integrity path: the payload arrives short, so the
// report shows it and --fail-on-invalid rejects the run.
const truncateStream = process.argv.includes("--truncate-stream");

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (record && truncateStream)
  throw new Error(
    "Refusing to record a baseline from a fault-injected run: --truncate-stream produces an invalid observation",
  );
if (record && git("status", "--porcelain", "--untracked-files=no"))
  throw new Error(
    "Commit tracked changes before recording a performance baseline; the baseline records the measured source",
  );

const scratchRoot = path.resolve(".scratch/performance-benchmark");
await mkdir(scratchRoot, { recursive: true });
const scratch = await mkdtemp(path.join(scratchRoot, "run-"));
const bundle = path.join(scratch, "runner.mjs");
await build({
  entryPoints: ["test/fixtures/performance-benchmark-run.ts"],
  outfile: bundle,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
const runner = await import(pathToFileURL(bundle).href);
const { runAndEvaluate, profileFor } = runner;
// The profile owns the baseline file name, so the script never derives a
// second path.
const profile = profileFor(process.platform, process.arch);
const baselinePath = path.resolve("test/performance", profile.baselineFile);
const outcome = await runAndEvaluate({
  scratch,
  baselinePath,
  artifactsDirectory: path.join(scratch, "artifacts"),
  ...(truncateStream ? { truncateStream: true } : {}),
  ...(record
    ? {
        recordBaseline: {
          sourceCommit: git("rev-parse", "HEAD"),
          replace,
          cleanTree: true,
        },
      }
    : {}),
});
const blocking = outcome.issues.filter((issue) => issue.blocking);
const notes = outcome.issues.filter((issue) => !issue.blocking);
const lines = [
  `Profile: ${profile.key} (${outcome.report.metric.name})`,
  outcome.baseline === null
    ? "Baseline: none recorded for this profile; nothing to compare"
    : outcome.comparabilityReasons.length === 0
      ? `Baseline: compared against ${baselinePath}`
      : `Baseline: not comparable (${outcome.comparabilityReasons.join("; ")})`,
  blocking.length === 0
    ? "Integrity: no blocking issue"
    : `Integrity: ${blocking.length} blocking issue(s)`,
  ...blocking.map((issue) => `  invalid: ${issue.code}: ${issue.detail}`),
  ...notes.map((issue) => `  note: ${issue.code}: ${issue.detail}`),
  `Report: ${outcome.artifacts.reportPath}`,
  `Summary: ${outcome.artifacts.summaryPath}`,
  `Private raw observations: ${outcome.artifacts.rawPath}`,
];
if (record) lines.push(`Baseline written: ${baselinePath}`);
else lines.push("This run reports numbers; it does not judge them.");
console.log(lines.join("\n"));
if (failOnInvalid && blocking.length > 0) process.exitCode = 1;
