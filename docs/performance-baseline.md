# Memory-first performance comparison

This opt-in, reporting-only workflow compares an identified baseline and candidate
on the **same idle native desktop**. It is not part of `npm test`, a RAM budget,
a leak detector, a release gate, or a claim about total application consumption.
Run it on an idle desktop, not inside the terminal being measured, and don't run
other graphical tests, builds or workloads at the same time. See
[side effects on your desktop](development.md#side-effects-on-your-desktop).

The [initial Ubuntu calibration](performance-calibration.md) retains raw
normal/normal/control results, demonstrates large-cost sensitivity, and explains
why small separated ranges are not automatic regression verdicts.

## Small initial scope

Reuse #317's `depthRenderingFixture`: production Terminal Tabs, Restty Surface,
Ghostty WASM and Electron Adapter with a synthetic bridge, bundled fonts at 16px,
line height 1, ligatures enabled and zero padding. An 800×500 content window stays
visible, at the desktop's actual DPR. Each phase selects every retained Surface
and writes 120 fixed text lines, then checks nonblank real WebGL output:

1. **one**: one warm Surface, after its first output (not cold application startup).
2. **three**: three live tabs, two hidden after each selection settles.
3. **closed**: close back to the original Surface and write again.

The original fixture records drawings, geometry, pixel hashes and session-close
state. No shell, PTY child, user configuration, native font discovery, extension,
image preview or complete application host participates. Thus these are **Surface
host process costs**, not total OMXTerm or terminal-workload costs. The harness
itself, pixel readback buffers and font/driver caches contribute to these values.
A higher final one-tab sample is not proof of a leak or synchronous reclamation.
There is no forced GC, memory pressure, renderer pause or reduced DPR.

Why this scope: #290/PR #291 found real font ownership/retention defects, but its
macOS post-GC RSS/CDP numbers and unestablished older ~100MB build are not budgets
or comparable baselines here. #316's actual hidden-draw elimination had mixed
short CPU samples, not a stable CPU-saving claim. #317 established removal of an
unused depth attachment and preserved rendering, not measured RAM savings. Its
small 1→3→1 fixture is reusable without replaying the larger scrollback/native
input/image suites. Their functional coverage remains unchanged. Historical
reports are available in Git at `b68e249:docs/hidden-rendering-evidence.md` and
`9067f1a:docs/webgl-depth-evidence.md`, and in PRs #291, #318 and #319.

## Commands

Install locked dependencies (`npm ci`) in each clean, committed checkout on the
same guest. Run from its repository root. The environment label is a nonprivate
identifier for the **same machine/VM configuration**, not merely an OS name.
Create the parent `.scratch` first; each output directory must be new.

```sh
mkdir -p .scratch
node scripts/performance/run.mjs .scratch/perf-baseline lab-a normal
# In the candidate checkout, with the same fixture/protocol:
node scripts/performance/run.mjs .scratch/perf-candidate lab-a normal
node scripts/performance/compare.mjs \
  /path/to/baseline/results.json .scratch/perf-candidate/results.json \
  .scratch/comparison
```

The runner performs **three serial fresh-process repetitions**, each with an
isolated profile and a 60-second internal / 70-second supervisor deadline. The
existing native-fixture supervisor owns and joins process/profile cleanup.
Failure, timeout or unresolved cleanup stops the set; partial sets are not valid
comparisons. Keep execution and settlement receipts locally for diagnosis; they
may contain private paths. No profiling port is opened. Linux uses the project's
X11/no-sandbox policy; desktop prerequisites are in [development](development.md).
Keep outputs under the checkout's `.scratch` so the bundled supervisor runner can
resolve installed Node dependencies. Other platforms require fresh native
qualification; a command existing does not establish their measurements.

For older source without this harness, copy the identical `scripts/performance/`
and `test/fixtures/performance-renderer.ts` files to a dedicated branch, commit
that harness-only addition and record original/product and harness-added SHAs.
Do not alter older product code to make it pass. The reused fixture files must
also match; otherwise comparison reports non-comparability. Keep each checkout's
own lockfile/runtime preparation. A changed runtime, geometry, GPU or environment
requires separate calibration rather than cross-environment percentages.

## Metrics and reports

`results.json` records exact Git commit/tree, lockfile and fixture hashes, compiled
bundle hashes, Electron/Chromium/Node, OS/architecture/CPU/GPU, content geometry,
DPR, workload evidence and individual process snapshots. Build hashes distinguish
the actual bundled product input even where source versions differ. Raw results
are written after each settled repetition. Review raw results for private
metadata before publishing; never publish the raw supervisor receipts blindly.

Memory is Electron `app.getAppMetrics().memory.workingSetSize` in KiB, reported as
MiB (1024 KiB). **Browser/main, Tab/renderer and GPU stay separate**, not summed:
shared pages can be counted in multiple processes. This is not macOS footprint,
JS heap, WASM allocation, GPU-resident memory or an exclusive physical byte count.
Unavailable/zero metrics, missing roles or process replacement make a comparison
non-comparable. Other Electron helper roles remain in the raw result but are not
silently included in an application total.

Each phase records an immediate snapshot and three further snapshots at nominal
one-second spacing. The memory summary per repetition is the median of those
three later samples. CPU uses the same exact process's cumulative CPU seconds:

- `idleCpuPercentOneCore`: delta from immediate to final snapshot divided by
  actual elapsed seconds; one fully busy core is 100%. This includes live
  rendering and measurement overhead, not just terminal work.
- `workloadCpuSeconds`: delta around the whole phase, including tab lifecycle,
  fixed output, rendering, readback and hashing. It is not output throughput or
  physical presentation latency. No additional responsiveness metric is justified
  by this fixture.

The comparison emits JSON and Markdown with repetition medians, observed min–max
ranges and absolute deltas. JSON also includes relative deltas (null for a zero
baseline). Three repetitions are a small initial noise sample, **not a confidence
interval**. Nonoverlapping ranges are an investigation signal, not statistical
proof of attribution; overlapping ranges do not prove equivalence. Comparability
checks cover every repetition, runtime/environment, fixture, geometry and GPU.
Source/bundle/lock differences are retained as candidate provenance, not hidden by
silently rebuilding the baseline. VM contention, host load, thermal state and
cache order cannot be fully detected automatically: record them in the report.

## Calibration and normal review

First collect two normal sets on unchanged source, then one explicit positive
control, serially with the same environment label:

```sh
node scripts/performance/run.mjs .scratch/perf-repeat lab-a normal
node scripts/performance/run.mjs .scratch/perf-control lab-a control
node scripts/performance/compare.mjs .scratch/perf-baseline/results.json \
  .scratch/perf-repeat/results.json .scratch/noise
node scripts/performance/compare.mjs .scratch/perf-baseline/results.json \
  .scratch/perf-control/results.json .scratch/sensitivity
```

The control retains and touches **128 MiB in the renderer** and spends 200ms
busy in that renderer after each nominal sample interval. It is fixture-only,
labelled calibration, and never production code. Its measured working-set/CPU
delta need not equal the injected byte/time amounts because other allocations,
sampling and scheduling remain real. This verifies that the measurement can
separate a substantial persistent cost from observed normal variation; it does
not calibrate small-regression sensitivity or prove a product regression.

Use this workflow when reviewing resource-relevant changes (Surface lifetime,
fonts, rendering, retained tabs), or when a concrete report warrants it—not every
unit-test run. Attach the concise comparison and retain raw results. Inspect
separated memory/CPU ranges and large overlaps with broad variance; check load,
workload validity and like-for-like provenance before attributing a cost. Use a
focused experiment or profile for a credible signal rather than rerunning until
green. If ordinary unchanged-source variation defeats the signal, report that
calibration limitation and improve the measurement before setting alert budgets.

There is deliberately no automatic numeric pass threshold yet. The initial
signal is actionable review evidence, not a permanent ignored dashboard. Improve
confirmed implementation regressions where practical. When a feature has an
unavoidable material cost, record its benefit/cost and obtain the product decision
when needed. An accepted baseline update retains the **previous results, exact
source, comparison and rationale**; it never erases the unfavorable comparison.
Measurement runs do not authorize releases or automatic feature removal.
