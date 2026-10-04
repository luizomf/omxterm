# Working on OMXTerm

OMXTerm is a personal desktop terminal for ARM64 macOS, Linux and Windows,
using Electron, TypeScript, a portable DOM+Restty Terminal Surface and a local
PTY Adapter.

## Working style

- Chat in the user's language; write code, docs and GitHub artifacts in English.
- Keep going while the next step is clear and in scope. Make routine engineering
  decisions yourself, including in delegated work. Ask when information blocks
  progress or a destructive consequence needs authorization.
- Prefer the smallest complete solution and existing tools. Inspect repository
  state yourself and report blockers with evidence and a recommended next step.
- Carry the maintainer's actual request into plans, issues and delegated prompts.
  Do not add unrequested restrictions, work or approval gates.

## Context

- Read `docs/spec.md`, `CONTEXT.md`, relevant `docs/adr/` decisions and the issue
  for context. Documentation, specs, ADRs and contracts evolve with the product;
  none is immutable. A documentation reconciliation request includes correcting
  those documents, not only user guides. Write the current tree as guidance for
  today's product, not a chronicle of how it evolved. Replace obsolete decisions
  and remove superseded documents, old release reports and experiment results
  instead of keeping historical banners or archives in the tree. Preserve useful
  current rationale and procedures; history remains in commits, issues and PRs.
- Describe implemented behavior and limitations accurately. Separate supported
  code bugs from documentation drift into focused follow-up issues, with affected
  platforms and evidence limits. An old promise, audit finding or historical
  evidence gap is not automatically a requirement to change code or block a
  release. State a concrete impact and relevance when recommending a blocker.
- Keep code fixes bounded to one problem and its affected platform(s), rather
  than turning a broad documentation audit into a single implementation task.
- GitHub: `luizomf/omxterm`. Tracker operations, labels and domain references live
  in `docs/agents/`; read them when needed.
- `CONTRIBUTING.md` covers contribution and checks. `docs/development.md` covers
  native setup, graphical tests and destructive fixture prerequisites.

## Changes and delivery

- Check working-tree changes and active branches/PRs before editing. Preserve
  unrelated work and coordinate with active writers.
- Default to issue → branch → PR → squash merge. Small documentation or agent
  guidance maintenance may go directly to `main` with maintainer approval.
  Fork contributions follow `CONTRIBUTING.md`.
- Create worktrees under `~/sannux-data/worktrees/<repo>/<worktree_name>`.
- Use focused conventional commits. PRs explain intent, link the issue, and
  record verification and documentation impact. Get independent review and
  passing required checks before merging.
- Check current issue/PR state before acting; completed work stays closed unless
  the task calls for reopening it. After integration, clean up task-owned
  branches, worktrees and temporary resources while preserving uncommitted work
  and artifacts still in use.

## Engineering and verification

- Keep modules focused, interfaces small and types strict. Add dependencies or
  abstractions for a concrete need in the current change.
- Privileged operations belong in Electron main; preload exposes a minimal
  typed bridge. Preserve renderer isolation, disabled Node integration and
  sandboxing (Linux exception: ADR 0024). The Terminal Surface receives an
  Adapter and imports neither Electron nor `node-pty`.
- Validate external input at IPC and PTY boundaries. Pass untrusted values as
  literal arguments rather than interpolating shell commands. Logs follow the
  safe-metadata contract in `docs/spec.md`.
- Prefer test-first changes covering observable behavior. Mock external I/O in
  unit tests; use scoped integration tests for real PTYs, filesystems and GUI.
- Format changed files. For code, establish `npm run check:portable` plus relevant
  native/packaging evidence; reuse recorded PASS steps with unchanged relevant
  inputs under `docs/release.md`. Run affected tests for test/fixture changes,
  not unrelated native rebuilds. For docs, formatting and diff checks suffice;
  verify changed links and examples. State unavailable checks. Retain observed
  failures and assess their relevance to the current candidate. An applicable
  FAIL needs a diagnosis-supported disposition; a later pass does not erase it,
  and a historical failure is not automatically a blocker for unrelated work.
- Review the final diff for unrelated changes, generated files and private data.
  Keep credentials, local configuration, terminal/clipboard contents and session
  transcripts out of commits and public evidence.

## Versions and releases

Follow `docs/versioning.md` for the development baseline and `docs/release.md`
for releases. Ordinary changes leave versions unchanged; feature/contract
changes may advance the `-dev` baseline as documented.

A release request covers preparation, native verification, tags, uploads and
download verification. Carry that scope through delegations. Manual testing is
optional; record unverified risk alongside checks and checksums. Build natively
when package inputs change; preserve verified packages otherwise. Separate
behavioral, build, exact-artifact and publication evidence;
a version-only edit requires new packages, not wholesale behavioral reruns.
Collect exact artifacts and evidence in the primary checkout's ignored
`release/` directory. Identify development builds by full source SHA and preserve
candidates through verification and publication.
