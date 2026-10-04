# Hidden Terminal Surface rendering — issue 316

## Status

Historical #316 comparison and post-review verification, not current release
qualification. The hidden-rendering correction remains in production, while
runtime, fixtures and package inputs have evolved. Measurements, failures and
PASS results below retain their original scope. Current guidance lives in the
[spec](spec.md), [development guide](development.md) and
[release procedure](release.md).

## Reproduction and correction

Baseline: `d884de730bab7cc1a78bb900dfa0a938a89c7fe6`, runtime SHA-256
`e0d54804ec53ada4692691394852eb1f18e82a223283fe26e3ee2117ccd609ad`.
Reviewed candidate: `29e92318509a868ea999ce9339617416de383493`, runtime SHA-256
`17def10ec435cb5ba194b7c142433a1f550d6b9e25cac3d8d16b295c6199d250`.
Final corrected runtime SHA-256:
`dafd11ff8e1dba44c5d9f1429b895c00cde2cdbe3d6c971db9938c046b18c0be`.
The Ghostty artifact is unchanged. [Machine-readable comparison](evidence/issue-316-hidden-rendering.json)
records the baseline and reviewed-candidate executions and fixture source digests.
The table below refers to that comparison. Separate
[post-review verification](evidence/issue-316-review-verification.json) records
the final runtime, including synchronized-output presentation.

The native scrollback fixture now also drives production Terminal Tabs, Surface
mounting, and the Electron Adapter with a synthetic bridge. It counts real
WebGL calls per canvas. Fixture-only bundle instrumentation separately counts
Restty loop callbacks and snapshots the geometry passed to drawing. None of this
instrumentation enters the application build. The existing host fixture covers
the real main/preload IPC and PTY flow-control path; this synthetic bridge does
not substitute for that native coverage.

Baseline failed the new assertions: hidden frames drew/uploaded, hidden zoom
resized the retained grid, and tab selection returned with a 1400-pixel canvas
inside a 960-pixel target. Hidden image cleanup also depended on later drawing.
The candidate gates frame work using a Surface-owned visibility callback and
refreshes synchronously after selection refits. It retains RAF scheduling,
synchronous ingestion and core ownership. The grid helper now also ignores
hidden font updates after initial grid creation. This extends, rather than
replaces, the zero-size guard from #275/#276; scroll anchoring remains disabled
as established by #290/#291.

Hidden frames and hidden output clear disposable Kitty renderer caches,
including pending decode identities. This avoids a second core-resource
introspection API or parser: valid core images survive and are copied again on
reveal. Deletion/reset/alternate exit run normally even if no draw follows.

## Native measurements

Recorded on macOS 27.0 (26A428), Apple M1 Max, ARM64, Node 24.15.0,
Electron 43.1.1 / Chromium 150.0.7871.114. The document was visible at DPR 2.
The painting window was shown without native activation. Two Surfaces used
bundled fonts at 16 CSS px, zero padding, and an initial 700 × 440 native window.
The hidden canvas retained 1400 × 816 backing pixels; the selected canvas was
1400 × 752 after the tab strip appeared. The browser's compatibility user-agent
string says Intel/macOS 10.15; it is not the native architecture/OS identity.

Both executions use 60 intervals of 25 ms per phase. Idle has no output;
synthetic output submits 20 numbered lines to **each** Surface per interval:
1200 lines per Surface. A 300 ms setup delay excludes the runtime's 180 ms
resize-active grace from idle measurement. There is **no settling delay after
reveal**. The matched protocol, not an exact timer deadline, defines each phase.

| Phase  | Source | Elapsed ms | Hidden RAF | Hidden clears / draws / buffer uploads / texture uploads | Visible clears / draws | Renderer CPU seconds |
| ------ | ------ | ---------: | ---------: | -------------------------------------------------------- | ---------------------- | -------------------: |
| Idle   | Before |     1563.3 |        187 | 3 / 6 / 6 / 0                                            | 3 / 6                  |             0.125396 |
| Idle   | After  |     1561.3 |        187 | 0 / 0 / 0 / 0                                            | 3 / 6                  |             0.138038 |
| Output | Before |     1572.5 |        188 | 62 / 186 / 188 / 10                                      | 62 / 186               |             0.503997 |
| Output | After  |     1580.2 |        190 | 0 / 0 / 0 / 0                                            | 61 / 183               |             0.433070 |

Draws aggregate the four instrumented draw entry points; buffer uploads aggregate
`bufferData` and `bufferSubData`, and texture uploads aggregate `texImage2D` and
`texSubImage2D`. Raw evidence preserves individual calls, both Surfaces' RAF
counts and the independent observer RAF count. Hidden initialization still makes
three `bufferData` allocation calls to create its WebGL backend; it makes no
frame clear/draw, glyph/Kitty texture upload or instance-data upload. These
initial backend allocations are not recurring render work.

CPU is the delta of Electron `app.getAppMetrics()` Tab-process
`cpu.cumulativeCPUUsage`, in CPU seconds, across the renderer measurement call.
It includes both Surfaces, ingestion, shaping, browser work and test probes—not
just the hidden Surface or the GPU. It excludes separate GPU/main-process CPU.
The after idle CPU sample was **higher**; the output sample was lower. These
short, instrumented samples establish no stable percentage CPU improvement.
RAF counts are scheduling evidence, not CPU measurements. GPU time, total RSS,
core memory and driver allocations are not measured, and there is no RAM-saving
claim, performance quota, fixed CPU target or reason here to suspend RAF.

## Regression observations

- Actual tab selection hides the first Surface; idle/output produce zero hidden
  clears, draws and render uploads while the selected Surface keeps drawing.
- Hidden numbered output is synchronously ACKed by the production Adapter,
  retains ordered scrollback for Select All/copy, emits one parsed title and BEL,
  and answers the cursor-position query without waiting for reveal.
- After hidden output, a native resize to 520 × 440, a 480 CSS px host constraint
  and Window Font Zoom, selection refits to 56 × 22 cells and a 960-pixel canvas
  in the **switching task**. `readPixels` observes the requested background,
  1713 foreground pixels and 578 foreground pixels in the current cursor cell.
  The canvas identity is unchanged and hidden zoom produces no PTY resize.
  The sample's 14.7 ms includes synchronous drawing and pixel readback; it is not
  a compositor latency measurement. There is no timer or subsequent frame before
  the asserted pixels. The baseline made no draw in this task and retained the
  wrong canvas/grid.
- Eight rapid selections each refresh immediately. A mount completing hidden
  performs no frame work; live size/padding/ligature/scrollback/Option changes
  preserve it. Hidden close and pending-mount close terminate ownership; the
  disposed canvas receives zero later RAF callbacks and another tab accepts input.
- Bounded generated 8 × 8 PNG and 1 × 1 Chafa RGBA render on immediate reveal and
  survive another hidden-output/reveal cycle with the same colored pixel counts.
  Image-ID, all-image and all-placement deletion, reset, alternate-buffer exit
  and disposal release cached textures without hidden clears; deleted images
  do not reappear. Existing image-core and native host fixtures retain bounds,
  malformed-input, placement, real-PTY and geometry coverage.

The fixture measures drawing-buffer correctness before Chromium can present,
not a physical display scanout or native focus transition. It does not validate
Linux/Windows native GPU behavior. Existing synchronous-output mode still owns
its intentional batching. The recorded Restty output-filter cursor hint could
retain a pre-resize row for a subsequent CPR query; #316 did not modify that
separate behavior. Audit
[#566](https://github.com/luizomf/omxterm/issues/566) subsequently recorded
actual-core/reply disagreement for Unicode and resize sequences in the prepared
runtime. This is a separate current limitation, not proof of a hidden-rendering
failure or a reason to reinterpret this experiment's results. Cursor **pixels**
and render geometry, not CPR accuracy, establish first-presentation correctness
here.

## Review correction

Independent review identified unconditional canvas dimension assignments during
forced refitting as a risk to the retained presentation during synchronized
output. The coordinator added a native regression that begins a batch, switches
away and back, restores focus, and reads pixels in the same task. It verifies
zero frame clears during the batch, unchanged prior pixels, and current pixels
after the batch ends. The reviewed candidate already passed this pixel test on
this macOS/Chromium backend: blanking was **not reproduced** here, so the
source-level concern is not reported as an observed failure.

The final correction avoids assigning unchanged canvas dimensions while still
forcing grid recomputation for font changes. It removes the questionable reset
side effect without bypassing synchronized-output batching. The same regression
passes on the final runtime, alongside hidden-rendering and first-presentation
coverage. Linux/Windows behavior remains unverified rather than inferred from
this host. Final preparation was restored with a fresh `npm ci` and verified
byte-idempotent twice.

## Verification

The candidate passed `npm run lint` and `npm run check:portable`: formatting,
type-aware lint, typecheck, 81 test files passed / 3 skipped, 813 tests passed /
12 skipped, and build. This includes native Electron tab/scrollback/image/host
fixtures, core bounds tests, and dependency drift/idempotence coverage.
A fresh task-owned `npm ci` followed by two preparation runs produced the same
corrected digest. The existing installation audit reports four dependency
vulnerabilities (two moderate, two high); dependency upgrades are outside #316.

On this ARM64 macOS host, `npm run package:mac` produced the development DMG and
`npm run package:verify` reported `FULL` packaged ARM64 startup verification
against the generated `release/mac-arm64/OMXTerm.app`. No installed user app was
launched or changed. This is the repository's generated-app verification, not a
claim of owner acceptance or additional mounted-DMG testing. Linux/Windows native
checks were not run on this macOS host. No publication, release version, tag or
owner acceptance is implied.

## Current re-evaluation

With the [native prerequisites](development.md#platform-prerequisites) satisfied,
run from the current checkout, serially with other native fixtures:

```sh
npm ci
mkdir -p .scratch
OMXTERM_HIDDEN_EVIDENCE="$PWD/.scratch/hidden-current.json" \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
```

Use a fresh evidence filename and retain the new source/runtime identities
separately. This collects current fixture evidence, not the historical before/
after comparison or package qualification. Use only generated fixtures and
isolated profiles, never an installed user application or private Terminal Payload.

Reconstructing the historical baseline requires the recorded base and matching
candidate fixture bytes identified in the comparison JSON. Current fixtures have
evolved; copying them into the old baseline is not the recorded experiment.
Historical failing assertions remain failures; JSON was written before assertions.

Dependency preparation accepts only reviewed original/prior/current digests,
checks every replacement and verifies the final digest before writing. Running
it again is byte-idempotent. The emoji experiment guard and dependency contract
test use the same corrected runtime digest; historical evidence remains unchanged.
No release version or durable architecture decision changes in this bug fix.
