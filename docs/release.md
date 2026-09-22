# ARM64 release policy and native procedures

This document explains how OMXTerm produces and accepts its ARM64 release
artifacts: an ad-hoc-sealed, unnotarized macOS DMG, a Linux AppImage, and a
Windows NSIS installer. It is a procedure, not publication permission. Tags,
GitHub Releases, uploads, signing, and notarization require separate maintainer
approval.

For a new candidate, follow this path:

1. choose the version using [the versioning policy](versioning.md);
2. apply the [cross-platform policy](#cross-platform-release-policy) and record
   whether every change affects packaged bytes;
3. run the matching native procedure for [macOS](#macos-arm64),
   [Linux](#linux-arm64), and [Windows](#windows-arm64);
4. complete the
   [exact-artifact acceptance record](#automation-first-exact-artifact-acceptance)
   and checksums; and
5. stop after owner acceptance unless publication receives its own explicit
   authorization.

The historical sections preserve what happened for earlier releases; they do
not replace the current procedure or authorize repeating a past action. The
latest published release described here is **0.13.0**. The repository currently
uses **0.14.0-dev.0** as its development baseline, which is not a published
release and must not be used as a release identity.

## Cross-platform release policy

The initial Supported Platforms and artifact formats are macOS arm64 DMG, Linux
arm64 AppImage, and Windows arm64 NSIS. Initial artifacts carry no verified
publisher identity; publisher signing, Apple notarization, certificates, and
paid signing services are deferred. The macOS application receives a complete
ad-hoc code seal for internal bundle integrity without gaining a publisher
identity.

Every release candidate is built and verified natively. macOS builds run on
Apple Silicon. Linux arm64 and Windows arm64 builds run on native runners or in
native Parallels VM clones using the VM's native filesystem, never a host shared
folder. Each exact artifact requires its own automated checks. Manual testing is
optional and never gates acceptance or publication. A material changed boundary
that automation cannot observe is recorded as unverified rather than inferred
as passing. Rebuilding or changing an artifact invalidates its identity and
automated evidence.

Exact-artifact acceptance and publication are separate owner gates. Acceptance
never authorizes a tag, upload, or GitHub Release; publication remains manual
and requires separate maintainer authorization. x64, Intel macOS, additional
package formats, signing and notarization, paid CI, and automatic publication
remain deferred.

The macOS, Linux, and Windows steps below are the implemented procedures for
those platforms. The macOS procedure preserves its Gatekeeper policy; the Linux
procedure records the unsigned AppImage and FUSE limitations; the Windows
procedure records the unsigned NSIS installer and SmartScreen limitation.

### Artifact-affecting and documentation-only changes

Each native record keeps the exact **artifact build commit** used for its
package. The three artifact build commits normally match. They may differ only
when every intervening change qualifies for the documentation-only exception
below; all artifact-affecting source must remain identical across the three
packages.

A change qualifies only when every changed path is a non-packaged Markdown file
and none is:

- `docs/spec.md` or a file under `docs/adr/`, because these define the product
  contract and durable decisions;
- `THIRD_PARTY_NOTICES.md`, because it is packaged in every artifact; or
- a license, package/version file, executable or test source, dependency,
  configuration, build or packaging input, asset, generated application file,
  or any other non-Markdown path.

Eligible examples include `README.md`, `CONTRIBUTING.md`, tutorials, agent
instructions, release procedures, and platform guidance that is not packaged.
Such a change does not alter or invalidate an unchanged artifact. If it adds or
changes required automation or changed-boundary evidence, the existing exact
artifact must satisfy the current requirement before acceptance or publication;
documentation-only status avoids a rebuild, not the new gate.

Any non-eligible change after an artifact build invalidates every earlier native
record for that version. Rebuild those packages from the new accepted source and
start new exact-artifact records. Record every artifact build commit; before
publication, compare each one with the intended tag and confirm that every
intervening path is eligible under this section. If that proof fails, do not tag
or publish.

This exception applies only before publication. Published releases are
immutable: never move their tags, replace their artifacts or checksums, or reuse
their GitHub Releases. Later documentation corrections ship from `main` or with
a future release without rewriting the published one.

## Historical release records

The canonical records under [`docs/releases/`](releases/) preserve exact
artifact identities, evidence, and authority for their original releases. The
summaries below are navigation and context only. Keep them in the past tense:
current release work follows the procedures later in this document.

## Accepted 0.11.0 artifacts

The [0.11.0 release record](releases/0.11.0.md) binds all three native builds to
`741a1cc67597bfdbe5aacf4933a01760c658f352`, records passing automated checks,
exact filenames/sizes/checksums, completed verifier cleanup, remaining platform
risk, owner acceptance and separate publication authorization. Publish those
unchanged files; release documentation and squash integration do not rebuild
them. The tag retains the build commit's ancestry with only eligible Markdown
changes, and the squash-integrated source tree must match the tagged tree.

## 0.12.0 release-specific platform exception

The maintainer authorized and published 0.12.0 with only the macOS ARM64 DMG
and Linux ARM64 AppImage plus optional installer. Windows ARM64 remains a
Supported Platform, but there is no Windows 0.12.0 candidate: its native gate
failed before packaging, and diagnosis is deferred to issue #310. The latest
available Windows download therefore remains the unchanged 0.11.0 NSIS
installer and checksum from the existing `v0.11.0` GitHub Release.

This exception changes neither the general three-platform release policy nor
the verification requirements for an artifact that is included. The 0.12.0
macOS and Linux identities still require their complete native commands,
changed-boundary evidence, exact checksums, cleanup, owner acceptance and
separate publication authorization. A Windows 0.12.0 file must not be attached,
and no macOS or Linux result may be presented as Windows qualification. The
0.12.0 attachment set is the DMG, AppImage and versioned Linux installer plus
their three matching checksum files. They were published unchanged; macOS and
Linux downloads are now 0.12.0, while Windows remains explicitly 0.11.0.

## Published 0.12.0 artifacts and authority

The owner **ACCEPTED** these exact six canonical macOS/Linux identities and,
separately, **AUTHORIZED** their manual publication through
[issue #311](https://github.com/luizomf/omxterm/issues/311). The immutable
[v0.12.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.12.0)
(release ID `391846996`) was published on `2026-09-18T23:51:24Z` with exactly
those six files and no Windows 0.12.0 attachment. Publication did not authorize
a rebuild, replacement, additional attachment, or automatic publication.

| File                                                |     Bytes | SHA-256                                                            |
| --------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `OMXTerm-0.12.0-arm64.dmg`                          | 127519162 | `ed17cba1f77b6d2250f734ef4df4faa4637dc3d74635f1cff4584e3f20fcccb0` |
| `OMXTerm-0.12.0-arm64.dmg.sha256`                   |        91 | `464bba3863dad485137c97986a6da7a3b74680900ef5e0736239cf51696c3131` |
| `OMXTerm-0.12.0-arm64.AppImage`                     | 124262587 | `7dcd33b76495a707918daebae23c1707a90f512af0c18a33b976d4da3116eb4c` |
| `OMXTerm-0.12.0-arm64.AppImage.sha256`              |        96 | `347ab1f815e31b10b0493000d3da47e97646301acaa08e7b88047a1dc3ca8e11` |
| `OMXTerm-0.12.0-arm64.AppImage-installer.sh`        |      6215 | `181f2c4ff1ba93536328cd026272c64c435f320695aa2cf21f08a28676e5b936` |
| `OMXTerm-0.12.0-arm64.AppImage-installer.sh.sha256` |       109 | `14eb1c670126f1f618f66500acafea3acb3adcf989511de9f33c3dd3ff83ad69` |

The canonical [0.12.0 release record](releases/0.12.0.md) preserves the native
evidence, migration guidance, limitations, source mapping, and post-publication
verification. Annotated tag `v0.12.0` dereferences to independently reviewed
source `1c1ba485da23612bafe44ee19c3b526993dfe841`, which retains artifact-build
commit `87aa8eb44ce355c6ae967eee17c2ddb9e1b6762a` in its ancestry. Its tree
`f0c2776e239c546340d9db80b71ee6f4a8900589` equals PR #312 squash
`935d1091743ce457a2b7501da761ad5e409b6345`. Only `README.md`,
`docs/README.md`, `docs/release.md`, and `docs/releases/0.12.0.md` differ from
the build source, all eligible non-packaged Markdown.

## Published 0.12.1 artifacts and authority

The canonical [0.12.1 release notes and record](releases/0.12.1.md) binds all three
ARM64 native builds to independently reviewed/refrozen source
`34119842ddbb1dbdb496a80a9e316e8695d09c82`. Complete fresh native commands,
actual packaged parsed-output proof, platform package/installation seams and
verifier cleanup passed. All eight exact files are collected with native/collected
size and SHA-256 equality and matching checksum basenames.

The record includes release notes, changed-boundary PASS/UNVERIFIED evidence against
macOS/Linux 0.12.0 and Windows 0.11.0, #310's source-to-squash mapping and the
later test-only configured-font capture correction. Earlier candidates were
superseded and all three platforms rebuilt after refreeze. Original historical
triggers remain unproven; neither correction is a product-font/color change.

Independent final review passed Standards and Spec with no findings. The
canonical record identifies the reviewed evidence range and eligible Markdown
paths. Final preparation source `7c561ad5a10c26d0fe103233bc657b9627d84ec8`
and integrated main `8fde337e43c3efbe1821e4c1f243edf02ade3954` have identical
trees. Annotated tag `v0.12.1` points to that final preparation source,
retaining the common build commit's ancestry. Only `README.md`, `docs/README.md`,
`docs/release.md`, and `docs/releases/0.12.1.md` differ from build source.

Exact-artifact acceptance is **OWNER ACCEPTED** for the eight recorded files.
The owner separately **AUTHORIZED** publication through
[issue #323](https://github.com/luizomf/omxterm/issues/323), following the completed
preparation in #320. This authorization covers the annotated tag, GitHub
Release, eight unchanged uploads, and post-publication download/checksum
verification; it explicitly excludes rebuilds and repeated test suites.

The [v0.12.1 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.12.1)
was published on `2026-09-20T08:41:01Z` with exactly the eight accepted files.
Post-publication authenticated downloads passed byte-size and SHA-256 comparison
for every file, plus verification of all four checksum records against the
accepted manifest. Repository visibility remains private; anonymous download
access is not claimed.

The #323 documentation candidate at
`5d51084f3869bb6699a638fbed4f298667ab2084` passed independent Standards and
Spec review with no findings before publication. That polish and subsequent
publication bookkeeping change only the same four eligible Markdown files.
They do not rebuild the packages or retarget the tag. The exact identity and
native verification record remains unchanged; earlier published releases remain
immutable.

## Published 0.12.2 artifacts and authority

The [0.12.2 release notes and record](releases/0.12.2.md) bind all three native
ARM64 builds to `18ab438a898d246a6eaa197fb4f9b826c3244a7e`. Fresh complete
native commands passed on macOS, Linux and Windows, including actual packaged
parsed output and exact Windows installer verification/cleanup. All eight final
files have matching native/collected sizes and SHA-256 values.

The owner accepted the eight exact files and separately authorized publication
in #334. Independent final review passed without findings. The
[v0.12.2 release](https://github.com/luizomf/omxterm/releases/tag/v0.12.2)
was published on September 20, 2026. All eight downloaded assets matched the
accepted sizes and SHA-256 values, including the four checksum records.

Annotated tag `v0.12.2` points to
`2d6c080e4093cfbcf9a546b24d2dc231af71e3ee`, retaining the build source in its
ancestry. Its tree matches PR #335 squash
`1d5ec8d71dd11345faca45eff5466a61cdc9a975`. Only the four eligible release
Markdown files differ from the build source. The files were published unchanged;
earlier releases remain available under their original tags.

## Accepted 0.13.0 artifacts

The [0.13.0 candidate record](releases/0.13.0.md) binds all three native ARM64
builds to `f53bff7225d4ac1cab4036853484c261bf3d80da`. Complete native commands
passed and all eight unchanged files have matching native/collected identities.
Independent final review passed without findings before the subsequent Windows
installer report. The same unchanged installer was reported to install and run
successfully after reboot (#349); its earlier shutdown stall has no confirmed
root cause or product correction. Windows and Ubuntu use was subsequently
reported successful. The Bash visual-bell limitation (#333) is documented in
the installation guide and release notes for this release; product-side
investigation remains deferred. These follow-up Markdown changes passed an
independent Standards and Spec review without findings and do not alter the
artifact identities. On September 21, 2026, the owner explicitly accepted all
eight listed files and separately authorized publication. Final documentation
and GitHub Release notes passed independent review without findings.

[OMXTerm 0.13.0](https://github.com/luizomf/omxterm/releases/tag/v0.13.0) was
published on September 21, 2026. Annotated tag `v0.13.0` points to
`c16623c265718e5b388c99ec8ad22c902494fb0f`, retaining the artifact build source in
its ancestry. Its tree equals PR #347 squash
`2364f14323f983b75c8ea8c5184c43560e25c4b9`; only three eligible non-packaged
Markdown files differ from the build source. All eight assets were downloaded
from the published release and matched their accepted sizes and SHA-256,
including the four checksum records. Published files and the tag remain
unchanged while `main` resumes development at `0.13.1-dev.0`.

## Version selection and consistency

Select the release version under the [versioning policy](versioning.md) in an
explicitly authorized release preparation issue. This procedure does not choose
or increment a version by itself. A `-dev` development baseline version is
never releasable; release preparation removes the prerelease suffix.

Before building a release candidate, confirm that `package.json` and
`package-lock.json` contain the same accepted `X.Y.Z` version. The application
version, intended `vX.Y.Z` tag, `TERM_PROGRAM_VERSION`, native artifact
filenames, checksum filenames, and GitHub Release must all identify that same
version. The intended tag points to every included artifact build commit directly or to
a descendant that differs from it only through the documentation-only exception
above. Except for a recorded release-specific omission such as 0.12.0 Windows,
the package names are `OMXTerm-X.Y.Z-arm64.dmg`,
`OMXTerm-X.Y.Z-arm64.AppImage`, and `OMXTerm-X.Y.Z-arm64.exe`. Linux also
produces `OMXTerm-X.Y.Z-arm64.AppImage-installer.sh`; its embedded `--version`,
filename, and checksum must identify the same version.

## Build and automated verification

Portable checks include the production-Chromium image fixture with its own
Electron userData/sessionData directories. On Windows and Linux it shows a
non-activating native window before loading the fixture; macOS keeps it hidden.
Hidden Windows/Linux windows can stall real image-frame progress even with
background throttling disabled. All original checks, real animation frames,
deadlines, production CSP and renderer isolation remain required; visibility is
a test-harness requirement, not a Terminal Surface behavior change. Appearance
verification crosses real frames after configured/reference-font remount output
before comparing exact pixel buffers; an elapsed delay alone is not readiness.
A delayed-output-frame regression exercises that ordering without relaxing the
bitmap comparison or claiming a universal compositor fence.

Each native platform command also runs the Restty host fixture through an actual
WebGL2 renderer and owned PTYs. It covers Default Shell and explicit-command
startup, input/output, resize, shutdown and renderer loss; bundled and installed
fonts; configuration and restart notices; and direct Pi/Chafa images. A missing
backend or irrecoverable context loss must visibly fail and clean only its owned
session while another session remains usable. Synthetic DOM coverage or another
operating system cannot substitute for this native seam.

Release candidates additionally use a fresh `npm ci` and explicitly rerun the
existing checksum-guarded node-pty and Restty preparation scripts before the
complete native command. This bounded release procedure rejects unknown
installed bytes and avoids reusing a stale prepared runtime; it is not a new
runtime-prevention framework. Packaged verification then starts the actual
packaged application with a synthetic owned PTY command. That command prints a
visible marker and sends `CSI 16 t`; only a positive cell-size reply from the
packaged Terminal Surface creates the proof file. Startup events and a live
shell are still required, but cannot substitute for this parsed-output proof.
The probe uses no user shell, configuration, Terminal Payload or persistent
profile and its owned state is removed after verified process termination.

### macOS arm64

Use an accepted release commit for `X.Y.Z`, with `vX.Y.Z` recorded as the
intended tag, on the macOS Supported Platform: the designated Apple Silicon
(`arm64`) Mac. Install Node.js 22.13 or later in the Node.js 22
line, or Node.js 24 or newer, check out the accepted source
without local or private files, and run:

```sh
npm ci
node scripts/prepare-node-pty-runtime.mjs
node scripts/prepare-restty-runtime.mjs
npm run check
```

`npm run check` is the complete automated verification command. It checks
formatting and types, runs every unit and integration test, builds the
application, creates `release/OMXTerm-<version>-arm64.dmg`, and starts the
packaged `release/mac-arm64/OMXTerm.app` with isolated configuration and state.
The packaged-startup check requires the arm64 executable, renderer, Terminal
Surface, bundled font, native PTY helper, project and third-party licenses, and
startup events through a running PTY. It rejects source maps, tests, source
trees, alternate-architecture PTY binaries, common secret files, and publisher
signing identities in the package. It also requires the complete ad-hoc
application seal to pass `codesign --verify --deep --strict`; inspecting only
signature metadata is insufficient.

For packaging alone, use `npm run package:mac`, which passes `--publish never`
to the packager. Run the non-publishing `npm run package:verify` command against
the unpacked app afterward.

The DMG has no publisher signature and is not notarized; the application inside
it is ad-hoc sealed only for bundle integrity. It is not a release candidate
until every automated check is green and material automation-resistant risk is
recorded honestly.

### Linux arm64

Use a native Linux arm64 clone on the VM's native filesystem, never a Parallels
shared folder. Install Node.js 22.13 or later in the Node.js 22 line, or
Node.js 24 or newer, plus `python3`, `make`, a C++ compiler
(`build-essential` on Ubuntu), `readelf` (`binutils` on Ubuntu), the `fontconfig`
utilities, and an X11 display or XWayland in a Wayland session. Native Wayland
is not currently claimed. Keep the graphical session unlocked and prevent idle
locking during native image/input verification; a locked desktop can suppress
frames and synthetic input without identifying a product failure. Run as an
ordinary user. OMXTerm uses an unconditional
Linux-only `--no-sandbox` policy (ADR 0024); no administrator sandbox setup or
host-policy changes are required. Then run from the accepted source commit:

```sh
npm ci
node scripts/prepare-node-pty-runtime.mjs
node scripts/prepare-restty-runtime.mjs
npm run check:linux
```

The postinstall rebuilds `node-pty` against Electron's Linux arm64 runtime.
`npm run check:linux` runs all portable and real-PTY checks, creates the
non-published `release/OMXTerm-<version>-arm64.AppImage`, its checksum, the
exact versioned `release/OMXTerm-<version>-arm64.AppImage-installer.sh`, and the
helper checksum. It extracts that exact AppImage, rejects the unversioned
`libz.so` development linker dependency, and checks its arm64 executable and
native module, runtime files, version, icon, licenses, and
forbidden/private-looking files. It verifies both checksum records and helper
version agreement, installs that AppImage through the exact helper in an
isolated home, and launches the installed result through
`--appimage-extract-and-run` and through normal kernel-FUSE mounting when the
host's installation-time probe establishes that direct seam is available. Each
available startup path must reach a running PTY, and its Operational Event logs
must not contain the environment canary; an unavailable direct seam is not
inferred as passing. Before startup, the extracted AppRun must match the exact
reviewed launcher with its unconditional `--no-sandbox` flag. Chromium image
coverage uses the same Linux policy and retains the production CSP and renderer
isolation settings; it does not claim Chromium sandbox protection.

For packaging alone, run `npm run package:linux`, followed on the same native
host by `npm run package:verify`. The Linux packaging command first applies a
checksum-guarded correction to the pinned packager's launcher generator before
loading electron-builder. Unknown dependency bytes fail preparation; direct
packager invocation without prepared bytes is rejected by `beforePack`.
Dependency upgrades require reviewing and regenerating the correction and
launcher digest together. No finished artifact is patched. Packaging creates the AppImage, helper, and
both matching `.sha256` files without downloading or publishing anything. The statically linked AppImage runtime needs
neither zlib development headers nor a system `libfuse2` library. Normal
mounting uses kernel FUSE support. When mounting is unavailable, the safe manual
fallback is:

```sh
./release/OMXTerm-<version>-arm64.AppImage --appimage-extract-and-run
```

Extraction addresses FUSE mounting only; both launch paths use the same
no-sandbox policy. Release notes must disclose this Linux limitation and link
to the [launch decision](adr/0024-disable-the-chromium-sandbox-on-linux.md).

The AppImage is intentionally unsigned and provides no verified publisher
identity. It is not a release candidate until all automated checks pass and
material automation-resistant risk is recorded honestly.

### Windows arm64

Windows packaging runs in a graphical, native Windows ARM64 VM clone on its
native filesystem. Prepare the clone before its first checkout with
`core.autocrlf=false` and `core.symlinks=true`, then confirm that Markdown and
source files remain LF and repository symlinks are real symlinks. Install a
supported Node.js version and the ARM64 Visual C++ Redistributable. Developer
Mode supplies unprivileged symlink creation for the native fixtures. Arrange
these development prerequisites with the host owner's approval. If local
PowerShell scripts need it, owner-approved process-scoped `RemoteSigned` is
sufficient and leaves the persisted execution policy unchanged. Preserve the
normal executable search path when adding portable tools.

The exact NSIS test has real installer side effects. A temporary `/D=` path
changes the destination, but the installer can still remove a registered
per-user OMXTerm installation and replace shared registration and shortcuts.
For that reason, use an explicitly authorized disposable VM with a recoverable
snapshot, even if the VM appears clean. Before running the test, close OMXTerm
sessions and other OMXTerm installers yourself; the verifier reports those
conflicts and leaves them alone. Defender and SmartScreen stay enabled.

From the accepted source commit, after authorization for replacement and
install/uninstall effects, run:

```powershell
npm ci
node scripts/prepare-node-pty-runtime.mjs
node scripts/prepare-restty-runtime.mjs
npm run check:win -- --disposable-vm-allow-omxterm-replacement
```

Without that literal CLI opt-in, `npm run check:win` fails closed at the exact
installer seam. Environment variables do not authorize replacement. Unknown or
inaccessible installation inspection also fails closed. Existing registration
is checked in HKCU and HKLM, in both registry views, along with default install
locations, shortcut conflicts, and matching running processes. Existing paths
must belong to the accepted per-user installation: path-only, machine-location,
reparse-point, or differently targeted shortcut conflicts are refused. Existing
installation trees and the transaction tree are inspected without following
reparse points, including their directory ancestors. Unreadable or oversized
trees fail closed. Matching registry pairs are insufficient: the previous
directory and its regular application/uninstaller files must exist. Process
inspection mirrors both NSIS's name-based fallback and its case-insensitive path
prefix for registered installations and the new transaction destination. The
pinned dependency can target a sibling path sharing that prefix; the verifier
refuses that conflict rather than terminating the unrelated process. Paths
that break the pinned installer's PowerShell quoting are refused too. The
verifier's temporary directory must also contain no spaces: NSIS expects an
unquoted raw `/D=` tail, not Windows argv quoting. Choose a compatible temporary
location inside the disposable VM; this does not grant replacement consent.
The pinned
NSIS installer also writes `%LOCALAPPDATA%\\omxterm-updater\\installer.exe`, even
though OMXTerm has no automatic updates. Any pre-existing cache directory/file
or cache reparse point is refused even with opt-in; do not delete guessed cache
contents to bypass this guard. Use a clean disposable VM or separately coordinate
preservation of the existing cache. Deliberate
replacement supports only the known per-user installation; orphan, machine, or
unexpected registration requires a clean disposable VM, not a force bypass.
Preflight is not a guarantee against host races or installer-wide effects, so the
disposable-VM requirement applies even when no existing installation is found.
No credential collection, elevation or OS security-policy change is authorized.

`npm run check:win` runs all portable and real-ConPTY checks, creates the
non-published `release/OMXTerm-<version>-arm64.exe` NSIS installer, inspects
the unpacked application's arm64 PE executables and win32-arm64 node-pty
runtime, version, licenses, and forbidden/private-looking files, installs the
exact installer into a transaction-owned temporary directory, compares every
extracted payload file with the unpacked application, and verifies startup from
both the unpacked and installed trees with isolated configuration, state, and
user data. Startup must reach a running PTY and its Operational Event log must
not contain the environment or launch-argument canaries.

For packaging alone, run `npm run package:win`. For non-installing content and
startup diagnostics on the same native host, run:

```powershell
npm run package:verify -- --windows-unpacked-only
```

This explicitly reports **UNPACKED DIAGNOSTIC ONLY**: it neither launches the
installer nor proves exact-installer acceptance. It does launch the unpacked
application with an isolated test profile and a synthetic PTY command.
Full `package:verify` requires the same disposable-VM opt-in as `check:win`:

```powershell
npm run package:verify -- --disposable-vm-allow-omxterm-replacement
```

The exact installer seam remains mandatory for release. A different application
identity, repacked installer, or archive-only extraction is not equivalent.
`/D=` selects the destination only; the existing OMXTerm may be removed and is
**not restored** by the test. Registration and shortcuts are changed during
installation. The verifier checks ownership before invoking only the new
transaction's byte-identical uninstaller from a separate owned directory outside
the install-path termination prefix. Its `_?=` argument selects the transaction
root without spawning a detached copy, so completion stays observable. The
verifier waits for bounded registration/shortcut/process cleanup, then removes
both owned temporary directories. It also verifies the newly created cached
installer against the exact installer digest and removes only that unchanged
file and its empty cache directory, never pre-existing or unrelated cache data.
A changed cache or nonempty directory fails cleanup and retains uncertain state.
User data is not deleted. Startup, process-termination and profile-cleanup errors are preserved together;
a profile is retained when process termination cannot be confirmed. Installer
cleanup errors fail verification alongside any primary error; unknown
ownership leaves evidence for inspection rather than deleting guessed state.
Restore/discard the VM only after preserving artifacts and evidence outside the
snapshot's rollback scope.

The inspection supports the pinned builder and reviewed packaging footprint;
changes to those inputs require reviewing its registry identities, locations,
shortcuts and NSIS templates together. A footprint mismatch is a refusal, not
permission to bypass the check. A real Start Menu installation is optional;
installer or desktop-integration behavior beyond the automated seam remains
unverified rather than requiring manual installation.

The installer carries a zip-compressed application payload rather than the
smaller default LZMA archive. On an ARM64 build host electron-builder
compresses executables with the ARM64 BCJ2 7-Zip filter, which the installer's
bundled extraction plugin cannot decode — it drops every PE file at install
time. The zip payload avoids that filter, so the installer is larger than a
macOS or Linux artifact of the same application but installs completely.
Because this disables the differential (blockmap) package, no `latest.yml` or
`.blockmap` is produced; OMXTerm ships no automatic updates, so nothing depends
on them.

The installer is intentionally unsigned and may trigger a Microsoft Defender
SmartScreen unknown-publisher warning. It is not a release candidate until all
automated checks pass and material automation-resistant risk is recorded
honestly.

## Automation-first exact-artifact acceptance

OMXTerm uses native automation as the routine release gate. The exhaustive
manual exercise completed for the initial three-platform 0.4.0 release is
baseline evidence, not a script to replay for each version.

Everyday use complements automation. The maintainer regularly uses OMXTerm on
macOS; optional testing and reports on Linux and Windows also help uncover
problems and guide regression coverage. Record those observations against the
build actually tested. They are useful feedback, not a prescribed checklist or
a substitute for exact-artifact verification.
Exact artifact identity, native automated verification, owner acceptance, and
separate publication authorization remain mandatory.

### 1. Record changed boundaries

Before building, compare the accepted source with the previous published tag and
record every changed observable or release boundary. Classify each change under
the smallest applicable category:

- portable product behavior;
- platform-specific product behavior;
- packaging, installation, architecture, or native runtime;
- security, privacy, IPC, clipboard, input, or filesystem boundary;
- rendering, icon, window-system, or desktop integration;
- version metadata or documentation only.

For each changed boundary, name the automated seam that observes it. Record a
material boundary with no reliable automated seam as `UNVERIFIED`, together with
the affected platform and risk. Missing manual coverage is not pending release
work, and no boundary inherits the historical manual matrix.

### 2. Run mandatory native automation

Every exact artifact must pass its platform's complete documented command:

- macOS: `npm run check`;
- Linux: `npm run check:linux`;
- Windows: `npm run check:win`.

The record binds each result to source commit, filename, byte size, and SHA-256.
At minimum the command must establish formatting and type safety, portable and
native tests, package construction, target architecture, packaged contents and
licenses, embedded version agreement, package extraction or installation seam,
startup, PTY readiness, synthetic parsed output from the actual packaged
Terminal Surface, required Operational Events, and cleanup of verifier state.

No release requires a human replay after every native command required for its
included artifacts passes. Ordinarily that means all three platform commands;
the recorded 0.12.0 exception requires macOS and Linux only and makes no Windows
0.12.0 claim. Owner acceptance remains explicit but does not represent manual
exercise of every artifact.

### 3. Record optional observations and unverified risk

Manual product testing is optional and non-blocking on every platform. Routine
macOS dogfood may reveal regressions during ordinary use, but no release
requires a walkthrough, visual matrix, Gatekeeper exercise, or other targeted
manual check. Maintainer and community testing on any platform is welcome,
without becoming a scheduled release dependency.

When automation cannot observe a material changed boundary, record it as
`UNVERIFIED` instead of manufacturing a pass. Examples include Gatekeeper or
SmartScreen presentation, native rendering, icon or window association,
desktop-shell integration, and other native UI behavior without a reliable
seam. State the affected platform, the unobserved outcome, and the user-facing
risk in the exact-artifact record or release notes. The absence of a report is
not evidence that the boundary passed.

Verification uses the shipped platform policy, including Linux's documented
Chromium sandbox exception. It never relaxes additional security protections
to manufacture a result. An optional
observation may be recorded factually, but it does not become a reusable release
gate or imply coverage of another artifact.

### 4. Rebuilds require fresh automation

Rebuilding changes artifact identity and requires fresh native automation. Prior
dogfood observations remain historical context only; they do not establish the
behavior of a rebuilt artifact. A matching version number or source claim alone
is insufficient to reuse automated evidence.

### 5. Canonical exact-artifact record

Use one compact record per platform:

```text
Version: <X.Y.Z>
Platform: <supported OS and architecture>
Source commit: <full SHA>
Artifact: <filename>
Byte size: <integer>
SHA-256: <lowercase digest>
Native automated verification: <PASS/FAIL and safe summary>
Changed boundaries: <each boundary -> automated seam or UNVERIFIED risk>
Optional dogfood observations: <none, or factual non-blocking observations>
Cleanup: <COMPLETE/INCOMPLETE with reason>
Exact-artifact acceptance: <PENDING/OWNER ACCEPTED>
Publication gate: <BLOCKED/AUTHORIZED separately>
```

Do not place private paths, Terminal Payload, clipboard contents, commands,
configuration contents, secrets, or transcripts in tracker evidence.

### 6. Acceptance and publication gates

An exact artifact may be owner-accepted when:

- mandatory native automation passed against that exact identity;
- every changed boundary maps to passing automation or an honestly recorded
  `UNVERIFIED` platform risk;
- verifier cleanup is complete; and
- public documentation accurately describes the package and known limitations.

A current automated failure, an undisclosed automation-resistant risk,
incomplete cleanup, an identity mismatch, or missing documentation blocks
acceptance. Missing manual exercise does not. Owner acceptance is a release
decision and does not represent manual exercise of the artifact. Unexecuted rows
from the historical exhaustive matrix are not release state under this policy.

Owner acceptance does not authorize publication. Tagging, uploading the exact
artifacts and checksums, and creating the GitHub Release still require a
separate explicit owner instruction. After publication, download every asset
and verify each checksum again on its native Supported Platform or an equivalent
byte-verification host.

### Public provenance

Release notes may state factually that the initial three-platform release
received exhaustive native human testing, that the macOS build is dogfooded by
the project maintainer during ordinary use, that later releases rely on native
automation without required manual testing, and that Linux and Windows
community reports are welcome. These statements are process provenance, not a
claim that every release or platform was manually exercised, an independent
security audit, platform-vendor approval, or a guarantee.

## macOS SHA-256

Generate the checksum after native automation finishes against the exact DMG. From the output directory, preserving
the artifact's filename:

```sh
cd release
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256
```

Changing or rebuilding the DMG invalidates its identity, native automation, and
checksum. Run the acceptance model against the replacement.

## Linux SHA-256

`npm run package:linux` generates checksum records for both unchanged exact
Linux assets. Recheck them after native automation:

```sh
cd release
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check OMXTerm-<version>-arm64.AppImage-installer.sh.sha256
./OMXTerm-<version>-arm64.AppImage-installer.sh --version
```

Record both asset filenames and digests in the exact-artifact record. Rebuilding,
renaming, or changing either asset invalidates its identity, native automation,
and checksum. Keep publication blocked until the exact artifact has owner
acceptance and publication is separately authorized.

## Windows SHA-256

Generate the checksum after native automation finishes against the unchanged
exact installer:

```powershell
cd release
$name = "OMXTerm-<version>-arm64.exe"
"$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name" |
  Out-File -Encoding ascii "$name.sha256"
Get-Content "$name.sha256"
```

Confirm the digest matches a fresh `Get-FileHash` of the same file. The same
rebuild/rename invalidation and blocked-publication rules as the other
platforms apply.

## Gatekeeper and provenance release note

Use this language in any later owner-authorized release, updated only with the
accepted version and checksum:

> OMXTerm for Apple Silicon is intentionally not signed with an Apple Developer
> ID and is not notarized. macOS may warn that it cannot verify the developer or
> check the app for malicious software. Review the source, verify the published
> SHA-256, and proceed only if you trust this exact artifact. If you choose to
> open it, follow Apple's current [Open Anyway instructions](https://support.apple.com/102445)
> in System Settings -> Privacy & Security. Do not disable system-wide macOS
> security protections. The application has an ad-hoc integrity seal, not a
> verified publisher identity.

## SmartScreen and provenance release note

Use this language in any later owner-authorized release that attaches the
Windows installer, updated only with the accepted version and checksum:

> OMXTerm for Windows ARM64 is intentionally not signed with a code-signing
> certificate. Microsoft Defender SmartScreen may warn that the installer is
> from an unknown publisher. Review the source, verify the published SHA-256,
> and proceed only if you trust this exact artifact. If you choose to install
> it, use SmartScreen's `More info -> Run anyway` for this one file. Do not
> disable SmartScreen or other system-wide Windows security protections.

## Later owner-authorized GitHub Release

Only after the exact-artifact record has owner acceptance and the maintainer
separately authorizes publication:

1. confirm the canonical repository is `luizomf/omxterm`; the package metadata,
   DMG, AppImage, installer, and checksums still match their accepted records;
   and `vX.Y.Z` points to each recorded artifact build commit or differs from it
   only through paths eligible for the documentation-only exception above;
2. create the canonical GitHub Release for that exact tag with the applicable
   provenance notes above (Gatekeeper for macOS and SmartScreen only when a
   Windows installer is attached); summarize material changes, identify
   incompatible changes and migration or state that there are none, and record
   relevant known limitations;
3. for an ordinary three-platform release, attach exactly
   `OMXTerm-<version>-arm64.dmg`,
   `OMXTerm-<version>-arm64.dmg.sha256`,
   `OMXTerm-<version>-arm64.AppImage`,
   `OMXTerm-<version>-arm64.AppImage.sha256`,
   `OMXTerm-<version>-arm64.AppImage-installer.sh`,
   `OMXTerm-<version>-arm64.AppImage-installer.sh.sha256`,
   `OMXTerm-<version>-arm64.exe`, and
   `OMXTerm-<version>-arm64.exe.sha256` manually. Under the recorded 0.12.0
   exception, attach only the first six macOS/Linux files and no Windows file;
4. download every attachment, verify every checksum again on any trustworthy
   byte-verification host, and preserve the final release URL with the accepted
   evidence.

Do not automate these publication steps or perform them under the authority of
this repository procedure alone.
