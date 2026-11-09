import { describe, expect, it } from "vitest";
import {
  acceptedReport,
  makeRun,
  report,
} from "../fixtures/performance-benchmark-synthetic";
import {
  baselineFrom,
  recordingRefusal,
} from "../fixtures/performance-benchmark-baseline";
import {
  integrityIssues,
  blockingIssues,
} from "../fixtures/performance-benchmark-integrity";

// Recording is how the reference is created, so its rules are asserted without
// a native run: an uncommitted tree, an invalid run and an unrequested
// replacement are the three ways a reference could become a lie.

const accepted = acceptedReport();
const healthy = blockingIssues(
  integrityIssues(accepted, {
    expectedRepetitions: 1,
    expectedStreams: 3,
    baselinePresent: false,
    compared: false,
    replacing: false,
    skipReasons: [],
  }),
).map((issue) => issue.code);

describe("baseline recording rules", () => {
  it("accepts a first recording of a valid observation", () => {
    expect(
      recordingRefusal({
        cleanTree: true,
        blockingIssueCodes: healthy,
        baselineExists: false,
        replace: false,
      }),
    ).toBe(null);
  });

  it("refuses an uncommitted tree", () => {
    expect(
      recordingRefusal({
        cleanTree: false,
        blockingIssueCodes: [],
        baselineExists: false,
        replace: false,
      }),
    ).toContain("commit tracked changes");
  });

  it("refuses a run with blocking integrity issues", () => {
    const short = report([
      makeRun({ scrollbackLines: 10_000, streamFound: false }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const blocked = blockingIssues(
      integrityIssues(short, {
        expectedRepetitions: 1,
        expectedStreams: 3,
        baselinePresent: false,
        compared: false,
        replacing: false,
        skipReasons: [],
      }),
    ).map((issue) => issue.code);
    expect(blocked).toContain("stream-incomplete");
    expect(
      recordingRefusal({
        cleanTree: true,
        blockingIssueCodes: blocked,
        baselineExists: false,
        replace: false,
      }),
    ).toContain("not a valid observation");
  });

  it("requires --replace for an existing baseline", () => {
    expect(
      recordingRefusal({
        cleanTree: true,
        blockingIssueCodes: [],
        baselineExists: true,
        replace: false,
      }),
    ).toContain("--replace");
    expect(
      recordingRefusal({
        cleanTree: true,
        blockingIssueCodes: [],
        baselineExists: true,
        replace: true,
      }),
    ).toBe(null);
  });

  it("records every repetition of every family", () => {
    const multi = report(
      [],
      [
        [
          makeRun({ scrollbackLines: 10_000 }),
          makeRun({ scrollbackLines: 10_000 }),
        ],
        [makeRun({ scrollbackLines: 0 }), makeRun({ scrollbackLines: 0 })],
      ],
    );
    const baseline = baselineFrom(multi, "c".repeat(40), "linux-arm64");
    expect(baseline.profileKey).toBe("linux-arm64");
    expect(baseline.repetitionsRequested).toBe(2);
    for (const variant of Object.values(baseline.variants)) {
      expect(variant.repetitions.map((repetition) => repetition.index)).toEqual(
        [1, 2],
      );
      for (const repetition of variant.repetitions) {
        expect(Object.keys(repetition.steps).sort()).toEqual([
          "one",
          "six",
          "three",
        ]);
        expect(
          repetition.streams.every((stream) => stream.rates.length === 3),
        ).toBe(true);
      }
    }
  });
});
