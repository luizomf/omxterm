# Native development reference

Start with [Contributing](../CONTRIBUTING.md#development-environment) for the
fork, install and development commands. This page covers the platform and test
setup needed for Electron, native PTYs and graphics. Release builds follow the
[release procedure](release.md); Terminal Surface changes also use the
[Restty guide](restty-development.md).

## Platform prerequisites

Build on the target ARM64 platform with Node.js 22.13+ within 22.x, or 24+.
Use the VM's native filesystem rather than a host shared folder for native builds.

### macOS

Use Apple Silicon with Xcode Command Line Tools (Apple clang and the macOS SDK).
If needed, run `xcode-select --install` and finish the installer before `npm ci`.

`npm run build` compiles the macOS blur addon locally with pinned build-only
Node-API headers, targeting macOS 12.0. It needs neither a runtime download nor
an Electron ABI rebuild. Linux and Windows builds do not use Apple tooling.
[ADR 0030](adr/0030-prefer-direct-macos-background-blur.md) explains the private-API
tradeoff and runtime fallback.

### Linux

Install Python 3, `make`, a C++ compiler, `patch`, `binutils` for native package
inspection, `fontconfig` utilities and fixture fonts for exact family validation,
and XWayland when using a Wayland desktop. For example:

```sh
# Ubuntu
sudo apt install build-essential python3 patch binutils fontconfig file xwayland fonts-dejavu-core fonts-liberation
```

```sh
# Fedora
sudo dnf install gcc-c++ make python3 patch binutils fontconfig file xorg-x11-server-Xwayland dejavu-sans-fonts dejavu-sans-mono-fonts liberation-mono-fonts
```

```sh
# Arch / Omarchy
sudo pacman -S --needed base-devel python patch binutils fontconfig file xorg-xwayland ttf-dejavu ttf-liberation
```

These commands install build/test prerequisites, not Node.js/npm. Use a supported
Node.js version as described above; an existing version-manager installation
(such as Omarchy's mise-managed Node) does not need a second system installation.

Native font fixtures require the exact installed families `DejaVu Sans` and
`DejaVu Sans Mono`; reload fixtures also use `Liberation Mono`. Inspect
`fc-list : family` for those exact names, not merely a `fc-match` substitution.
Bundled runtime fonts do not satisfy tests of an explicitly configured installed
font, even when the application itself opens successfully. Missing fixture fonts
can cause `Configured native fixture font is missing` followed by long session
startup timeouts. Install the font packages before rerunning the native suite.

Run project commands as your ordinary user. Postinstall builds the pinned `node-pty` Node-API runtime with the native
exec-status correction. It requires `patch` and the C++ compiler on Linux and
Apple Command Line Tools on macOS; unknown pinned source bytes stop preparation.
A module copied from another platform is not interchangeable. See
[ADR 0032](adr/0032-report-native-exec-failures-outside-terminal-payload.md).

If `npm ci` or `npm install` fails during `postinstall`, `node_modules` can
remain partially prepared. For example, missing `patch` stops node-pty
preparation before the Restty corrections run. Later lint/type errors about
Restty's `title` or `bell` events can therefore indicate incomplete setup,
not an application type error. After installing the missing prerequisite, resume
preparation from the project directory:

```sh
npm run postinstall && npm run check:portable
```

The check runs only if preparation succeeds. There is no need to reinstall
unchanged dependencies or rerun preparation before every check. The DejaVu packages
above serve installed-font tests; users of packaged OMXTerm do not need these
build/test prerequisites.

Preparation also removes node-pty 1.1.0's Linux `process` getter fallback to the
spawned shell. Unavailable native foreground reads remain unavailable and count
as Busy; macOS and Windows policies are unchanged (ADR 0017). Before writing,
`scripts/prepare-node-pty-runtime.mjs` checks these exact SHA-256 inputs after
normalizing its exec-status callback forwarding:

| Unix runtime                             | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Original 1.1.0                           | `a62e3a60c3bc1b0e7261f58284856df748dcee6761a2bc7a5a5ba98b22660473` |
| Prior paused-exit-tail correction        | `238f993db4aa83d57885832eabe9c1de1ce05b96c84d3270574f26f71f9afcb8` |
| Paused-exit-tail + foreground correction | `89fafa225fe39a4fc7d2af373cf9381684a3b2bfe7aa5df073247eb3b91040cc` |

Each replacement must match once and produce the reviewed digest; repeated
preparation preserves corrected bytes and unknown bytes fail without writing.
Unit tests execute the pinned public getter with an unavailable native result
using isolated temporary runtime files. On Linux ARM64, the owned native fixture
checks an idle shell, ordinary `sleep`, and `/bin/true | /bin/sleep 2` with a real
unavailable lookup, then return to idle and native exit:

```sh
npx vitest run test/unit/linux-foreground.test.ts test/unit/postinstall.test.ts test/integration/linux-foreground.test.ts
```

This checks the Busy decision, not physical close-dialog interaction or loss of
user data. Foreground names remain in memory only.

Graphical tests and packaged launches need an authorized X11/XWayland desktop;
native Wayland is not currently claimed. Over SSH, use the desktop's `DISPLAY`
and X11 authorization while keeping X server access control enabled. Inherit
`XDG_RUNTIME_DIR`, `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE`, and
`DBUS_SESSION_BUS_ADDRESS` from the authenticated desktop as applicable; do not
guess another user's values. Privilege may hold a temporary idle inhibitor, but
Electron and tests must still run as the ordinary desktop user. Keep the
desktop unlocked during tests. A headless `xvfb-run` smoke test does not verify
native desktop behavior.

OMXTerm disables Chromium sandboxing on Linux, so no administrator sandbox setup
is needed. `npm run dev` supplies `--no-sandbox` before Electron starts and retains
it through the X11 relaunch. App main runs too late to establish this policy:
a bare `electron .` can abort before main or fail to start its renderer. For a
raw Electron diagnostic launch after building, use `npx electron --no-sandbox .`
on Linux; do not change sandbox-helper or `/dev/shm` permissions as a workaround.
macOS and Windows development launches retain their sandbox behavior.
[ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md) documents this tradeoff;
simple, reproducible contributions for sandboxed support are welcome.

The statically linked AppImage runtime needs neither zlib development headers
nor system `libfuse2`. Normal mounting uses kernel FUSE support;
`--appimage-extract-and-run` is the fallback when mounting is unavailable.

### Windows

- Clone with `core.autocrlf=false` to preserve LF formatting and
  `core.symlinks=true` to preserve repository symlinks. Windows Developer Mode
  enables unprivileged symlink creation.
- Install the Visual C++ Redistributable for ARM64. Without it, Electron's
  postinstall can fail with `ERR_DLOPEN_FAILED`. Install native build tools if
  npm cannot find a matching dependency prebuild.
- Local PowerShell scripts must be permitted: both npm's `.ps1` shims and native
  inspection/package helpers use them. `npm.cmd` bypasses only the npm shim.
  Check `Get-ExecutionPolicy -List` in Windows PowerShell (`powershell.exe`).
  Where organizational policy permits, launch a temporary shell with
  `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned` and run `npm.cmd`
  there. This affects that process and its children, not persistent user or
  machine policy. Keep organizational policy and security protections intact;
  a blocked inspection is an unavailable check, not a passed ownership guard.
- If `npm ci` reports `EPERM`, check for processes holding files open and review
  antivirus events before retrying, with protections still enabled.

Run graphical tests and package verification from the interactive desktop or a
VM harness configured to execute as its logged-in user. Windows OpenSSH normally
runs in non-interactive Session 0, even for that same user. GPU startup, selection
and pixel capture can fail or appear to pass intermittently there.

To compare the current process session with the desktop:

```powershell
[System.Diagnostics.Process]::GetCurrentProcess().SessionId
Get-Process explorer | Select-Object SessionId
```

Matching session IDs are a setup check; actual renderer/GPU tests must still pass.
Software-renderer flags cannot substitute for a required native graphics path.

Windows postinstall also corrects node-pty 1.1.0's array-argument serializer so
literal enclosing quotes with spaces or tabs reach the child unchanged. It
accepts only the reviewed original or corrected runtime digest and refuses
unknown bytes. Callers still pass literal argv directly, without a shell or
extra quoting. The native regression uses an argv-echo child through
`createLocalTerminalSession` and real ConPTY on Windows ARM64:

```sh
npx vitest run test/integration/literal-argv.test.ts test/unit/postinstall.test.ts
```

The same argv corpus checks direct executable startup on Unix ARM64. This does
not qualify outer CLI parsing or an exact installer.

## Running native tests

The standalone Restty rendering test hides the cursor after its input/reset
exercises, captures a blank baseline, then requires new glyph ink in three
separate expected word regions. Portable controls reject blank, cursor-only,
unchanged and out-of-region frames; native captures tolerate platform-specific
glyph rasterization rather than requiring identical bitmaps.

The cursor fixture captures real native WebGL2 pixels at DPR 1 and 2 through
font zoom, a controlled host-container width shrink, and configuration reload
with width restoration. Its font/padding matrix, cell bounds, focus/blink and
Surface/canvas/session continuity checks do not depend on the compositor
honoring an arbitrary native-window size request. Window Chrome fixtures retain
real native/content/Surface/PTY bounds and window-manager behavior coverage.

The host's inline-image oracle checks both cell-anchored Pi/Chafa rectangles
and their full complement after zoom, content shrink/restore through the
production Snippets Sidebar toggle, tab selection and configuration reload.
The sidebar must actually appear with loaded content, shrink the canvas and
real PTY grid, then disappear and restore both before later host phases.
The emitter clears unrelated earlier host scrollback once before placing images;
it never clears or re-emits them after zoom or content refit. Content/grid
readiness failures are reported separately from image-pixel failures. This is
content refit coverage, not a native-window sizing assertion.
It uses current `CSI 16 t` device-pixel cell metrics, not canvas/grid division
(which includes unused edges). Area/perimeter counts tolerate native DPR and
edge rasterization without expanding image bounds; portable duplicate/displaced
RGBA controls exercise the same inspector and acceptance predicate. This
strengthens test evidence, not the Kitty protocol or product image contract.

`npm run check:portable` includes Electron fixtures and requires a working
desktop with WebGL2. Fixtures share the desktop compositor. Vitest serializes
files within one run; also keep separate suites and clones from running native
tests on that same desktop concurrently.

The owned Unix resize regression invokes the production IPC listener and Local
Terminal Session with real `true` PTYs (`/usr/bin/true` on macOS, `/bin/true`
on Linux) under Node and Electron's Node
runtime. It requires observed native descriptor-closure failures before exit
notification, safe diagnostics, actual exits and a usable sibling; it never
manually closes a descriptor or injects a native failure:

```sh
npx vitest run test/integration/terminal-resize-race.test.ts test/unit/terminal-resize-failure.test.ts
```

This verifies the session/IPC boundary, not renderer-originated packets or an
observed main-process crash. Windows failure classification has controlled unit
coverage; this Unix check does not qualify ConPTY.

### AltGr layout boundary

On an owned disposable Linux/Windows desktop with an active US International
AltGr layout, run:

```sh
OMXTERM_TEST_ALTGR_NATIVE=1 npx vitest run test/integration/altgr-native.test.ts
```

In PowerShell, set `$env:OMXTERM_TEST_ALTGR_NATIVE = '1'` for the run and remove
it afterwards. Linux needs `/dev/uinput` and noninteractive `sudo` for the
short-lived keyboard helper. Windows must run in Explorer's interactive session.
These helpers send OS key codes through the actual layout, not fabricated
Electron modifier objects. Do not overlap other graphical input on that desktop.
The fixture checks distinct native Alt/AltGr menus, main-owned F6 delivery and
consumption, plain-Alt rejection, unbound `é`, dead-key completion with Space,
and the native Alt-alone popup. It changes no keyboard layout or persistent OS
configuration. This is not hardware-key input, arbitrary-layout qualification,
or a measurement of PTY bytes. Ordinary checks skip this disruptive opt-in.

### Deliberate compositor policy

Window Chrome tests require native maximize/restore success by default. A Linux
Hyprland desktop deliberately suppressing maximize can declare its independently
verified policy **before** the run:

```sh
OMXTERM_TEST_WINDOW_POLICY=hyprland-suppress-maximize npm test
```

First inspect the active Hyprland configuration and its loaded rules to confirm
that they suppress application maximize requests (Omarchy's default window rules
use `suppress_event = "maximize"`). An installed configuration file alone is not
proof that it is loaded. Preserve `HYPRLAND_INSTANCE_SIGNATURE` from that desktop.
Do not set this declaration merely because a maximize assertion failed, or change
global rules to obtain a pass. Unknown declarations or missing Hyprland sessions
fail validation. Other desktops keep the default successful-maximize assertion.

The declared path still clicks the real custom control, observes its native
request and unchanged native state, checks its label and terminal focus, and
verifies Surface/PTY continuity and cleanup. Tiling may resize the first window
when the second opens: its selected Surface and PTY must fit actual native and
container bounds, while hidden-tab geometry remains untouched. Both policies
check actual bounds rather than requiring a historical height to survive tiling;
`standard` declares maximize behavior, not an absence of tiling.

About startup tests retain the desktop's Wayland environment and exercise the
production X11 relaunch. About-specific bounded stage/error-category metadata is
written before self-inventory and production import to
`.scratch/about-diagnostics/`, outside the disposable profile. Assertion failures
include the validated metadata, which survives supervisor profile removal even
when detached replacement stderr is ignored. It contains no raw error text or
terminal data and is neither completion nor authenticated ownership evidence.
Missing/unreadable diagnostics never establish success; inspection, completion,
producer-death and timeout guards remain unchanged. This improves observability,
not the diagnosis of historical intermittent Fedora failures.

Their supervised completion file records the result producer's process-exit
outcome, not the original launcher's success.
The supervisor validates registered identity and waits for that producer to
actually disappear before accepting its outcome. An observation file alone
cannot pass a hanging or failed replacement. Missing evidence is a bounded
failure; registered detached descendants are cleaned before the profile is
removed. Custom Surface/host fixtures select X11 explicitly before Electron
bootstrap because they do not import application startup. This includes Restty
host, standalone rendering, local-image and configured-font-style fixtures, as
well as appearance, scrollback and ligature coverage; this is not a global
session override. Scrollback resize checks wait boundedly for the observed live
viewport to reach the bottom rather than assuming two frames and 50 ms complete
native layout/rendering. The exact bottom and geometry assertions remain intact.

Window Chrome fixtures also enter and leave real native fullscreen repeatedly
with the title hidden. On Windows the fixture temporarily moves the desktop
pointer and drags the restored handle with native mouse input, checking that
only its foreground window is under the pointer before pressing. Keep that
desktop idle during the check; the helper releases the button and restores the
pointer in its cleanup path. Synthetic renderer input alone cannot prove native
drag hit testing.

The failure-acknowledgement fixture uses guaranteed missing explicit executables
and Default Shells, a real sibling PTY/renderer and Electron's real native failure
dialog. Unix must report the native exec-status flag, not an ordinary code-1
exit or a synchronous mock. Windows' pinned missing-file path rejects before
allocating its pseudoconsole or child. It retains the dialog while the successfully
executed sibling exits with code 1, then dismisses it through Electron's AbortSignal
cancellation API and verifies owner cleanup and safe failure metadata. macOS
additionally checks native sheet begin/end events; Windows checks the native
dialog disables its owner. This is not physical OK-button input or a
pixel/appearance assertion.

Local-image native fixtures exercise the real recognizer, activation routing,
main loader, filesystem reads and native PNG/JPEG decoder. Directory-picker
selection is controlled at Electron's dialog port, with exact owner, home-start
and directory-only options asserted; this is not physical native-dialog input.
Actual Chromium-generated RIFF/WEBP bytes must receive the unsupported-format
error, separately from PNG bytes named `.webp`. Restty host coverage exercises
quoted/spaced, home and relative references through real visible cells and
modified native Electron mouse events, including soft wraps and mouse-report
precedence. The host also activates small synthetic whole-line unquoted PNG/JPEG
paths through the real main reader/native decoder and production preview, checking
full-span hover pixels, first/space/continuation clicks, a literal space at a soft-wrap
boundary, resize/reflow, dismissal and focus. These controls temporarily constrain
content inside the native window, observe the real Surface/PTY grid, and restore
the original layout in `finally`; they do not require arbitrary native sizes to
be honored by a tiler. Canvas extents target the interior of actual device-cell
backing buckets, with exact observed backing/grid checks and unchanged strict
CSS/hover budgets; nominal CSS boundaries can quantize below a backing pixel.
Generated paths use bounded filesystem components and a fixture-only observation
of Ghostty cells and selection text for the root's sentinel position. CPR is not
used for width measurement: Restty's output filter can answer it from a UTF-16
hint before Ghostty receives the text. The long reference must really wrap, and
the filename space must occupy the observed grid's last column. Separate wide-only
and combining-only root controls independently read the actual row-end space and
next-row filename cells, then check hover, exact activation, native preview and
both reflow directions without reprinting. The observer exists only in the
broad-host fixture bundle, not a production Surface API. macOS uses a short owned random `/tmp` profile so the complete path
prefix fits the viewport-clipping control inside the original window.
Its unrelated gesture-only references still return cancellation. No physical
click/picker acceptance is claimed.

The host's focused link-cancellation scenario starts one real Surface/PTY and
waits for its non-echoing child readiness, then restores a complete visible URL
and application mouse reporting. Non-echoing input prevents the reporting control
from changing the URL stimulus. It runs separately from the broad host's font,
clipboard, image/resize, hover, stress and lifecycle exercises, without their
image artifacts or font-mutation probe. A modified pointer first presents its
cue; activation at the same coordinates proves recognition, and an ordinary
click proves reporting is active. Separate synthetic pending pointer gestures then
cancel through `pointercancel` and window blur, each requiring no activation or
PTY mouse input. Two fixture-only renderer mutants independently remove those
listeners; the same cancellation assertions must reject only the missing listener.
All three focused cases require actual owned native PTY exit and supervised
cleanup. Run them without the broad scenario using:

```sh
npx vitest run test/integration/restty-host-integration.test.ts -t 'pending'
```

This qualifies the evidence, not a new gesture rule or physical-pointer input.

For explicit high-resolution capacity and resource qualification:

```sh
OMXTERM_TEST_IMAGE_CAPACITY=1 npx vitest run test/integration/local-image-capacity-native.test.ts
```

In PowerShell, set `$env:OMXTERM_TEST_IMAGE_CAPACITY = '1'` for the run and remove
it afterwards. The supervised fixture uses synthetic PNGs matching the reported
7680 × 3215 / 2,804,358-byte and 7036 × 3960 / 64,398,930-byte cases, a real JPEG,
and valid byte/pixel-ceiling controls. No source file is changed. It uses the
production preload, native loader and overlay, captures displayed synthetic
pixels, checks rejection and late renderer-decode disposal, then records 12
alternating open/close cycles without forced GC. Every cycle observes captured
image pixels before dismissal, then records synchronous source/Blob cleanup and
settled process memory. Evidence is written to
`.scratch/local-image-capacity.json`; inspect the observations, not just test exit.
Latency ends at observed captured image pixels, including load/IPC/decode and
bounded presentation settling; `previewReadyMs` separately records overlay readiness.
Decode and two animation frames alone need not complete GPU image presentation. Memory entries are
Electron per-process working sets and lifetime peak working sets in KiB; the
sampled aggregate may double-count shared pages and is not unique RSS or GPU
allocation accounting. Native decoder work can block the main sampler, so
lifetime high-water marks complement its 50 ms samples. The main timer's longest
gap reports responsiveness rather than enforcing an invented budget. Settled
cycles and the additional five-second idle observation distinguish warm caches
from continued accumulation; they do not promise immediate reclamation.

For a real multiplexer comparison on a POSIX desktop with `tmux` installed:

```sh
OMXTERM_TEST_IMAGE_TMUX=1 npx vitest run test/integration/restty-host-integration.test.ts
```

This opt-in owns a foreground tmux server and pane PTY under the fixture supervisor.
It feeds actual pane output and `refresh-client` redraw into the same Surface and
repeats full-destination hover/loading checks for long and wrap-boundary spaced
paths. It does not generalize arbitrary producer hard breaks into soft wraps.

When investigating an intermittent failure, record the failure and rerun
conditions. A later isolated pass alone does not show that it was fixed.

Keep successful evidence with its full source SHA, commands, relevant prepared
dependencies and native environment. Release work resumes missing/invalidated
steps under the [input-based reuse policy](release.md#changed-inputs-and-build-to-tag-comparison),
not a fresh full test/build cycle on request. Test/fixture-only edits need affected
tests, not native package rebuilds; version-only edits need new packages and
version/package verification, not wholesale behavioral reruns. `check:portable`
already builds; use explicit `package-built:mac`, `package-built:linux` or
`package-built:win` only with a known current native build. Standalone `package:*`
still builds fresh. No implicit skip/cache establishes provenance.

Platform packaging commands and exact-artifact evidence are documented in the
[release procedure](release.md). In particular, Windows NSIS verification can
replace an existing installation even with a temporary `/D=` destination. It
requires an authorized disposable VM, a recovery snapshot, and the literal
`--disposable-vm-allow-omxterm-replacement` option. Unknown installation ownership
or live-process conflicts still stop verification. Unpacked diagnostics are
non-installing and do not establish exact-installer acceptance.

## Fixture ownership and cleanup

The [native fixture runner](../test/fixtures/run-native-fixture.ts) uses a separate
supervisor to clean up Electron, native PTYs and helper processes, including
after a test worker exits unexpectedly.

Before native launch, the Restty host builder settles all started parallel build
and file operations before reporting a preparation failure. It preserves the
first failure, including when another builder later fails, so the caller can
remove the unsupervised profile without late build writes recreating it. This
covers broad host and focused cancellation preparation; it does not extend
supervisor ownership to the build phase.

The sibling builders use `prepareFixture` for pre-launch ownership: parallel
build/file operations register before starting, all started operations settle
before failure escapes, and only the owned failed root is removed. Serial setup
failures are covered too. The first error is preserved; a removal failure reports
both errors rather than hiding cleanup uncertainty. Preparation failure cleanup
belongs only to the builder; caller launch/finally handling begins after preparation
succeeds. Successful preparation leaves the profile with its caller, and
supervisor-owned profiles are never removed by this
helper. Cursor/background callers also guard setup before handing off ownership.
This covers the initialization/pending-tab/font/title/removal/acknowledgement,
Window Chrome, macOS blur, production-shutdown, local-image and standalone Restty
rendering/appearance/ligature/scrollback/background/cursor recipes, not every
fixture or arbitrary interrupted process. The existing host builder remains
separate. Headless regressions exercise the actual preparation recipes with
external builders mocked and real owned filesystem writes; they do not establish
native rendering, compiler, installed-font or PTY success:

```sh
npx vitest run test/unit/fixture-preparation.test.ts test/unit/fixture-preparation-recipes.test.ts test/unit/fixture-preparation-callers.test.ts
```

When adding supervised fixtures:

- Create PTYs through `spawnFixturePty` and other owned children through
  `spawnFixtureProcess`. These adapters write a pending ownership record before
  spawning, then atomically register PID and process-creation identities while
  the parent is still alive. If a PTY exits before its identity can be inventoried,
  its registration remains pending until the real native exit callback proves
  completion and a fresh inventory confirms its PID is absent. A missing process
  snapshot alone never completes ownership; arbitrary synchronous spawn errors
  still retain uncertainty.
- Let the supervisor manage the profile. It removes the profile only after
  process termination and stream closure have both been checked. Uncertain
  cleanup or interrupted/invalid registration retains it for diagnosis.
- Preserve timeout, interruption and worker-loss failures even when cleanup
  succeeds. Cleanup is not a replacement test result.

The supervisor combines registrations with descendant inventories, so a
registered PTY remains identifiable after its leader exits or leaves Electron's
process group. Results and synthetic stdout/stderr are written under
`.scratch/native-fixtures/`; review them for local paths before sharing.

On POSIX, cleanup uses three freeze/rescan passes and creation-identity checks
before signals. Each native inventory or termination command has a five-second
timeout. A separate five-second post-termination deadline checks process exit;
an in-flight inventory may finish beyond that deadline within its own timeout.
Stream draining and Windows profile retries have separate bounds, so five
seconds is not a total cleanup limit.

The Windows launcher also publishes pending bootstrap ownership before calling
native spawn. Its existing creation-identity or native failed/completed-launch
record settles that pending evidence; an empty inventory or arbitrary synchronous
spawn exception does not. Interruption before settlement retains cleanup
uncertainty and the profile even if Windows Job behavior already ended the child.
This does not claim a surviving orphan or add process containment.

Windows uses WMI with `CREATE_BREAKAWAY_FROM_JOB` for the supervisor: an ordinary
detached child would remain in the test worker's Job. WMI must be available; the
supervisor runs as the caller without elevation or a policy change. Electron
stays in the caller's interactive desktop, session and environment. After
observing supervisor disappearance, the Windows caller reads its outcome once
more with the same validation, preserving actual exit and cleanup metadata.
Missing or invalid evidence still fails; file presence alone is not success.
POSIX uses a detached supervisor and IPC-disconnect detection.

This is cooperative fixture cleanup, not process containment. POSIX inspection
and signaling are separate operations, and macOS creation times have second-level
resolution. Children that escape before registration or observation, arbitrary
daemonization, and termination of the supervisor itself are outside its coverage.

### Interruption regressions

These opt-in tests deliberately terminate fixture-owned processes. **Run them
only in an authorized disposable VM with a recovery snapshot.** Ordinary
`npm test` discovers but skips them.

```sh
OMXTERM_TEST_NATIVE_INTERRUPTION=1 npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts
```

In PowerShell, enable the same tests for this shell:

```powershell
$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'
npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts
Remove-Item Env:OMXTERM_TEST_NATIVE_INTERRUPTION
```

The suites cover parent/fixture interruption, deadlines, exit outcomes, profile
retention after interrupted registration, successful removal, survival of an
unrelated sentinel, and a real PTY whose leader exits early.

Windows outcome-publication regressions use the same disposable-VM opt-in:

```powershell
$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'
npm test -- test/integration/native-fixture-outcome-windows.test.ts
Remove-Item Env:OMXTERM_TEST_NATIVE_INTERRUPTION
```

They delay delivery of a real missing-file read until the WMI supervisor has
published its outcome and exited, checking success, failure and rejected evidence.
This controlled interleaving does not measure spontaneous failure frequency.

Bootstrap ownership regressions use the same Windows disposable-VM opt-in:

```powershell
$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'
npm test -- test/integration/native-fixture-bootstrap-windows.test.ts
Remove-Item Env:OMXTERM_TEST_NATIVE_INTERRUPTION
```

They interrupt the real launcher after native spawn but before registration,
checking retained uncertainty, the original worker failure and an unrelated
sentinel. Ordinary, immediate-exit and missing-executable controls preserve native
outcomes and successful profile cleanup. An independent exact-identity journal
outside the profile supports test cleanup even when assertions intentionally fail.
