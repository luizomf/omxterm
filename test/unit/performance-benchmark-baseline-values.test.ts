import { expect, it } from "vitest";
import type {
  BaselineRepetition,
  BenchmarkBaseline,
} from "../fixtures/performance-benchmark-baseline";
import {
  baselineFrom,
  baselinePreflight,
} from "../fixtures/performance-benchmark-baseline";
import {
  acceptedReport,
  makeRun,
  report,
} from "../fixtures/performance-benchmark-synthetic";

function syntheticBaseline(): BenchmarkBaseline {
  return baselineFrom(acceptedReport(), "c".repeat(40), "linux-arm64");
}

function platformBaseline(
  platform: "linux" | "darwin",
  repetitions: number,
): BenchmarkBaseline {
  const runs = [10_000, 0].map((scrollbackLines) =>
    makeRun({ platform, scrollbackLines }),
  );
  const repeatedRuns = [10_000, 0].map((scrollbackLines) =>
    Array.from({ length: repetitions }, () =>
      makeRun({ platform, scrollbackLines }),
    ),
  );
  return baselineFrom(
    report(runs, repeatedRuns),
    "c".repeat(40),
    `${platform}-arm64`,
  );
}

function updateLastZeroHistoryRepetition(
  baseline: BenchmarkBaseline,
  update: (repetition: BaselineRepetition) => BaselineRepetition,
): BenchmarkBaseline {
  const variant = baseline.variants["0"]!;
  const lastIndex = variant.repetitions.length - 1;
  return {
    ...baseline,
    variants: {
      ...baseline.variants,
      "0": {
        ...variant,
        repetitions: variant.repetitions.map((repetition, index) =>
          index === lastIndex ? update(repetition) : repetition,
        ),
      },
    },
  };
}

const SECONDARY_ROLES = [
  "utility",
  "extension-runtime",
  "shell",
  "other",
] as const;
const STEP_NAMES = ["one", "three", "six"] as const;
const CPU_MAP_LOCATIONS = [
  "idle",
  "idle-median",
  "blink-off-focused",
  "blink-off-unfocused",
  "blink-on-focused",
  "blink-on-unfocused",
  "quiet",
] as const;

type CpuMapLocation = (typeof CPU_MAP_LOCATIONS)[number];

function withRoleCpu(
  repetition: BaselineRepetition,
  location: CpuMapLocation,
  role: string,
  value: number | null,
): BaselineRepetition {
  const updateWindow = (window: BaselineRepetition["quiet"]) => ({
    ...window,
    cpuPercentOneCore: { ...window.cpuPercentOneCore, [role]: value },
  });
  if (location === "idle")
    return {
      ...repetition,
      idle: {
        ...repetition.idle,
        cpuPercentOneCore: {
          ...repetition.idle.cpuPercentOneCore,
          [role]: value,
        },
      },
    };
  if (location === "idle-median")
    return {
      ...repetition,
      idleCpuMedianPercent: {
        ...repetition.idleCpuMedianPercent,
        [role]: value,
      },
    };
  if (location === "quiet")
    return { ...repetition, quiet: updateWindow(repetition.quiet) };
  return {
    ...repetition,
    idleCpuWindows: repetition.idleCpuWindows.map((window) =>
      window.name === location ? updateWindow(window) : window,
    ),
  };
}

function updateFirstRepetition(
  baseline: BenchmarkBaseline,
  update: (repetition: BaselineRepetition) => BaselineRepetition,
): BenchmarkBaseline {
  const variant = baseline.variants["10000"]!;
  return {
    ...baseline,
    variants: {
      ...baseline.variants,
      "10000": {
        ...variant,
        repetitions: variant.repetitions.map((repetition, index) =>
          index === 0 ? update(repetition) : repetition,
        ),
      },
    },
  };
}

function withCpuValue(
  repetition: BaselineRepetition,
  value: number | null,
): BaselineRepetition {
  const updateWindow = (window: BaselineRepetition["quiet"]) => ({
    ...window,
    cpuPercentOneCore: { ...window.cpuPercentOneCore, main: value },
    totalCpuPercentOneCore: value,
  });
  return {
    ...repetition,
    streams: repetition.streams.map((stream) => ({
      ...stream,
      cpuPercentOneCore: value,
    })),
    idle: {
      ...repetition.idle,
      cpuPercentOneCore: {
        ...repetition.idle.cpuPercentOneCore,
        main: value,
      },
    },
    idleCpuWindows: repetition.idleCpuWindows.map(updateWindow),
    quiet: updateWindow(repetition.quiet),
    idleCpuMedianPercent: {
      ...repetition.idleCpuMedianPercent,
      main: value,
    },
    idleCpuTotalMedianPercent: value,
  };
}

it("rejects negative absolute memory at each stored measurement boundary", () => {
  const baseline = syntheticBaseline();
  const invalid = [
    updateFirstRepetition(baseline, (repetition) => {
      const one = repetition.steps.one!;
      return {
        ...repetition,
        steps: {
          ...repetition.steps,
          one: {
            ...one,
            roles: {
              ...one.roles,
              main: { ...one.roles.main!, steadyBytes: -1 },
            },
          },
        },
      };
    }),
    updateFirstRepetition(baseline, (repetition) => {
      const one = repetition.steps.one!;
      return {
        ...repetition,
        steps: {
          ...repetition.steps,
          one: {
            ...one,
            roles: {
              ...one.roles,
              main: { ...one.roles.main!, peakBytes: -1 },
            },
          },
        },
      };
    }),
    updateFirstRepetition(baseline, (repetition) => {
      const one = repetition.steps.one!;
      return {
        ...repetition,
        steps: { ...repetition.steps, one: { ...one, totalBytes: -1 } },
      };
    }),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      streams: repetition.streams.map((stream, index) =>
        index === 0
          ? { ...stream, peaks: { ...stream.peaks, main: -1 } }
          : stream,
      ),
    })),
    {
      ...baseline,
      extensionRuntime: {
        ...baseline.extensionRuntime!,
        steadyBytes: -1,
      },
    },
  ];
  const problems = invalid.map((value) =>
    baselinePreflight(value, [10_000, 0]),
  );
  expect(problems).toHaveLength(invalid.length);
  for (const problem of problems) expect(typeof problem).toBe("string");
});

it("rejects negative secondary-role step memory in every step and repetition", () => {
  const invalid: BenchmarkBaseline[] = [];
  for (const platform of ["linux", "darwin"] as const) {
    const baseline = platformBaseline(platform, 3);
    for (const stepName of STEP_NAMES) {
      for (const role of SECONDARY_ROLES) {
        for (const field of ["steadyBytes", "peakBytes"] as const) {
          invalid.push(
            updateLastZeroHistoryRepetition(baseline, (repetition) => {
              const step = repetition.steps[stepName]!;
              const observation = step.roles[role]!;
              return {
                ...repetition,
                steps: {
                  ...repetition.steps,
                  [stepName]: {
                    ...step,
                    roles: {
                      ...step.roles,
                      [role]: { ...observation, [field]: -1 },
                    },
                  },
                },
              };
            }),
          );
        }
      }
    }
  }
  const problems = invalid.map((baseline) =>
    baselinePreflight(baseline, [10_000, 0]),
  );
  expect(problems).toHaveLength(invalid.length);
  for (const problem of problems) expect(typeof problem).toBe("string");
});

it("accepts unavailable secondary step roles and null memory observations", () => {
  for (const platform of ["linux", "darwin"] as const) {
    const baseline = platformBaseline(platform, 3);
    const valid = updateLastZeroHistoryRepetition(baseline, (repetition) => {
      const step = repetition.steps.one!;
      const roles = { ...step.roles };
      delete roles.utility;
      roles.shell = { steadyBytes: null, peakBytes: null };
      return {
        ...repetition,
        steps: { ...repetition.steps, one: { ...step, roles } },
      };
    });
    expect(baselinePreflight(valid, [10_000, 0])).toBeNull();
  }
});

it("safely rejects malformed step role objects", () => {
  const baseline = platformBaseline("linux", 3);
  const malformed = [
    updateLastZeroHistoryRepetition(baseline, (repetition) => {
      const step = repetition.steps.one!;
      return {
        ...repetition,
        steps: {
          ...repetition.steps,
          one: {
            ...step,
            roles: {
              ...step.roles,
              utility: null,
            } as unknown as typeof step.roles,
          },
        },
      };
    }),
    updateLastZeroHistoryRepetition(baseline, (repetition) => {
      const step = repetition.steps.one!;
      return {
        ...repetition,
        steps: {
          ...repetition.steps,
          one: { ...step, roles: null as unknown as typeof step.roles },
        },
      };
    }),
  ];
  for (const invalid of malformed) {
    expect(() => baselinePreflight(invalid, [10_000, 0])).not.toThrow();
    expect(baselinePreflight(invalid, [10_000, 0])).not.toBeNull();
  }
});

it("rejects secondary-role CPU percentages in every stored CPU map and profile", () => {
  const invalid: BenchmarkBaseline[] = [];
  for (const platform of ["linux", "darwin"] as const) {
    const baseline = platformBaseline(platform, 3);
    for (const location of CPU_MAP_LOCATIONS) {
      invalid.push(
        updateLastZeroHistoryRepetition(baseline, (repetition) =>
          withRoleCpu(repetition, location, "utility", -0.5),
        ),
      );
    }
  }
  const problems = invalid.map((baseline) =>
    baselinePreflight(baseline, [10_000, 0]),
  );
  expect(problems).toHaveLength(invalid.length);
  for (const problem of problems) expect(typeof problem).toBe("string");
});

it("rejects non-finite CPU percentages for every secondary role", () => {
  const invalid: BenchmarkBaseline[] = [];
  for (const platform of ["linux", "darwin"] as const) {
    const baseline = platformBaseline(platform, 3);
    for (const role of SECONDARY_ROLES) {
      invalid.push(
        updateLastZeroHistoryRepetition(baseline, (repetition) =>
          withRoleCpu(repetition, "quiet", role, Number.POSITIVE_INFINITY),
        ),
      );
    }
  }
  const problems = invalid.map((baseline) =>
    baselinePreflight(baseline, [10_000, 0]),
  );
  expect(problems).toHaveLength(invalid.length);
  for (const problem of problems) expect(typeof problem).toBe("string");
});

it("accepts null or missing secondary CPU observations in every stored map", () => {
  for (const platform of ["linux", "darwin"] as const) {
    const baseline = platformBaseline(platform, 3);
    const valid = updateLastZeroHistoryRepetition(baseline, (repetition) => {
      let updated = repetition;
      for (const location of CPU_MAP_LOCATIONS) {
        for (const role of SECONDARY_ROLES)
          updated = withRoleCpu(updated, location, role, null);
      }
      const idleCpuPercentOneCore = Object.fromEntries(
        Object.entries(updated.idle.cpuPercentOneCore).filter(
          ([role]) => role !== "utility",
        ),
      );
      return {
        ...updated,
        idle: { ...updated.idle, cpuPercentOneCore: idleCpuPercentOneCore },
      };
    });
    expect(baselinePreflight(valid, [10_000, 0])).toBeNull();
  }
});

it("rejects fractional delivered byte counts within the allowed stream range", () => {
  const baseline = syntheticBaseline();
  const invalid = updateFirstRepetition(baseline, (repetition) => ({
    ...repetition,
    streams: repetition.streams.map((stream, index) =>
      index === 0
        ? {
            ...stream,
            bytes: stream.bytes.map((bytes, repeat) =>
              repeat === 0 ? stream.expectedBytes + 0.5 : bytes,
            ),
          }
        : stream,
    ),
  }));
  expect(baselinePreflight(invalid, [10_000, 0])).not.toBeNull();
});

it("rejects negative stored CPU percentages without assuming a 100% ceiling", () => {
  const baseline = syntheticBaseline();
  const invalid = [
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      streams: repetition.streams.map((stream, index) =>
        index === 0 ? { ...stream, cpuPercentOneCore: -0.5 } : stream,
      ),
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      idle: {
        ...repetition.idle,
        cpuPercentOneCore: {
          ...repetition.idle.cpuPercentOneCore,
          main: -0.5,
        },
      },
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      idleCpuMedianPercent: {
        ...repetition.idleCpuMedianPercent,
        main: -0.5,
      },
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      idleCpuTotalMedianPercent: -0.5,
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      idleCpuWindows: repetition.idleCpuWindows.map((window, index) =>
        index === 0
          ? {
              ...window,
              cpuPercentOneCore: {
                ...window.cpuPercentOneCore,
                main: -0.5,
              },
            }
          : window,
      ),
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      idleCpuWindows: repetition.idleCpuWindows.map((window, index) =>
        index === 0 ? { ...window, totalCpuPercentOneCore: -0.5 } : window,
      ),
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      quiet: {
        ...repetition.quiet,
        cpuPercentOneCore: {
          ...repetition.quiet.cpuPercentOneCore,
          main: -0.5,
        },
      },
    })),
    updateFirstRepetition(baseline, (repetition) => ({
      ...repetition,
      quiet: {
        ...repetition.quiet,
        totalCpuPercentOneCore: -0.5,
      },
    })),
    {
      ...baseline,
      extensionRuntime: {
        ...baseline.extensionRuntime!,
        cpuPercentOneCore: -0.5,
      },
    },
  ];
  const problems = invalid.map((value) =>
    baselinePreflight(value, [10_000, 0]),
  );
  expect(problems).toHaveLength(invalid.length);
  for (const problem of problems) expect(typeof problem).toBe("string");
});

it("preserves signed deltas and fractional per-tab marginals and stream rates", () => {
  const baseline = syntheticBaseline();
  const updated = updateFirstRepetition(baseline, (repetition) => ({
    ...repetition,
    marginal: {
      ...repetition.marginal,
      oneToThree: {
        ...repetition.marginal.oneToThree,
        perTab: { ...repetition.marginal.oneToThree.perTab, main: -0.5 },
        total: -1.25,
      },
    },
    idle: {
      ...repetition.idle,
      growthBytes: { ...repetition.idle.growthBytes, main: -1 },
      totalGrowthBytes: -2,
    },
    idleCpuWindows: repetition.idleCpuWindows.map((window, index) =>
      index === 0
        ? {
            ...window,
            growthBytes: { ...window.growthBytes, main: -1 },
            totalGrowthBytes: -2,
          }
        : window,
    ),
    quiet: {
      ...repetition.quiet,
      growthBytes: { ...repetition.quiet.growthBytes, main: -1 },
      totalGrowthBytes: -2,
    },
    streams: repetition.streams.map((stream, index) =>
      index === 0
        ? {
            ...stream,
            rates: stream.rates.map((rate, repeat) =>
              repeat === 0 ? 0.5 : rate,
            ),
            retained: { ...stream.retained, main: -1 },
          }
        : stream,
    ),
  }));
  const updatedPair = {
    ...updated,
    scrollbackPair: {
      ...updated.scrollbackPair!,
      deltas: updated.scrollbackPair!.deltas.map((delta, index) =>
        index === 0 ? { ...delta, main: -1 } : delta,
      ),
    },
    extensionRuntime: {
      ...updated.extensionRuntime!,
      growthBytes: -1,
    },
  };
  expect(baselinePreflight(updatedPair, [10_000, 0])).toBeNull();
});

it("accepts null optional CPU and nonnegative percentages above 100", () => {
  const darwin = baselineFrom(
    report([
      makeRun({ platform: "darwin", arch: "arm64", scrollbackLines: 10_000 }),
      makeRun({ platform: "darwin", arch: "arm64", scrollbackLines: 0 }),
    ]),
    "c".repeat(40),
    "darwin-arm64",
  );
  const optionalCpu = updateFirstRepetition(darwin, (repetition) =>
    withCpuValue(repetition, null),
  );
  expect(
    baselinePreflight(
      {
        ...optionalCpu,
        extensionRuntime: {
          ...optionalCpu.extensionRuntime!,
          cpuPercentOneCore: null,
        },
      },
      [10_000, 0],
    ),
  ).toBeNull();

  const highCpu = updateFirstRepetition(syntheticBaseline(), (repetition) =>
    withCpuValue(repetition, 175),
  );
  expect(
    baselinePreflight(
      {
        ...highCpu,
        extensionRuntime: {
          ...highCpu.extensionRuntime!,
          cpuPercentOneCore: 250,
        },
      },
      [10_000, 0],
    ),
  ).toBeNull();
});
