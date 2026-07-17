# AGENTS.md

Instructions for agents working on OMXTerm.

## Project

OMXTerm is Otávio Miranda's open-source personal desktop terminal for Apple
Silicon macOS. It uses Electron and TypeScript around a portable DOM+xterm
Terminal Surface and a local PTY Adapter.

The terminal is the product. AI assistance, SSH brokering, saved sessions,
tabs, splits, shell integration, and cross-platform support are outside the
first release. Do not turn nearby ideas into requirements.

## Sources of truth

Read these before changing product behavior or architecture:

- `docs/spec.md` — observable first-release contract;
- `CONTEXT.md` — project vocabulary;
- relevant files under `docs/adr/` — durable decisions and tradeoffs;
- the current GitHub issue — scope, acceptance criteria, and dependencies.

Use the terms defined in `CONTEXT.md`. Surface a conflict with the spec or an
ADR instead of silently overriding it. Do not reopen settled decisions merely
because another design is possible.

When accepted observable product behavior is added, removed, or changed, update
`docs/spec.md` in the same PR unless the existing contract already states that
behavior. An issue, PR discussion, test, or implementation is not a substitute
for keeping the spec current. Add or update an ADR as well when the change makes
or revises a durable architectural decision or tradeoff.

## Communication

- Chat in the user's language. Write code, documentation, GitHub artifacts, and
  commit messages in English.
- Be direct and practical. Avoid corporate language and ceremony.
- Ask only when a missing answer materially changes product behavior, safety,
  scope, or authority. Otherwise make the smallest reasonable assumption,
  state it when relevant, and continue.
- Explain blockers with evidence and a recommended next action.

## Workflow

The default flow is **issue -> branch -> PR -> merge**.

1. Check existing issues, PRs, branches, and working-tree changes before taking
   ownership. Never duplicate an active writer.
2. Work on one issue at a time in its own branch.
3. Preserve unrelated and uncommitted user changes.
4. Use small conventional commits such as `feat`, `fix`, `refactor`, `test`,
   `docs`, `chore`, and `ci`.
5. Open a PR that contains `Closes #<issue>`, maps the acceptance criteria, and
   records verification evidence.
6. Merge PRs with squash after required reviews and checks pass. Use the PR
   title as the conventional squash commit subject.
7. After integration, verify issue closure and delete the merged branch.

Keep tracker state accurate. A delivered change that is not reflected in its
issue or PR is unfinished work.

## Documentation

- Update user-facing documentation in the same PR when a change affects
  installation, configuration, controls, supported behavior, limitations, or
  troubleshooting.
- Before a release, ensure public documentation describes the shipped product
  and its operating requirements accurately. Write factual product and process
  documentation; do not include private conversations, maintainer biography, or
  personal learning context.
- Complete the PR documentation-impact section with the updated documents or a
  concrete reason no documentation change is needed.

## Versioning and releases

- Releases are deliberate, manual, and owner-authorized. Do not bump versions,
  create tags, publish GitHub Releases, or upload artifacts unless the current
  issue and Otávio explicitly authorize those side effects.
- Proactively surface when an accepted batch of changes forms a coherent release
  candidate or appears to require a version change. State the recommended next
  version and reasoning, and identify any missing versioning policy instead of
  silently choosing one.
- Before proposing a release, reconcile package metadata, the intended tag,
  artifact filenames, public documentation, release notes, and the exact-artifact
  checklist in `docs/release.md`.
- A release is not ready while required checks, regression coverage, packaging
  verification, user-facing documentation, or applicable manual checks are
  missing. Publication remains blocked until Otávio accepts the exact artifact
  and separately authorizes publication.

## Engineering approach

- Prefer the smallest complete change. Do not build speculative abstractions,
  compatibility layers, frameworks, or future features.
- Follow ecosystem conventions before inventing project conventions.
- Keep the project as one package organized by real runtime responsibility:
  Electron main, preload, renderer, and the portable Terminal Surface.
- Preserve the boundaries in the spec: privileged capabilities belong to the
  Electron main process; preload exposes a minimal typed bridge; the renderer
  remains sandboxed; the Terminal Surface does not import Electron or
  `node-pty`.
- Keep modules focused and interfaces small. Wrap a dependency only at a real
  seam or when project-owned validation, defaults, or cleanup justify it.
- Prefer clear searchable names and explicit control flow. Avoid generic dumping
  grounds such as `utils`, `helpers`, `common`, or `manager`.
- Use strict types at public and IPC boundaries. Avoid `any`; isolate and explain
  it when unavoidable.
- Validate external input at its boundary. Preserve useful error context and
  never fail silently.
- Comments explain non-obvious reasons, constraints, or security tradeoffs — not
  what the next line visibly does.
- Do not add a dependency without a concrete need in the current issue.

## Tests and verification

- New behavior needs observable behavior tests. Bug fixes need regression tests.
- Test public contracts rather than private implementation details.
- Mock external I/O in unit tests. Use real PTYs, filesystems, packaging, or GUI
  behavior only in explicitly scoped integration or end-to-end tests.
- Do not assert volatile versions, timestamps, full log messages, or internal
  call shapes unless they are the behavior under test.
- Keep one documented project command capable of running the test suite.

Before delivery, run the relevant formatter, typecheck, tests, build, and
packaging checks for the issue. Inspect the final diff for unrelated changes,
secrets, generated files, and missing documentation. If a check cannot run,
state exactly why.

## Safety

- Never commit secrets, credentials, `.env` files, private data, terminal
  payload, clipboard contents, or session transcripts.
- Treat PTY data, IPC messages, URLs, filesystem paths, configuration, and shell
  arguments as untrusted at their boundaries.
- Do not weaken renderer isolation or broaden preload capabilities for
  convenience.
- Do not use destructive Git commands, force-push `main`, or discard user work.
- Avoid shell command construction from untrusted strings. Prefer a safer API
  when one exists.
- Logs contain only the operational metadata allowed by `docs/spec.md`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub at `luizomf/omxterm`. See
`docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the five canonical omskills triage labels. See
`docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.
