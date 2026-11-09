# Performance benchmark evidence (#830)

Measured on a disposable Linux ARM64 guest, profile **linux-arm64** (machine
class `linux-arm64-4cpu-virtualized`, Electron 43.8.1, Chromium 150.0.7871.250,
virtualized GPU). The host is not identified further on purpose; see
[the benchmark contract](../../development.md#performance-regression-benchmark).

The current baseline recording measured clean source
`573eb96de4a620b2106ad1eb00d98aa163682b6e` with schema 5. It replaces the
schema-4 baseline, which was measured from
`7612bedfb663e1802cb1286b665c1ffdb3522948` and recorded in commit
`3bec42253b9af2f66b831c27facff42bb99a401d`. The two historical comparison
summaries predate the schema-5 timing and CPU corrections and are not evidence
for those corrected measurements.

**This benchmark measures and reports. It does not gate regressions.** There is
no threshold, no pass and no fail in any file below. Each repetition is printed
individually; where a median appears it is labelled as the median of the printed
repetitions. Both the recording command and the negative integration-test
command exited zero; the latter asserted invalid observations. No invocation of
the `--fail-on-invalid` CLI exit branch is claimed by these receipts.

The baseline records three fresh repetitions per variant; the negative test uses
one. Each stream axis prints three stream repetitions. Steady memory reads start
after explicit renderer collection (`--js-flags=--expose-gc`).

For the current recording, from the clean source above:

```sh
npm run build
npm run perf:baseline -- --replace
```

The recording command exited 0; all six application repetitions and the runtime
reported exit 0, no signal, no cleanup errors and no cleanup assistance. Raw
per-repetition observations and the supervisor receipts are retained privately.
Later completeness checks were applied by re-deriving and reprojecting the
retained raw samples: numerical observations matched the recorded report, and
no blocking issue was found. The baseline includes the added completeness fields.
Final admission corrections additionally checked sample chronology and configured
minimum spans, matched observed focus/visibility to CPU scenario names, validated
optional CPU counters and refused multi-process aggregates for non-additive
metrics. Replaying the retained raw samples passed these checks without changing
numerical observations or the committed baseline. The final producer also removes
unused aggregate stream-rate fields and waits for the requested visible focus
state before CPU sampling; that new readiness guard was not natively rerun.
The retained summaries reflect the recording-time generator, not a fresh run.
The schema-4 report and repeat remain historical observations; they have not been
regenerated under schema 5.

| File                            | Run                                   | Result                                     |
| ------------------------------- | ------------------------------------- | ------------------------------------------ |
| `recording-linux-arm64.md`      | Schema-5 baseline recording           | No blocking integrity issue; exit 0        |
| `report-linux-arm64.md`         | Historical schema-4 report            | Compared; no blocking integrity issue      |
| `report-repeat-linux-arm64.md`  | Historical schema-4 repeat            | Compared; no blocking integrity issue      |
| `invalid-stream-linux-arm64.md` | Schema-5 native truncated-stream test | 18 `stream-incomplete` issues; test exit 0 |

## Historical observations

The historical comparison summaries contain the original measured rows; their
comparison tables each contain 128 rows. Read the original numbers there rather than from a
second manually transcribed inventory. Their limitations were corrected, while
other labels and measurements reflect the older generator, not schema-5 semantics.

## The invalid run

The native integration test injected quarter-sized payloads, causing marker
observation to time out. With one repetition per variant it reported 18 blocking
`stream-incomplete` issues (three streams × three payloads × two variants), and
all six missing-rate comparison rows show unavailable values and `0/3` counts.
The test command exited 0 after asserting that actual fault path; it did not run
the `--fail-on-invalid` CLI. Re-derivation after the completeness corrections
matched the numerical report and retained the same 18 incomplete streams. The test-only repetition change followed the measured
source commit; the measurement fixture was unchanged:

```sh
OMXTERM_TEST_PERFORMANCE_BENCHMARK=1 npm test -- test/integration/performance-benchmark.test.ts -t "rejects a short payload"
```

## What this evidence does not show

Absolute budgets for other machines; macOS, Windows or Linux x64 qualification;
presentation latency; attribution of a uniform per-tab leak; growth slower than
the 12-second window; and extension-runtime cost beyond one observation. Spread
is descriptive, not a detection threshold.
