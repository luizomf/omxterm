# Contributing to OMXTerm

OMXTerm welcomes focused bug reports, documentation improvements, and code
contributions that fit its documented product scope. It is Otávio's personal
desktop terminal, not a general terminal framework or a promise to absorb every
adjacent feature.

This guide explains the public contribution workflow. The
[documentation map](docs/README.md) points to the authoritative product and
project documents. If a coding agent drives your contribution, point it at
[`AGENTS.md`](AGENTS.md): it carries the same engineering, boundary, and
safety instructions repository agents follow, and its Authority section
explains which operations a fork agent requests rather than performs.

## Before proposing a change

Read the relevant sources first:

- [`docs/spec.md`](docs/spec.md) defines the current observable product contract;
- [`CONTEXT.md`](CONTEXT.md) defines project vocabulary;
- [`docs/adr/`](docs/adr/) records durable decisions and tradeoffs;
- [`docs/configuration.md`](docs/configuration.md) documents user configuration;
- [`docs/versioning.md`](docs/versioning.md) and
  [`docs/release.md`](docs/release.md) govern versions and releases.

Open a GitHub issue before substantial code, behavior, architecture, security,
or configuration work. This lets the maintainer confirm scope, identify
dependencies, and prevent duplicate implementations. A small typo or broken
link may go directly to a focused pull request.

Keep proposals inside the current product boundary. Splits, saved sessions, AI
assistance, SSH brokering, shell integration, theme catalogs, and automatic
updates remain outside the current product contract; their presence in other
terminals does not make them requirements. The Supported Platforms are ARM64
macOS, Linux, and Windows. Linux ARM64 runtime and AppImage packaging are
implemented, while native Windows runtime and packaging remains scoped to
[#61](https://github.com/luizomf/omxterm/issues/61).

## Development environment

Use an ARM64 machine running macOS, Linux, or Windows with Node.js 22 or newer
and its bundled npm. Install dependencies from the lockfile with `npm ci`.

On Linux, `node-pty` builds from source and requires `python3`, `make`, and a C++
compiler (`build-essential` provides the latter two on Ubuntu). Install those
tools through the distribution's package manager before running `npm ci`.
OMXTerm's postinstall then rebuilds `node-pty` against the installed Electron
Linux ARM64 runtime; do not use a module copied from Node.js, macOS, or another
architecture. Linux also needs the `fontconfig` utilities for exact configured
font-family validation. Running the AppImage normally requires FUSE 2, such as
`libfuse2t64` on Ubuntu 24.04 or `libfuse2` on older Ubuntu releases. Linux
rendering uses X11 and requires XWayland under a Wayland session; native Wayland
is not currently claimed. macOS and Windows contributors should install the
native build toolchain requested by npm if no matching dependency prebuild is
available.

The portable development baseline does not require a packaged application:

```sh
npm ci
npm run check:portable
```

This command runs formatting checks, strict typechecking, the complete automated
test suite, and the unpackaged build. Native packaging and operating-system
behavior evidence are platform-owned work: macOS uses `npm run check`, and a
native Linux ARM64 clone uses `npm run check:linux`. The Windows procedure lands
with #61. In a pull request, list every check run and state exactly why any
relevant platform check could not run. Never infer a platform pass from another
operating system.

Do not commit local configuration, logs, terminal contents, environment files,
credentials, release output, or other private data.

## Making a change

External contributors use fork-and-pull: fork the repository, create a focused
branch from current upstream `main`, push that branch to the fork, and open a
pull request against this repository. A contribution does not grant authority
to change assignments, labels, dependencies, roadmap state, versions, release
artifacts, or publication state; those remain maintainer operations.

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
remains sandboxed, and the portable Terminal Surface does not import Electron
or `node-pty`.

Write code, documentation, issue and pull-request text, and commit messages in
English. Use clear, focused modules, strict types at public and IPC boundaries,
and project terminology from `CONTEXT.md`. Do not add a dependency without a
concrete need in the current change.

## Verification

Use the narrowest useful checks while developing:

```sh
npm run format:check
npm run typecheck
npm test
npm run build
```

Before delivery on any Supported Platform, run `npm run check:portable`. On
macOS, `npm run check` is the full native project command. On Linux ARM64, use
`npm run check:linux`; it formats and typechecks, runs all tests including the
real-PTY test, builds the AppImage, extracts and inspects its exact contents,
and launches that exact AppImage with isolated configuration and state. These
commands create local output under `release/` but never publish it. Use
`npm run package:linux` for a non-publishing AppImage build alone, followed by
`npm run package:verify` on the same host.

If a required or platform-specific check cannot run, state exactly which check
was not run and why in the pull request. Do not report an inferred result as a
pass.

The exact-artifact manual checklists that gate a release candidate are run
agent-guided by default: an agent prepares test assets, dictates one blind step
at a time, records verbatim `PASS`/`FAIL`/`UNEXECUTED` under the never-infer
rule, verifies the system side, and posts the record on the tracking issue. See
[agent-guided manual testing](docs/release.md#agent-guided-manual-testing) if you
want to help test an artifact with your own agent.

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

Ordinary contributions do not change versions, create tags, publish GitHub
Releases, or upload artifacts. The maintainer selects versions under the
[versioning policy](docs/versioning.md) and authorizes each release separately
after the exact artifact passes the [release procedure](docs/release.md).

Do not include a version bump in a pull request, with one exception: the
[versioning policy](docs/versioning.md) assigns the development-baseline move
to the pull request that adds user-visible behavior, so such a pull request
may move the baseline to the next minor `-dev.0` (updating `package.json`,
`package-lock.json`, and the pinned release-version test together). The
maintainer repairs a missing baseline move during review.

## Collaboration

Be direct, respectful, and specific. Critique code and decisions rather than
people. Assume good intent, provide evidence for technical claims, and make
room for maintainers and contributors to disagree without hostility.

The maintainer may decline a well-written contribution when it does not fit the
product, timing, or maintenance budget. That decision is about project scope,
not the contributor's worth.
