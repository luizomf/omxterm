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

> **Note:** Graphical integration tests included in `npm test` and `npm run check:portable` open and focus real Electron windows. Run one graphical suite at a time on an unlocked, idle desktop. Use `npm test -- test/unit` for fast headless feedback.
>
> For agent work, run browser tests and browser-based review/reproduction probes only in an assigned disposable guest, including headless Chromium or Chrome. Carry this restriction to every nested delegate. Before native clipboard-writing tests (including default-suite cases), follow the [shared-clipboard prelaunch checks](docs/development.md#shared-clipboard-before-native-tests); hold affected execution if isolation is unavailable. Temporary profiles, HOME and XDG paths do not isolate macOS Keychain or OS preferences; see the [macOS verification precautions](docs/development.md#macos-preferences-and-native-verification). They do not isolate Linux per-user services either; follow the [Linux desktop-service prerequisites](docs/development.md#linux-desktop-services-and-native-verification), including shared portal/mount baselines and preservation checks. A same-user private D-Bus/Xvfb desktop is not account/runtime isolation.

## Architecture and repository layout

- `src/main/` — Electron main process: native windows, local PTY sessions, configuration and theme loading, font validation, clipboard, external link validation, bounded local-image reads, and operational logging.
- `src/preload/` — Minimal typed preload bridge with sender and payload validation.
- `src/renderer/` — Window host, tabs, chrome, snippets sidebar, and local image preview overlay (runs with context isolation enabled and Node integration disabled).
- `src/terminal-surface/` — Framework-independent DOM Terminal Surface powered by Restty and Ghostty WASM. Receives a session Adapter rather than importing Electron or `node-pty`.
- `docs/` — User guides and developer references (see [`docs/README.md`](docs/README.md)).

## Repository standards

- Write code, documentation, commit messages, and GitHub issues/PRs in English.
- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, engineering standards, verification, and PR workflow. For native development, use the relevant [platform prerequisites](docs/development.md#platform-prerequisites), [test suites](docs/development.md#running-native-tests), and [packaging checks](docs/development.md#evidence-reuse-and-packaging).
- When changing observable behavior or architecture, consult the affected sections of [`docs/spec.md`](docs/spec.md), the terms in [`CONTEXT.md`](CONTEXT.md), and relevant decisions in the [ADR index](docs/adr/README.md). Follow [Making a change](CONTRIBUTING.md#making-a-change) to keep affected documentation and contracts in sync.
- Keep privileged capabilities in Electron `main`, validate external inputs at IPC and PTY boundaries, pass untrusted values as literal arguments (never interpolated shell strings), and keep terminal contents, commands, clipboard data, and private paths out of logs and commits.
- Contribution PRs and forks leave application-version metadata unchanged unless a maintainer assigns versioning work. The upstream integration maintainer or assigned agent owns development-version bumps under [`docs/versioning.md`](docs/versioning.md); tags and publication remain separate maintainer actions under [`docs/release.md`](docs/release.md). Tracker conventions and triage labels are documented in [`docs/agents/`](docs/agents/issue-tracker.md).
