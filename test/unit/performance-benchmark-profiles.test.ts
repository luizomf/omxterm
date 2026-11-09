import { describe, expect, it } from "vitest";
import {
  acceptedReport,
  makeRun,
  report,
} from "../fixtures/performance-benchmark-synthetic";
import {
  PERFORMANCE_BENCHMARK_PROFILES,
  profileFor,
} from "../fixtures/performance-benchmark-report";
import {
  baselineFrom,
  comparability,
} from "../fixtures/performance-benchmark-baseline";

// The metric is per platform and only linux-arm64 carries a recorded baseline.
// A comparison from another platform's file must be refused rather than printed
// beside numbers it cannot be compared with.

const linux = acceptedReport();
const linuxBaseline = baselineFrom(linux, "c".repeat(40), "linux-arm64");

describe("platform profiles", () => {
  it("declares the platform memory metric for every registered profile", () => {
    expect(PERFORMANCE_BENCHMARK_PROFILES["linux-arm64"]).toMatchObject({
      key: "linux-arm64",
      baselineFile: "baseline.linux-arm64.json",
    });
    expect(PERFORMANCE_BENCHMARK_PROFILES["linux-x64"]!.metric.name).toBe(
      "pss",
    );
    expect(PERFORMANCE_BENCHMARK_PROFILES["darwin-arm64"]!.metric.name).toBe(
      "phys_footprint",
    );
    expect(PERFORMANCE_BENCHMARK_PROFILES["win32-arm64"]!.metric.name).toBe(
      "private_bytes",
    );
    expect(PERFORMANCE_BENCHMARK_PROFILES["win32-x64"]!.metric.name).toBe(
      "private_bytes",
    );
  });

  it("prints nothing beside a baseline recorded on another platform", () => {
    const windows = report([
      makeRun({ scrollbackLines: 10_000, platform: "win32", arch: "arm64" }),
      makeRun({ scrollbackLines: 0, platform: "win32", arch: "arm64" }),
    ]);
    const comparison = comparability(windows, linuxBaseline, "win32-arm64");
    expect(comparison.comparable).toBe(false);
    expect(comparison.reasons.join("\n")).toContain("metric private_bytes");
    expect(comparison.reasons.join("\n")).toContain(
      "baseline profile linux-arm64",
    );
  });

  it("falls back to an unnamed profile for an unregistered platform", () => {
    const profile = profileFor("freebsd", "arm64");
    expect(profile.key).toBe("freebsd-arm64");
    expect(profile.baselineFile).toBe("baseline.freebsd-arm64.json");
  });
});
