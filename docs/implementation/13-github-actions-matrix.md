# CI and platform validation matrix

The repository had no GitHub Actions workflows at the branch point. Release
qualification relied on maintainers running native suites (see
[`docs/release.md`](../release.md)).

## Validation evidence by target

| OS         | Architecture  | Build | Unit tests      | Graphical/real-app                                                                                                                                                                                                                  | Package                                               | Evidence                                                                                  |
| ---------- | ------------- | ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Linux      | x86_64        | yes   | yes (2217 pass) | native suites: tab-removal, failure-acknowledgement, window-chrome, pending-tab, initialization-cancellation, startup-tab-titles, local-shell, literal-argv, linux-foreground, resize-race, session-retirement; manual RA for panes | local: AppImage, DEB, RPM, PKGBUILD; CI `package` job | local runs, see [15](15-regression-and-bug-tracking.md) and [16](16-release-readiness.md) |
| Linux      | ARM64         | no    | no              | no                                                                                                                                                                                                                                  | CI `package` job (no run yet)                         | needs ARM64 runner                                                                        |
| Windows 11 | x64           | no    | no              | no                                                                                                                                                                                                                                  | CI `package` job (no run yet)                         | needs runner                                                                              |
| Windows 11 | ARM64         | no    | no              | no                                                                                                                                                                                                                                  | CI `package` job (no run yet)                         | needs ARM64 runner or VM (ADR 0023)                                                       |
| macOS      | Apple Silicon | no    | no              | no                                                                                                                                                                                                                                  | CI `package` job (no run yet)                         | needs runner                                                                              |
| macOS      | Intel x64     | no    | no              | no                                                                                                                                                                                                                                  | CI `package` job (no run yet)                         | needs runner                                                                              |

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

## Packaging job

`ci.yml` has a `package` job on the same six native runners as `unit`
(`ubuntu-24.04`, `ubuntu-24.04-arm`, `windows-2025`, `windows-11-arm`,
`macos-15`, `macos-15-intel`). Each runner builds unsigned packages for its own
architecture with `npm run package:<mac|linux|win>` (no cross-compiling), then:

| Runner OS | Packages                                   | Verification                                                                                       |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Linux     | AppImage, `linux_install.sh`, DEB, RPM     | `xvfb-run npm run package:verify`: AppImage contents, helper install and startup; DEB/RPM contents |
| macOS     | DMG (ad-hoc signature only, not notarized) | `package:verify -- --static-only`, `hdiutil verify`; startup not claimed                           |
| Windows   | NSIS installer (unsigned)                  | `package:verify -- --static-only`; startup and exact installer not claimed (ADR 0023)              |

Every runner checks its `SHA256SUMS-<platform>-<arch>.txt` and uploads the
packages and checksums as workflow artifacts kept for 7 days. Linux ARM64
uses a system `fpm` gem (`USE_SYSTEM_FPM=true`). The job never signs beyond the
existing macOS ad-hoc seal, publishes, tags or bumps versions. See
[16](16-release-readiness.md) for the release-readiness record.
