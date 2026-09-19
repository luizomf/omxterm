# Hidden Terminal Surface rendering — issue 316

## Reproduction and correction

Baseline: `d884de730bab7cc1a78bb900dfa0a938a89c7fe6`, runtime SHA-256
`e0d54804ec53ada4692691394852eb1f18e82a223283fe26e3ee2117ccd609ad`.
Candidate: the source containing this document, corrected runtime SHA-256
`17def10ec435cb5ba194b7c142433a1f550d6b9e25cac3d8d16b295c6199d250`.
The Ghostty artifact is unchanged. [Machine-readable evidence](evidence/issue-316-hidden-rendering.json)
records both executions and fixture source digests.

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
its intentional batching. Restty's existing output-filter cursor hint can retain
a pre-resize row for a subsequent CPR query; this change does not modify that
separate behavior. Cursor **pixels** and render geometry, not that hint, establish
first-presentation correctness here.

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

## Reproduce

```sh
npm ci
OMXTERM_HIDDEN_EVIDENCE=/absolute/path/after.json \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
npm run lint
npm run check:portable
npm run package:mac
npm run package:verify
```

For the baseline, extract the exact base with `git archive` into an owned
operating-system temporary directory (not a new worktree). Copy the current
`restty-hidden-*.ts`, `restty-scrollback-renderer.ts` and
`restty-scrollback-rendering.test.ts` fixtures into that copy, install its own
lockfile dependencies, and run the same evidence command. New assertions are
expected to fail; JSON is written before assertions. Do not run another native
fixture concurrently. Use only generated fixtures and isolated profiles; never
point this procedure at an installed user application or private Terminal Payload.

Dependency preparation accepts only reviewed original/prior/current digests,
checks every replacement and verifies the final digest before writing. Running
it again is byte-idempotent. The emoji experiment guard and dependency contract
test use the same corrected runtime digest; historical evidence remains unchanged.
No release version or durable architecture decision changes in this bug fix.
