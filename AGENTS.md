# Working on OMXTerm

OMXTerm is a personal desktop terminal for ARM64 macOS, Linux and Windows,
using Electron, TypeScript, a portable DOM+Restty Terminal Surface and a local
PTY Adapter.

## Shared contributor guidance

[CONTRIBUTING.md](CONTRIBUTING.md) is the contribution guide for humans and
agents alike: setup, engineering and security standards, verification, commits
and PRs. Use [docs/development.md](docs/development.md) for platform prerequisites,
native tests and fixture safety. No particular agent harness, skill collection,
private tooling or worktree location is required.

For the task's context, read its issue, [docs/spec.md](docs/spec.md),
[CONTEXT.md](CONTEXT.md) and relevant [ADRs](docs/adr/README.md). These are shared
technical references, not agent-only requirements. Update affected contracts
alongside behavior changes; documentation corrections alone do not authorize
code changes. The [documentation map](docs/README.md) identifies each subject's
home.

## Agent working guidance

- Chat in the user's language; write code, docs and GitHub artifacts in English.
- Inspect working-tree changes and related issues/branches/PRs before editing.
  Preserve unrelated work and coordinate with active writers. Check current
  tracker state; completed work stays closed unless the task calls for reopening.
- Carry the actual request and delivery boundary into plans and delegations.
  Prefer the smallest complete solution and existing tools; do not add
  unrequested work, approval gates or implementation to a documentation task.
- Continue while the next step is clear and in scope. Ask when missing information
  blocks progress or a destructive consequence needs authorization. Report
  blockers with evidence and a recommended next step.
- Apply the shared [engineering standards](CONTRIBUTING.md#making-a-change) and
  [verification guidance](CONTRIBUTING.md#verification). Inspect the final diff;
  report actual checks, unavailable checks and retained failures, not inferred
  passes. Keep private data out of commits and public evidence.
- Leave integration and releases to the authorized maintainer workflow under
  [maintainer responsibilities](CONTRIBUTING.md#maintainer-integration-and-releases).
  Do not treat a contribution request as permission to publish or release.

GitHub: `luizomf/omxterm`. Maintainer tracker operations and label meanings are in
[docs/agents/](docs/agents/issue-tracker.md); consult them when doing tracker work.
