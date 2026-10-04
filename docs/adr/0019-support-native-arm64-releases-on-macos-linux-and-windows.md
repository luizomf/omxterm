# Support native arm64 releases with automation-first validation

## Platforms and artifacts

The Supported Platforms are macOS ARM64, Linux ARM64 and Windows ARM64. Native
package formats are DMG, AppImage and NSIS. Linux releases also provide the
optional `linux_install.sh` per-user helper and checksum under
[ADR 0031](0031-keep-linux-installer-choices-small-and-local.md). Direct AppImage
use remains supported; the helper is not a fourth package format.

Artifacts carry no verified publisher identity. The macOS ad-hoc code seal
provides bundle integrity, not Developer ID signing or notarization
([ADR 0015](0015-publish-tested-unsigned-arm64-releases.md)). Windows release
notes explain SmartScreen's unknown-publisher warning without recommending
system-wide security changes.

Build and verify each target natively: Apple Silicon for macOS, native ARM64
Linux/Windows runners or VM-native filesystems, not shared folders. A
cross-build or build-only result does not establish native behavior. x64,
Intel macOS, additional formats, paid signing and automatic updates remain
outside current support, not permanently forbidden directions.

## Verification and evidence reuse

Validation is automation-first and risk-based. Separate behavioral tests,
native package construction, exact-artifact verification and publication. Each
artifact needs its own architecture/content/version/startup/PTY evidence and
checksum identity. Applicable behavioral PASS evidence can be reused only when
its relevant inputs are known equivalent. Missing provenance prevents reuse,
not all future release work. The
[release procedure](../release.md) owns commands and evidence records.

Version-only metadata needs new packages and package/version verification,
not wholesale behavioral reruns. Non-packaged docs or test/fixture-only changes
need their affected checks, not native rebuilds of unchanged product bytes.
Product, dependency and build-input changes invalidate affected steps/platforms;
unclear impact is handled conservatively. Proven non-artifact changes can
separate build and tag commits while retaining the original full build SHA and
digest; retained metadata or changed build recipes are not exempt without proof.

A known FAIL needs diagnosis-supported disposition. A later PASS does not explain
a historical failure. Disposition can document bounded unresolved risk rather
than claim a cause that was not established. An audit discrepancy or old evidence
gap is not automatically a release blocker: establish its relevance to the
candidate, record the limitation and make the release decision explicitly.

Manual testing is optional, not a gate. Unobservable boundaries are marked
unverified: native appearance, desktop/security UI and desktop-shell integration
commonly fall here. Maintainer macOS dogfooding supplies opportunistic feedback,
not an exact-artifact checklist. Linux and Windows use native automation and
subsequent contributor/user reports. Historical initial-release exercises do not
promise that every later release replayed them.

### Current Linux verifier coverage

The package verifier binds the exact helper/AppImage to checksums, installs into
a fixture home and runs packaged startup through extraction and direct kernel
FUSE when available. It does not infer direct-mount success when FUSE is absent.
The verifier removes the fixture installation root recursively after success;
it **does not invoke the exact helper's `uninstall`**. Source/helper tests cover
uninstall separately, but this is not exact published-helper uninstall evidence
(#566). “Full” verifier output must not be read as proof of that absent seam.

### Historical evidence limitations

#566 identifies an unexplained historical Windows Chrome crash and Linux desktop
records without full tested source SHAs. Those records support only their bounded
observations. A development version string cannot recover source identity, and
a later passing run cannot retroactively diagnose the crash. Do not reuse the
records as exact-build qualification without provenance and relevant disposition;
this ADR neither claims a fresh failure nor imposes blanket publication blocking.

## Installation and delivery ownership

The Linux helper performs no network discovery or trust establishment. It owns
only the per-user AppImage, hicolor icon and desktop entry. Staging/replacement
failures attempt rollback, preserving unrestored originals and reporting recovery
locations. After all replacements, recovery traps are disabled before cleanup.
Cleanup failure can return nonzero with the new installation committed and
without structured recovery reporting; no complete-preservation promise covers
that post-commit phase. [ADR 0031](0031-keep-linux-installer-choices-small-and-local.md)
details the current limitation. Uninstall removes only the owned entries and
preserves unrelated data; removal is not an all-or-nothing transaction.

Windows exact NSIS verification requires an authorized disposable VM, explicit
CLI opt-in, inspected ownership and cleanup under
[ADR 0023](0023-verify-exact-nsis-only-in-authorized-disposable-vms.md).
Unpacked diagnostics remain partial, not an installer substitute.

An owner release request covers environment preparation, native checks, tags,
uploads and download verification without per-step acceptance interviews.
Rebuilding creates a new artifact identity and invalidates its exact-artifact
checks, not unchanged behavioral evidence. Public evidence records the exact
bytes and limitations; it does not claim independent audit or vendor approval.

## Consequences

Native environments and pinned package/runtime adapters cost maintenance. The
project accepts bounded platform-specific risk to keep a small free project
maintainable, without claiming coverage that automation did not execute or
requiring every historical promise to become future code.
