# Installed Snippets native qualification

This fixture exercises an ordinary `.omxext` install and explicit trust through
Settings, followed by real hosted-page requests through production semantic
admission, presentation, Surface and PTY delivery. Source, exact-AppImage, exact-DMG
and exact-Windows staged adapters share one current ten-check scenario body. Historical nine-scenario
receipts below remain bound to their original inputs. Adapter admission and
headless tooling tests are not native qualification. The adapters' evidence
remains distinct; none qualifies physical keyboards or other platforms; Linux
uses software rendering.

## Composition supplied by the integration owner

`OMXTERM_SNIPPETS_PACKAGED_ENTRY` must be an absolute path to a built Electron
main entry with unchanged production Linux ARM64/x64 or macOS/Windows ARM64 composition, lifecycle and
assets. Production routes the ordinary Snippets command to the optional installed
companion or Extensions guidance, with no duplicate action or built-in view. Retain production
`registerSemanticInputIpc`, renderer semantic capture/preview, native gesture
ownership and hosted presentation wiring. Do not bypass admission or expose a
fixture terminal-injection API. The entry must honor the isolated configuration
root and the adapter's literal `-e` arguments and join normal shutdown. Linux and
macOS use `/bin/sh -i`; Windows starts a controlled Node line probe in ConPTY.

The fixture imports this entry after installing test-only observers for PTY writes,
backend retirement, native chooser and trust responses. Observed PTY writes are
forwarded unchanged; no input is admitted by those observers. Catalog and profile
are created inside the supervisor-owned temporary root. The supplied archive and
entry are read only. The source adapter copies the matching source host version
into its temporary application manifest, asserts actual `app.getVersion()` before
installation and records it as `SNIPPETS_SOURCE_HOST`; Electron's fallback version
is not matching-host evidence. The archive digest is checked before launch, at consent, in
the result, and after execution; the entry digest is checked before/after.

On an assigned disposable Linux ARM64/x64 or macOS/Windows ARM64 desktop only, run the normal source build.
For macOS, follow the [preference precautions](../../docs/development.md#macos-preferences-and-native-verification)
for source-mode Electron too; an isolated profile does not protect OS preferences.
Then run `node test/fixtures/snippets-qualification-build.mjs /absolute/new/qualification`
to copy its artifacts and rebuild main/renderer without source substitutions.
The builder refuses output reuse and records source hashes (including the real
application icon) and `differences: []`. Its owned output preserves the development
layout: `dist/`, `assets/application-icon.png`, `node_modules` (a dependency link;
a junction on Windows), `package.json` and `qualification.json`. Main still resolves its normal relative
assets; no parent-directory writes, dummy icon or product fallback are used.
It leaves shipping `dist` unchanged. The copied host uses the source's installed
dependencies; keep both until qualification settles.

```sh
OMXTERM_SNIPPETS_PACKAGED_ENTRY=/absolute/qualification/dist/main/index.js \
OMXTERM_SNIPPETS_PACKAGED_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_PACKAGED_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_PACKAGED_EVIDENCE=/absolute/evidence \
  npm test -- test/integration/snippets-packaged.test.ts
```

With none of these variables set, the test skips without opening Electron. Partial
configuration fails rather than silently skipping. `runNativeFixture` supervises
launch, timeout, cancellation and cleanup. A successful result requires normal
exit, no cleanup errors, joined backend/PTY shutdown and exactly one scenario
receipt. The integration owner should retain the supervisor receipts alongside
host commit/build and archive provenance.

On Windows ARM64, set the same inputs with absolute Windows paths in the assigned
Interactive/Limited console. The source adapter uses a Node launcher that joins
actual Electron exit, close and both bounded output streams. It runs the native
ARM64 Node executable with a fixed probe script as literal arguments. The byte-oriented
probe accepts only the fixture's known lines and reports their exact receipts. It
requests child-facing focus reporting and bracketed paste off; it is not a shell
or an account-shell qualification. ConPTY may immediately request outer focus
reporting on. The source fixture requires the original child reset followed by
outer enable and the plain-paste ready marker, then the core's same-session
output acknowledgement and two render opportunities before first Insert. It
requires the mirrored outer focus mode to be on and bracketed paste off; a missing,
partial or unacknowledged sequence, later outer reset, or ambiguous ownership
fails closed. The probe's exact child-byte receipts independently test delivery;
outer output and ACK alone do not prove the child's mode or consumption.

The Windows write assertion preserves all original ordered node-pty writes. It
classifies complete standalone `ESC[O` or `ESC[I` writes as focus shapes, and a
complete standalone `ESC[<row>;<column>R` as a cursor-position-report (CPR) shape
only when the observer paired that write with a previously observed, unused
`ESC[6n` query shape. Row and column are canonical positive decimals bounded to
1–1000, matching the Terminal Adapter's grid limits. Split, mixed, malformed,
unsolicited or excess CPR writes and every other escape-bearing write fail closed.
Two identical CPRs require two distinct earlier queries; unanswered queries are
allowed. The observer incrementally records query offsets and write indices in
main-process callback order, with a 65,536-code-unit output limit and at most
1,024 queries and replies. Validation requires enough callback slots for every
write and each distinct observed query callback before, between and after replies;
multiple queries can share one output callback. Nonempty output without queries
requires at least one output callback, while additional unrecorded output
callbacks are allowed. This is a consistency lower bound, not a complete event
history. Observation forwards the original data unchanged but can perturb timing.
Missing, truncated, overflowed, inconsistent or errored CPR observation fails the
oracle, including for an empty action window.
All remaining bytes must equal the exact expected Insert, Run or Enter sequence;
the historical `nonFocus` evidence field now holds those remaining semantic bytes,
with focus and CPR metadata retained separately. The existing 150 ms post-action
drain remains; a final whole-interaction check
also rejects delayed extra input between checkpoints. The retained CPR metadata
is an explicit **lexical** correlation, not a provenance tag or a VT parser:
node-pty's shared write boundary does not independently prove whether a standalone
focus- or CPR-shaped write came from Restty or semantic input. An `ESC[6n`
substring inside another control string can look like a query to this narrow
observer, and a semantic CPR-shaped write can consume a pending query credit.
The byte-oriented probe separately requires the exact 19-byte
Insert draft before Enter, exact submitted lines, and expected receipt counts.
Receipt counting reads the accumulated, untruncated output without modifying it.
A complete marker must end with LF or CRLF and start at the output beginning,
after LF, or immediately after a complete `ESC[<positive-decimal-row>;1H` cursor
position. The last form accounts for ConPTY moving to column one before a probe
receipt, even without a preceding newline. Other cursor forms and marker
substrings are not receipts; an occurrence with invalid complete framing fails
closed. Distinct complete markers are counted separately, while an unfinished
marker or line terminator at a recognized boundary is not treated as a completed
count. This is a narrow decoded-string shape contract for this controlled probe,
not a VT screen parser or proof of the marker's provenance. It cannot predict later output
or claim completeness of an open stream. Unsupported control sequences can still
make a run inconclusive; no input escapes or semantic text are filtered.
With private evidence enabled, `pty-writes.json` retains the original writes and
classified check windows through input cleanup, plus the selected PTY's observed
output captured before cleanup (or on failure before diagnostics). The associated
`cprTrace` snapshots query offsets, reply write indices and observation order at
that same boundary; `writeEnd` distinguishes later cleanup writes. That output is
a node-pty decoded string, bounded to the last 65,536 UTF-16 code units with an
explicit truncation flag; it retains child receipt markers when observed, not a
complete recording of child stdin or evidence of write provenance. If the process
stops before finalization, the file may be absent. It is synthetic private
evidence, not a product log. ConPTY delivery and the full scenario still require
native verification. The Windows catalog contains synthetic probe lines, not the immutable
archive's POSIX example.
The observed ConPTY PID and creation identity must remain the same through
retirement; normal Quit checks PTY `onExit`, backend exit/close and recorded
identity absence. No separate PTY close event or arbitrary-descendant census is
claimed.

For a separately selected first-Insert diagnosis, Windows ARM64 may additionally
set `OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC=1` and an absolute, private
`OMXTERM_SNIPPETS_PACKAGED_EVIDENCE` directory. This runs the same installation,
presentation and the same classified-write assertion once, captures bounded
synthetic PTY writes, output tail and semantic request/reply observations, and
requires the ordinary exact child-draft receipt and a separate diagnostic receipt
before deliberately stopping
**before** explicit Enter or the held-key scenario. It retains
`insert-diagnostic.json` independently of screenshot/DOM capture. A timeout
retains its original error; an exact first Insert stops with
`SNIPPETS_INSERT_DIAGNOSTIC_STOP_AFTER_EXACT_BYTES`. Either outcome makes the
ordinary integration test fail because it is diagnostic, **not qualification**.
The instrumentation observes scoped handler registration and replies without
admitting or retrying requests. A bounded local request ID and captured sender ID
correlate each recorded hosted request with its outcome; neither establishes PTY
delivery. `observedHandlerIds`, truncation and `observationUnavailable` limit
what missing events can establish.

The controlled Node probe can also capture input on the ordinary Windows scenario
path with `OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE=1` and an absolute,
private `OMXTERM_SNIPPETS_PACKAGED_EVIDENCE` directory. Without the separate
first-Insert or readiness diagnostic flags, this does not install the stopping
diagnostic, emit its extra receipt, or stop before Enter: the ordinary scenario
may continue through the held-key checks. The capture-only checkpoint is written
synchronously before the click without an extra event-loop yield, but that I/O
and child capture can still perturb timing. This is a diagnostic observation,
not proof of uninstrumented behavior or qualification by itself.

Either child-input capture flag or the first-Insert diagnostic flag makes the
probe create `child-input-diagnostic.jsonl` exclusively and synchronously record
its own startup, requested capture/stop flags, raw-mode request, each
Node-delivered stdin `Buffer` chunk as base64, line lengths, draft timer and
probe-error events. It does not strip or
modify input. A `child-input-checkpoint.json` is written by the scenario before
the first Insert click; each child event reports whether that file was visible at
callback time. File visibility does not establish when bytes entered an OS buffer,
prove cross-process clock ordering or identify provenance. Compare the checkpoint
PID with the selected PTY and child-start PID; a missing, invalid or failed
checkpoint is unknown, not an implicit pre-click phase.

The journal is bounded to 256 events, 65,536 input bytes and 262,144 serialized
bytes, with a reserved explicit `capture-truncated` event; a non-Buffer callback,
partial record, `child-input-capture-error.json` or absent journal makes exact
capture incomplete. Existing evidence is never overwritten. Writes are incremental
but process termination may prevent an exit record or leave OS-buffered input
unobserved. Capture errors and checkpoint-write errors are retained where possible
without replacing the original scenario failure. A checkpoint-write failure is
recorded when possible in `child-input-checkpoint-error.json` and the selected
PTY evidence; an error writing that sidecar is separately retained in PTY
evidence when possible. Existing files are never overwritten. Missing or
failed evidence remains inconclusive. Synchronous diagnostic writes and
file-visibility checks can perturb timing; this trace is not a native qualification
or proof of every byte sent. All captured synthetic input and paths remain private.
Neither flag alters the ordinary scenario's classified-write, exact child-receipt
or drain requirements.

### Capture-off first-Insert memory diagnostic

For a separately selected Windows ARM64 source diagnostic, set
`OMXTERM_SNIPPETS_PACKAGED_MEMORY_INPUT` to a fresh 32-character lowercase hex
nonce and use an absolute private evidence directory. Leave the child-input,
Insert and readiness capture flags **unset**, not `0`. The ordinary GUI/focus
prefix, readiness predicate, exact-write drain, child parser and 150 ms draft
timer remain in use. The ordinary first-Insert receipt wait still has its
15-second deadline. Both receipt and timeout stop before explicit Enter; later
Snippets scenarios are not exercised.

The inline child recorder adds no module loads, stdio getter reads, journal I/O
or checkpoint checks before its one delayed dump turn. It retains raw callbacks,
full parser lines before/after, cancellation/scheduling/firing and receipt-write
invocation/return in memory (256 events, 65,536 input bytes, 262,144 serialized
event bytes). It preserves the ordinary `stdin -> raw request -> stdout` order.
At 60 seconds after listener attachment, it makes one dump attempt. The parent
publishes `memory-observation.json` exclusively only after its original
observation finishes. The child first attempts exclusive creation of that same
file with an early-dump sentinel: if the child wins, the run is inconclusive;
otherwise the dump must contain the exact completed parent outcome and nonce.
A concurrent partial parent write also fails validation rather than being retried.
No shared clock between processes is assumed. Child event times are relative to
its own monotonic start; `dump-boundary` ends the capture in the synchronous dump
turn, and subsequent callbacks cannot mutate the retained event array.

The parent saves the pre-collection PTY snapshot, then waits at most 65 seconds
for the single atomically published `memory-child.json`. The existing 120-second
native-fixture deadline and 150-second test deadline remain outer bounds; slow
startup or a dump arriving before observation completes is not made successful
by extending or restarting those bounds. `memory-result.json` keeps the initial
receipt/timeout/error separate from collection status. `memory-lifecycle.json`
records owned shutdown separately, alongside the existing supervisor receipt.
Missing, malformed, early, overflowing or mismatched evidence is inconclusive.
Validation checks required event fields and synchronous producer ordering:
callback/cancellation/processing, optional scheduling, timer firing, and paired
receipt-write invocation/return. A pending timer at the dump boundary and
post-observation callback tails remain valid; no cross-process clock is inferred.
The opt-in test can pass for a completely collected timeout with joined shutdown;
it never emits `SNIPPETS_PACKAGED_RESULT` or establishes full source qualification.

Memory allocation, serialization and timers can still perturb behavior. No
callbacks in a complete dump means no Node callbacks observed in this bounded
window, not proof of OS nondelivery. Trace callbacks can include traffic after
the parent's initial outcome and before the dump; compare the retained initial
PTY snapshot and do not infer a shared cross-process event clock. Keep all raw
synthetic evidence private. This mode does not fix or filter terminal input.

For a separately selected Windows startup-readiness diagnosis, set
`OMXTERM_SNIPPETS_PACKAGED_READINESS_DIAGNOSTIC=1` and the private evidence
location, without the first-Insert diagnostic flag. This observes the same
controlled startup and readiness predicate, then deliberately stops before the
render-opportunity barrier and before opening or activating Snippets. It writes
`readiness-diagnostic.json` on an observed timeout or diagnostic stop, with a
bounded ordered trace of PTY output/writes, main-to-renderer output and ACKs,
selected identity, mirrored parser modes and individual readiness conditions.
The trace is limited to 128 events and 65,536 serialized bytes; at most four
PTYs are summarized with 2,048-code-unit output tails and at most 32 writes /
2,048 UTF-8 bytes each. The main-output tail has the same 2,048-code-unit cap.
Truncation or observation failure is reported. Captured synthetic terminal
bytes and identities remain private. Sequence numbers represent main-process
callback observation order, not a cross-process causal clock. The post-timeout
snapshot may differ from the last readiness poll. Instrumentation can perturb
timing; the mirrored parser and ACK observation are not independent proof of
child input consumption or compositor freshness. An
absent, truncated or unavailable snapshot is inconclusive. The test deliberately
fails after the diagnostic stop and is **not qualification**; ordinary runs are
unchanged when the flag is absent.

The Windows held-Enter adapter uses the existing Windows scan-code `SendInput`
mechanism against the owned foreground window. Separate helper invocations query
`GetAsyncKeyState` for a held-to-up transition. The scenario also requires trusted
child activation, an observed and prevented Chromium core repeat, exact PTY
no-leak checks and a fresh Enter. An injected repeat is not assumed to produce a
Chromium repeat: failure of any observation fails the campaign. The input marker
is written outside the disposable profile before posting and remains after an
uncertain or failed scenario. An independently observed release remains recorded
as such, not as a successful gesture or an unknown key state merely because the
scenario failed. Cleanup release is not a successful receipt. This is synthetic
session input, not physical-keyboard or natural-autorepeat evidence.
The [Windows ARM64 source checkpoint](../../docs/snippets-migration.md#windows-arm64-source-transition)
records the later ordinary pass and its limits.

The macOS ARM64 source transition passed all nine ordinary scenarios on the exact
host/archive pair recorded in the [migration guide](../../docs/snippets-migration.md#macos-arm64-source-transition).
The source layout preserves the development icon under the owned output and has a
headless CLI/filesystem regression. This does not establish a universal remedy for
pre-JavaScript AppKit stalls. Startup timeouts are not held-key failures, and
neither scenario oracles nor timeouts are relaxed.

The campaign uses native macOS graphics and Chromium sandboxing, without Linux/X11 flags. The published
Snippets 0.1.0 manifest has no platform restriction and its engine permits the
qualified source host; reuse its exact archive without editing the published catalog
or original build receipt. A new macOS receipt must identify that archive and
matching host independently. The extension builder's `qualification.target` is
still `linux-arm64` / `not-run`, not macOS evidence; no rebuild is needed here.

## macOS Quartz tool provisioning and ownership

On the assigned disposable macOS ARM64 desktop, build the stock Swift helper into
a new **stable** directory (Command Line Tools required). Do not rebuild it for each
fixture profile or grant permissions to arbitrary newly generated tools:

```sh
node test/fixtures/snippets-quartz-build.mjs /absolute/stable/quartz-tool
/absolute/stable/quartz-tool/quartz-input status
```

The explicit builder compiles and ad-hoc signs the helper, writes `tool.json` with
absolute executable path and SHA-256 bindings to the exact tracked Swift source and
binary, and does not post input or request permissions. The manifest is local trusted
provisioning evidence, not a signed supply-chain attestation. Keep its directory
writable by the fixture user for the durable input-ownership marker. To reuse an
already provisioned identical source/binary, the integration owner may create the
same manifest from independently verified hashes without replacing that binary.

If needed, explicitly run `quartz-input request-access` and approve the actual guest
responsible executable/application in Accessibility/Input Monitoring. Request return
is not permission. Observe post/listen preflights and successful tap creation in the
actual fixture ancestry; TCC attribution can differ from a shell invocation. Do not
edit TCC databases, disable SIP, or assume root/SSH access grants input access. Run
nonroot in the active unlocked Aqua session, with no competing GUI suite, real held
keys or modifiers. No host GUI or permission changes are part of headless tests.

Set `OMXTERM_SNIPPETS_PACKAGED_QUARTZ_TOOL=/absolute/stable/quartz-tool/tool.json`
alongside the three source-adapter inputs on macOS. Missing configuration or changed
source/binary hashes refuses the native launch. Linux retains its existing X11 route
and needs no Quartz tool. `snippets-quartz.cjs` owns a separate listen-only annotated
session observer, literal-argument bounded poster calls, per-gesture cursors and
fresh token/PID checks. It records `quartz.jsonl` and `quartz-lifecycle.jsonl` in the
private evidence directory (or temporary root if none was requested).

Before observation/posting it exclusively creates `<executable>.unsettled.json`,
**outside** the disposable profile. It removes that marker only after normal joined
observer close, continuous observation, completed gestures and independent final
session/HID-up queries. Interrupted input, unexpected observer exit, disabled taps,
missing observations and cleanup releases retain refusal. A cleanup keyUp is labeled
and cannot turn a failed gesture into successful qualification. The existing joined
native supervisor still owns all descendant processes; if observer close cannot be
established, the fixture fails and leaves the marker for the integration owner.

After cancellation/SIGKILL, process/profile cleanup alone does not prove OS key
release. Before another campaign the owner must inspect the retained marker and
receipts, verify PID/start settlement and independently check guest key state; any
necessary release is a separate documented recovery, never retroactive PASS. Only
then may the owner archive/remove the marker explicitly. There is no automatic
marker reset, rerun, permission prompt, or fallback from failed Quartz evidence.

## Exact AppImage adapter

On an assigned disposable, nonroot Linux ARM64 or x64 X11 desktop,
`test/integration/snippets-appimage.test.ts` extracts the supplied exact AppImage
without replacing its entry, dependencies or ASAR. Both architectures use the
same observer and shared scenario, with architecture-specific expected input
receipts; admitting x64 is tooling, not an exact-package PASS or release gate
completion. It uses the existing packaged process owner and loopback inspector,
loading a separate CommonJS observer. The application runs with isolated
HOME/XDG/profile and a PATH containing only the fixture bin and ordinary system
`/usr/bin:/bin`, never the caller's source Node/npm paths or startup overrides.
The account's login shell needs system tools during startup (for example Fedora's
profile scripts use `grep` and `tr`); retaining only fixture-bin links prevents
the controlled plain-paste shell from starting reliably. The ordinary
guest account shell must be sh or bash. Provision xdotool, Python 3/libX11,
xprop and bwrap in that guest; keep the desktop idle with no competing GUI suite.
Rendering explicitly remains X11/ANGLE SwiftShader on both architectures.

```sh
OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE=/absolute/host.AppImage \
OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE_SHA256=<sha256> \
OMXTERM_SNIPPETS_APPIMAGE_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_APPIMAGE_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_APPIMAGE_VERSION=<host-version> \
OMXTERM_SNIPPETS_APPIMAGE_EVIDENCE=/absolute/evidence \
  npm test -- test/integration/snippets-appimage.test.ts
```

Do not set source or DMG adapter variables in this mode. Mixed adapters and
partial configuration fail; with no AppImage opt-in variables the test skips.
For Linux x64, use the unchanged published Snippets `0.1.0` archive identified in
the [source transition](../../docs/snippets-migration.md#linux-x64-source-transition),
not a rebuilt archive, edited catalog or relabeled original build receipt. Bind
`VERSION` to the supplied exact host, not Electron's version. Each run has new receipts. The
observer asserts actual packaged version, executable, ASAR and backend paths.
AppImage/archive/ASAR hashes are rechecked even on failure. Successful completion
requires normal Quit, actual main exit and joined process ownership; failed roots
and evidence are retained. Extraction does not qualify FUSE/helper installation
or public acquisition. Run the ordinary Linux package verifier separately on
the same exact artifact; the Snippets campaign does not replace it. The bounded
[Linux x64 exact-AppImage checkpoint](../../docs/snippets-migration.md#linux-x64-exact-appimage-checkpoint)
records package-source and test-fixture identities separately, its ten-check and
actual-preview evidence, reused FULL modes and retained diagnostic limitations.
A later fixture-only revision does not imply an artifact rebuild. Shared Hide
waits require native hide/core focus **and** committed renderer panel hiding and
terminal DOM focus before another reveal; native effects alone can precede the
Hide acknowledgement. Reveal/input oracles and timeouts remain unchanged. No
package, catalog, public-HTTPS or Files qualification follows from headless tests.

All adapters observe new `node-pty` instances at their existing event-forwarding
prototype seam and forward writes unchanged. This avoids assuming that replacing
a CommonJS export changes main's already captured ESM spawn binding. The package
adapter creates one ordinary New Tab after attachment; that new session runs the
shared scenario. The initial readiness session remains alive and is independently
checked for kernel exit at Quit. The scenario session and backend must join too.
The source adapter observes its initial session before importing production main.
Neither observer exposes a product input API or bypasses semantic admission.
On Linux and macOS, ordinary terminal text and Enter replace the scenario shell
with `/bin/sh -i` in the same PTY. A preceding shell output marker explicitly
disables bracketed paste; the fixture verifies that marker and that plain-paste
mode remains selected at every exact-byte assertion. This makes source and
account-shell launches comparable without stripping framing from observed writes
or accepting either encoding. The Windows source adapter starts its controlled
probe directly instead. On the exact Linux AppImage adapter, only the inner
controlled shell receives `INPUTRC` pointing to a fixture-owned file in its
isolated HOME with `set enable-bracketed-paste off`. Readline otherwise defaults
to enabling bracketed paste during interactive `/bin/sh -i` startup **after** the
preceding plain-mode marker; a shell that ignores this setting must still satisfy
the unchanged last-mode oracle. The real account shell keeps its normal startup
settings, and no user inputrc, product path, output-reactive toggle or PTY-write
normalization is involved. Account-shell startup and bracketed-paste delivery
are not qualified by either controlled scenario.

## Exact macOS ARM64 DMG adapter

`test/integration/snippets-dmg.test.ts` is opt-in tooling, not a qualification
receipt. On the assigned disposable, unlocked Aqua desktop, follow the
[macOS preference precautions](../../docs/development.md#macos-preferences-and-native-verification);
the isolated paths do not protect the guest user's OS preferences. Then supply:

```sh
OMXTERM_SNIPPETS_DMG_DMG=/absolute/host.dmg \
OMXTERM_SNIPPETS_DMG_DMG_SHA256=<sha256> \
OMXTERM_SNIPPETS_DMG_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_DMG_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_DMG_VERSION=<host-version> \
OMXTERM_SNIPPETS_DMG_EVIDENCE=/absolute/private-evidence \
OMXTERM_SNIPPETS_DMG_QUARTZ_TOOL=/absolute/stable/quartz-tool/tool.json \
  npm test -- test/integration/snippets-dmg.test.ts
```

No opt-in skips; partial or mixed-adapter configuration refuses. The guest must
have Command Line Tools, `hdiutil`, `ditto`, `codesign`, `lipo`, `plutil`, a
sh/bash/zsh account shell and the already provisioned Quartz permissions described
above. No permissions are requested automatically. Root owns exclusive native-lane
preflight and execution. Build a fresh DMG from verified source and locked,
self-contained dependencies, and run the existing package inspection separately.
Do not reuse an unpackaged build as DMG evidence.

Preparation mounts the exact digest-bound DMG read-only, copies `OMXTerm.app`
with `ditto`, compares the complete bundle's files/modes/symlink targets and
unmounts before launch. Mount/copy/detach failures refuse launch. It verifies the
app's code seal, ARM64 executable, plist and ASAR version, and records executable,
ASAR, backend and complete bundle digests. No entry, dependency, ASAR, signature or
quarantine attribute is rewritten. This is a copied DMG application, not Finder,
Gatekeeper/notarization or public-download qualification.

The thin integration entry calls `snippets-dmg-campaign.ts`; a separate
`snippets-dmg-main.ts` entry invokes the finite `snippets-dmg-driver.ts` controller.
These are the same orchestration functions exercised by controlled headless tests,
not alternate scenario implementations. The controller runs under
`runNativeFixture`; it registers the actual
packaged launch with the existing write-ahead ownership protocol. The unchanged
app receives only a loopback inspector, isolated profile and readiness-shell
arguments. Its environment excludes source Node/npm settings and uses system
commands, isolated HOME/XDG roots, native graphics and Chromium sandboxing—no
Linux flags. The existing inspector observer asserts actual app/version/executable/
ASAR and backend identity, creates an ordinary New Tab and invokes the shared
scenario. Baseline readiness PTY liveness uses real macOS `ps` start identity,
not `/proc` or PID-only existence.

Normal Quit must join baseline/scenario PTYs and backends; the controller also
requires actual main exit, stream closure and absence of its captured descendants
before it can succeed. The shared scenario joins the Quartz observer and verifies
OS release independently. The outer supervisor owns timeout, cancellation,
controller loss and remaining native descendants. It may recover processes but
cannot convert forced settlement into a successful normal Quit or prove OS keyup.

Each run uses fresh private `EVIDENCE/run-*` receipts, but supervisor receipts use
unique `EVIDENCE/supervisor-run-*.json` filenames in the **same configured lane**.
`run-*/supervisor-location.json` records that path. The existing runner therefore
shares `EVIDENCE/ownership-blocked.json` across attempts and refuses unresolved
ownership before preparing or launching another controller. Do not change the
configured evidence lane to evade a stop receipt; macOS recovery remains manual.

The application/profile and input evidence are outside the supervisor's disposable
launcher directory and are retained on **every** outcome, including success. Root
owns later useful-profile cleanup; profile existence is not evidence of live
processes. There is no asynchronous profile-deletion race to disguise cancellation
or destroy failure evidence. DMG, archive and complete copied-bundle identities
are checked again even after a reported failure. Finalization first writes an
asynchronous non-success checkpoint, then checks cancellation and synchronously
publishes the final outcome without another await. Cancellation during final
identity checks or checkpoint publication rejects and records failure. A failed,
missing, truncated or still-finalizing result is not PASS. The final receipt is a
completion-boundary snapshot, not a promise of filesystem atomicity or protection
against cancellation after completion. If the worker itself is killed, root must
perform identity checks from the retained receipts; missing `result.json` is not
PASS. The external Quartz
marker is never reset by this adapter. After interruption, inspect the marker,
PID/start settlement and independent OS state before authorizing another run.

This adapter does not repeat or supersede the delivered source qualification,
extend published catalog admission, change immutable archives/receipts or authorize a
release. Exact native DMG execution remains an integration-owner gate.

## Exact Windows ARM64 staged adapter (provisional qualification)

`test/integration/snippets-windows-exact.test.ts` is fixture-only tooling for an
assigned Windows ARM64 desktop, not a qualification receipt. It launches the
actual staged `OMXTerm.exe` and its unchanged `resources/app.asar`, rather than
dependency Electron importing an ASAR entry. The source adapter above remains
separate evidence. No package, catalog, public archive or version is changed.

**The early-arm/readiness-only probe completed on Electron 43.8.1 / Node
24.22.0. The first ordinary exact-stage campaign using a Node 26.12.1 controller
and controlled child failed at the first-Insert receipt; a separately selected
Node 24.22.0 ARM64 pair then passed all ten checks.** The
[exact-stage checkpoint](../../docs/snippets-migration.md#windows-arm64-exact-stage-and-nsis-checkpoint)
records both outcomes and the matching FULL NSIS result. The comparison does not
establish a Node-version cause or eliminate historical intermittence. Earlier
failures remain failed; no other controller/child runtime is silently qualified. First run the readiness-only probe below for a new exact pair; its
completion is not a Snippets campaign. It must establish the real process, entry breakpoint,
synchronous observer/readiness installation before the first window and PTY,
first `-e` controlled-Node session, renderer ACK/mode barrier and normal joined
Quit. The controller refuses an unidentified initial script, wrong PID/creation
identity, wrong entry or late window, and never falls back to a later New Tab.
The accepted startup is the first captured exact-entry module pause, before any
controller resume, with the actual ESM loader's verified inspector-wrapped
instantiation call. The loader source hash and call location are pinned to the
natively checked Electron 43.8.1 / Node 24.22.0 runtime. The entry source must
match its inspected ASAR bytes. Unknown loaders, later body breakpoints and
bootstrap fallbacks are refused. A dependency update needs fresh native proof,
not relaxed matching. Same-runtime ESM/CJS controls supported the instantiation
ordering; zero current windows or newly observed PTYs alone cannot prove it.
The owned entry breakpoint is removed before resuming.

`--inspect-brk` also suspends the ConPTY output worker. A same-runtime control
reproduced missing worker readiness; `NodeWorker.enable` alone did not release
it. The fixture admits exactly the expected packaged node-pty worker URL and
correlates both root forwarding acknowledgements and worker protocol replies
before resuming its one initial startup pause. Foreign identities, missing
replies and later pauses fail closed. No constructor, dependency, PTY data or
input-admission path is replaced. `worker-inspector.json` records this debugger
instrumentation; CDP detachment is not proof of thread or kernel settlement.
Actual main exit and EOF remain mandatory.

A Node-only headless inspector test and simulated controller events do not prove
Electron's native startup ordering. If this probe fails or its evidence cannot
establish that ordering, retain the failure and stop for owner investigation;
do not run the campaign, retry, or reset ownership/input guards automatically.

Use the native prerequisites and idle unlocked Interactive/Limited session in
[development](../../docs/development.md#platform-prerequisites) and the Windows
[source checkpoint](../../docs/snippets-migration.md#windows-arm64-source-transition).
Use native ARM64 Node and a matching stage and installer built and inspected
separately from the exact intended source. The installer is bound for comparison,
not run by this adapter. Verify the public Snippets `0.1.0` archive independently:
**76,653 bytes**, SHA-256
`6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`.
Reuse those exact bytes; never rebuild or relabel the archive or its receipt.
Leave all source/AppImage/DMG adapter variables and other Snippets diagnostic
flags unset. Use absolute paths; the private evidence lane must be separate from
the stage and remain the same across attempts:

```powershell
$env:OMXTERM_SNIPPETS_WINDOWS_STAGE = 'C:\private\release\win-arm64-unpacked'
$env:OMXTERM_SNIPPETS_WINDOWS_INSTALLER = 'C:\private\release\OMXTerm-0.24.0-dev.36-arm64.exe'
$env:OMXTERM_SNIPPETS_WINDOWS_INSTALLER_SHA256 = (Get-FileHash -Algorithm SHA256 $env:OMXTERM_SNIPPETS_WINDOWS_INSTALLER).Hash.ToLowerInvariant()
$env:OMXTERM_SNIPPETS_WINDOWS_ARCHIVE = 'C:\private\snippets-0.1.0.omxext'
$env:OMXTERM_SNIPPETS_WINDOWS_VERSION = '0.24.0-dev.36'
$env:OMXTERM_SNIPPETS_WINDOWS_EVIDENCE = 'C:\private\snippets-exact-evidence'

# First, only the provisional native pause/readiness/normal-Quit probe:
$env:OMXTERM_SNIPPETS_WINDOWS_PROBE = '1'
npm.cmd test -- test/integration/snippets-windows-exact.test.ts
```

Inspect the fresh `run-*` directory and its `supervisor-location.json`,
`artifacts.json`, `initial-pause.json`, `entry-pause.json`, `entry-source.js`,
`loader-source.js`, `attachment.json`, `worker-inspector.json`, `probe.json`,
`quit.json`, `controller.json`, the stage,
archive, installer and controlled-Node before/after identity files, and supervisor receipt. A completed probe has `result.json` with
`probeComplete: true` **and `passed: false`**. Confirm its actual entry URL and
pause, PID plus creation identity, zero windows/observed PTYs at arm, the one
initial probe PTY and readiness/ACK, joined PTY Quit, actual main exit 0, close,
both stream EOFs, absence of the controller's captured descendants and outer
supervisor settlement. The probe does not install
Snippets or exercise held Enter. If the native evidence supports the ordering
and the owner authorizes the ordinary campaign, unset the probe flag and run
once in the **same** evidence lane:

```powershell
Remove-Item Env:\OMXTERM_SNIPPETS_WINDOWS_PROBE
npm.cmd test -- test/integration/snippets-windows-exact.test.ts
```

No opt-in skips by default; partial or mixed inputs refuse. The ordinary command
sets no diagnostic flags. It retains the existing shared ten checks, timeout,
controlled approval, byte/CPR/ACK oracles, 150 ms drain, full-interaction
no-leak assertion, and independent held-to-up Windows input observation. Inspect
`scenario.json`, `quit.json`, `controller.json`, `pty-writes.json`,
`native-keys.json`, `installed-child.png`, `installed-core.png`, and
`preview.png` alongside the supervisor receipt. Screenshots require actual image
inspection; separate WebContents captures do not establish compositor behavior.
A successful final `result.json` requires `passed: true`; absent, malformed,
truncated, cancelled or `finalizing` evidence is never PASS.

The retained manifest identifies every stage file/directory and digest, executable,
ASAR, entry, backend, unpacked ARM64 runtimes, installer, archive, host version,
locked Electron/Node-PTY and the fixture's Restty parser bundle and input hashes.
Stage links are refused rather than treating a link name as its target's bytes.
The parser is bundled from the installed locked Restty outside the package; the
owner must bind that fixture source/lock and build provenance to the supplied
stage. The snapshot is an identity comparison, not a signing or build-provenance
attestation. Stage, installer, archive and controlled Node are rechecked on success and failure;
a killed worker may leave no final receipt, requiring manual checks. Profiles
and private synthetic evidence are retained for owner cleanup on every outcome.

The existing outer supervisor's `ownership-blocked.json` is shared by the lane.
The Windows held-input marker has a fresh UUID and is **not** an automatic
cross-run guard. After any failed or uncertain input, inspect its marker, OS key
state and PID/creation settlement before any later run; a cleanup key-up is not a
passing gesture. Do not change lanes to evade a guard or treat forced cleanup as
normal Quit. The separate stock FULL verifier on the matching NSIS installer and
stage remains required where applicable; it does not run installed-path Snippets
GUI, and this staged campaign does not replace it.

## Snippets 0.1.1 public-catalog follow-up

The opt-in `PUBLIC_UPDATE` mode of `test/integration/snippets-appimage.test.ts`
is a bounded 0.1.0 → 0.1.1 checkpoint, **not a native or public PASS**. It uses
the unchanged published Linux ARM64 0.25.0 AppImage and an ordinary local chooser
and trust prompt to install the exact 0.1.0 baseline as generation 1. It opens the
old backend, then uses production Browse/Refresh and Update over HTTPS; a separate
passive Node HTTPS/IPC observer binds the captured catalog selection, streamed
archive digest and Official trust to generation 1. It requires old-backend exit,
enabled dormant generation 2, a fresh activation, unchanged synthetic YAML, the
same focused Surface/canvas and usable PTY, and natural joined Quit. The checked
visible catalog card is retained as `public-update-card.png` before Update. The
independently downloaded 0.1.1 archive is an identity oracle, never a chooser or
download fallback.

First integrate and review the candidate, then compare both public catalog
endpoints byte-for-byte with integrated source. Record the SHA-256 of the actual
legacy endpoint bytes for this invocation; a stored endpoint receipt alone is not
a passive network trace or public-consumption result. The observer checks the
actual production request stream separately. Use only an assigned disposable
Linux ARM64 guest after the desktop, shared-clipboard and Linux service
prerequisites in [development](../../docs/development.md#running-native-tests).
Follow the existing AppImage adapter's settlement and preservation requirements;
retain failures and scoped evidence. No automatic replay or test-oracle relaxation.

Set the following to absolute, independently verified files in the guest. The
adapter refuses a non-ARM64 host, different 0.25.0 AppImage or 0.1.0 baseline,
and checks the target oracle's size and hash independently:

```sh
export OMXTERM_SNIPPETS_APPIMAGE_PUBLIC_UPDATE=1
export OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE=/absolute/path/OMXTerm-0.25.0-arm64.AppImage
export OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE_SHA256=78ba5335d2f10dda7777d8e0e65a09bdaff355a69978aac8582499130c3b9ccd
export OMXTERM_SNIPPETS_APPIMAGE_ARCHIVE=/absolute/path/snippets-0.1.0.omxext
export OMXTERM_SNIPPETS_APPIMAGE_ARCHIVE_SHA256=6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7
export OMXTERM_SNIPPETS_APPIMAGE_TARGET_ARCHIVE=/absolute/path/snippets-0.1.1.omxext
export OMXTERM_SNIPPETS_APPIMAGE_CATALOG_SHA256="$(sha256sum /absolute/path/verified-public-catalog.json | cut -d ' ' -f1)"
export OMXTERM_SNIPPETS_APPIMAGE_VERSION=0.25.0
export OMXTERM_SNIPPETS_APPIMAGE_EVIDENCE=/absolute/path/new-evidence-directory
npm test -- test/integration/snippets-appimage.test.ts
```

The existing local-archive mode and historical Windows public adapter remain
separate. This checkpoint does not repeat the ten-group functional matrix, prove
physical input/FUSE/helper behavior, resolve Windows failures or qualify other
targets.

## Windows ARM64 installed public-catalog adapter

🤖 AI-assisted.

`test/integration/snippets-windows-public.test.ts` is a separate five-check
public-consumption fixture, **not a native PASS**. It reuses the verified exact
Windows startup/controller/worker/PTY seams above but runs the actual installed
executable from the existing guarded exact-NSIS transaction callback. The retained
stage is only that transaction's payload reference. Do not feed an installed root
to the ordinary staged adapter and describe it as installed-public evidence.

This checkpoint is pinned to the public dev.36 product/tag
`c04a350fcd5d5a411b1993300cb62eab4a0feace`, the 155,134,581-byte NSIS/SHA-256
`57a556f64c6665befef6a096e902c1435fcc27c7c2db701b821bd224dd9d8d1b`
and the unchanged public Snippets identity above. The fixture source is separate:
use the reviewed dev.36 fixture branch and matching locked dependencies, not a
later stable-version checkout relabeled as the published product. Public archive
bytes are an independently downloaded **identity reference**, never a chooser
fallback. Installation and Reinstall use the packaged application's production
HTTPS catalog/archive downloader, with no transport interception or test CA.

### Preconditions and invocation

ROOT must first integrate the reviewed common Snippets promotion into both
complete catalogs. Read back both exact fixed endpoints, compare against their
actual integrated source and verify the unchanged Snippets identity/Windows ARM64
target. Windows uses the legacy endpoint. Do not mistake a source JSON edit,
helper output or public-download hash alone for this packaged HTTPS checkpoint.

Use the authorized disposable ARM64 VM, an idle unlocked Interactive/Limited
ordinary-user desktop and the native prerequisites above. Inspect the actual
recovery snapshot, complete known installation/cache/registry/shortcut/process
footprint and ownership/input guards before installation; snapshot listing is not
restoration evidence. The installer can replace a known prior installation.
`/D=` and isolated userData do not isolate machine-wide registration/cache effects.
Use the already verified official Node24.22.0 ARM64 controller and controlled child;
the prior Node26 first-Insert failure remains failed, without a proven cause.
The earlier same-pair readiness, ten-check and FULL NSIS evidence is reusable;
this public scenario is not an automatic rerun of them.

Supply absolute paths to a freshly public-downloaded installer/archive and the
unchanged qualified stage. Leave ordinary source/AppImage/DMG/Windows adapter and
diagnostic variables unset. Keep the configured evidence lane stable across
attempts; public-only variables do not opt into the old staged test.

```powershell
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_STAGE = 'C:\private\qualified\win-arm64-unpacked'
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_INSTALLER = 'C:\private\public-download\OMXTerm-0.24.0-dev.36-arm64.exe'
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_INSTALLER_SHA256 = '57a556f64c6665befef6a096e902c1435fcc27c7c2db701b821bd224dd9d8d1b'
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_ARCHIVE = 'C:\private\public-download\snippets-0.1.0.omxext'
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_VERSION = '0.24.0-dev.36'
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_EVIDENCE = 'C:\private\public-snippets-evidence'
$env:OMXTERM_SNIPPETS_WINDOWS_PUBLIC_DISPOSABLE_VM = '1'
& 'C:\private\tools\node24\node.exe' '.\node_modules\vitest\vitest.mjs' run test/integration/snippets-windows-public.test.ts
```

No opt-in variables skips without network/installation. Partial, mixed, unknown or
non-disposable configuration refuses. Public mode has a new fixed 240-second
native/evaluation bound for the bounded production HTTPS operations and a
600-second outer test bound for install/native/uninstall. Ordinary local/probe
120-second bounds and failed historical deadlines remain unchanged.

### Controlled child-input diagnostic (never qualification)

For an owner-authorized new diagnostic occurrence, keep the complete public recipe
and same evidence lane above, adding only
`OMXTERM_SNIPPETS_WINDOWS_PUBLIC_CHILD_STDIN_DIAGNOSTIC=1`. Unset or `0` selects
ordinary public mode; other values and mixed adapter/diagnostic inputs refuse.
Remove this variable, or set it to `0`, before a later ordinary qualification.
This switch does not authorize an automatic rerun of a failed occurrence.

The controller assigns the literal flag only to its known initial controlled Node
child, not an account shell, backend or Electron environment. The child derives
`run-XXXXXX/child-input-diagnostic.jsonl` from its owned copied fixture location;
there is no destination input. The existing bounded synchronous recorder opens a
new file exclusively and records synthetic child-stdin callback bytes before
parsing/rejection, separately from observer PTY writes. Keep these raw controlled
bytes private. An optional `child-input-capture-error.json` reports capture failure.
Synchronous capture can perturb timing; missing, incomplete, truncated or failed
evidence is inconclusive, not proof of empty input, upstream provenance or PASS.

The same opt-in also creates `run-XXXXXX/parent-pty-diagnostic.jsonl` before
observer installation. It records attachment, observed output and pre-call
`PTY.write` attempts with sequence, UTC/monotonic timestamps, PTY index and
current PID; `pidKnown:false` explicitly includes the late-PID interval. Data
is the exact JavaScript string's UTF-16LE code units encoded as base64, not raw
socket bytes. Chunks are not joined. The observer attaches after node-pty creates
its agent, so it cannot prove the absence of pre-attachment activity. A write
record proves only an attempted call, not successful forwarding, deferred socket
delivery, ConPTY transformation or child stdin. This separate private journal is
bounded to 256 events, 65,536 combined encoded PTY-data bytes and 262,144
serialized bytes; truncation, unexpected PTYs or non-string data mark it
incomplete. `parent-pty-capture-error.json`, missing or partial records likewise
mean unknown. The journal is exclusive; failures do not alter PTY forwarding.
No additional PTY's data is retained.

Diagnostic mode always withholds public PASS. After an otherwise successful
transaction it intentionally fails with
`PUBLIC_CHILD_STDIN_DIAGNOSTIC_NOT_QUALIFICATION`; an earlier actual scenario,
settlement or cleanup failure remains primary. Neither the journal nor this
expected diagnostic result authorizes uninstall: the same directly awaited native
return, fresh same-lane receipt and unchanged stock cleanup fence remain required.
It is not normal-Quit evidence or a product correction by itself.

### Five checks and cleanup authority

1. Actual Browse and exact visible catalog-card Install, controlled **Official**
   ID/version/digest consent at generation0, then dormant installed generation1.
2. Explicit Toggle, existing YAML and one exact `SNIPPETS_RUN\r`, with one framed
   child receipt and no other semantic writes.
3. Actual public Reinstall, controlled consent at generation1, joined first
   backend and dormant installed generation2.
4. Explicit activation of the second backend, Disable/join, dormant Enable and
   Uninstall; the YAML remains byte-identical.
5. The original canvas/Surface/s1 ConPTY remains usable for exact
   `SNIPPETS_PING\r` and its one framed receipt, without leaked semantic input.

The observer separately joins **normal Quit**: one PTY onExit, both retired
backend exit0/close identities absent, actual main exit0/close/both EOFs and
clean bounded captured/registered supervisor settlement. Two backends have already
retired through management; this is not an active-backend-at-Quit witness.
Lexical focus/CPR classification, raw writes, ACK/mode/render barriers and
150ms drains remain as documented above. No held-input/preview/locale matrix is
repeated. Controlled Chromium input is not physical keyboard/autorepeat or an
ordinary account-shell qualification.

A small fixture-local execute fence preserves the stock NSIS registry/cache/hash/
process guards. The installed callback enters unresolved state **before** native
handoff. Only the same directly awaited native runner's returned validated clean
outcome, matched to its fresh same-lane receipt, can authorize the relocated owned
uninstaller. A receipt alone, rejected runner, stale/malformed/mismatched journal
or cleanup error never unlocks it. Joined forced cleanup can authorize uninstall
after a failed scenario; it can never qualify normal Quit or public PASS. The
stock transaction may create an owned relocated uninstaller copy before the fence;
on refusal, retain and identify it with the installed payload/cache. Preserve both
primary and cleanup failures. Never reset permission, delete payload broadly,
change lanes, rerun or launch a staged fallback automatically.

Profiles, Node/controller/launcher/supervisor and evidence remain outside NSIS's
case-insensitive **string** termination prefix, not merely outside its directory
tree. A clean supervisor result is bounded captured/registered ownership evidence,
not universal containment of arbitrary escaping descendants. Installed executable,
ASAR and runtime identities—not the reference stage's paths—must match before/
after. Stock payload comparison remains one-way, allowing the owned uninstaller;
it is not proof that no extra installed file existed.

### Receipts and interpretation

Inspect fresh `public-*/result.json` plus `inputs.json`, its `innerEvidence`
`run-*` directory, `native-association.json`, `artifacts.json`, actual entry/loader/
worker attachments, `scenario.json`, raw `pty-writes.json`, `quit.json`, controller
and supervisor receipts. Inspect the actual public catalog/active child/core/
management/terminal PNGs, not merely their existence or mock captures. Keep before/
after installer, archive, Node, reference-stage and installed-tree identities.

The inner public run deliberately never publishes `passed:true`; the outer
`public-*` owner can do so only after guarded uninstall/cache/destination cleanup,
all final identities and cancellation checks complete. Missing, failed,
`finalizing`, malformed or cancelled evidence is not PASS. Profiles/evidence and
failed ownership scopes remain retained for the owner, not silently removed.
Independent known-footprint and OS key-state checks remain operator work. This
fixture does not qualify SmartScreen/UAC, compositor freshness, Windows x64,
Files/SSH, later main or stable-version bytes.

## Oracles and limits

- Absent/disabled package guidance without implicit installation or enablement;
  retained compatibility toggle with catalog readiness before row interaction.
- Dormant install, exact archive trust, one active native child/backend, and no
  built-in Snippets DOM in the core renderer.
- Exact PTY bytes for Insert and Run on POSIX. On Windows, original ordered
  writes are retained; standalone focus shapes and bounded CPR shapes correlated
  with earlier lexical query observations are recorded separately. Exact semantic
  bytes and the full interaction still reject prefixes, duplicates, newlines and
  delayed leakage. POSIX shell output receipts
  prove execution; Windows probe receipts prove the fixed child bytes/lines within
  the observed windows. Native Enter activation, repeat after focus handoff, and
  release must not append extra input. Chromium repeat receipt is checked explicitly.
- Both preview intent overrides; literal preview body; native-child exclusion;
  Cancel emits no semantic bytes and restores the initiating control's native
  focus. Separately classified Windows protocol writes may still be observed.
- Retained query across hide/reactivate; live en-US/pt-BR labels via real Settings
  language changes without replacing the query.
- Disable/uninstall joins backend retirement, preserves catalog bytes, and leaves
  the same canvas and PTY usable for a subsequent shell command.

Linux rendering explicitly selects ANGLE SwiftShader, not the default GPU. Optional
evidence retains supervisor results, child/core/preview captures and failure
DOM outside the cleaned fixture profile. Preview evidence now waits for two
renderer animation-frame opportunities after dialog-open/exact-body readiness,
then rechecks the same connected open dialog, body identity/exact text and native
child exclusion before capturing. This test-only barrier follows the existing
child/Files capture pattern; the unchanged enclosing native deadline bounds stalled
frames. Headless regressions check ordering and stale-state refusal, not pixels.
The earlier Linux x64 source preview capture remains blank/unqualified: neither
this barrier nor a DOM PASS proves paint or diagnoses that observation. The next
native campaign must inspect the actual new image. If still blank, retain it and
compare dialog/body computed visibility and bounds with the capture under the
same rendering mode before considering a product change. Separate WebContents
captures are not OS-compositor evidence. Input uses DOM clicks and Electron
`sendInputEvent`, plus `/usr/bin/xdotool` XTest events for the held Enter sequence
across native focus handoff (install xdotool in the assigned guest). Keydown,
and repeat are observed through Electron on the child/core respectively. Release
is verified with X11 `XQueryKeymap` (Python 3 and libX11), followed by exact PTY
byte isolation and a fresh Enter that must reach the terminal. A minimal Electron
comparison reproduced missing `before-input-event` and DOM keyUp after prevented
autorepeat, even without OMXTerm; this fixture does not claim an Electron keyUp
receipt for that suppressed sequence. This is synthetic X11 input, not physical keys. Consent is
controlled.

On macOS, the held and fresh Enter sequences use synthetic Quartz session events.
The fixture requires trusted child activation, actual prevented Chromium core
repeat after focus handoff, and independently observed tagged OS release to the
actual application PID with session key state transitioning from held to up.
Product-independent Electron 43.8.1 comparisons reproduced omitted keyUp after
prevented autorepeat; a Quartz comparison observed both OS release and session
state while that omission persisted. The fixture does not claim a consumed
Electron keyUp when it was omitted. Any delivered held keyUp must still be consumed.
Exact PTY bytes, bounded no-leak drain and a fresh Enter delivered to the same PTY
remain unchanged. API submission, stale prior-gesture receipts, wrong tokens/PIDs,
and constant HID-key-up queries cannot satisfy release. Missing observation or
observer continuity fails without fallback or timeout increases.

This is synthetic Quartz **session** input, not hardware/HID state or physical
keyboard/natural autorepeat timing. Repeat is explicitly marked in a posted event.
Native graphics selection is not broad GPU qualification. Separate WebContents
captures are not OS-compositor evidence. The full ordinary nine-scenario macOS
source campaign passed with inspected child/core/preview captures, joined native
cleanup, final session/HID-up state, no unsettled-input marker and verified tool
hashes. It does not qualify exact-DMG GUI execution or public-HTTPS acquisition.

Windows uses the controlled line probe described above. Its fixed responses prove
that the selected ConPTY received the fixture's exact synthetic lines, not that a
normal Windows shell executed them. The full ordinary Windows ARM64 campaign on
`684d3ee9ca07a5bddade18d147fd3b23d6af2bfb` passed with independently observed
held/released state, a prevented core repeat, exact action/global windows and
joined shutdown. The [source checkpoint](../../docs/snippets-migration.md#windows-arm64-source-transition)
records the inspected captures, synthetic-input limits and unresolved historical
intermittence; it is not a complete portable or exact-package qualification.

There is a bounded post-delivery drain assertion, not proof against
arbitrarily delayed events. This fixture does not cover Kitty protocol, Protected
Paste, stale selection, missing targets, removal during preview, update, backend
crash, all catalog boundaries or published artifact compatibility; those require
separate evidence. Native execution remains the integration owner's responsibility.
