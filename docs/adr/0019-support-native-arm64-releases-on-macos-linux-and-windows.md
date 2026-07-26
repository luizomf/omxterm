# Support native arm64 releases on macOS, Linux, and Windows

The initial Supported Platforms are macOS arm64, Linux arm64, and Windows
arm64. Their initial Release Artifact formats are respectively DMG, AppImage,
and NSIS. Initial artifacts carry no verified publisher identity: Developer ID
or equivalent publisher signing, Apple notarization, certificates, and other
paid signing services are deferred. The macOS application still receives the
ad-hoc code seal required for internal bundle integrity. Its distribution and
Gatekeeper policy remains in
[ADR 0015](0015-publish-tested-unsigned-arm64-releases.md).

While the repository is private, release candidates are built locally and
natively: macOS on Otávio's current Apple Silicon Mac, and Linux arm64 and
Windows arm64 in native Parallels VM clones. VM work uses the clone's native
filesystem, never a host shared folder, so native dependency, filesystem, and
packaging behavior are not hidden by a cross-platform mount. Each target must
pass its automated checks and native operating-system behavior verification.
Acceptance is recorded against each exact artifact; rebuilding or changing an
artifact invalidates that artifact's evidence.

Publication remains manual. Exact-artifact acceptance does not itself authorize
a tag, upload, or GitHub Release: Otávio must separately authorize publication.
This keeps build and publication credentials out of automation while the
repository is private and preserves a deliberate human gate over the artifact
that users receive.

The project accepts the cost of maintaining three native ARM64 verification
environments rather than claiming support from cross-compilation or build-only
evidence. x64, Intel macOS, additional package formats, signing and
notarization, paid CI, and a multi-platform CI matrix are deferred rather than
rejected. They will be reconsidered after the repository becomes public, when
public CI can be evaluated from actual platform and contribution needs.
