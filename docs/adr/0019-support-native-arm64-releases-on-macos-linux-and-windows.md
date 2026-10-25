# Support native arm64 releases with automation-first validation

## Platforms and artifacts

Supported Platforms are macOS ARM64, Linux ARM64 and Windows ARM64. Native
package formats are DMG, AppImage and NSIS. Linux also provides the optional
`linux_install.sh` helper and checksum under
[ADR 0031](0031-keep-linux-installer-choices-small-and-local.md). Direct AppImage
use is supported; the helper is not another application package format.

Artifacts carry no verified publisher identity. The macOS ad-hoc code seal
provides bundle integrity, not Developer ID signing or notarization
([ADR 0015](0015-publish-tested-unsigned-arm64-releases.md)). Windows release
notes explain SmartScreen's unknown-publisher warning without recommending
system-wide security changes. No application auto-update mechanism is present.

Targets are built and verified natively on ARM64 hardware or VM-native
filesystems, not shared folders. Cross-build or build-only evidence does not
establish native behavior. Windows x64 is added by
[ADR 0034](0034-support-native-windows-x64-packages.md).
[ADR 0036](0036-distribute-build-only-x64-ci-artifacts.md) adds Linux x64 and
supersedes x64 qualification gates with owner-approved native build-only CI
checks. Desktop and installer behavior remain unverified, not release gates for
those lanes. Intel macOS and other package formats remain outside support.

## Verification and evidence reuse

Validation is automation-first and risk-based. Behavioral tests, native package
construction, exact-artifact checks and publication have separate evidence
identities. Artifact checks cover architecture, content, version, startup and
PTY readiness; checksums bind the exact bytes. Behavioral PASS evidence is
reusable only with known equivalent relevant inputs. Missing provenance prevents
reuse, not unrelated release work. The [release procedure](../release.md) owns
commands, evidence recording and publication.

Version-only metadata needs new packages and package/version checks, not a
complete behavioral rerun. Non-packaged docs and test/fixture-only changes need
their affected checks, not rebuilds of unchanged product bytes. Product,
dependency and build-input changes invalidate affected steps/platforms; unclear
impact is handled conservatively. Proven non-artifact differences may separate
build and tag commits while retaining the original full build SHA and digest.
Retained metadata and changed build recipes are not exempt without proof.

An applicable FAIL needs diagnosis-supported disposition. A passing rerun does
not explain it; disposition can record bounded unresolved risk without inventing
a cause. Findings and evidence gaps are assessed for concrete relevance to the
candidate, not treated as automatic release blockers.

Manual testing is optional. Native appearance, desktop/security UI and other
unobserved boundaries are recorded as unverified. Everyday macOS dogfooding is
product feedback, not exact-artifact qualification. Linux and Windows rely on
native automation and contributor/user reports.

### Linux verifier coverage

The verifier binds the exact helper/AppImage to checksums, installs into a
fixture home and runs packaged startup through extraction and direct kernel
FUSE when available. It does not infer a direct-mount pass when FUSE is absent.
It removes the fixture root recursively after successful provisioning; it does
not invoke the exact helper's `uninstall`. Synthetic source-helper tests cover
uninstall separately.

## Installer boundaries

The Linux helper performs no network discovery or trust establishment. It owns
only the per-user AppImage, hicolor icon and desktop entry. Staging/replacement
failures attempt rollback and retain unrestored originals at reported backup
locations. Post-commit cleanup may fail with the new installation already active;
[ADR 0031](0031-keep-linux-installer-choices-small-and-local.md) describes that
outcome. Uninstall removes only the owned entries, not unrelated data, and is
not an all-or-nothing transaction.

Windows exact NSIS verification requires an authorized disposable VM, explicit
CLI opt-in, inspected ownership and cleanup under
[ADR 0023](0023-verify-exact-nsis-only-in-authorized-disposable-vms.md).
Unpacked diagnostics are partial, not an installer substitute.

## Consequences

Native environments and pinned package/runtime adapters cost maintenance. The
project accepts bounded platform-specific risk while recording actual coverage,
artifact identity and limitations.
