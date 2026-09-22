# Support native arm64 releases with automation-first validation

The initial Supported Platforms are macOS arm64, Linux arm64, and Windows
arm64. Their initial application-package formats are respectively DMG, AppImage,
and NSIS. Linux releases also carry an optional, versioned shell helper and
checksum that install a user-supplied verified AppImage into the current user's
desktop; this does not add another application-package format. Initial artifacts carry no verified publisher identity: Developer ID
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
portable contract tests. Linux automation additionally binds the exact helper
and AppImage to their checksums, exercises transactional per-user install and
uninstall behavior, and launches the installed result through the extraction
fallback and through direct kernel-FUSE mounting when that seam is actually
available. It does not infer a direct-mount pass when the host cannot provide
one. A release records which product, packaging, security,
or platform boundaries changed since the previous version and maps each changed
boundary to that automation.

Manual validation is optional and is not a release gate. When automation cannot
reliably observe a changed boundary, the release record marks it unverified.
Platform security UI, native visual output, desktop-shell integration, and other
automation-resistant boundaries commonly require this treatment. Missing human
coverage does not block an otherwise passing exact artifact.

The maintainer uses the macOS application during ordinary daily work and reports
problems encountered there. This provides opportunistic product feedback rather
than a prescribed checklist, exact-artifact test, or promise of manual coverage
for each change. Linux and Windows rely on native automation followed by
contributor and user reports; the maintainer does not perform manual validation
on those platforms. Community testing is welcome, without becoming a scheduled
release dependency.

The exhaustive native exercise performed for the initial three-platform 0.4.0
release remains historical baseline evidence, not a script or coverage promise
for later versions. This policy accepts unobserved platform-specific risk to
keep maintenance proportionate for a small, free project without changing the
three-platform product contract or claiming an independent audit.

The Linux helper is deliberately narrow: it performs no network or release
discovery, establishes no trust in downloaded content, and owns only the
per-user AppImage, hicolor icon, and desktop entry recorded in the product
contract. Installation resolves kernel-FUSE versus
`--appimage-extract-and-run` once and commits all three files with rollback;
uninstall removes only those files. The manual AppImage path remains supported.

Publication remains manual. Each exact artifact first requires owner acceptance,
and a tag, upload, or GitHub Release then requires separate publication
authorization. Native automation and optional dogfood observations satisfy
neither authority on their own. Acceptance is a release decision, not a claim
that someone manually exercised the artifact. Rebuilding changes artifact
identity and invalidates the previous automated evidence.

The project accepts the cost of maintaining native ARM64 build and automated
verification environments. x64, Intel macOS, additional package formats,
publisher signing, notarization, paid CI, and automatic publication are deferred
rather than rejected. The non-publishing multi-platform automation work is
tracked separately and must reflect the current ARM64 product contract.
