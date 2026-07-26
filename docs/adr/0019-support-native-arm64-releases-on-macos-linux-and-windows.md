# Support native arm64 releases with automation-first validation

The initial Supported Platforms are macOS arm64, Linux arm64, and Windows
arm64. Their initial Release Artifact formats are respectively DMG, AppImage,
and NSIS. Initial artifacts carry no verified publisher identity: Developer ID
or equivalent publisher signing, Apple notarization, certificates, and other
paid signing services are deferred. The macOS application still receives the
ad-hoc code seal required for internal bundle integrity. Its distribution and
Gatekeeper policy remains in
[ADR 0015](0015-publish-tested-unsigned-arm64-releases.md).

Every target is built and verified natively: macOS on Apple Silicon, and Linux
arm64 and Windows arm64 on native runners or native Parallels VM filesystems,
never host shared folders. Cross-compilation and build-only evidence do not
establish Supported Platform behavior.

Release validation is automation-first and risk-based. Every exact artifact
must pass native automated package construction, architecture and content
inspection, version agreement, packaged startup, PTY readiness, and applicable
portable contract tests. A release records which product, packaging, security,
or platform boundaries changed since the previous version and maps each changed
boundary to that automation.

Human validation is required only when a changed boundary cannot be observed
reliably through an automated seam. Examples include platform security UI,
native visual output, and desktop-shell integration. The check is narrowly
scoped to that boundary rather than replaying the complete product matrix.
Unchanged boundaries need no repeated manual evidence. A changed boundary with
neither adequate automation nor qualified targeted evidence remains a release
blocker.

Otávio continuously dogfoods the macOS application, which supplies useful
ongoing product evidence but does not replace exact-artifact validation for a
changed packaging, security, or visual boundary. Otávio is not the routine
manual tester for Linux or Windows. Qualified open-source contributors may
supply targeted native evidence when those platforms change; contributor
availability is not a release dependency when relevant boundaries are
unchanged and automated.

The exhaustive native exercise performed for the initial three-platform 0.4.0
release remains baseline evidence, not a script to repeat for every version.
This transition reduces repetitive owner ceremony without changing the
three-platform product contract or claiming an independent audit.

Publication remains manual. Native automation and targeted evidence do not
authorize a tag, upload, or GitHub Release. Otávio separately accepts each exact
artifact and authorizes publication. Rebuilding an artifact invalidates its
identity and automated evidence, but targeted evidence may carry to the rebuilt
artifact when an automated comparison proves the boundary-relevant packaged
payload and metadata are identical.

The project accepts the cost of maintaining native ARM64 build and automated
verification environments. x64, Intel macOS, additional package formats,
publisher signing, notarization, paid CI, and automatic publication are deferred
rather than rejected. The non-publishing multi-platform automation work is
tracked separately and must reflect the current ARM64 product contract.
