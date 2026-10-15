# Contributing to OMXTerm

Thanks for helping improve OMXTerm. Bug reports, everyday testing, documentation
fixes and code contributions are all welcome. Humans and coding agents use the
same engineering standards and technical references below.

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
2. On the [project's GitHub page](https://github.com/luizomf/omxterm), click
   **Fork**, select your account, and choose **Create fork**. If reusing an older
   fork, update its `main` with **Sync fork → Update branch** first.
3. Create a focused branch from current upstream `main`. Use the
   [local setup below](#development-environment), or the
   [browser-only route](#browser-only-documentation-edits) for a small doc edit.
4. Make the change, add tests for changed behavior, and update the affected
   guides and product contracts in the same commit.
5. Run the [checks below](#verification), then [commit, push, and open a PR](#commits-and-pull-requests)
   against `main` with the issue, a short explanation, and the results. Draft PRs
   are welcome.

Write code, documentation and GitHub contributions in English. Be respectful
and specific when giving feedback; discuss the work rather than the person.

### Browser-only documentation edits

No local build is needed for a small Markdown change:

1. In your fork, select `main`, open the file, and click the pencil (**Edit**).
2. Edit and preview the Markdown. Choose **Commit changes**, enter a focused
   message such as `docs: clarify theme setup`, and select **Create a new branch**
   with a descriptive name such as `docs/my-first-change`.
3. Open a PR using **Compare & pull request** (or **Contribute → Open pull request**).
   Choose `luizomf/omxterm` and `main` as the base repository/branch, and your fork
   and new branch as the head.
4. Inspect **Files changed** for unrelated edits or private data. Follow changed
   links and review examples and the rendered Markdown. In the PR, explicitly
   record unavailable checks, for example: **Not run (browser-only):
   `npm run format:check` and `git diff --check`.** Do not claim they passed.

The maintainer must verify formatting, links/examples, and `git diff --check`
before merging a browser-only documentation PR. See the
[PR description requirements](#commits-and-pull-requests) below.

## Development environment

For documentation-only edits, you can skip the native build setup. For code,
use ARM64 hardware running macOS, Linux or Windows, Git, and **Node.js 22.13+
within 22.x, or 24+**, with npm.

Prepare your [platform prerequisites](docs/development.md#platform-prerequisites)
before cloning and running `npm ci`: macOS needs native build tools, Linux needs
installed fixture fonts and graphical dependencies, and Windows development/tests
need ordinary-user symlink access through Developer Mode. These are development
requirements, not extra steps for people installing the packaged app.

Then clone your fork (replace `YOUR-USERNAME`):

```sh
git clone -c core.autocrlf=false -c core.symlinks=true https://github.com/YOUR-USERNAME/omxterm.git
cd omxterm
git remote add upstream https://github.com/luizomf/omxterm.git
git fetch upstream
git switch -c docs/my-first-change upstream/main
```

Choose a branch name that describes your change. For a documentation-only edit,
you can stop here, edit the Markdown, and follow [verification](#verification)
and [commit/push steps](#commits-and-pull-requests).

For code development, continue with:

```sh
npm ci
npm run dev
```

`npm ci` installs the locked dependencies and prepares the native runtime;
`npm run dev` builds and opens the app. Development uses your ordinary OMXTerm
configuration and opens a real shell, so back up settings before experimenting
with them.

The [native development reference](docs/development.md) covers platform setup,
graphical tests and fixture cleanup. See the [Restty guide](docs/restty-development.md)
when changing the Terminal Surface or its pinned dependencies.

## Making a change

OMXTerm focuses on local terminal sessions. For behavior changes, read the
relevant [product contract](docs/spec.md), [terminology](CONTEXT.md) and
[architecture decisions](docs/adr/). They explain current behavior and its
tradeoffs. Replace obsolete guidance rather than retaining chronology in active
files; Git preserves previous versions. Track supported code bugs separately from
documentation corrections, without expanding them into unrequested implementation
work.

- Keep the change focused, with clear modules, strict types and dependencies
  that serve a concrete need.
- Prefer test-first changes covering observable behavior, including a regression
  test for a bug fix. Mock external I/O in unit tests; use scoped integration tests
  for real PTYs, filesystems and GUI.
- In the same commit as a behavior change, update the affected user guides,
  `docs/spec.md`, architecture decisions and `CONTEXT.md` terminology. Check them
  against the implementation, not just the intended design. If none is affected,
  explain why in the PR.
- Write for the intended reader: user guides solve everyday tasks; contributor
  docs explain development; the spec and ADRs carry detailed behavior and
  architectural rationale. Link between them rather than copying the same detail.
- Keep privileged operations in Electron main, expose a minimal typed preload
  bridge, and preserve renderer isolation and disabled Node integration.
  Chromium sandboxing is enabled on macOS and Windows; Linux follows
  [ADR 0024](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).
  The portable Terminal Surface receives an Adapter rather than importing
  Electron or `node-pty`.
- Validate external input at IPC and PTY boundaries. Pass untrusted values as
  literal arguments, not interpolated shell commands. Logs follow the
  [safe-metadata contract](docs/spec.md#configuration-and-local-state).
- Review the final diff for unrelated changes and private data. Local settings,
  logs, terminal contents, credentials and generated release files stay out of Git.

## Verification

For documentation-only changes, check formatting, changed relative links and
anchors, and examples; run `git diff --check`. No native build or test suite is
needed. Product tests should exercise loaders and initial starter-file creation,
not parse shell commands from editorial Markdown or require a particular guide's
wording. With dependencies installed:

```sh
npm run format:check
git diff --check
```

> **Warning: graphical integration tests open and focus real windows.** Run them
> unattended on an ordinary-user, logged-in, unlocked desktop. Do not type,
> click, move the pointer over fixture windows, change window/display geometry,
> or switch Parallels VM tabs during the run. Run one graphical suite at a time.
> Desktop interference can invalidate results; a later PASS alone does not prove
> the cause of a failure.

For code, run:

```sh
npm run check:portable
```

This runs formatting, lint, type checking, the default Vitest suite and the
unpackaged build. You can run `npm run lint`, `npm run typecheck`, `npm test` or
`npm run build` separately while developing. `npm run test:integration` runs only
`test/integration/local-shell.test.ts`, not the full integration directory.
Graphical tests need a working desktop and WebGL2; “portable” does not mean
headless. For headless, unit-only feedback, use `npm test -- test/unit`; it omits
native integration and does not replace `check:portable`. Platform skips and
explicit opt-in tests are not passes on those boundaries; see the
[qualification scope](docs/development.md#qualification-scope). The
[desktop summary](README.md#exercised-desktops) describes where OMXTerm has been
used; [#586](https://github.com/luizomf/omxterm/issues/586) records detailed
behavioral results, tested source identities and retained failures.

Product packaging changes also need matching native evidence. Reuse recorded
PASS steps from Git or previous issues/PRs when relevant inputs are unchanged;
run missing or invalidated steps under the
[release procedure](docs/release.md#changed-inputs-and-build-to-tag-comparison).
Test-only/fixture-only changes need affected tests and honest results, not package
rebuilds everywhere. Proven orchestration-only changes need orchestration tests;
retained metadata or changed build recipes are not automatically exempt.

Native packaging commands and their safety prerequisites are in
[Development](docs/development.md#evidence-reuse-and-packaging).
**Windows exact-installer checks perform real installation and replacement**;
use only an authorized disposable VM with a recovery snapshot.

List unavailable checks and reasons. Report actual platform results and coverage
limits; one platform's pass does not qualify another. Preserve failures and
explain their relevance rather than erasing them with a later pass. Record results
in the PR, not a new repository execution report. Everyday testing is welcome
but optional for releases.

## Commits and pull requests

Use focused [Conventional Commit](https://www.conventionalcommits.org/) subjects,
such as `fix: preserve terminal focus` or `docs: clarify theme setup`.

For a local change, run the applicable [checks](#verification), then commit only
your intended files and push the branch to your fork (`origin` in the setup
above). Replace the file path and branch name below with your own:

```sh
git diff
git add path/to/changed-file.md
git commit -m "docs: clarify theme setup"
git push -u origin docs/my-first-change
```

On your fork's GitHub page, choose **Compare & pull request** (or
**Contribute → Open pull request**). Select `luizomf/omxterm` / `main` as the base,
and your fork / pushed branch as the head. Review **Files changed** before
submitting.

A PR should explain the problem and solution, link its issue (`Closes #123` when
applicable), and list verification commands and results. Identify the guides and
contracts updated alongside changed behavior, or explain why none is affected.
Mention security impact and any unresolved concern. For an issue with acceptance
criteria, explain how the change meets them. Keep unrelated work in separate PRs.

Ordinary fixes and docs leave versions unchanged; a feature or contract change
may advance the `-dev` baseline under the [versioning policy](docs/versioning.md).
Coding agents should also read [AGENTS.md](AGENTS.md); no particular agent tool or
skill collection is required to contribute.

## Maintainer integration and releases

Submitting a PR does not require tracker administration, publishing packages, or
qualifying every platform yourself. Maintainers coordinate missing checks and
own integration and releases:

- Check current issues, PRs and active writers. Default to issue → branch → PR →
  squash merge, with independent review and passing required checks before merge.
  Small documentation or agent-guidance maintenance may go directly to `main`
  with maintainer approval; this does not replace the public fork-and-PR route.
- Assess failures against the candidate with diagnosis-supported dispositions.
  An old promise, historical evidence gap or unrelated failure is not by itself
  a release blocker; explain concrete impact and affected platforms.
- Follow the [release procedure](docs/release.md) for preparation, native
  verification, tags, uploads and download verification. An authorized release
  request covers that full scope, including delegated work. Manual testing is
  optional; record unverified risks rather than inventing passes.
- Preserve verified packages when relevant inputs are unchanged. Separate
  behavioral, build, exact-artifact and publication evidence; version-only changes
  need new packages, not wholesale behavioral reruns. Collect exact artifacts
  and evidence in the primary checkout's ignored `release/` directory, identify
  development builds by full source SHA, and retain candidates through publication.
- After integration, clean up task-owned branches, worktrees and temporary
  resources only when no consumer still needs them. Preserve unrelated or
  uncommitted work and retained failure evidence.

[Tracker operations](docs/agents/issue-tracker.md) document repository labels and
coordination for maintainers.
