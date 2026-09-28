# Contributing to OMXTerm

Thanks for helping improve OMXTerm. Bug reports, everyday testing, documentation
fixes and code contributions are all welcome.

## Help without writing code

- Try the [latest download](README.md#platforms-and-downloads) in your everyday
  work, especially on Linux and Windows ARM64.
- Tell us which installation step or guide was confusing.
- Help reproduce an [existing issue](https://github.com/luizomf/omxterm/issues)
  and share your result and platform.
- Suggest an improvement by describing the problem it would solve.

### Report a problem

Search [existing issues](https://github.com/luizomf/omxterm/issues), then
[open a bug report](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md)
if there is no match. Include:

- your OMXTerm version (**About OMXTerm** in the application menu);
- operating system, architecture (ARM64 or x64), and Linux desktop if known;
- what you did, what you expected, and what happened.

It is fine to leave a detail unknown or report a problem you cannot reproduce
reliably. [Local diagnostics](docs/usage.md#local-diagnostics) are optional.
Use synthetic examples and review screenshots or log excerpts before sharing;
keep real terminal and clipboard contents, credentials, private paths, and
configuration or environment contents out of public reports.

For suspected vulnerabilities, use the private process in [SECURITY.md](SECURITY.md).

### Have an x64 Linux or Windows machine?

Current downloads are ARM64-only. The [Linux x64 issue](https://github.com/luizomf/omxterm/issues/223)
and [Windows x64 issue](https://github.com/luizomf/omxterm/issues/224) describe
where native testing and development help is needed. Share your environment and
what you would like to work on; the maintainer handles ARM64 regression checks.

## Your first documentation or code change

A **fork** is your own GitHub copy of the project. A **pull request (PR)** asks
us to review a change from that copy.

1. Check existing issues and pull requests for related work. Discuss substantial
   changes in an issue first; a typo or broken link can go straight to a PR.
2. Create a focused branch in your fork from current upstream `main`. GitHub's
   file editor is enough for a small documentation edit.
3. Make the change, add tests for changed behavior, and update the relevant docs.
4. Run the [checks below](#verification) and open a PR against `main` with the
   issue, a short explanation, and the results. Draft PRs are welcome.

Write code, documentation and GitHub contributions in English. Be respectful
and specific when giving feedback; discuss the work rather than the person.

## Development environment

For documentation-only edits, you can skip the native build setup. For code,
use ARM64 hardware running macOS, Linux or Windows, Git, and **Node.js 22.13+
within 22.x, or 24+**, with npm.

Prepare your [platform prerequisites](docs/development.md#platform-prerequisites)
first. Then clone your fork (replace `YOUR-USERNAME`):

```sh
git clone -c core.autocrlf=false -c core.symlinks=true https://github.com/YOUR-USERNAME/omxterm.git
cd omxterm
git remote add upstream https://github.com/luizomf/omxterm.git
git fetch upstream
git switch -c docs/my-first-change upstream/main
npm ci
npm run dev
```

Choose a branch name that describes your change. `npm ci` installs the locked
dependencies and prepares the native runtime; `npm run dev` builds and opens the
app. Development uses your ordinary OMXTerm configuration and opens a real shell,
so back up settings before experimenting with them.

The [native development reference](docs/development.md) covers platform setup,
graphical tests and fixture cleanup. See the [Restty guide](docs/restty-development.md)
when changing the Terminal Surface or its pinned dependencies.

## Making a change

OMXTerm focuses on local terminal sessions. For behavior changes, read the
relevant [product contract](docs/spec.md), [terminology](CONTEXT.md) and
[architecture decisions](docs/adr/). They explain current behavior and the
tradeoffs behind it.

- Keep the change focused, with clear modules, strict types and dependencies
  that serve a concrete need.
- Test observable behavior, including a regression test for a bug fix.
- Update user-facing guides and `docs/spec.md` when accepted behavior changes.
  Record durable architectural decisions in an ADR.
- Keep privileged operations in Electron main, expose a minimal typed preload
  bridge, and preserve renderer isolation and disabled Node integration.
  Chromium sandboxing is enabled on macOS and Windows; Linux follows
  [ADR 0024](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).
  The portable Terminal Surface receives an Adapter rather than importing
  Electron or `node-pty`.
- Review the final diff for unrelated changes and private data. Local settings,
  logs, terminal contents, credentials and generated release files stay out of Git.

## Verification

For documentation-only changes, check formatting, changed links and examples,
and run `git diff --check`. With dependencies installed:

```sh
npm run format:check
git diff --check
```

For code, run:

```sh
npm run check:portable
```

This runs formatting, lint, type checking, tests and the unpackaged build. You
can run `npm run lint`, `npm run typecheck`, `npm test` or `npm run build`
separately while developing. Graphical tests need a working desktop and WebGL2;
“portable” does not mean headless. Run one native suite at a time per desktop.

Packaging changes also need the matching native check:

| Platform      | Complete native check                                            |
| ------------- | ---------------------------------------------------------------- |
| macOS ARM64   | `npm run check`                                                  |
| Linux ARM64   | `npm run check:linux`                                            |
| Windows ARM64 | `npm run check:win -- --disposable-vm-allow-omxterm-replacement` |

These commands create and verify local artifacts in `release/`; they do not
publish. **The Windows check performs real installation and replacement.** Use
an authorized disposable VM with a recovery snapshot and follow the
[Windows release procedure](docs/release.md#windows-arm64). A temporary install
path does not protect an existing installation. For non-installing diagnostics,
run `npm run package:win`, then
`npm run package:verify -- --windows-unpacked-only`.

List checks you could not run and why. Report each platform's actual results;
a pass on one platform does not establish another. Everyday testing is welcome
but optional for releases.

## Commits and pull requests

Use focused [Conventional Commit](https://www.conventionalcommits.org/) subjects,
such as `fix: preserve terminal focus` or `docs: clarify theme setup`.

A PR should explain the problem and solution, link its issue (`Closes #123` when
applicable), and list verification commands and results. Mention documentation
or security impact and any unresolved concern. For an issue with acceptance
criteria, explain how the change meets them. Keep unrelated work in separate PRs.

Maintainers handle tracker organization and releases. Ordinary fixes and docs
leave versions unchanged; a feature or contract change may advance the `-dev`
baseline under the [versioning policy](docs/versioning.md). Release preparation
and publication follow the [release procedure](docs/release.md).

Coding agents should also read [AGENTS.md](AGENTS.md).
