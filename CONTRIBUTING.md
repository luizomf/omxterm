# Contributing to OMXTerm

OMXTerm welcomes focused bug reports, documentation improvements, and code
contributions that fit its documented product scope. It is Otávio's personal
desktop terminal, not a general terminal framework or a promise to absorb every
adjacent feature.

This guide explains the public contribution workflow. The
[documentation map](docs/README.md) points to the authoritative product and
project documents.

## Before proposing a change

Read the relevant sources first:

- [`docs/spec.md`](docs/spec.md) defines observable first-release behavior;
- [`CONTEXT.md`](CONTEXT.md) defines project vocabulary;
- [`docs/adr/`](docs/adr/) records durable decisions and tradeoffs;
- [`docs/configuration.md`](docs/configuration.md) documents user configuration;
- [`docs/versioning.md`](docs/versioning.md) and
  [`docs/release.md`](docs/release.md) govern versions and releases.

Open a GitHub issue before substantial code, behavior, architecture, security,
or configuration work. This lets the maintainer confirm scope, identify
dependencies, and prevent duplicate implementations. A small typo or broken
link may go directly to a focused pull request.

Keep proposals inside the current product boundary. Tabs, splits, saved
sessions, AI assistance, SSH brokering, shell integration, theme catalogs,
automatic updates, and cross-platform support are not first-release
requirements merely because they are common in other terminals.

## Development environment

Development currently requires:

- an Apple Silicon (`arm64`) Mac;
- Node.js 22 or newer;
- npm;
- the native build tools required by Electron and `node-pty`.

Install the exact dependency set and launch the development application:

```sh
npm ci
npm run dev
```

Do not commit local configuration, logs, terminal contents, environment files,
credentials, release output, or other private data.

## Making a change

1. Create a focused branch from current `main`.
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

Before delivery, run the checks relevant to the issue. `npm run check` is the
complete project command: formatting, typechecking, tests, arm64 packaging,
packaged-content inspection, and packaged-startup verification. It creates
local output under `release/` but never publishes it.

If a required check cannot run, state exactly which check was not run and why
in the pull request. Do not report an inferred result as a pass.

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

Do not include an unsolicited version bump in a pull request.

## Collaboration

Be direct, respectful, and specific. Critique code and decisions rather than
people. Assume good intent, provide evidence for technical claims, and make
room for maintainers and contributors to disagree without hostility.

The maintainer may decline a well-written contribution when it does not fit the
product, timing, or maintenance budget. That decision is about project scope,
not the contributor's worth.
