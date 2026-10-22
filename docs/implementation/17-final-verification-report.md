# Verification report

State of `feature/ashyterm-cross-platform-parity` against `main`. This is
interim: two areas (file manager, AI assistant) are not implemented.
Everything below was run or observed; nothing is inferred from configuration
alone.

## Delivered

| Area                                                      | Status       | Evidence                                                                              |
| --------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| Split panes, broadcast                                    | verified (L) | unit + IPC tests; native tab suites; real app                                         |
| Saved sessions, SSH, Quick Connect, ssh_config import     | verified (L) | unit tests; real app (local session, refused SSH with Reconnect)                      |
| Output highlighting (AshyTerm rules), rule editor         | verified (L) | byte-identity invariants; benchmark; real app (ping, df, free, ip, systemctl; editor) |
| Command Manager (56 built-ins)                            | verified (L) | unit + jsdom tests; real app (Ping run with ping rules)                               |
| Command palette, terminal search                          | verified (L) | unit tests; real app (split from palette, search with 4 matches)                      |
| Tab menu, tab groups                                      | verified (L) | jsdom tests; real app (group chip, restore)                                           |
| Workspace restore (opt-in)                                | verified (L) | unit tests with real files; real app (quit, relaunch, directories and groups back)    |
| Settings backup and restore                               | verified (L) | real crypto tests; real app (save, wrong passphrase refused, restore applied live)    |
| CLI (`-w`, `--ssh`, `--log-level`, `--help`, `--version`) | verified (L) | unit tests; real app (help, version headless, invalid option exit 2, refused `--ssh`) |
| i18n (English, pt-BR)                                     | verified (L) | completeness tests; real app in pt-BR                                                 |
| x64 and arm64 packages; DEB, RPM, PKGBUILD                | partial      | Linux x64 built and verified locally; other targets depend on CI (below)              |

(L) = exercised in the real application on Linux x86_64 (KDE Plasma, X11 and
XWayland).

## Not delivered

- File manager, SFTP transfers and remote editing:
  [08-file-manager-and-transfers.md](08-file-manager-and-transfers.md).
- AI assistant, pending a dependency decision:
  [10-ai-assistant.md](10-ai-assistant.md).
- Shell input highlighting, auto-reconnect, a guided host-key mismatch flow,
  window geometry restore, translated native menus, and Detach Tab.

## Local gates

Last run before this report:

- `npm run lint`, `npm run typecheck` and `npm run format:check` are clean.
- `npm test -- test/unit`: 189 files and 2390 tests pass.
- Graphical suites, run one at a time: window-chrome, tab-removal,
  startup-tab-titles, pending-tab-ownership, failure-acknowledgement,
  initialization-cancellation, literal-argv and local-shell all pass. Some
  cases are skipped by their own platform gates.
- Packaged Linux x64:
  - `npm run package:linux` builds the AppImage, DEB and RPM;
  - `npm run package:verify` reports FULL, with and without `--software-gl`;
  - `makepkg` builds the PKGBUILD.

## CI

The workflow runs format, lint and types once, then on six runners
(ubuntu-24.04, ubuntu-24.04-arm, windows-2025, windows-11-arm, macos-15,
macos-15-intel):

- unit tests and build on all six;
- the native PTY suites on both Linux runners;
- unsigned packaging with checksum verification on all six, plus:
  - Linux: packaged startup with software GL;
  - macOS: static content checks and `hdiutil verify`;
  - Windows: static content checks.

Results for the latest commit are listed in the pull request.

## Known limits of the evidence

- macOS and Windows packaged startup are not proven by CI. Hosted runners
  have no desktop this suite may use, and exact NSIS verification needs a
  disposable VM (ADR 0023).
- GPU rendering of packaged Linux builds is proven only on the developer
  desktop. CI uses software GL.
- R13 (one unexplained lost SSH tab) is still open; it did not recur in
  later runs.
