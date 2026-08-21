# Publish tested arm64 releases without verified publisher identities

This ADR owns the macOS-specific artifact and Gatekeeper policy. The broader
Supported Platform, native-build, verification, and publication policy is
recorded in
[ADR 0019](0019-support-native-arm64-releases-on-macos-linux-and-windows.md).

Each accepted OMXTerm version may be tagged as `v0.x.y` and published as a
ready-to-run Apple Silicon macOS `.dmg`. The exact artifact is built and
verified natively before it and a SHA-256 checksum are attached to the canonical
GitHub Release. Releases remain manual and the application has no automatic
update mechanism.

The application is not signed with an Apple Developer ID and is not submitted
for notarization. This avoids turning a personal open-source project into a paid
Apple distribution obligation, at the cost of a deliberate one-time Gatekeeper
review for users. The assembled application still receives a complete ad-hoc
code seal: Apple Silicon requires internal code integrity even when an
application has no verified publisher identity. Ad-hoc sealing does not identify
a publisher, satisfy Gatekeeper trust, or replace Developer ID signing and
notarization.

Automated package verification must run `codesign --verify --deep --strict`
against the assembled application and reject both an invalid seal and any
unexpected signing authority or Team ID. Browser-quarantined Gatekeeper
exercise is optional macOS dogfood, not a release gate, even when packaging,
code sealing, or Gatekeeper-facing metadata changes. When automation cannot
observe the resulting security UI, the release record states that boundary as
unverified and the release notes retain the unsigned, unnotarized limitation.
A locally built artifact without quarantine is never represented as independent
Gatekeeper evidence.

Release notes must state the unverified and unnotarized limitation, link to
Apple's current review instructions, and describe provenance narrowly: the
artifact is the build Otávio published and uses, not independently audited
software. They must not ask users to disable system-wide macOS protections.
