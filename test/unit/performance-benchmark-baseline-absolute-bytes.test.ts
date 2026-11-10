import { expect, it } from "vitest";
import type {
  BaselineRepetition,
  BenchmarkBaseline,
} from "../fixtures/performance-benchmark-baseline";
import {
  baselineFrom,
  baselinePreflight,
} from "../fixtures/performance-benchmark-baseline";
import { acceptedReport } from "../fixtures/performance-benchmark-synthetic";

const SCROLLBACK_LINES = [10_000, 0] as const;
const STEP_NAMES = ["one", "three", "six"] as const;
const STEP_ROLES = [
  "main",
  "renderer",
  "gpu",
  "utility",
  "extension-runtime",
  "shell",
  "other",
] as const;
const STEP_BYTE_FIELDS = ["steadyBytes", "peakBytes"] as const;
const STREAM_NAMES = ["ascii", "variety", "deep-history"] as const;
const STREAM_PEAK_ROLES = ["main", "renderer", "gpu"] as const;
const FRACTIONAL_ABSOLUTE_BYTE_COUNT = 1.5;
const UNSAFE_ABSOLUTE_BYTE_COUNT = Number.MAX_SAFE_INTEGER + 1;

type StepName = (typeof STEP_NAMES)[number];
type StepRole = (typeof STEP_ROLES)[number];
type StepByteField = (typeof STEP_BYTE_FIELDS)[number];
type StreamName = (typeof STREAM_NAMES)[number];
type StreamPeakRole = (typeof STREAM_PEAK_ROLES)[number];

type AbsoluteByteBoundary = {
  readonly name: string;
  readonly update: (
    baseline: BenchmarkBaseline,
    value: number,
  ) => BenchmarkBaseline;
};

function syntheticBaseline(): BenchmarkBaseline {
  return baselineFrom(acceptedReport(), "c".repeat(40), "linux-arm64");
}

function updateFirstRepetition(
  baseline: BenchmarkBaseline,
  update: (repetition: BaselineRepetition) => BaselineRepetition,
): BenchmarkBaseline {
  const variant = baseline.variants[String(SCROLLBACK_LINES[0])]!;
  return {
    ...baseline,
    variants: {
      ...baseline.variants,
      [String(SCROLLBACK_LINES[0])]: {
        ...variant,
        repetitions: variant.repetitions.map((repetition, index) =>
          index === 0 ? update(repetition) : repetition,
        ),
      },
    },
  };
}

function withStepRoleByte(
  baseline: BenchmarkBaseline,
  stepName: StepName,
  role: StepRole,
  field: StepByteField,
  value: number,
): BenchmarkBaseline {
  return updateFirstRepetition(baseline, (repetition) => {
    const step = repetition.steps[stepName]!;
    const observation = step.roles[role] ?? {
      steadyBytes: null,
      peakBytes: null,
    };
    return {
      ...repetition,
      steps: {
        ...repetition.steps,
        [stepName]: {
          ...step,
          roles: {
            ...step.roles,
            [role]: { ...observation, [field]: value },
          },
        },
      },
    };
  });
}

function withStepTotalByte(
  baseline: BenchmarkBaseline,
  stepName: StepName,
  value: number,
): BenchmarkBaseline {
  return updateFirstRepetition(baseline, (repetition) => {
    const step = repetition.steps[stepName]!;
    return {
      ...repetition,
      steps: {
        ...repetition.steps,
        [stepName]: { ...step, totalBytes: value },
      },
    };
  });
}

function withStreamPeakByte(
  baseline: BenchmarkBaseline,
  streamName: StreamName,
  role: StreamPeakRole,
  value: number,
): BenchmarkBaseline {
  return updateFirstRepetition(baseline, (repetition) => ({
    ...repetition,
    streams: repetition.streams.map((stream) =>
      stream.name === streamName
        ? { ...stream, peaks: { ...stream.peaks, [role]: value } }
        : stream,
    ),
  }));
}

function withRuntimeSteadyByte(
  baseline: BenchmarkBaseline,
  value: number,
): BenchmarkBaseline {
  return {
    ...baseline,
    extensionRuntime: {
      ...baseline.extensionRuntime!,
      steadyBytes: value,
    },
  };
}

function absoluteByteBoundaries(): AbsoluteByteBoundary[] {
  const boundaries: AbsoluteByteBoundary[] = [];
  for (const stepName of STEP_NAMES) {
    for (const role of STEP_ROLES) {
      for (const field of STEP_BYTE_FIELDS) {
        boundaries.push({
          name: `${stepName} step ${role} ${field}`,
          update: (baseline, value) =>
            withStepRoleByte(baseline, stepName, role, field, value),
        });
      }
    }
    boundaries.push({
      name: `${stepName} step totalBytes`,
      update: (baseline, value) => withStepTotalByte(baseline, stepName, value),
    });
  }
  for (const streamName of STREAM_NAMES) {
    for (const role of STREAM_PEAK_ROLES) {
      boundaries.push({
        name: `${streamName} stream ${role} peak bytes`,
        update: (baseline, value) =>
          withStreamPeakByte(baseline, streamName, role, value),
      });
    }
  }
  boundaries.push({
    name: "extension-runtime steadyBytes",
    update: withRuntimeSteadyByte,
  });
  return boundaries;
}

const BASELINE = syntheticBaseline();
const ABSOLUTE_BYTE_BOUNDARIES = absoluteByteBoundaries();

for (const boundary of ABSOLUTE_BYTE_BOUNDARIES) {
  it(`rejects fractional absolute bytes at ${boundary.name}`, () => {
    const invalid = boundary.update(BASELINE, FRACTIONAL_ABSOLUTE_BYTE_COUNT);
    expect(typeof baselinePreflight(invalid, SCROLLBACK_LINES)).toBe("string");
  });

  it(`rejects unsafe absolute bytes at ${boundary.name}`, () => {
    const invalid = boundary.update(BASELINE, UNSAFE_ABSOLUTE_BYTE_COUNT);
    expect(typeof baselinePreflight(invalid, SCROLLBACK_LINES)).toBe("string");
  });
}

it("keeps absent and null optional secondary step memory valid", () => {
  const updated = updateFirstRepetition(BASELINE, (repetition) => {
    const step = repetition.steps.one!;
    const roles = { ...step.roles };
    delete roles.utility;
    roles.other = { steadyBytes: null, peakBytes: null };
    return {
      ...repetition,
      steps: { ...repetition.steps, one: { ...step, roles } },
    };
  });
  expect(baselinePreflight(updated, SCROLLBACK_LINES)).toBeNull();
});

it("keeps fractional and above-one-core CPU percentages valid", () => {
  const updated = updateFirstRepetition(BASELINE, (repetition) => ({
    ...repetition,
    streams: repetition.streams.map((stream, index) =>
      index === 0 ? { ...stream, cpuPercentOneCore: 175.5 } : stream,
    ),
    idle: {
      ...repetition.idle,
      cpuPercentOneCore: {
        ...repetition.idle.cpuPercentOneCore,
        main: 0.5,
      },
    },
  }));
  const withRuntimeCpu = {
    ...updated,
    extensionRuntime: {
      ...updated.extensionRuntime!,
      cpuPercentOneCore: 250.5,
    },
  };
  expect(baselinePreflight(withRuntimeCpu, SCROLLBACK_LINES)).toBeNull();
});
