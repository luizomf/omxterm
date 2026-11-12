# Build Linux packages on Ubuntu 22.04

Status: accepted. Amends
[ADR 0036](0036-distribute-build-only-x64-ci-artifacts.md), whose ARM64
release checks no longer build on the verification desktop.

## Context

An AppImage bundles Electron and our native addons, but each addon still links
against the system glibc it was compiled on. Electron itself needs glibc 2.25.
The ARM64 AppImage up to 0.28.0 was built on a Fedora 44 desktop, so node-pty's
`pty.node` picked up `cfsetispeed`/`cfsetospeed@GLIBC_2.42` and refused to load
on Ubuntu 24.04 LTS (2.39) and Debian 13 (2.41). The x64 AppImage, built on
hosted Ubuntu 22.04, already ran there.

## Decision

Both Linux AppImages build on GitHub-hosted Ubuntu 22.04 runners
(`ubuntu-22.04` and `ubuntu-22.04-arm`) from the manual `linux.yml` workflow.
The supported Linux floor is glibc 2.35: Ubuntu 22.04, Debian 12, Fedora 36 or
later.

The ARM64 artifact keeps full verification: the maintainer downloads it, checks
its checksums and build evidence, places it with its helper in `release/` of the
same cut on a Linux ARM64 desktop, and runs `npm run check:portable` and
`npm run package:verify` there. x64 keeps the build-only scope of ADR 0036.

## Consequences

The glibc floor follows the runner image, not whoever builds the release. A
newer runner raises it again, so moving off Ubuntu 22.04 is a deliberate change
to this ADR and the installation guide. Hosted artifacts expire after seven
days, so a release downloads them before then. Older released ARM64 AppImages
still need glibc 2.42.
