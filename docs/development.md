# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) for cloning,
installing and opening the app. This page covers native prerequisites and tests.
Use the [Restty guide](restty-development.md) for Terminal Surface maintenance and
[release procedures](release.md) for packaging.

## Platform prerequisites

Use native ARM64 macOS, Linux or Windows with Node.js 22.13+ within 22.x, or 24+.
Build on the VM's native filesystem, not a host shared folder. Run development
commands as an ordinary user and one native suite at a time per desktop,
including across clones: Electron fixtures share the compositor and input.

### macOS

Use Apple Silicon and Xcode Command Line Tools. If needed, run
`xcode-select --install` and finish installation before `npm ci`.

Postinstall builds the pinned Unix node-pty runtime. `npm run build` also compiles
`native/macos-window-blur.mm` with pinned build-only Node-API headers and a macOS
12.0 deployment floor. Compilation requires Apple clang and the macOS SDK, not
an Electron ABI rebuild. Runtime addon failure uses the documented fallback in
[ADR 0030](adr/0030-prefer-direct-macos-background-blur.md).

### Linux

Install Python 3, `make`, a C++ compiler, `patch`, `binutils`, process-inspection
and fontconfig tools, fixture fonts, and XWayland for a Wayland desktop:

```sh
# Ubuntu
sudo apt install build-essential python3 patch binutils procps fontconfig file xwayland fonts-dejavu-core fonts-liberation
```

```sh
# Fedora
sudo dnf install gcc-c++ make python3 patch binutils procps-ng fontconfig file xorg-x11-server-Xwayland dejavu-sans-fonts dejavu-sans-mono-fonts liberation-mono-fonts
```

```sh
# Arch / Omarchy
sudo pacman -S --needed base-devel python patch binutils procps-ng fontconfig file xorg-xwayland ttf-dejavu ttf-liberation
```

Install a supported Node.js/npm separately; an existing version-manager setup
needs no second system installation. Native font fixtures require exact installed
families `DejaVu Sans`, `DejaVu Sans Mono` and `Liberation Mono`. Check
`fc-list : family`, not merely a `fc-match` substitution. Bundled application
fonts do not satisfy installed-family tests. Missing fonts can produce
`Configured native fixture font is missing` followed by startup timeouts.

Postinstall builds node-pty's ARM64 Node-API runtime and applies checksum-guarded
runtime preparation. Missing `patch` or a compiler can leave dependencies partly
prepared, including Restty event declarations. After fixing the prerequisite,
resume from the repository directory:

```sh
npm run postinstall && npm run check:portable
```

Do not repeat preparation before every check or copy native modules from another
platform. Unknown dependency bytes require review rather than a new guessed hash.

Graphical tests need an authenticated, unlocked X11/XWayland desktop with WebGL2;
native Wayland is not claimed. Over SSH, use that desktop's `DISPLAY` and X11
authorization with access control enabled. Inherit its `XDG_RUNTIME_DIR`,
`WAYLAND_DISPLAY`, `XDG_SESSION_TYPE` and `DBUS_SESSION_BUS_ADDRESS` as applicable,
without guessing another user's values. A bounded idle inhibitor may keep the
desktop awake, but Electron still runs as the ordinary desktop user.
`xvfb-run` smoke tests do not establish native desktop behavior.

External automation such as `xdotool` may need compositor-specific remote-control
consent. RDP sharing or sudo access does not grant that consent. Approve the
specific input request where appropriate; do not disable security globally.

OMXTerm uses a fixed Linux `--no-sandbox` policy. `npm run dev` supplies the flag
before Electron bootstrap; a raw diagnostic launch after building is:

```sh
npx electron --no-sandbox .
```

Do not change sandbox-helper or `/dev/shm` permissions. macOS and Windows retain
Chromium sandboxing. See
[ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md).

The statically linked AppImage runtime needs neither zlib development headers nor
system `libfuse2`; mounting needs kernel FUSE support. Extraction is the fallback.

### Windows

Enable **Developer Mode** in Windows Settings before cloning or testing. Tests
create real symbolic links as an ordinary user; missing permission can cause
unrelated suites to fail with `EPERM`. Packaged-app users do not need this setup.

- Clone with `core.autocrlf=false` and `core.symlinks=true`. These preserve LF and
  repository links but do not grant symlink privileges. If links were checked out
  as plain files, preserve changes and clone again after fixing permission.
- Install the ARM64 Visual C++ Redistributable. Install native build tools if npm
  cannot obtain a matching dependency prebuild.
- Check `Get-ExecutionPolicy -List` in Windows PowerShell (`powershell.exe`).
  Local npm shims and native inspection helpers need script execution permission.
  Where organizational policy permits, use a temporary
  `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned` shell; this does not
  change persistent policy. `npm.cmd` bypasses only npm's PowerShell shim.
- Keep UAC, Defender and other protections enabled. Run tests non-elevated; an
  administrator run hides missing ordinary-user prerequisites.
- Inspect the operation behind `EPERM`: symlink creation and deletion blocked by
  an open handle are different failures.

#### Verify ordinary-user symlink access

Run in a non-elevated PowerShell terminal before `npm ci`:

```powershell
@'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'omxterm-symlink-check-'));
try {
  fs.writeFileSync(path.join(root, 'target.txt'), 'ok');
  const link = path.join(root, 'link.txt');
  fs.symlinkSync('target.txt', link, 'file');
  if (fs.readFileSync(link, 'utf8') !== 'ok') throw new Error('Symlink read failed');
  console.log('PASS: ordinary-user file symlink creation');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
'@ | node
```

A privilege failure calls for checking Developer Mode and organization policy,
not elevating the whole suite.

#### Run from the graphical session

Run graphical tests and package verification in the logged-in, unlocked desktop.
Windows OpenSSH normally uses non-interactive Session 0 even for the same user;
GPU startup, selection and captures there do not qualify the desktop path.
Compare sessions with:

```powershell
[System.Diagnostics.Process]::GetCurrentProcess().SessionId
Get-Process explorer | Select-Object SessionId
```

Matching IDs check setup, not rendering. Software-renderer flags do not replace
required native graphics coverage. From a desktop PowerShell terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned
# In the temporary shell, from the repository directory:
npm.cmd ci
npm.cmd run check:portable
```

## Test discovery

Vitest discovers `*.test.*` and `*.spec.*` beneath `test/unit/` and
`test/integration/`. `test/fixtures/` is support code; `.scratch/` is excluded.
Inventory files without importing suites or launching fixtures:

```sh
npx vitest list --filesOnly --json
```

`npm test` runs the default suite. `npm run test:integration` runs only
`test/integration/local-shell.test.ts`, not the integration directory. Default
reporters retain console output and write `.scratch/vitest-results.json`.
Each invocation replaces that report; copy it before another run when needed.
Interrupted runs may not finish it. Retain the command outcome and native
journals, and review local paths and failure details before sharing.

## Running native tests

### Qualification scope

`npm run check:portable` runs formatting, lint, type checking, the default Vitest
suite and an unpackaged build. It does not package, install or publish.
Platform guards and opt-ins determine which tests execute; a skip is not a pass.

Keep the tested desktop unlocked and idle while graphical fixtures run. Real
pointer movement, modifier keys and window activation can replace a fixture's
controlled hover, selection or focus state. Hover evidence retains every setter
request's revision/time separately from the revision/time of actual cell-set
transitions, observed after the prepared setter's full identity equality guard.
Draw readiness and capture stability require the intended cell-set transition
(including equal-count different cells), not a redraw for an equivalent request.
Dispatch still requires its own setter request; a no-op keyup cannot claim a
positive cue's release cleared before that dispatch. An initially drawn empty
set can serve the baseline and no-link cases. A `stimulus-invalidated` failure
means that the measured cell set or content changed; inspect retained requests
and events before attributing it to terminal rendering. Do not retry until green
or discard the original failure. A later pass alone does not identify its cause.

For a graphical test run:

- Leave the VM logged in and unlocked, and do not minimize or suspend it.
- Do not click, drag-select on the desktop, type, or move the pointer across
  fixture windows. Desktop clicks can steal focus from native menu/key tests.
- Run only one graphical suite per desktop. When diagnosing shared-host
  contention, run one VM's suite at a time against the same source candidate.
- If a run fails, preserve `.scratch/vitest-results.json` and
  `.scratch/native-fixtures/` before another run overwrites evidence. An
  `ownership-blocked.json` file requires the ownership inspection described
  below; do not clear the directory indiscriminately.

Input interference is not proof of an application defect. Conversely, application
failure on ordinary focus loss is a defect, not something to excuse as test
interference. The default `check:portable` includes graphical tests; it is not a
headless-only check.

Controlled renderer input, injected I/O and held continuations establish the
asserted boundaries, not physical input or every production interleaving.
Native captures establish fixture pixels on the tested GPU, not cross-platform
rasterization parity. Native API success or `capturePage` does not prove visible
behind-window blur. These are coverage limits, not extra manual-release gates.
Current runtime constraints are in the
[Restty guide](restty-development.md#current-runtime-limitations).

### Focused checks

Run a focused command while developing, then the applicable full check. These
paths are entry points; read their assertions and platform/opt-in guards before
claiming qualification.

| Boundary                                       | Command                                                                                                                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendering, appearance and cursor               | `npx vitest run test/integration/restty-rendering.test.ts test/integration/restty-appearance-rendering.test.ts test/integration/restty-cursor-rendering.test.ts`                              |
| Tab removal readiness                          | `npx vitest run test/unit/tab-removal-readiness.test.ts test/integration/tab-removal.test.ts`                                                                                                 |
| Host image, output and reload oracles          | `npx vitest run test/integration/restty-host-oracles.test.ts`                                                                                                                                 |
| Integrated host and retained sessions          | `npx vitest run test/integration/restty-host-integration.test.ts`                                                                                                                             |
| Scrollback readiness and input                 | `npx vitest run test/integration/restty-native-scroll-feedback.test.ts test/integration/restty-scrollback-rendering.test.ts`                                                                  |
| Hover and local-image activation               | `npx vitest run test/unit/restty-hover-evidence.test.ts test/unit/restty-hover-readiness.test.ts test/integration/restty-hover-readiness.test.ts test/integration/local-image-native.test.ts` |
| Native window controls                         | `npx vitest run test/integration/window-chrome.test.ts test/integration/restty-cursor-rendering.test.ts`                                                                                      |
| About startup                                  | `npx vitest run test/integration/application-about.test.ts`                                                                                                                                   |
| Native failure acknowledgement                 | `npx vitest run test/integration/failure-acknowledgement.test.ts`                                                                                                                             |
| Initialization cancellation and font ownership | `npx vitest run test/integration/initialization-cancellation.test.ts test/integration/surface-font-ownership.test.ts`                                                                         |
| Literal argv                                   | `npx vitest run test/integration/literal-argv.test.ts test/unit/postinstall.test.ts`                                                                                                          |
| Unix native resize failure                     | `npx vitest run test/integration/terminal-resize-race.test.ts test/unit/terminal-resize-failure.test.ts`                                                                                      |
| Linux foreground Busy decision                 | `npx vitest run test/unit/linux-foreground.test.ts test/unit/postinstall.test.ts test/integration/linux-foreground.test.ts`                                                                   |

The host output oracle uses paced 128 KiB checkpoints, not a continuous 2 MiB
retention guarantee. ACK progress measures synchronous Surface submission, not
rendered output; destination Copy and pixel assertions are separate checks.
Window/cursor fixtures compare bounded run-local raw Electron behavior before
choosing actual native transitions or an unavailable branch. Hide is not minimize
coverage, and a healthy unchanged maximize result is not a maximize/restore pass.
Do not run them concurrently with another native suite.

Scrollback retains fixed input classifications/counts, not arbitrary Adapter
writes. Unexpected character events or unrecognized writes invalidate the
stimulus and fail with `stimulus-invalidated`, rather than reporting a viewport
regression. This does not identify a physical input source, excuse a valid
behavior failure, or turn interference into a pass.

Cursor positives retain 64 records at each of DPR 1 and 2. The artificial
controls use bundled fonts and zero padding: eight style records across
initial/refit with held RAF, and four initial records plus three native blink
pixel samples with a held clock. Configured fonts, alternate padding, zoom and
reload remain in the positive matrices, not in those focused controls.

Appearance runs six unchanged scenarios in fresh profiles through the supervised
runner and the current test context. Per-run settings are prepared into the
fixture, not shared mutable environment state. Synthetic captures are retained
under `.scratch/restty-appearance-*` before profile cleanup, including successful
children whose later parent-side assertions may fail.

Palette/image mutation controls use a reload-only scenario with a matching
native positive. Real PTY image emission, initial Pi/Chafa placement and palette
pixels, hidden theme reload, peer cleanup/reveal and the existing rejection
oracle remain. They omit preliminary zoom/sidebar refits; the full positive
scenario still covers those transitions. Output drop/reordering controls remain
unchanged because source completion and ACK progress alone can miss data loss.

Window Chrome runs one native continuity scenario and an early-failure cleanup
check. Dropped, wrong-owner and duplicate routing are rejected by focused tests
using the real exercise and main-process routing functions with native ports
simulated. The suite does not repeat the full native scenario with a deliberately
broken route; native rejection of that mutation and populated fixture-error
teardown are not claimed by those headless checks. Production close/quit and
fixture settlement have separate coverage.

On Windows, the window fixture moves the desktop pointer for native drag checks;
keep the desktop idle. Failure acknowledgement uses controlled cancellation of
Electron's native dialog, not physical OK-button input. Local-image picker tests
control the dialog port, not a user's picker interaction.

Cursor fixtures reject `OMXTERM_TEST_CURSOR_PRESENTATION_CONTROL` and
`OMXTERM_TEST_WINDOW_POLICY` if defined, even as empty strings. Remove those
variables from the shell instead of declaring compositor capabilities.

### macOS fullscreen comparison

For an optional HUD/direct-blur fullscreen comparison on an Apple Silicon desktop:

```sh
OMXTERM_TEST_MACOS_FULLSCREEN=1 npx vitest run test/integration/macos-window-blur.test.ts
```

This exercises native enter/leave transitions for both modes and records their
state. The ordinary test run leaves this comparison disabled. It is a focused
diagnostic, not a release gate or proof of visible compositor blur; run it
serially with other native fixtures.

### AltGr layout boundary

On an owned disposable Linux/Windows desktop with an active US International
AltGr layout:

```sh
OMXTERM_TEST_ALTGR_NATIVE=1 npx vitest run test/integration/altgr-native.test.ts
```

Linux needs `/dev/uinput` and noninteractive sudo for the short-lived keyboard
helper. Windows needs Explorer's interactive session. The helper sends OS key
codes through the current layout without changing it; it is not hardware-key or
arbitrary-layout qualification. Do not overlap other graphical input.

### Opt-in font stroke evidence

To retain the configured-font fixture's existing comparison JSON and six
synthetic blank/H-regular/H-bold PNGs in a full matrix run:

```sh
out=$(mktemp -d "$PWD/.scratch/font-evidence-prepared.XXXXXX")
OMXTERM_FONT_STYLES_EVIDENCE_PATH="$out/font-observations.json" npm run check:portable
```

Use the same retention setting for prepared and CLEAN conditions, with a fresh
owned destination for each invocation. The JSON path must not already exist;
collisions fail before launching this test's children rather than overwriting
another candidate. Without the variable, no extra image encoding, retention,
provenance hashing or artifact writes occur.

The existing five observation keys remain; `captureEvidence` adds a relative
index to a unique sibling `font-style-captures-*` directory. Its
`current-regular/` and `prior-regular/` variants each contain `blank.png`,
`strokeRegular.png`, `strokeBold.png` and `manifest.json`. Manifests record exact
phase/variant identity, PNG and original bitmap hashes, existing ink/pixel-size
metrics, reported DPR, and fixture-source/runtime/generated-bundle SHA-256s.
Only those synthetic images are retained; no font bytes, terminal text or native
paths enter manifest metadata. Bounds can be reconstructed from the raw PNGs;
this does not add font-face probes, neighbor metrics or renderer instrumentation.

The fixture reuses the assertion's existing children and exact original phase
images, not additional capture calls. PNG encoding and writes happen after each
child's final phase report, before it exits and its profile is removed. The
comparison JSON is written at the existing pre-assertion location, preserving
it on a failing stroke comparison. Earlier assertions/child errors can leave an
empty reserved JSON and only one variant or partial captures (`complete:false`);
missing files or manifests are missing evidence, not successful captures.
`complete` describes the three-image set, not a passing child or test. Retain
partial output and the command outcome instead of retrying automatically.

Opt-in source/bundle hashing and file reservation add startup work. Holding
three images until report changes memory/GC pressure; final encoding/I/O adds
latency before the next observation. Original capture order, GC, runtime guards,
180ms delay, metrics and assertions remain, but **unmodified timing and a fixture
fix are not claimed**. The delay/GC is not presentation acknowledgement.

Keep the complete unique directory with the matrix outcome, exact tested source
SHA/source manifest and runtime identities. The artifact hashes identify fixture
inputs, not the entire candidate; archived guest trees need the matrix owner's
source verification, not a guessed Git HEAD. Review JSON/logs before publication.
A retained later PASS does not resolve an earlier FAIL without its raw evidence
or establish historical causality (#597).

### Local-image preview capacity

For explicit resource qualification:

```sh
OMXTERM_TEST_IMAGE_CAPACITY=1 npx vitest run test/integration/local-image-capacity-native.test.ts
```

Inspect `.scratch/local-image-capacity.json`, not only the exit status. Latency
includes observed captured image pixels; `previewReadyMs` separately reports
overlay readiness. Electron working sets, lifetime peaks and sampled aggregates
are not unique RSS or GPU allocation accounting. Native decoding can block the
main sampler. Dismissal releases application ownership, not immediate process or
GPU reclamation. This opt-in uses synthetic images and repeated open/close cycles.

### Multiplexer comparison

On a POSIX desktop with tmux installed:

```sh
OMXTERM_TEST_IMAGE_TMUX=1 npx vitest run test/integration/restty-host-integration.test.ts
```

The fixture owns a foreground tmux server and pane PTY and exercises redraw and
visible-path recognition. This does not qualify arbitrary multiplexer inline
image passthrough or reinterpret producer hard breaks as soft wraps.

For POSIX-style opt-ins on Windows, set the matching environment variable for
the command and remove it afterward, for example:

```powershell
$env:OMXTERM_TEST_IMAGE_CAPACITY = '1'
npx vitest run test/integration/local-image-capacity-native.test.ts
Remove-Item Env:OMXTERM_TEST_IMAGE_CAPACITY
```

### Evidence reuse and packaging

Record commands, full tested SHA, prepared dependencies, environment, outcomes
and coverage limits in the task's issue/PR. Reuse a recorded PASS from Git or a
previous issue/PR only with equivalent relevant inputs. An isolated later pass
does not erase a failure; explain its current relevance and disposition.

Test/fixture-only changes need affected tests, not unchanged package rebuilds.
Version-only changes need new packages and package/version verification, not
unchanged behavioral reruns. `check:portable` already builds; explicit
`package-built:*` requires that build's current provenance. See
[release procedures](release.md#changed-inputs-and-build-to-tag-comparison).
Windows exact NSIS verification requires an authorized disposable VM, recovery
snapshot and literal `--disposable-vm-allow-omxterm-replacement` option; a temporary
`/D=` destination does not isolate replacement effects.

## Fixture ownership and cleanup

Use [runNativeFixture](../test/fixtures/run-native-fixture.ts) with the current
Vitest `testContext` and a file-only `prepare` callback. This joins preparation,
launch, cancellation and settlement in `onTestFinished` without turning cleanup
into a passing timeout result. Check cancellation before allocating the profile.
Once delegated, do not delete the profile on rejection: handoff may be uncertain.

Use [prepareFixture](../test/fixtures/prepare-fixture.ts) to settle all started
build/file writers before preparation errors escape. Choose one cleanup owner:
`runner` for delegated preparation, `recipe` for standalone recipe ownership.
Keep separately owned base-directory cleanup outside the supervised profile.

Create PTYs through `spawnFixturePty` and other children through
`spawnFixtureProcess`. They publish pending ownership before spawn and register
PID/creation identity. Missing process snapshots and arbitrary spawn exceptions
do not settle uncertain ownership. Let the supervisor remove profiles only after
verified process exit and stream closure. Preserve timeout, interruption and
worker-loss outcomes even when cleanup succeeds.

Results and synthetic stdout/stderr are retained under `.scratch/native-fixtures/`.
Safe phase metadata localizes pending operations but is not completion or process
ownership proof. An `ownership-blocked.json` receipt stops further launches in
that evidence scope. Before preparation, the runner can automatically archive
only a recognized Windows **pre-bootstrap** stop receipt: the retained
external-child request must match its intact temporary profile and evidence
scope, process inspection must establish that the authorizing parent's exact
PID/creation identity is gone, and no supervisor-ready, bootstrap, native
process/exit/output/cancellation, outcome or process-registration evidence may
exist. Pending registration files also prevent recovery. The runner rechecks
retained files before moving the receipt to a unique
`ownership-blocked-recovered-*/ownership-blocked.json` in the same evidence
scope. Only successful archival clears its cached stop; cancellation still
prevents new preparation or launch.

This releases a launch stop, not the previous supervisor's lifetime or original
failure. Recovery neither deletes the profile nor changes its evidence, executes
retained code, or kills processes. A WMI creation request can complete after its
caller timed out: a delayed external-child supervisor cannot start the native
fixture after the authorizing parent exits, but **may still clean up the old
profile** and publish its outcome. Receipt recovery does not guarantee profile
retention against that previously authorized cleanup or establish that WMI's
original failure is fixed.

Other cases remain blocked with a classified explanation and receipt location:
including a live parent incarnation, missing/replaced/linked profile entries,
invalid or mismatched JSON, inspection or archive errors, any bootstrap evidence,
completed outcomes, and POSIX supervision. Inspect the referenced owners and
retained evidence before manually clearing an unresolved stop; do not blindly
retry, delete uncertain profiles or terminate unrelated processes. Recovery is
serialized within the runner's evidence scope, not a cross-suite desktop lock.
The existing one-suite-per-desktop rule and cooperative ownership contract still
apply; these checks do not authenticate evidence against same-user forgery.

Windows supervision uses WMI breakaway from the test worker's Job. WMI and its
inspection helpers must be available under the caller's policy; Electron stays
in the caller's desktop/session. POSIX supervision uses detached ownership and
IPC-disconnect cleanup. These are cooperative cleanup, not process containment:
unobserved daemonization, children escaping before registration and supervisor
termination are outside coverage. Per-command cleanup bounds are not a total
cleanup deadline.

Not every caller supplies the outer Vitest lifetime join. The enabled AltGr and
capacity fixtures, direct recovery calls in interruption/early-exit/outcome
suites, and standalone worker-control paths need their own ownership discipline.
Serial Vitest configuration is not an outer finish join.

Focused preparation/ownership checks:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/fixture-preparation-callers.test.ts test/unit/native-preparation-ownership.test.ts test/unit/run-native-fixture-windows.test.ts test/unit/native-fixture-recovery.test.ts
```

These mock builders and use owned filesystem operations; they do not establish
native compiler, font, renderer or PTY success. Recovery tests include the actual
bundled supervisor with mocked process I/O and delayed startup; they establish
its external-child protocol, not real Windows WMI/Job behavior.

### Interruption regressions

These opt-ins deliberately terminate fixture-owned processes. Use an authorized
disposable VM with a working recovery method appropriate to its OS. Ordinary
checks skip them.

```sh
OMXTERM_TEST_NATIVE_INTERRUPTION=1 npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts
```

Windows also has real WMI outcome-publication and bootstrap-ownership controls:

```powershell
$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'
npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts test/integration/native-fixture-outcome-windows.test.ts test/integration/native-fixture-bootstrap-windows.test.ts
Remove-Item Env:OMXTERM_TEST_NATIVE_INTERRUPTION
```

The suites check interrupted registration, retained uncertainty, actual exit,
profile cleanup and an unrelated sentinel. Controlled interleavings do not
measure spontaneous failure frequency.
