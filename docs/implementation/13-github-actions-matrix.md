# CI and platform validation matrix

The repository had no GitHub Actions workflows at the branch point. Release
qualification relied on maintainers running native suites (see
[`docs/release.md`](../release.md)).

## Validation evidence by target

| OS         | Architecture  | Build | Unit tests      | Graphical/real-app                                                                                                                                                                                                                  | Package | Evidence                                                |
| ---------- | ------------- | ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------- |
| Linux      | x86_64        | yes   | yes (2217 pass) | native suites: tab-removal, failure-acknowledgement, window-chrome, pending-tab, initialization-cancellation, startup-tab-titles, local-shell, literal-argv, linux-foreground, resize-race, session-retirement; manual RA for panes | not yet | local runs, see [15](15-regression-and-bug-tracking.md) |
| Linux      | ARM64         | no    | no              | no                                                                                                                                                                                                                                  | no      | needs ARM64 runner                                      |
| Windows 11 | x64           | no    | no              | no                                                                                                                                                                                                                                  | no      | needs runner                                            |
| Windows 11 | ARM64         | no    | no              | no                                                                                                                                                                                                                                  | no      | needs ARM64 runner or VM (ADR 0023)                     |
| macOS      | Apple Silicon | no    | no              | no                                                                                                                                                                                                                                  | no      | needs runner                                            |
| macOS      | Intel x64     | no    | no              | no                                                                                                                                                                                                                                  | no      | needs runner                                            |

A target counts as supported only when its row has native evidence. Cross-builds
and emulation do not count as runtime evidence.

## Planned workflows

1. **`ci.yml`** (pull requests and pushes): format, lint, typecheck, unit tests
   and build on `ubuntu-latest`, `windows-latest` and `macos-latest`. Graphical
   suites are excluded because hosted runners have no interactive desktop.
2. **`native-addons.yml`**: builds node-pty on each OS/architecture runner and
   loads it in Electron, using `npm run package:verify` where packaging is
   possible.
3. **`security.yml`**: `npm audit --omit=dev` and a dependency license check.

GUI integration suites need interactive desktops (self-hosted runners or the
documented VM procedure) and are not claimed from hosted runners.
