# Working on OMXTerm

OMXTerm is an open-source desktop terminal for ARM64 macOS, Linux, and Windows (ARM64 and x64), built with Electron, TypeScript, a portable DOM + Restty Terminal Surface (Ghostty WASM core), and a local `node-pty` Adapter.

## Quick commands

```sh
npm ci                       # Install locked dependencies and prepare native runtimes
npm run dev                  # Build and launch OMXTerm in development
npm test -- test/unit        # Run headless unit tests
npm run check:portable       # Format check, lint, typecheck, default tests, and build
npm run format:check         # Check formatting with Prettier
```

Graphical integration tests (part of `npm test` and `npm run check:portable`) open and focus real Electron windows and can write to the system clipboard. Run one suite at a time on an idle, unlocked desktop. Use `npm test -- test/unit` for fast headless feedback.

Pick verification proportional to the change. If a test can't run, report it as unrun and keep going.

## Architecture and repository layout

- `src/main/` — Electron main process: native windows, local PTY sessions, configuration and theme loading, font validation, clipboard, external link validation, bounded local-image reads, and operational logging.
- `src/preload/` — Minimal typed preload bridge with sender and payload validation.
- `src/renderer/` — Window host, tabs, chrome, snippets sidebar, and local image preview overlay (runs with context isolation enabled and Node integration disabled).
- `src/terminal-surface/` — Framework-independent DOM Terminal Surface powered by Restty and Ghostty WASM. Receives a session Adapter rather than importing Electron or `node-pty`.
- `docs/` — User guides and developer references (see [`docs/README.md`](docs/README.md)).

## Repository standards

- Write code, documentation, commit messages, and GitHub issues/PRs in English.
- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, engineering standards, verification, and PR workflow. Native platform details live in [`docs/development.md`](docs/development.md).
- Tests should be fast, deterministic, and check observable behavior. Don't add tests that assert documentation wording, grep source files, or pin implementation details.
- When changing observable behavior or architecture, keep [`docs/spec.md`](docs/spec.md), [`CONTEXT.md`](CONTEXT.md), and the [ADRs](docs/adr/README.md) in sync (see [Making a change](CONTRIBUTING.md#making-a-change)).
- Keep privileged capabilities in Electron `main`, validate external inputs at IPC and PTY boundaries, pass untrusted values as literal arguments (never interpolated shell strings), and keep terminal contents, commands, clipboard data, and private paths out of logs and commits.
- Leave application-version metadata unchanged unless versioning is your task ([`docs/versioning.md`](docs/versioning.md), [`docs/release.md`](docs/release.md)). Tracker conventions live in [`docs/agents/`](docs/agents/issue-tracker.md).
