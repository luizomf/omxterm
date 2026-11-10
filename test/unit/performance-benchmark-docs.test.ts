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

describe("performance benchmark documentation", () => {
  it("names every registered profile and the code that owns the values", () => {
    expect(section.length).toBeGreaterThan(600);
    for (const profile of Object.values(PERFORMANCE_BENCHMARK_PROFILES))
      expect(
        section,
        `docs/development.md must name the ${profile.key} profile`,
      ).toContain(profile.key);
    expect(section).toContain("PERFORMANCE_BENCHMARK_PROFILES");
    expect(section).toContain("--fail-on-invalid");
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
