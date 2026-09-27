# Contributing to OMXTerm

Thanks for helping improve OMXTerm. Focused bug reports, documentation fixes,
and code contributions are welcome. If this is your first contribution, the
shortest path is:

1. Search the existing issues for related work.
2. Open a bug report or feature request with the details requested by the
   template. A small typo or broken link may go directly to a focused pull
   request.
3. For a substantial change, use the issue discussion to align on scope before
   investing in implementation.
4. Fork the repository, create a focused branch from current upstream `main`,
   and make the smallest complete change.
5. Run `npm run check:portable` and any relevant platform checks.
6. Open a pull request that links the issue and reports the exact checks run.

Suspected vulnerabilities follow the private process in the
[security policy](SECURITY.md), not the public issue or pull-request workflow.

Jump to [development setup](#development-environment),
[verification](#verification), or [pull requests](#commits-and-pull-requests).
Coding agents should also read [`AGENTS.md`](AGENTS.md).

## Before proposing a change

Read the relevant sources first:

- [`docs/spec.md`](docs/spec.md) defines the current observable product contract;
- [`CONTEXT.md`](CONTEXT.md) defines project vocabulary;
- [`docs/adr/`](docs/adr/) records durable decisions and tradeoffs;
- [`docs/configuration.md`](docs/configuration.md) documents user configuration.

Version and release work additionally follows [versioning](docs/versioning.md)
and [release procedures](docs/release.md).

In a substantial-change issue, explain the user-facing problem and desired
outcome before implementation details. This lets contributors and maintainers
align on scope, identify dependencies, and prevent duplicate work.

OMXTerm focuses on local terminal sessions for ARM64 macOS, Linux, and Windows,
with native DMG, AppImage, and NSIS packages. Splits, saved sessions, AI
assistance, SSH brokering, shell integration, theme catalogs, and automatic
updates are outside the current product contract. Discuss proposals for those
areas before implementing them.

## Development environment

Use an ARM64 machine with Node.js **22.13+ in the 22.x line**, or **24+**, and
npm. Prepare the platform prerequisites below, then run from your clone:

```sh
npm ci
npm run check:portable
npm run dev
```

`check:portable` runs formatting, lint, types, tests, and the unpackaged build.
`dev` opens the application. Graphical tests need a working desktop and WebGL2;
"portable" does not mean headless. No package or release is needed for ordinary
development.

### macOS

Use Apple Silicon with Xcode Command Line Tools (Apple clang and the macOS SDK).
`npm run build` compiles the optional macOS blur addon locally with pinned
build-only Node-API headers, targeting macOS 12.0. No runtime download or
Electron ABI rebuild is needed for that addon. Linux/Windows builds do not use
Apple tooling. See [ADR 0030](docs/adr/0030-prefer-direct-macos-background-blur.md)
for the private-API tradeoff and fallback.

### Linux

On Linux, `node-pty` builds from source and requires `python3`, `make`, and a C++
compiler (`build-essential` provides the latter two on Ubuntu). Native package
verification also uses `readelf` from `binutils`; Ubuntu's build toolchain pulls
that package in. Install those tools through the distribution's package manager
before running `npm ci`. OMXTerm's postinstall then rebuilds `node-pty` against
the installed Electron Linux ARM64 runtime; do not use a module copied from
Node.js, macOS, or another architecture. Linux also needs the `fontconfig`
utilities for exact configured font-family validation. The statically linked
AppImage runtime needs neither zlib development headers nor a system `libfuse2`
library. Normal AppImage mounting uses kernel FUSE support; the
`--appimage-extract-and-run` fallback remains available when mounting is not.
Run as an ordinary user. OMXTerm deliberately disables Chromium sandboxing on
Linux; no administrator sandbox setup is required. See the
[Linux launch policy](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).
Simple, reproducible contributions for sandboxed Linux support are welcome.
Tests and packaged launches need an authorized X11/XWayland desktop session;
native Wayland is not currently claimed. Over SSH, set the correct `DISPLAY` and
use that session's X11 authorization; do not disable X server access control.
A headless `xvfb-run` smoke test does not establish native platform behavior.

### Windows

Install native build tools if npm cannot find a matching dependency prebuild.
Clone with `core.autocrlf=false` — a system Git for Windows
configuration that smudges the tree to CRLF breaks `prettier --check` — and
with `core.symlinks=true`, because the repository contains symlinked files
that must check out as symlinks; enabling Windows Developer Mode allows
unprivileged symlink creation. Electron's runtime needs the Visual C++
Redistributable for ARM64 (without it the postinstall fails with
`ERR_DLOPEN_FAILED`), and npm's `.ps1` shims need a PowerShell execution
policy that permits local scripts. The native installation-inspection tests and
package verifiers also execute local `.ps1` helpers: using `npm.cmd` bypasses only
the npm shim, not this prerequisite. Check `Get-ExecutionPolicy -List` in Windows
PowerShell (`powershell.exe`), which is the interpreter used by those helpers.
On a developer-controlled environment where organizational policy permits it,
start a temporary shell with `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned`
and run `npm.cmd` from that shell. This applies only to that process and inherited
children, not a persistent CurrentUser or LocalMachine setting. Do not override
organizational policy, automatically weaken execution policy in project commands,
or treat a policy refusal as evidence that an installer ownership guard passed.
If `npm ci` reports `EPERM`, check for processes holding files open and review
antivirus events before retrying. Keep security protections enabled. Windows launches — including the
packaged launch inside `npm run package:verify` and `npm run check:win` —
need a graphical session. An SSH login as the same user is not sufficient:
Windows OpenSSH normally runs commands in non-interactive Session 0, independently
of the user's logged-in desktop. Native graphical tests can fail or appear to
pass intermittently there, including GPU startup, selection, and pixel capture.
Run them from a terminal on the interactive desktop, or an explicitly configured
VM harness that executes as the logged-in desktop user. Compare
`[System.Diagnostics.Process]::GetCurrentProcess().SessionId` with the intended
desktop session (for example, `Get-Process explorer | Select-Object SessionId`),
and still verify the actual renderer/GPU behavior. Do not substitute session
identity alone for a passing graphics check or add software-renderer flags to
hide a missing required native path.

### Shared desktop constraints

Native Electron fixtures share the desktop compositor. The test configuration
serializes files within one run; do not run multiple native suites or clones
against the same desktop concurrently. When a graphical failure is intermittent,
record every failure and rerun condition rather than describing a later isolated
pass as proof that the original failure was fixed.

The [Restty development guide](docs/restty-development.md) covers pinned-source
restoration, graphics requirements, and renderer changes.

Do not commit local configuration, logs, terminal contents, environment files,
credentials, release output, or other private data.

## Making a change

Contributions use fork-and-pull: fork the repository, create a focused branch
from current upstream `main`, push that branch to your fork, and open a pull
request against this repository. The maintainer handles assignments, labels,
dependencies, roadmap state, versions, Release Artifacts, and publication. If
one of those needs attention, request it in the issue or pull request.

1. Create a focused branch from current upstream `main` in your fork.
2. Implement the smallest complete change that satisfies the issue.
3. Add observable behavior tests for new behavior and a regression test for a
   bug fix.
4. Update user-facing documentation when installation, configuration,
   controls, supported behavior, limitations, or troubleshooting changes.
5. Update `docs/spec.md` in the same pull request when accepted observable
   behavior changes. Add or revise an ADR only for a durable architectural or
   product tradeoff.
6. Inspect the final diff for unrelated changes, generated files, secrets, and
   missing documentation.

Preserve the runtime boundaries in the specification: privileged capabilities
belong to Electron main, preload exposes a minimal typed bridge, the renderer
keeps context isolation and disabled Node integration, and the portable Terminal
Surface does not import Electron or `node-pty`. macOS and Windows retain Chromium
sandboxing; the explicit Linux exception does not authorize other boundary changes.

Write code, documentation, issue and pull-request text, and commit messages in
English. Use clear, focused modules, strict types at public and IPC boundaries,
and project terminology from `CONTEXT.md`. Do not add a dependency without a
concrete need in the current change.

## Verification

Use the narrowest useful checks while developing:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

<details>
<summary>Native fixture internals and interruption tests</summary>

The Restty host fixture starts Electron, a native PTY, and helper processes. A
separate supervisor owns their cleanup, including when the test worker exits
unexpectedly. It identifies descendants by both PID and process-creation identity,
which matters when a PID is reused or a PTY leaves Electron's process group.
Supervised fixtures must create PTYs through `spawnFixturePty` and other owned
children through `spawnFixtureProcess`. These test-only adapters write a pending
ownership record before spawning, then atomically register process identities
while the parent is still alive. The supervisor reads these records as well as
periodic descendant inventories, so an early parent exit does not erase a
registered PTY's ownership. An interrupted or invalid registration makes cleanup
uncertain and retains the profile rather than reporting successful cleanup.
A timeout, interruption, or worker loss still fails the test; cleanup preserves
that result rather than turning it into a pass.

When cleanup succeeds, the supervisor removes the fixture profile; on failure,
it retains the profile for inspection. Profile removal happens only after process
termination and stream closure have both been checked. In either case, it writes
the mechanical outcome plus synthetic stdout and stderr under `.scratch/native-fixtures/` for
diagnosis. Those records can contain local paths, so review them before sharing.

Cleanup uses three POSIX freeze/rescan passes and identity checks before each
signal. Each native inventory or termination command has a five-second timeout.
After termination requests, a separate five-second deadline checks that the
processes disappear. An in-flight inventory can finish beyond that deadline,
within its own command timeout. Stream draining and Windows profile retries
have separate bounds, so total cleanup time depends on the process tree and
command durations rather than a single five-second window.

Windows uses local WMI process creation with
[`CREATE_BREAKAWAY_FROM_JOB`](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/create-method-in-class-win32-process)
for the cleanup supervisor because an ordinary detached child remains in the
test worker's Job. WMI must be available, and the supervisor runs as the caller
without elevation or a policy change. Electron itself stays in the caller's
interactive desktop, session, and environment. POSIX uses a detached supervisor
and IPC-disconnect detection. Its process inspection and signaling are separate
operations, and macOS process-start times have second-level resolution. These
identity checks support cleanup of the registered and observed fixture tree;
unregistered children that escape before observation, arbitrary process
daemonization and termination of the supervisor itself remain outside its coverage.

The interruption regressions deliberately terminate fixture-owned processes.
Run them only in an authorized disposable VM with a recovery snapshot:

```sh
OMXTERM_TEST_NATIVE_INTERRUPTION=1 npm test -- test/integration/native-fixture-interruption.test.ts test/integration/native-fixture-early-exit.test.ts
```

In PowerShell, set
`$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'` before running the same test
command. Ordinary `npm test` discovers these cases but skips them. The opt-in
suites cover parent and fixture interruption, deadlines, exit outcomes, profile
retention after interrupted registration, successful profile removal, survival of
an unrelated sentinel process, and a real PTY whose leader exits early. These
cases do not claim containment of arbitrary uncooperative process trees.

</details>

Before delivery, run `npm run check:portable`. Packaging changes also need the
matching native procedure:

| Platform      | Complete native check                                            |
| ------------- | ---------------------------------------------------------------- |
| macOS ARM64   | `npm run check`                                                  |
| Linux ARM64   | `npm run check:linux`                                            |
| Windows ARM64 | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |

These commands build and verify local artifacts under `release/`; they never
publish. **The Windows command performs real installation and replacement.**
Use it only in an explicitly authorized disposable VM with a recovery snapshot,
following the [Windows release procedure](docs/release.md#windows-arm64).
For non-installing Windows diagnostics, use
`npm run package:verify -- --windows-unpacked-only` after `npm run package:win`.

If a required or platform-specific check cannot run, state exactly which check
was not run and why in the pull request. Do not report an inferred result as a
pass.

Release validation combines complete native automated checks for every exact
artifact with feedback from everyday use. Manual testing is welcome on any
platform but is optional, not a release gate. Report what you observed and the
build you used; we use those reports to investigate problems and add regression
coverage. Record changed platform behavior that automation cannot observe as
unverified. See
[exact-artifact verification records](docs/release.md#exact-artifact-verification-record).

## Commits and pull requests

Use small [Conventional Commit](https://www.conventionalcommits.org/) subjects,
for example:

```text
fix: preserve terminal focus after activation
docs: explain external theme configuration
test: cover invalid theme paths
```

A pull request should:

- link its issue with `Closes #<number>` when applicable;
- explain intent and material changes without becoming an execution diary;
- map the issue's acceptance criteria to the implementation;
- list exact verification commands and results;
- describe security and documentation impact;
- call out any intentional deviation from the issue or specification.

Keep unrelated changes in separate pull requests. Reviews may request changes
when an implementation expands scope, weakens a security boundary, duplicates
existing behavior, or lacks contract-level tests or documentation.

## Version and release authority

Release work is maintainer-led and explicitly authorized. Each exact Release
Artifact must pass the [release procedure](docs/release.md) and receive owner
acceptance; publication requires separate owner authorization. Ordinary
contributions do not create tags, publish GitHub Releases, or upload artifacts.
The maintainer selects release versions under the
[versioning policy](docs/versioning.md).

Do not include a version bump in a pull request, with one exception: the
[versioning policy](docs/versioning.md) assigns the development-baseline move
to the pull request that adds user-visible behavior, so such a pull request
may move the baseline to the next minor `-dev.0` (updating `package.json`,
`package-lock.json`, and the pinned release-version test together). A missing
baseline move can be repaired during review.

## Collaboration

Be direct, respectful, and specific. Critique code and decisions rather than
people. Assume good intent, provide evidence for technical claims, and make
room for maintainers and contributors to disagree without hostility.

Discuss larger ideas early so we can find a scope that fits the project and
its maintenance capacity.
