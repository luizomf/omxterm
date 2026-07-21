# Publish tested unsigned arm64 releases

This ADR owns the macOS-specific artifact and Gatekeeper policy. The broader
Supported Platform, native-build, verification, and publication policy is
recorded in
[ADR 0019](0019-support-native-arm64-releases-on-macos-linux-and-windows.md).

Each accepted OMXTerm version may be tagged as `v0.x.y` and published as a
ready-to-run Apple Silicon macOS `.dmg`. Otávio builds and tests the exact
artifact locally on the supported machine before attaching it and a SHA-256
checksum to the canonical GitHub Release. Releases remain manual and the
application has no automatic update mechanism.

The artifact will not be signed with an Apple Developer ID or submitted for
notarization. This avoids turning a personal open-source project into a paid
Apple distribution obligation, at the cost of a deliberate one-time Gatekeeper
warning for users. Release notes must state that limitation, link to Apple's
current review instructions, and describe provenance narrowly: the artifact is
the build Otávio published and uses, not independently audited software. They
must not ask users to disable system-wide macOS protections.
