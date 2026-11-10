import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERFORMANCE_BENCHMARK_PROFILES } from "../fixtures/performance-benchmark-report";
import { LIMITATIONS } from "../fixtures/performance-benchmark-summary";

// The document is the contract a maintainer reads. It must name the profiles,
// point at the code for values, and state what the tool does not prove; the
// report prints the same limitation list and the test keeps them aligned.
const document = readFileSync(path.resolve("docs/development.md"), "utf8");
const start = document.indexOf('<a id="performance-regression-benchmark"></a>');
const end = document.indexOf('<a id="interruption-regressions"></a>');
const section = document.slice(start, end);
const historicalRecording = readFileSync(
  path.resolve("docs/evidence/performance-830/recording-linux-arm64.md"),
  "utf8",
);

describe("performance benchmark documentation", () => {
  it("names every registered profile and the code that owns the values", () => {
    expect(section.length).toBeGreaterThan(600);
    for (const profile of Object.values(PERFORMANCE_BENCHMARK_PROFILES))
      expect(
        section,
        `docs/development.md must name the ${profile.key} profile`,
      ).toContain(profile.key);
    expect(section).toContain("PERFORMANCE_BENCHMARK_PROFILES");
    for (const option of [
      "--record",
      "--replace",
      "--fail-on-invalid",
      "--truncate-stream",
    ])
      expect(section).toContain(option);
    expect(section.replace(/\s+/gu, " ")).toContain(
      "positional values, empty arguments, delimiters and malformed forms are rejected",
    );
    expect(section).toContain(
      "diagnostic identifies argument positions and supported options without echoing",
    );
  });

  it("states that the benchmark reports and does not judge", () => {
    expect(section).toMatch(/does\s+not\s+(decide|judge)/iu);
    expect(section).toContain("no threshold");
    expect(section).not.toMatch(/structural invariants? (run|gate)/iu);
  });

  it("documents per-process extension-runtime memory integrity and signed growth", () => {
    const normalized = section.replace(/\s+/gu, " ");
    expect(normalized).toContain(
      "per-process absolute-byte value in every `RawRuntimeRun` sample",
    );
    expect(normalized).toContain("nonnegative safe integer");
    expect(normalized).toContain(
      "after the platform memory reader has produced its per-process byte values",
    );
    expect(normalized).toContain(
      "do not validate the original OS output before reader processing",
    );
    expect(normalized).toContain("both runtime memory values unavailable");
    expect(normalized).toContain("extension-runtime-incomplete");
    expect(normalized).toContain("idle/runtime growth");
  });

  it("publishes the properties a reader needs to predict a miss", () => {
    expect(section).toContain("uniform");
    expect(section).toContain("idle window");
    expect(section).toContain("repaint counter");
    expect(section).toContain("linux-arm64");
    expect(section).toMatch(/per\s+repetition/iu);
  });

  it("discloses the quiescence observer effect and scoped timing", () => {
    const normalized = section.replace(/\s+/gu, " ");
    expect(normalized).toContain(
      "Idle CPU readings are collected over the interval bracketed by the before/after quiescence probes",
    );
    expect(normalized).toContain(
      "After sampling and the final probe, the fixture compares the probes for unchanged PTY output bytes and grid",
    );
    expect(normalized).toContain(
      "a failed comparison is reported as `quiescence-not-verified` and makes `--fail-on-invalid` exit non-zero",
    );
    expect(normalized).toContain(
      "probeActivity()` calls `surfaces()` and reads visible Surface geometry before the `observerCostMs` timer starts",
    );
    expect(normalized).toContain("Restty's `updateSize(true)`");
    expect(normalized).toContain("snapshot/refit is outside `observerCostMs`");
    expect(normalized).toContain("later work, including `textHash`, is timed");
    expect(normalized).toContain(
      "magnitude and attribution to prior observations are unknown",
    );
    expect(normalized).toContain(
      "historical recordings are not automatically invalidated",
    );
    expect(normalized).toContain(
      "instrumented WebGL `draw*`/`clear` calls, not complete frames or presentation",
    );

    const reportLimitation = LIMITATIONS.find((limitation) =>
      limitation.startsWith(
        "The quiescence snapshot reads visible Surface geometry",
      ),
    );
    expect(reportLimitation).toBeDefined();
    expect(reportLimitation).toContain(
      "The snapshot/refit is excluded from `observerCostMs`",
    );
    expect(reportLimitation).toContain(
      "while later observer work (including `textHash`) is timed",
    );
    expect(reportLimitation).toContain(
      "This may contribute to idle work in sampled windows",
    );
    for (const phrase of [
      "`observerCostMs`",
      "`updateSize(true)`",
      "`textHash`",
      "attribution to historical observations are unknown",
      "`draw*`/`clear`",
      "not complete frames",
    ])
      expect(reportLimitation).toContain(phrase);
  });

  it("qualifies the retained historical Linux measurements", () => {
    const normalized = historicalRecording
      .replace(/^> ?/gmu, "")
      .replace(/\s+/gu, " ");
    expect(normalized).toContain(
      "Later review found that the quiescence snapshot reads visible Surface geometry before `observerCostMs` starts",
    );
    expect(normalized).toContain(
      "`draws` values count instrumented WebGL `draw*`/`clear` calls, not complete frames",
    );
    expect(normalized).toContain(
      "The contribution of this observer-induced resize/refit work to these observations is unknown",
    );
    expect(normalized).toContain(
      "historical values are retained and not automatically invalidated",
    );
  });

  it("keeps the limitation topics in the code and the document aligned", () => {
    // Identical sentences would drift in wording; the topics must not.
    const topics: ReadonlyArray<[string, RegExp]> = [
      ["run-to-run spread", /Run-to-run variation/iu],
      ["uniform per-tab leak", /uniform per-tab leak/iu],
      ["idle window resolution", /idle window is about 12\s?s/iu],
      ["repaint counter", /repaint counter/iu],
      ["extension runtime is one observation", /single observation/iu],
      [
        "only linux-arm64 has a baseline",
        /Only `linux-arm64` has a recorded baseline/u,
      ],
      ["fixed workload", /workload is fixed/iu],
      ["no verdict", /no threshold/iu],
    ];
    for (const [label, pattern] of topics)
      expect(section, `docs must state ${label}`).toMatch(pattern);
    expect(LIMITATIONS.length).toBeGreaterThanOrEqual(8);
  });
});
