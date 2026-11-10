import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { parseBenchmarkArgs } from "../../scripts/performance/benchmark-cli.mjs";

const SUPPORTED_ARGUMENTS = [
  "--record",
  "--replace",
  "--fail-on-invalid",
  "--truncate-stream",
];
const syntheticPrivateValue = "SYNTHETIC_PRIVATE_PATH_TOKEN_9f72";

let root = "";

afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true });
    root = "";
  }
});

interface EntryPointHarness {
  readonly result: SpawnSyncReturns<string>;
  readonly gitActivity: string;
  readonly esbuildActivity: string;
  readonly workingDirectory: string;
}

function isolatedEnvironment(gitActivity: string, esbuildActivity: string) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.toUpperCase() === "PATH" || name.toUpperCase() === "NODE_OPTIONS")
      delete env[name];
  }
  // Keep Windows variables such as SystemRoot, ComSpec, PATHEXT, TEMP and TMP.
  env.PATH = "";
  env.BENCHMARK_CLI_TEST_GIT_ACTIVITY = gitActivity;
  env.BENCHMARK_CLI_TEST_ESBUILD_ACTIVITY = esbuildActivity;
  return env;
}

async function invokeEntrypoint(
  args: readonly string[],
  fakeEsbuild = false,
): Promise<EntryPointHarness> {
  root = await mkdtemp(path.join(os.tmpdir(), "omxterm-benchmark-cli-#-"));
  expect(root).toContain("#");
  const checkout = path.join(root, "checkout");
  const performanceScripts = path.join(checkout, "scripts", "performance");
  const workingDirectory = path.join(root, "working");
  const preloader = path.join(root, "block-project-processes.mjs");
  const entrypoint = path.join(performanceScripts, "run-benchmark.mjs");
  const gitActivity = path.join(root, "git-activity");
  const esbuildActivity = path.join(root, "esbuild-activity");
  await mkdir(performanceScripts, { recursive: true });
  await mkdir(workingDirectory);

  // Copy the exact production entrypoint and parser; no duplicate parser or
  // other real project dependencies are present in this temporary checkout.
  for (const filename of ["run-benchmark.mjs", "benchmark-cli.mjs"])
    await copyFile(
      path.resolve("scripts", "performance", filename),
      path.join(performanceScripts, filename),
    );

  await writeFile(
    preloader,
    `import { appendFileSync } from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
childProcess.execFileSync = (file) => {
  appendFileSync(process.env.BENCHMARK_CLI_TEST_GIT_ACTIVITY, String(file));
  throw new Error("Blocked child-process execution in the CLI test harness");
};
syncBuiltinESMExports();
`,
  );

  // A local fake or absent export shadows any ancestor package, so a faulty
  // import cannot reach a real esbuild outside this temporary checkout.
  const esbuildPackage = path.join(checkout, "node_modules", "esbuild");
  await mkdir(esbuildPackage, { recursive: true });
  await writeFile(
    path.join(esbuildPackage, "package.json"),
    JSON.stringify({
      name: "esbuild",
      type: "module",
      exports: fakeEsbuild ? "./index.mjs" : "./missing.mjs",
    }),
  );
  if (fakeEsbuild) {
    await writeFile(
      path.join(esbuildPackage, "index.mjs"),
      `import { appendFileSync } from "node:fs";
const activity = process.env.BENCHMARK_CLI_TEST_ESBUILD_ACTIVITY;
appendFileSync(activity, "import\\n");
throw new Error("Blocked esbuild import in the CLI test harness");
export async function build() {
  appendFileSync(activity, "build\\n");
  throw new Error("Blocked esbuild build in the CLI test harness");
}
`,
    );
  }

  // Node treats --import as an ESM specifier, not a filesystem path.
  const result = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(preloader).href, entrypoint, ...args],
    {
      cwd: workingDirectory,
      encoding: "utf8",
      timeout: 10_000,
      env: isolatedEnvironment(gitActivity, esbuildActivity),
    },
  );
  return { result, gitActivity, esbuildActivity, workingDirectory };
}

function expectArgumentRejection(
  harness: EntryPointHarness,
  positions: readonly number[],
) {
  const { result, gitActivity, esbuildActivity, workingDirectory } = harness;
  const stderr = result.stderr ?? "";
  const label = positions.length === 1 ? "position" : "positions";

  expect.soft(result.error).toBeUndefined();
  expect.soft(result.status).not.toBe(0);
  expect.soft(stderr).toContain("Invalid performance benchmark arguments:");
  expect.soft(stderr).toContain("Unrecognized performance benchmark argument");
  expect.soft(stderr).toContain(`${label} ${positions.join(", ")}`);
  expect
    .soft(stderr)
    .toContain(`Supported arguments: ${SUPPORTED_ARGUMENTS.join(", ")}`);
  expect.soft(stderr).not.toContain("Blocked child-process execution");
  expect.soft(stderr).not.toContain("Blocked esbuild");
  expect.soft(existsSync(gitActivity)).toBe(false);
  expect.soft(existsSync(esbuildActivity)).toBe(false);
  expect.soft(existsSync(path.join(workingDirectory, ".scratch"))).toBe(false);
}

it.each([
  ["misspelled flag by itself", "--fail-on-invaldi"],
  ["synthetic sensitive literal", syntheticPrivateValue],
] as const)(
  "rejects the %s in the exact entrypoint before Git, esbuild or scratch work",
  async (_label, argument) => {
    const harness = await invokeEntrypoint([argument], true);
    expectArgumentRejection(harness, [1]);
    expect(harness.result.stderr ?? "").not.toContain(argument);
  },
);

it("rejects a typo before resolving an unavailable esbuild module", async () => {
  const harness = await invokeEntrypoint(["--fail-on-invaldi"]);
  expectArgumentRejection(harness, [1]);
  const stderr = harness.result.stderr ?? "";
  expect(stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  expect(stderr).not.toContain("Cannot find package 'esbuild'");
  expect(stderr).not.toContain("--fail-on-invaldi");
});

it("blocks Git if an accepted record path reaches the process guard", async () => {
  const harness = await invokeEntrypoint(["--record"], true);
  const stderr = harness.result.stderr ?? "";

  expect.soft(harness.result.error).toBeUndefined();
  expect.soft(harness.result.status).not.toBe(0);
  expect.soft(stderr).toContain("Blocked child-process execution");
  expect.soft(existsSync(harness.gitActivity)).toBe(true);
  expect.soft(existsSync(harness.esbuildActivity)).toBe(false);
  expect
    .soft(existsSync(path.join(harness.workingDirectory, ".scratch")))
    .toBe(false);
});

const supportedFlagCases = [
  ["--record", "record"],
  ["--replace", "replace"],
  ["--fail-on-invalid", "failOnInvalid"],
  ["--truncate-stream", "truncateStream"],
] as const;

it.each(supportedFlagCases)(
  "parses %s independently",
  (flag, selectedOption) => {
    expect(parseBenchmarkArgs([flag])).toEqual({
      record: selectedOption === "record",
      replace: selectedOption === "replace",
      failOnInvalid: selectedOption === "failOnInvalid",
      truncateStream: selectedOption === "truncateStream",
    });
  },
);

it("preserves report defaults and harmless repetitions", () => {
  expect(parseBenchmarkArgs([])).toEqual({
    record: false,
    replace: false,
    failOnInvalid: false,
    truncateStream: false,
  });
  expect(
    parseBenchmarkArgs([
      "--record",
      "--record",
      "--replace",
      "--replace",
      "--fail-on-invalid",
      "--fail-on-invalid",
      "--truncate-stream",
      "--truncate-stream",
    ]),
  ).toEqual({
    record: true,
    replace: true,
    failOnInvalid: true,
    truncateStream: true,
  });
});

function captureParserError(args: readonly string[]): Error {
  try {
    parseBenchmarkArgs(args);
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("Expected benchmark argument parsing to reject the input");
}

const invalidParserCases = [
  { label: "unknown flag", args: ["--unknown"], position: "position 1" },
  { label: "positional value", args: ["word"], position: "position 1" },
  { label: "empty argument", args: [""], position: "position 1" },
  { label: "delimiter", args: ["--"], position: "position 1" },
  {
    label: "separated value",
    args: ["--record", "value"],
    position: "position 2",
  },
  {
    label: "malformed literal",
    args: ["--record=yes"],
    position: "position 1",
  },
  {
    label: "unsupported comparison option",
    args: ["--confirm-same-machine"],
    position: "position 1",
  },
  {
    label: "another unsupported option",
    args: ["--no-comparison"],
    position: "position 1",
  },
  {
    label: "synthetic sensitive value",
    args: [syntheticPrivateValue],
    position: "position 1",
  },
] as const;

it.each(invalidParserCases)(
  "rejects the $label at $position without echoing its contents",
  ({ args, position }) => {
    const error = captureParserError(args);

    expect(error.message).toBe(
      `Unrecognized performance benchmark argument at ${position}. Supported arguments: ${SUPPORTED_ARGUMENTS.join(", ")}.`,
    );
  },
);

it("reports all invalid positions without echoing values", () => {
  const error = captureParserError(["--unknown", "--record", "private-value"]);
  expect(error.message).toContain("positions 1, 3");
  expect(error.message).not.toContain("--unknown");
  expect(error.message).not.toContain("private-value");
});

it("preserves the record-plus-truncate refusal before Git, esbuild or setup", async () => {
  const harness = await invokeEntrypoint(
    ["--record", "--truncate-stream"],
    true,
  );
  const stderr = harness.result.stderr ?? "";

  expect.soft(harness.result.error).toBeUndefined();
  expect.soft(harness.result.status).not.toBe(0);
  expect
    .soft(stderr)
    .toContain(
      "Refusing to record a baseline from a fault-injected run: --truncate-stream produces an invalid observation",
    );
  expect.soft(stderr).not.toContain("Invalid performance benchmark arguments");
  expect.soft(existsSync(harness.gitActivity)).toBe(false);
  expect.soft(existsSync(harness.esbuildActivity)).toBe(false);
  expect
    .soft(existsSync(path.join(harness.workingDirectory, ".scratch")))
    .toBe(false);
});
