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

This guide explains the public contribution workflow. The
[documentation map](docs/README.md) points to the authoritative product and
project documents. If a coding agent helps with your contribution, point it at
[`AGENTS.md`](AGENTS.md) for the repository's engineering, boundary, safety,
and fork-and-pull instructions.

## Before proposing a change

Read the relevant sources first:

- [`docs/spec.md`](docs/spec.md) defines the current observable product contract;
- [`CONTEXT.md`](CONTEXT.md) defines project vocabulary;
- [`docs/adr/`](docs/adr/) records durable decisions and tradeoffs;
- [`docs/configuration.md`](docs/configuration.md) documents user configuration;
- [`docs/versioning.md`](docs/versioning.md) and
  [`docs/release.md`](docs/release.md) govern versions and releases.

In a substantial-change issue, explain the user-facing problem and desired
outcome before implementation details. This lets contributors and maintainers
align on scope, identify dependencies, and prevent duplicate work.

OMXTerm focuses on local terminal sessions for ARM64 macOS, Linux, and Windows,
with native DMG, AppImage, and NSIS packages. Splits, saved sessions, AI
assistance, SSH brokering, shell integration, theme catalogs, and automatic
updates are outside the current product contract. Discuss proposals for those
areas before implementing them.

## Development environment

Use an ARM64 machine running macOS, Linux, or Windows with Node.js 22.13 or
later in the Node.js 22 line, or Node.js 24 or newer, and its bundled npm. Install dependencies from the lockfile with `npm ci`.

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
Linux rendering uses X11 and requires XWayland under a Wayland session; native
Wayland is not currently claimed. Launching OMXTerm — including the packaged launch
inside `npm run package:verify` and `npm run check:linux` — needs a running
graphical session; a headless or SSH shell without `$DISPLAY` fails with
`Missing X server or $DISPLAY`. Over SSH, point `DISPLAY` at the machine's
desktop session (commonly `DISPLAY=:0`). `xvfb-run` can smoke-test a truly
headless machine but never counts as platform behavior evidence. macOS and
Windows contributors should install the
native build toolchain requested by npm if no matching dependency prebuild is
available.

On Windows, clone with `core.autocrlf=false` — a system Git for Windows
configuration that smudges the tree to CRLF breaks `prettier --check` — and
with `core.symlinks=true`, because the repository contains symlinked files
that must check out as symlinks; enabling Windows Developer Mode allows
unprivileged symlink creation. Electron's runtime needs the Visual C++
Redistributable for ARM64 (without it the postinstall fails with
`ERR_DLOPEN_FAILED`), and npm's `.ps1` shims need a PowerShell execution
policy that permits local scripts. If `npm ci` fails with `EPERM` file locks,
an antivirus scanner racing the extractor is the usual cause; an exclusion
for the clone directory resolves it. Windows launches — including the
packaged launch inside `npm run package:verify` and `npm run check:win` —
need a graphical session.

The portable development baseline does not require a packaged application:

```sh
npm ci
npm run check:portable
```

Restty is the sole Terminal Surface in development and packaged builds. See the
[Restty Terminal Surface guide](docs/restty-development.md) for pinned-source
restoration, failure behavior, graphics and memory limits. There is no renderer
selector or fallback Surface.

This command runs formatting checks, type-aware lint with zero accepted warnings,
strict typechecking, the complete automated test suite, and the unpackaged
build. Native packaging and operating-system behavior evidence are
platform-owned work: macOS uses `npm run check`, a
native Linux ARM64 clone uses `npm run check:linux`, and a native Windows
ARM64 clone uses `npm run check:win`. In a pull request, list every check run and state exactly why any
relevant platform check could not run. Report results separately for each
operating system.

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

### Native fixture cleanup

The Restty host fixture starts Electron, a native PTY, and helper processes. A
separate supervisor owns their cleanup, including when the test worker exits
unexpectedly. It identifies descendants by both PID and process-creation identity,
which matters when a PID is reused or a PTY leaves Electron's process group.
A timeout, interruption, or worker loss still fails the test; cleanup preserves
that result rather than turning it into a pass.

When cleanup succeeds, the supervisor removes the fixture profile. Otherwise it
keeps the profile and writes the mechanical outcome plus synthetic stdout and
stderr under `.scratch/native-fixtures/` for diagnosis. Those records can contain
local paths, so review them before sharing. Cleanup is bounded, but its total
runtime is not a single five-second window: native inspection commands,
termination, stream draining, and Windows profile retries have separate limits.

Windows uses local WMI process creation with
[`CREATE_BREAKAWAY_FROM_JOB`](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/create-method-in-class-win32-process)
for the cleanup supervisor because an ordinary detached child remains in the
test worker's Job. WMI must be available, and the supervisor runs as the caller
without elevation or a policy change. Electron itself stays in the caller's
interactive desktop, session, and environment. POSIX uses a detached supervisor
and IPC-disconnect detection. Its process inspection and signaling are separate
operations, and macOS process-start times have second-level resolution. These
identity checks support cleanup of the observed fixture tree; arbitrary
process daemonization and termination of the supervisor itself remain outside
its coverage.

The interruption regressions deliberately terminate fixture-owned processes.
Run them only in an authorized disposable VM with a recovery snapshot:

```sh
OMXTERM_TEST_NATIVE_INTERRUPTION=1 npm test -- test/integration/native-fixture-interruption.test.ts
```

In PowerShell, set
`$env:OMXTERM_TEST_NATIVE_INTERRUPTION = '1'` before running the same test
command. Ordinary `npm test` discovers these cases but skips them. The opt-in
suite covers parent and fixture interruption, deadlines, exit outcomes, profile
retention/removal, and survival of an unrelated sentinel process.

Before delivery on any Supported Platform, run `npm run check:portable`. On
macOS, `npm run check` is the full native project command. On Linux ARM64, use
`npm run check:linux`; it formats, lints, and typechecks, runs all tests
including the real-PTY test, builds the AppImage, extracts and inspects its exact contents,
and checks its ELF dependencies before launching that exact AppImage through
both normal FUSE mounting and `--appimage-extract-and-run`, with isolated
configuration and state for each real-PTY launch. These commands create local
output under `release/` but never publish it. Use
`npm run package:linux` for a non-publishing AppImage build alone, followed by
`npm run package:verify` on the same host.

If a required or platform-specific check cannot run, state exactly which check
was not run and why in the pull request. Do not report an inferred result as a
pass.

Release validation combines complete native automated checks for every exact
artifact with feedback from everyday use. Manual testing is welcome on any
platform but is optional, not a release gate. Report what you observed and the
build you used; we use those reports to investigate problems and add regression
coverage. Record changed platform behavior that automation cannot observe as
unverified. See
[automation-first exact-artifact acceptance](docs/release.md#automation-first-exact-artifact-acceptance).

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
