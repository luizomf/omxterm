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
sudo apt install build-essential python3 binutils fontconfig file xwayland
```

```sh
# Fedora
sudo dnf install gcc-c++ make python3 binutils fontconfig file xorg-x11-server-Xwayland
```

Run project commands as your ordinary user. Postinstall rebuilds `node-pty`
against the installed Electron Linux ARM64 runtime; a module copied from Node.js
or another platform is not interchangeable.

Graphical tests and packaged launches need an authorized X11/XWayland desktop;
native Wayland is not currently claimed. Over SSH, use the desktop's `DISPLAY`
and X11 authorization while keeping X server access control enabled. Keep the
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
  the parent is still alive.
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

Windows uses WMI with `CREATE_BREAKAWAY_FROM_JOB` for the supervisor: an ordinary
detached child would remain in the test worker's Job. WMI must be available; the
supervisor runs as the caller without elevation or a policy change. Electron
stays in the caller's interactive desktop, session and environment. POSIX uses a
detached supervisor and IPC-disconnect detection.

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
