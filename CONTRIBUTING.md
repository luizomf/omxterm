# Contributing to OMXTerm

Thanks for helping improve OMXTerm! Bug reports, feedback, documentation improvements, and code contributions are all welcome.

## Ways to help without writing code

- Test the [latest release](README.md#platforms-and-downloads) in your daily workflow, especially on Linux and Windows ARM64.
- Let us know if an installation step or documentation section is unclear.
- Help reproduce an [open issue](https://github.com/luizomf/omxterm/issues) and share your platform details.
- Suggest a feature by describing the use case it solves.

### Report a problem

Search [existing issues](https://github.com/luizomf/omxterm/issues) first, then [open a bug report](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md). Include:

- Your OMXTerm version (**About OMXTerm** in the app menu).
- Your operating system, architecture (ARM64 or x64), and Linux desktop environment if applicable.
- What you did, what you expected, and what happened.

[Local diagnostic logs](docs/usage.md#local-diagnostics) are optional. Please use synthetic examples and redact any private paths, credentials, or sensitive terminal output before sharing screenshots or logs.

For security vulnerabilities, follow the private reporting instructions in [SECURITY.md](SECURITY.md) rather than opening a public issue.

### Have an x64 Linux or Windows machine?

Windows x64 installers are available and can also be built from source (`npm run package:win:x64`; see [development](docs/development.md#windows)). Help with native Intel/AMD qualification is welcome in the [Windows x64 issue](https://github.com/luizomf/omxterm/issues/224). The [Linux x64 issue](https://github.com/luizomf/omxterm/issues/223) is still open if you would like to help build and test native Linux x64 packages.

## Opening a pull request

1. Check existing issues and pull requests first. For larger features or architectural changes, open or comment on an issue before writing code; small bug fixes and documentation edits can go straight to a PR.
2. Fork [`luizomf/omxterm`](https://github.com/luizomf/omxterm) on GitHub and create a focused branch from `main`.
3. Make your changes, add or update tests for changed behavior, and update affected documentation and contracts (`docs/spec.md`, `CONTEXT.md`, or `docs/adr/`) in the same commit.
4. Run the [verification checks](#verification) below, then [commit, push, and open a pull request](#commits-and-pull-requests) against `main`.

Please write all code, documentation, commit messages, and GitHub issues/PRs in English.

### Browser-only documentation edits

For small Markdown fixes, you can edit files directly on GitHub in your fork without setting up a local build environment. Preview the rendered Markdown, check any modified links, and note in your PR description that local CLI checks (`npm run format:check`) were not run.

## Development environment

For code development, you need ARM64 hardware running macOS, Linux, or Windows (or an x64 Windows PC), Git, and **Node.js 22.13+ (22.x) or 24+** with npm.

Install your [platform prerequisites](docs/development.md#platform-prerequisites) before running `npm ci` (Xcode Command Line Tools on macOS; build tools, XWayland, and fixture fonts on Linux; Developer Mode symlink access and Visual C++ Redistributable on Windows).

Clone your fork and set up the `upstream` remote:

```sh
git clone -c core.autocrlf=false -c core.symlinks=true https://github.com/YOUR-USERNAME/omxterm.git
cd omxterm
git remote add upstream https://github.com/luizomf/omxterm.git
git fetch upstream
git switch -c feat/my-change upstream/main
```

Install dependencies and start the app in development mode:

```sh
npm ci
npm run dev
```

`npm ci` installs locked dependencies and prepares the native runtimes (`node-pty` and Restty). `npm run dev` builds and opens OMXTerm using your local configuration directory (`~/.config/omxterm`), so back up your settings before testing configuration changes.

See the [native development guide](docs/development.md) for platform details and test suites, and the [Restty guide](docs/restty-development.md) when working on the Terminal Surface.

## Making a change

When changing application behavior, consult the [product specification](docs/spec.md), [terminology glossary](CONTEXT.md), and [Architecture Decision Records](docs/adr/README.md):

- **Focused changes:** keep modules clear and strictly typed, and avoid unnecessary dependencies.
- **Test coverage:** add unit tests (`test/unit/`) with mocked external I/O and scoped integration tests (`test/integration/`) for real PTY, filesystem, or GUI behavior.
- **Documentation in sync:** update affected user guides, `docs/spec.md`, `CONTEXT.md`, and ADRs in the same commit as behavior changes.
- **Security boundaries:** keep privileged operations in Electron `main`, expose a minimal typed `preload` bridge, and maintain renderer context isolation with Node integration disabled. Chromium sandboxing stays enabled on macOS and Windows (Linux follows [ADR 0024](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md)). The portable Terminal Surface receives an Adapter rather than importing Electron or `node-pty`.
- **Input and log safety:** validate external inputs at IPC and PTY boundaries, pass untrusted arguments as literal argv arrays (never shell-interpolated strings), and follow the [safe logging contract](docs/spec.md#configuration-and-local-state) (never log terminal payloads, commands, clipboard data, or private paths).

## Verification

For **documentation-only changes**, check formatting and whitespace:

```sh
npm run format:check
git diff --check
```

For **code changes**, run the portable check suite:

```sh
npm run check:portable
```

`npm run check:portable` runs Prettier (`format:check`), lint (`npm run lint`), TypeScript type checking (`npm run typecheck`), the default Vitest suite (`npm test`), and the unpackaged build (`npm run build`).

> **Warning:** Graphical integration tests included in `npm test` and `npm run check:portable` open and focus real Electron windows. Run one graphical suite at a time on an unlocked, idle desktop without moving the mouse or typing during the run. For fast headless unit-test feedback while developing, run:
>
> ```sh
> npm test -- test/unit
> ```

For changes that affect native packaging or installers, see [packaging verification](docs/development.md#evidence-reuse-and-packaging). Note that full Windows installer verification (`npm run check:win`) performs a real installation and requires a disposable VM with a recovery snapshot.

In your PR description, list the verification commands you ran and their results (as well as any platform checks you could not run locally).

## Commits and pull requests

Use [Conventional Commit](https://www.conventionalcommits.org/) messages such as `fix: preserve terminal focus` or `docs: clarify theme setup`:

```sh
git diff
git add path/to/changed-file
git commit -m "fix: preserve terminal focus"
git push -u origin feat/my-change
```

Open a pull request against `luizomf/omxterm` (`main`) and include:

- A clear summary of the problem and solution.
- The related issue (`Closes #123` when applicable).
- The verification commands run and their results.
- Any documentation or contract files updated (or why none were affected).

## Maintainer integration and releases

When integrating a contribution, add any missing contributor to
[CONTRIBUTORS.md](CONTRIBUTORS.md) in alphabetical GitHub handle order, with a
profile link and their public name if known (otherwise just the handle). This
includes small documentation fixes and one-line translations; contributors can
correct their names or optional self-provided details later.

Contributors do not need to bump versions, run multi-platform release builds, or publish packages. Maintainers handle cross-platform qualification, version bumps ([`docs/versioning.md`](docs/versioning.md)), release builds ([`docs/release.md`](docs/release.md)), and [issue tracker triage](docs/agents/issue-tracker.md).
