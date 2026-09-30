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

Install `python3`, `make`, a C++ compiler, `binutils` for native package
inspection, `fontconfig` utilities for exact font-family validation, and XWayland
when using a Wayland desktop. For example:

```sh
# Ubuntu
sudo apt install build-essential python3 patch binutils fontconfig file xwayland fonts-dejavu-core
```

```sh
# Fedora
sudo dnf install gcc-c++ make python3 patch binutils fontconfig file xorg-x11-server-Xwayland dejavu-sans-fonts dejavu-sans-mono-fonts
```

Native font fixtures require the exact installed families `DejaVu Sans` and
`DejaVu Sans Mono`, not merely fontconfig substitution. On Arch/Omarchy install
`ttf-dejavu`; inspect `fc-list : family` to verify both families. Bundled runtime
fonts do not satisfy tests of an explicitly configured installed font.

Run project commands as your ordinary user. Postinstall builds the pinned `node-pty` Node-API runtime with the native
exec-status correction. It requires `patch` and the C++ compiler on Linux and
Apple Command Line Tools on macOS; unknown pinned source bytes stop preparation.
A module copied from another platform is not interchangeable. See
[ADR 0032](adr/0032-report-native-exec-failures-outside-terminal-payload.md).

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
is needed. [ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md) documents
this tradeoff; simple, reproducible contributions for sandboxed support are welcome.

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

## Running native tests

`npm run check:portable` includes Electron fixtures and requires a working
desktop with WebGL2. Fixtures share the desktop compositor. Vitest serializes
files within one run; also keep separate suites and clones from running native
tests on that same desktop concurrently.

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
container bounds, while hidden-tab geometry remains untouched. The standard
path additionally retains the unchanged-height assertion.

About startup tests retain the desktop's Wayland environment and exercise the
production X11 relaunch. Their supervised completion file records the
result producer's process-exit outcome, not the original launcher's success.
The supervisor validates registered identity and waits for that producer to
actually disappear before accepting its outcome. An observation file alone
cannot pass a hanging or failed replacement. Missing evidence is a bounded
failure; registered detached descendants are cleaned before the profile is
removed. Surface-only appearance, scrollback and ligature fixtures select X11
explicitly because they do not import application startup; this is not a global
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
boundary, resize/reflow, dismissal and focus. Its unrelated gesture-only references
still return cancellation. No physical click/picker acceptance is claimed.

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
