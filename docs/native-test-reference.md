# Native subsystem fixture reference

This reference details focused native subsystem fixtures, their prerequisites, and evidence boundaries. Start with the [native development prerequisites](development.md#platform-prerequisites) and [focused commands](development.md#focused-checks). Follow the [graphical test precautions](development.md#running-native-tests): use an unlocked, logged-in desktop with WebGL2 support, leave the mouse and keyboard idle, do not resize or switch windows, and run only one graphical suite at a time per desktop.

For fixture ownership and cleanup, see [Linux packaged-wrapper controls](#linux-packaged-wrapper-controls), [supervised PTY acquisition](#supervised-pty-acquisition), and [Windows cleanup diagnostics](#windows-cleanup-diagnostics). The [graphical fixture supervision overview](development.md#graphical-fixture-supervision) and its headless entry recipe remain in the development guide.

## Hosted extension view composition

On an assigned idle, unlocked Linux or macOS desktop, run the existing hosted-view
composition and native installed-version pin fixtures together:

```sh
OMXTERM_EXTENSION_VIEW_EVIDENCE_DIR=/absolute/evidence/directory npm test -- test/integration/extension-view-native.test.ts test/integration/extension-view-package-pin.test.ts
```

Use a fresh evidence directory outside disposable fixture profiles. The graphical
fixture retains captures and composition/supervisor receipts there. It exercises
two production hosted tabs, retained Settings, the same real Surface/PTY, native
field editing/clipboard routing, hide-before-overlay, packaged-resource policy,
A/B version pinning and renderer-crash retirement. The package-pin fixture uses
the real native store without opening Electron or a PTY. Both use existing
fixture preparation and lifetime infrastructure; neither enables production
macOS extension composition or changes built-in Snippets availability.

Input is synthetic Chromium/native editing API input, not physical-keyboard
qualification. Page captures do not prove OS compositor behavior. These fixtures
do not qualify packaged inclusion/signing, production application Quit or
surviving-browser main-death file-read exclusion; see
[ADR 0039](adr/0039-own-packaged-web-content-by-epoch.md).

## Host, hover and font lifecycle

The integrated host's concurrent-font phase requires actual exit callbacks from
all four removed sessions and no exit from previously live peers; aggregate
counts, DOM removal and kill requests do not prove completion. Failure snapshots
include counts and missing-target/exited-peer indices. Before fixture cleanup,
these failures also capture each target and previously live peer's spawned PID,
delivered LocalTerminalSession close calls (returned/threw), and Linux procfs
birth/start ticks plus current state/parent PID. A returned close is not proof
of signal delivery or exit. Same birth ticks identify a sampled process, not
continued liveness (a zombie may still have a stat entry); different ticks mean
PID reuse. Missing procfs entries, unreadable observations and unsupported
platforms remain explicit, not inferred callback completion or tree settlement.
No command, environment, process name or terminal payload is captured. Birth
reads may perturb timing; failure reads are synchronous and read-only, before
additional cleanup closes. The wait deadline and independent fixture settlement
still apply. Headless diagnostic and callback-order checks:
`npm test -- test/unit/restty-host-concurrent-cleanup.test.ts test/unit/restty-host-failure-state.test.ts test/unit/restty-session-diagnostic.test.ts`.
The historical Fedora timeout in [#722](https://github.com/luizomf/omxterm/issues/722)
remains unattributed and is not cleared by these checks or the later instrumented
native pass.

The hover `early-capture` negative control qualifies the rejection of an undrawn
hover generation: exact modified/`cue-not-drawn` phase, stale draw provenance,
the same actually held callback through capture, explicit release, and clean
native settlement. It does not require complete compositor bitmap equality.
A draw-call receipt is not a presentation fence; even the baseline's two frame
continuations are only a presentation opportunity. The existing positive and
release cases retain their strict destination/complement/unused-edge pixel
oracles, and the other invalidation controls retain zero-pixel checks.

Headless capture-helper/frame-hold checks cover equal/different bitmaps and a
released/current-draw counterexample:
`npm test -- test/unit/restty-hover-readiness.test.ts`.
Pixel comparison metadata remains in phase receipts. These checks establish
oracle semantics, not native compositor reproduction or all-platform qualification.
The historical bitmap variation in [#721](https://github.com/luizomf/omxterm/issues/721)
remains unexplained; correcting the equality criterion did not turn that run into
a pass. Capture, draw guards, deadlines and settlement behavior are unchanged.

The `font-read-reload` suite holds one actual main-process `FileHandle.read`
before its positional read, retaining native discovery, bounded bytes/face
validation, production preload, host, Surface and supervised PTYs. One window
retains default/A/A/B Surfaces: two A consumers share the started read while B
queues. It requires exact request/load outcomes, creation-time families/line
heights and lease names, four mounted live sessions with distinct actual start
receipts, the original healthy session identity, closed font handles and actual
native exits. Its `old-post-read` control qualifies only the fixed A-supersession
outcome after the held-read/B-queued preconditions, with default and B fulfilled
and exact counts; unrelated read errors, timeouts and cleanup failures do not
qualify. A fixture-local 60-second total scenario deadline also bounds hung
awaits inside the unchanged 90-second supervisor allowance; observed failed or
cancelled mounts fail immediately. Native exits and independent supervision are
still required, not replaced by a result marker or local timeout.

This fixture no longer checks six-child post-reload input/acknowledgement,
cancelled-sibling usability or a second disposed window. The existing real-read
headless lifetime matrix retains cancellation/disposal, admission, serialization
and genuine read-error policy coverage, not that full native usability
cross-product. Reducing the scenario does not explain or qualify a historical
native timeout. Run the native suite alone on an idle unlocked desktop with
`npm test -- test/integration/font-read-reload.test.ts`.
Headless fixture/oracle/deadline and real-read lifetime checks:
`npm test -- test/unit/font-read-reload-fixture.test.ts test/unit/terminal-font-read-reload.test.ts`.
Successful headless checks or bundle preparation are not native runtime acceptance.

## Restty host PowerShell isolation

The shared Restty host fixture disables Ctrl+V clipboard access with a typed
`Action<Nullable<ConsoleKeyInfo>, object>` no-op registered through public
`PSConsoleReadLine.SetKeyHandler`. Unlike a ScriptBlock handler, the delegate
preserves PSReadLine's console input mode: an immediate Ctrl+C must reach
`CancelLine` and generate the fresh prompt required by large-paste readiness.
History remains isolated with `SaveNothing` and a fixture-owned path; input
phases still require the executed setup marker. The readiness oracle also
requires an executed command marker, not just a prompt or observed PTY write.

Headless encoded-setup and readiness checks (not native console-mode evidence):
`npm test -- test/unit/restty-host-sessions.test.ts test/unit/restty-host-paste.test.ts`.

## Host output evidence

The paced output fixture keeps all sixteen actual Select All/Copy checks over
2 MiB of ordered records, with unchanged pacing, history/core limits and real
pause/resume. Each source workload window is one literal BEGIN, 4096 exact
32-byte records and its matching END (131,122 bytes). The reserved
`__OMXTERM_BATCH_` namespace must occur once in configured order; malformed,
duplicate, reordered or truncated framing fails without resynchronization.
Bytes inside frames are never normalized, including controls and line endings.

Outside those frames, arbitrary printable/control output is uninterpreted
transport envelope, not an ANSI allowlist or a tolerated trailer length. It is
forwarded unchanged and counted without retaining the whole envelope. Only a
bounded possible-marker prefix is carried between callbacks. Original source
bytes use each callback's UTF-8 byte length; finalized framed bytes plus envelope
bytes must equal that total. This scoped workload oracle does not identify or
validate the origin/semantics of arbitrary envelope text.

After the actual producer exits, the fixture finalizes framing and takes a fresh
session flow snapshot: every original source byte must be cumulatively ACKed and
actual pending bytes must be zero. A pre-exit snapshot or advancement of the ACK
wrapper's counter alone is insufficient.

For a deliberately failed Copy, the callback retains the actual destination
cause and copy diagnostic without sampling flow. The existing bounded copy-result
wait requires exact cumulative ACK equality with **all currently observed original
UTF-8 bytes** and actual session pending bytes zero, then captures/formats/throws
the destination rejection in that same synchronous check, before failure cleanup.
New chunks before settlement remain counted. A timeout or unavailable real flow
metadata is an accounting failure retaining the destination cause, not a qualified
destination-only negative. This snapshot is not the positive post-exit finalization.
Headless parser/core and composed producer/session/harness controls:
`npm test -- test/unit/restty-output-checkpoint.test.ts test/unit/restty-host-output-phases.test.ts`.
They do not qualify native continuation or Windows transport.

## Resize and continued-text coverage

The existing appearance/resize fixture also checks one short primary-screen,
wrap-enabled continuation on its retained host-resize Surface. It clears/homes
its controlled output, writes exactly the current columns of ASCII, changes
only the owned container width from 640 to 600 CSS px once, then crosses the
existing frame boundary. Its initial 32 px height must yield one or two rows:
Select All includes unused viewport rows, so this avoids blank-row suffixes
without normalizing copy. The existing TUI checks subsequently grow that host.
Current positive integer geometry must actually
narrow, retain rows and move the old edge off the new edge. No calibration,
replay, historical-match acceptance, tolerance or retry chooses the grid.
The short continuation must copy as exactly prefix plus suffix, without trimming
or normalization, with the same Surface/container/canvas, one Adapter start and
no close. The integration consumer checks this evidence in its existing
appearance runs. Run on an idle unlocked desktop, one graphical suite at a time:

```sh
npm test -- test/integration/restty-appearance-rendering.test.ts -t "renders theme colors and preserves configured geometry through live updates"
```

This real DOM/Restty/core/font check uses a controlled Adapter, not a native PTY,
OS clipboard paste or native-window drag. Headless preparation is not its pass.
The bundled-core reflow/CPR tests retain the history, hard-break, alternate-screen
and pending-wrap matrix; the native paced-output case separately retains real
transport/backpressure, sixteen exact copies, ACK/pending accounting and exit.

The former oversized native controlled-prefix/refit/continuation case was
retired as a coverage redesign, not made green. Its unexplained Windows progress
timeouts remain a residual native pause/resize/continuation risk. Separate core,
Surface and native-flow checks do not prove that exact combined ordering or
qualify a dependency migration by themselves.

The source-side reorder/omission controls retain only the longest suffix that
could still begin their exact mutation needle. Unrelated protocol/prompt output
is released immediately, with no timer or assumed later read. Raw source
observation precedes the single targeted mutation. Reorder preserves byte length
and must fail actual destination order at record 100; omission must first prove
fresh raw execution (not command echo), then fail response presence in that same
surviving core. Original-source ACK semantics and diagnostic deadlines are
unchanged; omission never synthesizes ACKs for removed bytes. These fixture
corrections do not establish the cause of historical native control timeouts.

## Host/oracle phase receipts

The shared Restty host fixture emits `__OMXTERM_RESTTY_HOST_PHASE__` JSON lines
with version 1, a fixed `phase`, `begin`/`complete`, wall-clock `at` and
process-local monotonic `monotonicMs`. Only source/ACK/copy checkpoint phases
carry a zero-based `checkpoint` (0–15). These synchronous, best-effort receipts
contain no terminal text, commands, titles or paths; they do not replace the
supervisor's mechanical outcome or any oracle assertion.

App readiness, load, first session, the original single native focus request,
its observed focus event, native focus predicate and DOM readiness are separate
boundaries. `dom-focus-query / complete` means the first existing renderer query
returned, even if false; only `dom-focus / complete` establishes its original
focus predicate. No extra responsiveness probe or periodic watcher is added.
An activation stall before that query says nothing about renderer responsiveness.
Output receipts cover the real producer, high-water/resume, all sixteen source,
original-ACK and copied-destination checkpoints, memory query and exit. The
D3-only calibration/continuation/resize-return trace stream was removed with its
retired scenario. No per-chunk logger, payload dump or new poller replaces it.
A contained resize failure in the owned output session still vetoes successful
settlement, including initial sizing and the later asynchronous memory/exit
boundaries. It does not replace an earlier primary source/copy/write failure or
synthesize native exit. Production fixed-category resize diagnostics and native
lifetime/cleanup ownership remain unchanged. Requested grids are not native
resize success or child consumption.

Focused output waits retain their **10-second** predicate deadline, composed
with the session's 25 ms / 120-second wait. The wrapper checks its clock before
entering the predicate. No wait or supervisor bound changed with retirement;
missing receipts alone do not establish a native mechanism.

The existing supervisor retains these lines even when its outer deadline wins
before an inner wait can report an error. Inspect unmatched entered phases and
completed phases together, including asynchronous stall completion and cleanup;
the last line alone need not identify the first failed operation. Absence of a
receipt is not success. Diagnostic sink failure is ignored, never converted to
acceptance. Deadlines, focus policy, producer pacing, backpressure and original
assertions remain unchanged. Headless ordering, privacy and real-supervisor
outer-termination controls:

```sh
node node_modules/vitest/vitest.mjs run test/unit/restty-host-window.test.ts test/unit/restty-host-phases.test.ts test/unit/restty-host-output-phases.test.ts test/unit/restty-host-phase-supervision.test.ts
```

## Auxiliary panel and shortcut capture

The `auxiliary-panel` suite uses the production window host, real Surfaces/PTYs,
native menu callbacks and Chromium synthetic input through the main keybind
matcher (default and remapped). It covers bounded geometry, captured pointer and
keyboard resize, retained hidden-tab output/grid, window independence, small
height, light/dark reload, chrome/fullscreen and About/image transitions. It does
not establish physical keyboard layouts, OS pointer hardware or cross-platform
pixel parity. Like the suites below, run it only on an idle unlocked desktop.

The Linux `settings-shortcut-native` suite uses the same real window host,
Settings capture/IPC, menu callbacks and Surface, with a raw Python PTY child
that reports every received byte. It checks held bound fullscreen/Quit gestures,
overlapping invalid/modifier releases, fresh input after a missing release,
page departure without button blur, window blur and the real 30-second timeout.
An exact Kitty press/release control fences each empty-input assertion; real
fullscreen and guarded Quit callbacks supply positive action/menu controls.
A deliberately bypassed native repeat must fail the action oracle; an explicitly
injected unmatched DOM release must fail the actual PTY oracle. Chromium can omit
a native release after a prevented down, so the fixture reports observed owned
native repeats/releases rather than assuming both arrived. Run it alone with `npm test -- test/integration/settings-shortcut-native.test.ts`.
The retained-Settings phase types into its graphical raw field, switches to a
terminal without disposing the editor or blurring Record, checks capture
cancellation and exact empty PTY input fenced by the fresh Kitty Escape, then
reopens the same draft/DOM. Its Electron `sendInputEvent` gestures are synthetic, not physical OS/layout or
AltGr qualification; the native menu positive control calls its actual callback,
not OS menu navigation. The ordinary fixture supervisor owns all windows/PTYs.

## Native terminal popup and input provisioning

The Linux `terminal-popup-native` suite builds the production popup callbacks,
preload, renderer, Surfaces and real raw Python PTYs. It opens `Menu.popup` from
an actual Surface context-menu request and uses X11 `xdotool` keyboard events to
activate Paste, checking `BrowserWindow.getFocusedWindow()` inside that real
native callback and the clicked child's received bytes. Retained installed
callbacks additionally check ordinary child exit, selected-window changes with
window-local session IDs, the real Busy decision/shared close slot, native
clipboard selection, and effective translated/remapped/unbound menu state.
Deliberate old Close Pane and clipboard routing controls must fail their distinct
oracles; the existing fixture supervisor still requires actual child exits and
clean ownership settlement.

**Native-input prerequisite:** use an idle, explicitly provisioned input-capable
X11/XWayland desktop with the standard X11/evdev F5=71 and F6=72 keycode
mapping, where these commands cannot create an unowned pending permission
request. Xwayland's portal-backed XTEST may return command success while
RemoteDesktop Start is still pending; those resources belong to Xwayland,
not the Electron fixture supervisor. A portal flag's presence or absence alone
neither proves nor refutes admission. An already admitted portal session or a
provisioned direct XTEST lane may work; provision/authorize it separately using
the platform's supported mechanisms before declaring the lane ready. Tests never
change developer-desktop security, forge portal responses, or send guessed keys
to a permission dialog. Do not use the declaration to bypass consent.

On that provisioned lane, run alone:

```sh
OMXTERM_TEST_PROVISIONED_NATIVE_INPUT=1 npm test -- test/integration/terminal-popup-native.test.ts
```

The declaration is only a safety prerequisite, not proof of capability. Before
opening the first popup, the fixture sends exactly one F5 warmup and one F6
proof, using literal numeric keycodes 71 and 72 with a fixed five-second admission
budget and bounded command submission. Numeric keycodes bypass libxdo's named-key
modifier mapping (older libxdo can select Alt-modified F5/F6); calibration does not
use `--clearmodifiers`, manipulate unowned modifiers, change keymaps or upgrade
tools. The standard mapping is an assumption, not admission: the strict real,
unmodified F6 receipt remains the verifier. A cold EI fallback can discard the
triggering warmup; it does not justify repeated attempts or sleeps. Admission
requires the actual focused, live owned window's recognized F6 press and completed
native submission, never xdotool exit, listener registration or menu-show/mapping
timing. Preventing a
press can omit its release, so no release is invented as an admission requirement;
calibration events and late releases remain suppressed before renderer/PTY
delivery until owner retirement. Wrong owner/key, submission, receipt timeout
and retirement have distinct fixed failure categories. After each attempted
calibration command and its streams settle, a `finally` cleanup sends only that
numeric key's `keyup`, with its own five-second command timeout and without the
possibly aborted admission signal. Cleanup's command and stream closure are
also joined before returning; cleanup failure fails submission, retaining any
primary command error. An already-aborted signal sends neither command nor
cleanup. This teardown allowance does not extend the five-second admission
deadline or retry proof. Owned listeners/timers retire on closure. Original
popup/outer deadlines and Home/Down/Return activation, exact clicked-child Paste,
empty alternate child and both intended retarget-negative oracles remain required.

A failed case blocks further popup-case injection in that invocation (failure,
not a green skip). Stop and inspect the lane, including external portal state;
process settlement alone is not portal settlement. Native acceptance must record
actual admission plus source and both negative oracles on the selected runtime,
with no retained process/portal resources. This preflight adds no menu-map fence,
arbitrary delay, product authorization change or desktop provisioning code.

On KDE, `OMXTERM_POPUP_EVIDENCE_DIR` optionally uses Spectacle to capture and crop
a synthetic-content-only native popup PNG (not `capturePage`, which omits OS
menus). Busy answers are fixture-controlled, not native dialog-widget evidence;
input is synthetic, not physical keyboard/layout or cross-platform qualification.
Headless input-observer/child/build checks (no native input or provisioning declaration needed):
`npm test -- test/unit/terminal-popup-input-admission.test.ts test/unit/terminal-popup-native-submission.test.ts test/unit/terminal-popup-native-fixture.test.ts`.

## Window chrome, About and drag geometry

The `window-chrome` suite includes an independent `about-only` scenario so an
unrelated native geometry failure cannot skip About coverage. Run it alone with
`npm test -- test/integration/window-chrome.test.ts -t about-only`. It exercises
the real menu callback, preload, dialog and Terminal Surface, using synthetic
keyboard input. For an explicitly scheduled browser handoff check, set
`OMXTERM_TEST_ABOUT_BROWSER=1`: it opens the fixed project page in the default
browser, observes focus leaving OMXTerm, then returns focus to the dialog.
`OMXTERM_ABOUT_EVIDENCE_DIR` optionally saves fixture-only normal/small light/dark
PNG captures. These checks still require an idle unlocked desktop; they do not
claim physical keyboard navigation or pixel parity across platforms.

On Windows, the real handle-drag no-resize oracle compares exact Win32 physical
window **and** client sizes before/after input on the same HWND, monitor, DPI and
restored state. Geometry-read failures, context transitions and one-physical-pixel
size changes fail; there is no tolerance or retry. Electron's enclosing DIP bounds
can gain or lose a DIP solely from moving across a fractional-scale rounding
boundary, so their sizes are not the no-resize oracle. Physical and DIP movement,
foreground/point ownership, pointer release/restoration and continuity checks are
still required. Headless validator and caller controls:
`npm test -- test/unit/window-chrome-drag-geometry.test.ts test/unit/window-chrome-native-drag.test.ts`.
They do not replace native Windows execution.

## Settings layout

The Window Chrome `settings-only` case additionally runs the graphical editor's
layout matrix: six categories after a native-minimum request and at five exact
renderer viewports (640×480, 800×600, 960×640, 1280×800 and 1920×1080), en-US/pt-BR,
representative dark/light palettes and actual panel breakpoint edges. It checks
clicked/selected/hidden/rendered category agreement,
readable label width/line geometry, actual form and shortcut placement on both
sides of their content breakpoints, horizontal containment and reachable focused
controls. Retained editor identity, palette color-scheme and native minima are
also checked. Immediately after the existing focus request, opening Settings
must preserve native outer bounds and minimum, before any deliberate config save.

The first matrix slot is explicitly `native-minimum-request`: one `setSize` of
the unchanged runtime window minimum, followed by the existing two-frame wait.
Four bounded language/palette records report requested minimum and actual
outer/content/viewport sizes. Positive finite geometry, outer size at least the
minimum, and an actual compact viewport (at most 639 px wide / 360 px high and
smaller on both axes than the original desktop viewport) are required. An
ignored resize fails. All six categories run at that stable observed viewport;
this does not assert an exact 320×200 viewport or physically smallest OS rectangle.

The five larger exact viewport targets retain the initial request plus at most
two request-delta corrections on both axes, each followed by the same two-frame
boundary. Deltas accumulate from the last request, not observed/native size.
Breakpoint targeting uses the same bounded rule for panel width and exact
640 px viewport height. Exact first observations stop immediately; unreachable
exact targets fail without tolerance, minimum/zoom/scale changes or layout
retries. All 144 matrix cases and four breakpoint targets remain required.
The fixture finally requests the saved outer bounds once via `setBounds`, in the same domain
as the entry `getBounds` snapshot. This restoration request is not independent
proof of physical/native geometry restoration; a primary failure is preserved.
`OMXTERM_SETTINGS_EVIDENCE_DIR` optionally saves synthetic-only
PNGs. Before throwing, a failure captures bounded app-only geometry and a frame
(up to 1920×1080 logical pixels and 32 MiB encoded), without refocusing or
restoring the renderer first. The runner's per-invocation failure destination is
outside the removed profile under `.scratch/native-fixtures/`; with an explicit
evidence directory it creates a unique `failure-*` child there. Capture/write
errors are recorded and never replace the original oracle failure.
Run alone on an assigned idle desktop with
`npm test -- test/integration/window-chrome.test.ts -t settings-only`.
Headless preparation does not establish rendered layout or physical input.

## Split, language and theme smoke checks

The independent Window Chrome feature smoke reuses the real renderer, host,
Settings service/reloader, owned profiles and native PTY supervisor. Select its
single literal case on an idle unlocked desktop:

```sh
node node_modules/vitest/vitest.mjs run test/integration/window-chrome.test.ts -t 'checks pane geometry and live language drafts without leaking a native dialog or process'
```

It checks a right split in one tab, DOM/command focus reaching main ownership,
input acknowledged by each actual child, keyboard divider resize changing both
pane bounds and PTY grids, and Close Pane terminating only its child while the
survivor refits and accepts input. It then changes the genuine Settings language
control through persistence/reload into two retained hosts while both dirty raw
editors keep bytes, selection, scroll, DOM focus and identity. The language event
is dispatched programmatically without moving focus; pane-close confirmation is
fixture-approved. This does not automate OS widgets, physical input, every split
axis/weight case, or preview target death. Headless preparation/control coverage:
`node node_modules/vitest/vitest.mjs run test/unit/feature-native-smoke-fixture.test.ts`.
Native behavior is established only by actually running the native case, not by
its successful bundle build or collection.

The independent theme-appearance case reuses that Window Chrome fixture:
`npm test -- test/integration/window-chrome.test.ts -t 'reloads theme appearance without losing separator focus, resize targets or native grids'`.
It loads real theme files through reload into retained windows; checks distinct,
null and omitted paint, both pane axes and the panel, pointer/keyboard PTY resize,
foreground focus during drag, light/dark defaults and a positive transparency
request with blur disabled. Windows retains its documented opaque fallback for
that request; macOS/Linux use the requested tint opacity. A Chromium pixel sample
verifies exact opaque accent/red pixels at the top/bottom of the returned image.
Dimensions and BGRA bytes come from the same NativeImage representation: its
pixel dimensions can differ from the requested 1×3 DIP rectangle at high DPI.
No resizing or color tolerance is applied. Keyboard modality uses synthetic input
plus programmatic separator focus, ordered after the owned renderer consumes the
actual trusted Shift-Tab down/up pair and its default focus movement. Consumption
and the strict `:focus-visible` oracle share the existing response budget; no CSS
modality flag is forced. This is not physical tab traversal or OS-compositor pixel parity.

## Fixture ordering and failure controls

The `application-about` startup fixture stops before its first window. Its
`published-failure` control publishes the real observation, requests normal Quit
to latch production shutdown, then prevents the default `will-quit` exit and
injects actual exit code 3. The supervisor must report code 3 with no signal;
diagnostics never substitute for that outcome. The timeout controls require the
same producer/role to reach the menu (`missing-result`) or successful atomic
observation publication (`published-hang`). Bounded metadata outside the removed
profile records publication completion, Quit progression and unexpected window
creation; missing/invalid evidence or any window fails the phase check. These
checks diagnose fixture ordering, not the exact cause of a native SIGTRAP.
Headless coverage uses the actual fixture callback and production shutdown owner:
`npm test -- test/unit/application-about-startup.test.ts test/unit/application-about-diagnostics.test.ts test/unit/terminal-shutdown.test.ts test/unit/native-fixture-completion.test.ts`.

The auxiliary-panel native fixture fences overlay transitions with bounded,
window-owned receipts recorded only after the actual production Toggle/Paste
listeners return. These receipts establish callback consumption before About
close, picker cancellation or image Escape; they do not drain asynchronous
input accepted earlier. The continuous input sample and strict empty assertions
remain unchanged. Headless ordering/negative controls:
`npm test -- test/unit/overlay-action-consumption.test.ts test/unit/auxiliary-panel-fixture.test.ts`.

Fixture Surface import overrides target the canonical composition importer,
`src/renderer/start-terminal-window.ts`, not the thin `src/renderer/index.ts`
entry. After moving composition, check every importer-sensitive consumer; normal
bootstrap equivalence does not prove fixture interception equivalence. Run
`npm test -- test/unit/renderer-fixture-consumers.test.ts` for actual headless
bundle/control checks, including deliberately stale-importer negative controls.

Session-selection notifications describe ownership, not Surface adoption or host
command readiness: panes may report a started session before their mount returns.
The tab-removal, startup-title and initialization-cancellation fixture entries
observe successful registration of the actual host tab-command callback through
their supplied bridge; independent arrival observers never establish readiness.
Initialization cancellation waits for that receipt before requesting B, not just
A's native-child readiness. Its first-tab cases instead wait for the actual held
font/runtime boundary and host registration, invoke production Close Tab, and
check zero native sessions, normal window destruction and one Quit request.
They do not prevent window closure to inspect renderer cleanup; late release or
rejection and resource cleanup are covered headlessly through the production
host, Surface and Adapter. Native cases remain separate from headless evidence.
The headless emitted entry and production preload demonstrate host registration
while the first Surface return is held; independently holding actual host
registration retains the lost-command/no-replay negative control. Run
`node node_modules/vitest/vitest.mjs run test/unit/initialization-readiness.test.ts test/unit/renderer-fixture-consumers.test.ts`
for the ordering and stale-importer negative controls. This is fixture ordering
evidence, not a diagnosis of a historical native timeout or native cancellation
acceptance. Tab-removal retains its
held-Surface, early-command and held-renderer controls and original deadlines.
Held Surface now positively establishes reception before adoption; the
held-registration and early-command controls independently delay the real
subscription, preserving arrival-only, no-replay, retirement and timeout checks.
Headless emitted-entry/production-callback coverage:
`node node_modules/vitest/vitest.mjs run test/unit/tab-removal-host-readiness.test.ts`.
The production host receives commands during synchronous setup without buffering
or changing mount readiness. Actions requiring an unavailable Surface remain
no-ops; zoom/tab-bar state and Snippets are already available.

## Linux packaged-wrapper controls

Linux packaged-wrapper outcome controls use a private acquire-before-release
handoff. A finite Run-as-Node actor (or the stream-retention control worker)
proposes its PID/start identity and waits for an exact acknowledgement before
its native action or wrapper exit. The verifier acknowledges only an actually
collected actor with a live retained parent chain to the immutable initial
wrapper identity. Proposals never seed ownership or authorize signaling.
Malformed, oversized, stale and foreign controls fail within the existing
bounds; recovery cannot turn a timeout/native failure into success. This does
not provide containment of arbitrary unobserved orphans.

`beforeCleanup.outcome` records only the native exit notification already
observed by the verifier at that snapshot; it can be absent even when a retained
worker has been reparented after its wrapper exited. Reparenting does not prove
that the JavaScript exit callback has run. Acquisition-gap regressions compare
that field with independently observed notification delivery, including a real
exit notification deferred until recovery. They still require final native
exit 7/no signal, the acquired worker's retained identity, open streams before
recovery, exact output, closed streams and no remaining actors after recovery,
and the original settlement-timeout failure. Cleanup never supplies a substitute
native outcome or turns that intentional failure into verifier success.

Only those notification-order cases hold the verifier's test clock at launch
until the actual native exit emission is captured, then advance it to the same
250 ms expiry. One independent 3-second wall-clock guard bounds readiness and
capture together; this is event ordering, not native 250 ms latency
qualification. Recovery closes the deferral gate before releasing any captured
notification, so genuinely later arrivals pass through. Real time is restored
before recovery timing and on setup/capture failure, before joining cleanup.
An independent retirement timer shares that wall deadline, so a missing capture
or recovery transition cannot leave an asynchronous join on a frozen clock. Portable real-Node
controls cover late delivery, capture-gated expiry and wall-guard retirement,
not Linux ownership qualification. The no-capture control awaits actual clock
restoration by that watchdog before asserting retirement; elapsed wall time
alone is not its completion receipt. The other real 250 ms negative controls and
production deadlines remain unchanged.

Positive generated-actor tests share the existing 3-second readiness/setup
allowance with their readiness polling; their outer test guards also allow all
three native controls and bounded recovery. This is not a 250 ms native-latency
requirement. The six bad/missing-acknowledgement cases also use that positive
setup allowance: they require actual acquisition before exercising exactly one
ACK-publication fault, not acquisition expiry. The missing-publication case
forces a late hidden collection while retaining the worker, native SIGKILL,
stream closure and intentional settlement failure. Deliberate 250 ms
acquisition-expiry controls still require failure: the same
late hidden collection that succeeds with the positive allowance must expire
without an acknowledgement or action under the negative budget, then settle
cleanup. Controlled-clock tests call the actual actor acquisition helper to
check matching acknowledgements just before, exactly at and after expiry, plus
missing/mismatched acknowledgements. Production deadlines and ownership/signaling
rules are unchanged.

Headless regressions, including a deliberately bypassed handoff and forced
procfs observation gaps:

```sh
node node_modules/vitest/vitest.mjs run test/unit/linux-packaged-process.test.ts test/unit/linux-wrapper-acquisition.test.ts test/unit/linux-wrapper-control.test.ts
```

## Supervised PTY acquisition

Supervised PTY registration completes **process acquisition**, not native-resource
quiescence or fixture settlement. Ordinary readiness requires a verified positive
child identity; ordinary early exit requires a positive PID and reinspection
confirming its disappearance. The fixture PTY adapter alone knows beta.18's
`ready_datapipe` ordering; it never waits for payload or a prompt. Production
session/shutdown interfaces and their actual-exit barrier remain unchanged.

Only the pinned prepared **Windows** `execFailed === true` agent-error event
selects failed-start acquisition. Reviewed dependency ordering consumes the
attempt's deferred-connect admission before that notification, so late worker
readiness cannot initiate another connect. The synchronous observer must verify
the exact retained live owner and a valid positive-identity descendant closure,
then atomically publish that snapshot before forwarding lifecycle downstream.
Include live children/helpers created before native connect threw, even when the
public PID remains 0. An inspected owner-only snapshot is also allowed; neither
PID 0, absence nor the marker proves that no child existed or that native handles
or threads retired. This path does not invoke the successful-readiness callback;
Unix's shared marker still follows the ordinary actual-child exit path.

Readiness/exit/failed-start observation or publication failures retain the pending
write-ahead record and retire temporary observers, without throwing through the
dependency's synchronous listener queue and starving session lifecycle consumers.
Safe diagnostics distinguish `ready-observation`, `exit-observation` and
`failed-start-observation` (branch `failed-start`); publication failures retain
their precise publication phase too. Later events cannot rescue failed
observation. Synchronous registration failures still throw. The unchanged
independent supervisor acquires retained ledger identities, rechecks exact birth
identity before signaling, verifies disappearance and rejects pending/failed
cleanup even after a fixture exit 0 or empty final inventory. Its join and the
original native outcome/scenario assertions remain required; cleanup cannot turn
a nonzero exit or timeout into success.

This is a cooperative fixture protocol, not containment of arbitrary programs or
unobserved orphan trees. A child that launches descendants and disappears before
any accepted ancestry snapshot cannot be reconstructed from PID/name or empty
inventories. The deferred-failure fixture therefore attempts valid PowerShell
with literal no-profile, bounded, non-spawning arguments while preserving its
real unavailable-cwd failure oracle. Unknown escaping ancestry is a blocker, not
permission to invent identities or clear historical blocked receipts.
Headless composition and receipt coverage:
`npm test -- test/unit/native-fixture-ownership.test.ts test/unit/native-fixture-registration.test.ts test/unit/native-fixture-registration-receipt.test.ts`.
Passing those controlled cases does not qualify Windows native D9 or its baseline.

## Windows cleanup diagnostics

Windows supervisor receipts can additionally contain optional `cleanupFailure`
metadata when an existing cleanup PowerShell command throws. Its fixed `callsite`
is `final-sample`, `registration-before-kill`, `termination`,
`registration-after-kill`, or `survival`. `elapsedMs` measures the synchronous
boundary around the failed `execFileSync` call (including JavaScript call/argument
overhead) using the process-local monotonic clock, floored to whole milliseconds
and capped at 86,400,000 (one day). It excludes inventory parsing, registration
file processing and target encoding; it is not total cleanup time or an internal
PowerShell phase duration. `category` uses only own data properties: `timeout`
for `ETIMEDOUT`, `command-failed` for a nonzero safe-integer command exit status,
otherwise `unknown`. No arbitrary error codes/text, command arguments, output, environment
values or paths enter this metadata. The original `cleanupErrors` strings and
native exit/signal/reason remain authoritative and unchanged. Successful cleanup
and failures outside those command boundaries omit the field; legacy receipts
without it remain valid. This improves future failure discrimination, not
historical Windows performance or diagnosis of a rare timeout's cause. Command
bounds, ownership blocking, profile retention and supervisor joining are unchanged.
Headless emitted-supervisor/schema controls:
`npm test -- test/unit/native-fixture-cleanup-failure.test.ts test/unit/native-fixture-cleanup-outcome.test.ts test/unit/run-native-fixture-windows.test.ts`.
They do not replace actual Windows execution.
