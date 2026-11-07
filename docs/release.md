# Native release procedures

This guide covers native ARM64 macOS (`.dmg`) and ARM64/x64 Linux (`.AppImage` + `linux_install.sh`) and Windows (`.exe` NSIS) releases. Linux and Windows x64 packages use owner-approved **build-only qualification**: native CI and enumerated headless checks, with desktop, GPU, installer and ordinary-user integration unverified and not release gates ([ADR 0036](adr/0036-distribute-build-only-x64-ci-artifacts.md)). ARM64 checks and full-verifier safety boundaries are unchanged.

See [versioning.md](versioning.md) for SemVer rules and [development.md](development.md#platform-prerequisites) for platform setup.

## Stable 0.25.0 publication

[OMXTerm 0.25.0](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) was
published on **2026-11-07 at 11:39:10 UTC** as immutable Latest, with all twelve
draft and anonymous public assets verified by size/SHA-256. Tag/cut:
`13ea6873e6c45240a0a757156b7a4f694c2b43af`. Actual macOS/Linux ARM64 builds use
`575407cc61648b8dbf598dd7e1c4d46345c31ff2`; Linux x64 uses
`0e9102ceb29336957e5ccf659f542bf5b2bc64a0`; both Windows builds use the tag cut.
All build SHAs are cut ancestors with only test/docs differences, identical
shipping/version/lock inputs and one byte-identical common Linux helper pair.

The maintainer lifted the earlier hold **for 0.25.0 only**, accepting Windows
ARM64's unrun graphical suite and unresolved public-install Snippets failures
(child loss and one unexpected-prefix diagnostic; cause unknown). The strict
Windows network-silence test remains failed; profile behavior was accepted
separately using the existing-empty proxy control. macOS exact-DMG/public-archive
Insert, preview and acquisition remain untested. See the
[release limits](snippets-migration.md#stable-0250-release-disposition). x64 stays
build-only; terminal-input rules and future test-isolation requirements are unchanged.

The release includes native theme authoring and the one-time Snippets 0.1.0 default.
It excludes Files 0.8 insertion/drop and #818's later palette presentation. The
frozen host cannot run Files 0.8: it lacks the required capability despite matching
the version range. Extension archives, versions and catalogs are unchanged.
See [development metadata](versioning.md#post-0250-development-baseline) for the
pending next baseline. Historical release records below keep their original inputs.

## Release workflow

1. Select the release version `X.Y.Z` under [versioning.md](versioning.md) and ensure `package.json` and `package-lock.json` match.
2. Build and verify ARM64 packages on each target platform; collect native Linux/Windows x64 build-only artifacts using the manual lanes below.
3. Collect the verified installers and `.sha256` checksum files in the ignored `release/` directory.
4. Tag `vX.Y.Z`, create a draft GitHub Release with the [qualified release assets](#publication) (twelve including both x64 platforms, with one common Linux helper pair), verify the uploaded bytes, and publish. Update download links in `README.md` and `docs/installation.md`. Published releases are immutable: finish uploading all assets before publication; never move a published tag, replace an asset, or disable immutability to add a missing platform.
5. Bump `main` to the next `-dev.0` baseline after release.

## Verification and release decisions

Follow [ADR 0019's risk-based verification and reuse policy](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse):
assess findings and gaps for their relevance to the cut. Missing provenance
prevents reuse, not unrelated release work; a diagnosis-supported disposition can
record bounded unresolved risk without inventing a cause.

Record the selected cut/assets, actual failures, missing coverage, supporting
results and maintainer decision with the publication inputs. If a test cannot run
safely, leave that execution unrun and continue independent work. This does not
change test-isolation or data/security boundaries. The
[0.25.0 decision](snippets-migration.md#stable-0250-release-disposition) applies to
that release only. Version/source correspondence, uploaded-byte checks and
immutable tags/assets still belong to the publication transaction.

<a id="changed-inputs-and-build-to-tag-comparison"></a>

## Reusing test and build results

When preparing a release across multiple machines or VMs, you only need to rerun steps whose inputs have changed:

- **Documentation-only changes** do not change packaged application binaries.
- **Test-only changes** only require running the affected tests, not rebuilding packages.
- **Version-only bumps** require rebuilding packages and running `package:verify` (x64 build-only lanes use `--inspection-only`), without needing to rerun the full behavioral test suite if the code is otherwise identical.
- **Code, asset, dependency, or build-script changes** require running tests, building new packages, and verifying the resulting artifacts.

To compare a package build commit against the final release tag commit:

```sh
git merge-base --is-ancestor <build-sha> <tag-sha>
git diff --stat <build-sha> <tag-sha>
```

## Version consistency

Before tagging a release, verify that the final `X.Y.Z` version (with no `-dev` suffix) matches across:

- `package.json` and `package-lock.json`
- The packaged app version and `TERM_PROGRAM_VERSION`
- `linux_install.sh --version`
- Git tag `vX.Y.Z` and all release asset filenames

## Build and automated verification

<a id="resume-and-version-only-commands"></a>

### Resume and version-only commands

On macOS, follow the [preference precautions](development.md#macos-preferences-and-native-verification)
before graphical tests or packaged Electron probes, including FULL and
inspection-only verification and the standalone commands below. Temporary
HOME/XDG/profile paths do not isolate OS preferences.

- `npm run check` (macOS), `npm run check:linux` (Linux), and `npm run check:win` (Windows) run `check:portable`, package the build via `package-built:*`, and run `package:verify`.
- Standalone `npm run package:mac`, `npm run package:linux` (ARM64), `npm run package:linux:x64`, `npm run package:win` (ARM64), and `npm run package:win:x64` run `npm run build` and package the installer without running the test suite.
- If `npm run build` (or `check:portable`) has already completed on the current source, you can package and verify directly:

```sh
npm run package-built:mac    # or package-built:linux / package-built:win (ARM64) / package-built:win:x64
npm run package:verify      # Windows requires -- --disposable-vm-allow-omxterm-replacement
```

For a version-only bump when behavioral tests have already passed on the same code:

```sh
npm version X.Y.Z --no-git-tag-version --ignore-scripts
npx vitest run test/unit/release-version.test.ts
npm run package:mac         # or package:linux / package:win (ARM64) / package:win:x64
npm run package:verify      # Windows: -- --disposable-vm-allow-omxterm-replacement
```

### macOS ARM64

On Apple Silicon macOS with Xcode Command Line Tools, use the
[macOS native verification precautions](development.md#macos-preferences-and-native-verification)
for both the staged-app and mounted-DMG verifier runs:

```sh
npm ci
npm run check
```

`npm run check` verifies the staged app (`release/mac-arm64/OMXTerm.app`). Afterwards, mount and verify the final `.dmg` image:

```sh
(
  set -eu
  version="$(node -p 'require("./package.json").version')"
  dmg="release/OMXTerm-$version-arm64.dmg"
  hdiutil verify "$dmg"
  mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/omxterm-dmg.XXXXXX")"
  cleanup() {
    verify_status=$?
    trap - EXIT
    hdiutil detach "$mount_dir" || exit 1
    rmdir "$mount_dir" || exit 1
    exit "$verify_status"
  }
  trap cleanup EXIT
  hdiutil attach -readonly -nobrowse -mountpoint "$mount_dir" "$dmg"
  npm run package:verify -- "$mount_dir/OMXTerm.app"
)
```

The macOS app bundle uses an ad-hoc signature (`codesign --verify --deep --strict`) without Apple Developer ID signing or notarization.

### Linux ARM64

On an unlocked Linux ARM64 X11/XWayland desktop with [Linux prerequisites](development.md#linux):

```sh
npm ci
npm run check:linux
```

This builds `OMXTerm-<version>-arm64.AppImage`, `linux_install.sh`, and both `.sha256` files in `release/`, and verifies AppImage contents, `--no-sandbox` launcher configuration, and per-user helper installation in an isolated home directory.

### Windows ARM64 and x64

For full verification (optional beyond the x64 build-only lane below), build and verify each Windows architecture natively on a host of that architecture. An explicitly maintainer-approved x64 build may instead use x64 Node and Electron under Windows ARM64 emulation (ADR 0034); record that distinction and pending native qualification in the release notes. `check:win` picks `package-built:win` (ARM64) or `package-built:win:x64` (x64) from Node's process architecture. The x64 installer is `OMXTerm-<version>-x64.exe`; the x64 unpacked directory is `release/win-unpacked`.

> **Warning:** Full Windows NSIS verification installs and uninstalls the real package and can replace an existing OMXTerm installation on the system ([ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)). Always run it inside a disposable Windows 11 VM with a clean recovery snapshot, using the target architecture or the explicitly approved x64 emulation exception.

In an interactive desktop PowerShell session with [Windows prerequisites](development.md#windows):

```powershell
npm ci
npm run check:win -- --disposable-vm-allow-omxterm-replacement
```

For unpacked-only diagnostics without running the NSIS installer:

```powershell
npm run package:win        # or: npm run package:win:x64
npm run package:verify -- --windows-unpacked-only
```

### Hosted x64 build-only artifact delivery

The manual `.github/workflows/windows-x64.yml` (`windows-2025`) and
`.github/workflows/linux-x64.yml` (`ubuntu-22.04`) lanes use native x64 Node 24.
Workflows must exist on the default branch for dispatch; the maintainer selects a
reviewed source ref, with checkout pinned to its dispatch SHA. For example:

```sh
gh workflow run windows-x64.yml --ref <reviewed-ref>
gh workflow run linux-x64.yml --ref <reviewed-ref>
```

Each lane runs locked install, format, lint, typecheck, `npm test -- test/unit`,
build, explicit `package-built:win:x64` or `package-built:linux:x64` (`--publish never`),
and `npm run package:verify -- --inspection-only` as fail-preserving steps.
No GUI suite, NSIS or Linux helper installation runs. The unchanged default
`package:verify` and even `--windows-unpacked-only` launch the GUI: do not use
those modes on a headless runner.

Inspection checks architecture, ASAR contents, version, icons and licenses.
Linux verifies exact AppImage/helper checksums, reviewed AppRun bytes, extracts
without FUSE, reports ELF dynamic dependencies, and exercises bounded packaged
PTY output/exit/resize, missing-executable exec failure and successful exit 1.
Both lanes load the packaged addon in the packaged Electron Run-as-Node runtime,
recording actual runtime versions separately from the locked dependency.
Windows inspects `win-unpacked`; the exact NSIS is hashed, not executed or
proven equivalent to that tree.

Only successful jobs upload an explicit allowlist: binary, its `.sha256`,
`build-evidence.json`, and (Linux only) the common helper/checksum pair. Names
contain platform, full source SHA, run ID and attempt; summaries link the upload.
Retention is **7 days**, no dependency caches or automatic publication. The JSON
records source/lock, runner image/OS/glibc, Node/npm, actual checks/runtime and
file basenames/byte counts/digests, plus unverified boundaries. Download before
expiry, keep each platform's evidence separately, and verify every file against
those records. The artifact ZIP digest is not the binary checksum. On Linux,
restore executable bits with `chmod +x <AppImage> linux_install.sh` after checking
contents; Actions ZIPs do not preserve modes.

Desktop/GPU, ordinary-user OS integration, FUSE launch, actual helper/NSIS
installation, Windows 11 and SmartScreen/UAC remain unverified and are **not
release gates** for these lanes. Windows Server administrators do not establish
ordinary-user Developer Mode. Linux's runner/glibc baseline does not establish
broad distro compatibility; the static AppImage runtime does not make Electron
or the addon static. First native runs must establish downloaded AppImage tool
execution and upload success. Do not call #223/#224 fully qualified; #627's
broader automation and #680's shortcuts work remain separate.

### Checksums

Generate and verify SHA-256 files inside `release/`:

```sh
# macOS
shasum -a 256 OMXTerm-<version>-arm64.dmg > OMXTerm-<version>-arm64.dmg.sha256
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256

# Linux (generated automatically by package:linux)
sha256sum --check OMXTerm-<version>-arm64.AppImage.sha256
sha256sum --check linux_install.sh.sha256
./linux_install.sh --version
```

```powershell
# Windows
$name = "OMXTerm-<version>-arm64.exe"   # or OMXTerm-<version>-x64.exe
"$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name" |
  Out-File -Encoding ascii "$name.sha256"
Get-Content "$name.sha256"
```

## Files preview preparation

A Linux ARM64 Files preview is a separate preparation lane, not the complete
stable-release asset set below and not an announcement that a preview is published.
Use an ordinary-user disposable Linux ARM64 guest and an exact committed source:

```sh
npm ci
npm run build
node scripts/build-files-extension.mjs
npm run package-built:linux
npm run package:verify -- --inspection-only
OMXTERM_FILES_BUILD=1 npm test -- test/integration/files-extension-build.test.ts
```

Build Files **after** `npm run build` (which clears `dist`) and **before** packaging
so exclusion is actually checked. The Files archive and its `.sha256`/`.json`
sidecars live in `dist/extensions`, outside the host package. Current source builds
Files `0.8.0` with minimum host `0.25.0-dev.20` / API `0.1.x` and declared
`terminal.insertPath.v1`; see the [source compatibility rationale](files-development-preview.md#concrete-consumer).
This packages the already-integrated shared protected path-insertion/terminal-drop
consumer alongside filtering/keyboard and confirmed directory movement; it does
not redesign them. Lower hosts are refused through archive admission. Node-only
archive preparation may use a private output path instead of `dist/extensions`;
it needs no browser/Electron launch or host package build. Keep generated archives
and original sidecars outside Git. No host version bump, catalog promotion,
exact-pair qualification or publication follows from building the separate archive.
Published Files `0.6.0`
retains minimum host `0.24.0-dev.21`, its original bytes and catalog entries;
Files0.7's separate Linux package/public-link checkpoints and publication have
passed as recorded below; macOS and broader qualification are not implied.
The original Files `0.4.0` archive
(minimum host `0.24.0-dev.8`) is published separately as `ext-files-v0.4.0`
(see below). The historical published Files
`0.1.0` archive retains its historical minimum host `0.23.0-dev.8`; none of these
archives supports `v0.22.0`. When building an exported source
archive, pass `OUTPUT.omxext FULL_SOURCE_COMMIT` to the Files builder and verify
the export's source correspondence. The receipt distinguishes supplied source
identity from a clean local Git HEAD.

Inspection-only now includes packaged Linux ARM64 extension store/native loading
and bootstrap module resolution. It is **not** Files activation, GUI or normal
Quit qualification. Before publication, qualify the exact packaged host with the
separate archive: captured-byte trust, dormant install, explicit Files activation,
real filesystem mutation/conflict, deliberate replacement/management, the same
live PTY and joined Quit. Preserve source/lock/tool/runtime identities, package
and archive hashes, actual tested host/target, outcomes and limitations alongside
the build receipt; never turn its `not-run` field into an inferred pass.

The historical Files0.7 [exact Linux packaged consumer](files-development-preview.md#exact-linux-arm64-files07-packaged-consumer)
remains pinned to its published pair; do not relabel it as Files0.8 evidence.
Files0.8 needs separately selected exact-host/archive qualification through the
existing consumer seams before any publication decision, including production
package admission, protected insertion/drop and real PTY behavior. Prior native
UI used inert session/backend/package dependencies; its receipt timeout was not
the transport deadline. No native replay or broader campaign is selected by
archive preparation. Preserve both stable Files0.6 catalogs and published0.7 bytes. Historical built-host checks are
not package qualification, and old private inputs may no longer exist. Reuse a
retained host only after checking actual bytes, source/version provenance and
security relevance; otherwise build a compatible committed host. A missing
archive needs a fresh build receipt, not a reconstructed historical receipt,
even when the new digest equals historical bytes.

Root/maintainers decide publication after review and qualification. If publishing
a partial Linux ARM64 preview, label it explicitly as a prerelease and not Latest,
keep Files as a separately downloadable versioned artifact, and disclose missing
platform/SDK/catalog qualification. Do not mutate an already published release to
add it. Public readback/checksums and a compatible public host are needed before
claiming distribution; neither a branch, local artifact nor CI upload is shipment.
The normal stable-release procedure and its complete asset set remain unchanged.

<a id="files07-linux-link-first-preview-preparation"></a>

## Files0.7 Linux link-first distribution

On 2026-11-06, the qualified dev.19 host and Files0.7 archive were published as
separate immutable, non-Latest Linux ARM64 prereleases:
[host `v0.25.0-dev.19`](https://github.com/luizomf/omxterm/releases/tag/v0.25.0-dev.19)
and [Files `ext-files-v0.7.0`](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.7.0).
Both tags identify actual build source `0cb89accd61f1f5d5263c60773454882793e2e99`.
All seven original assets matched draft and anonymous public size/SHA-256
readback; Files publication/readback preceded the host. At that checkpoint,
stable0.24.0 remained Latest; both Files0.6 catalogs remain unchanged, and original archive receipts
retain their build-time `not-run` field.

The separately reviewed [actual public Settings-link checkpoint](files-development-preview.md#files07-linux-public-link-checkpoint)
then passed seven bounded scenario groups using fresh anonymous downloads and
qualification fixture `ed84ce729e03656018eb2e1b971dd8f458123df3`, not the
build/tag commit. Later test/docs-only source does not rebuild or relabel the
published pair. Three exact captured-byte consents and dormant installs,
filtering/keyboard, confirmed directory conflict/move, management/reinstall,
the retained terminal and active-backend normal Quit passed. All three backend
exit/close outcomes and shell/main settlement joined. Actual Files/terminal
captures were inspected and Linux shared-service preservation was verified again
after owned-scratch cleanup. No controlled transport, fixture CA or local
archive substitution supplied the application.

The prior [local checkpoint](files-development-preview.md#files07-linux-packaged-checkpoint)
and unchanged FULL AppImage verification retain their separate scopes; no
primitive/platform matrix or host/archive build was repeated for public
consumption. Synthetic input/consent, extracted-AppImage/WebContents capture and
native diagnostic limits remain explicit in the preview guide. This is not
macOS/Windows/x64 Files0.7 or a stable SDK/all-platform release claim.

The linked fixture instructions remain available for an explicitly assigned
future check, including verified downloads followed by `chmod u+x` before direct
extraction. Do not recreate sealed releases, modify their assets/receipts, promote
catalogs or infer new consumption results from this completed checkpoint.

## Files macOS link-first preview preparation

The link-first preview was published on 2026-10-31 using the retained dev.21
macOS ARM64 DMG and original Files0.5 archive from the
[controlled checkpoint](files-development-preview.md#files-050-macos-controlled-qualification).
Both immutable non-Latest releases passed all five draft/public asset checks;
Files publication and anonymous verification preceded host publication. The
separate six-check public Settings-link checkpoint and read-only audit passed.
See [actual evidence and capture limits](files-development-preview.md#macos-link-first-distribution).
Later development metadata does not rebuild or relabel that dev.21 host.
At that link-first checkpoint, the complete v1 catalog remained unchanged:
Linux0.4/dev.11, SSH and Snippets retained their then-current offers. Its strict
one-release-per-ID schema cannot offer distinct Linux0.4 and macOS0.5 releases;
duplicate IDs or schema changes break old clients.

The completed sequence below records the separate publication boundaries; it is
not an instruction to recreate sealed releases or replay executed fixtures.

1. Revalidate retained source/artifact identities and image integrity. Obtain the
   ordinary **FULL** package-verifier result on the exact DMG-derived app with a
   matching dev.21 source context, without `--inspection-only`. Existing staged
   and copied-app inspections, native primitives and local Files lifecycle evidence
   remain reusable for unchanged inputs but do not claim that FULL result.
   The selected dev.21 pair subsequently passed this separate image/FULL check;
   [the preview evidence](files-development-preview.md#macos-link-first-distribution)
   records exact-copy equality, startup/PTY/privacy and independent audit limits.
2. After review/qualification, check tag/release absence and prepare separate
   non-Latest draft prereleases: host `v0.24.0-dev.21` with DMG/checksum, and
   `ext-files-v0.5.0` with the original archive/checksum/JSON. Preserve original
   filenames, source identities and build-time `not-run` qualification field.
   Compare build/tag inputs; never tag dev.21 bytes as dev.22 or replace a sealed
   release. Stable Latest remains unchanged.
3. Verify all five draft assets by exact byte size/SHA-256; publish and verify
   anonymous public downloads again. Make Files available before advertising the
   host/archive pair. This is a partial macOS preview, not the stable asset set.
4. Run the separately assigned [public-link checkpoint](../test/fixtures/files-dmg.md#public-link-mode)
   using that publicly downloaded pair and the actual versioned archive URL.
   It exercises Settings **Install from link**, captured-byte trust, dormant
   install/reinstall, basic operations, management, retained terminal and normal
   joined Quit. No transport interception or local archive substitution. Record
   actual outcomes separately; public download checks alone do not establish app
   acquisition. Do not replay the settled local Trash/state matrix.

The published macOS pair uses Settings → Extensions → **HTTPS archive link** →
**Install from link**, comparing the captured digest to the release checksum;
local downloaded `.omxext` installation remains available offline. Browse will
still show the Linux-targeted Files entry as incompatible on macOS. Document this
honestly rather than calling link delivery macOS catalog discovery. No application-version bump
is needed for fixture/docs-only work; catalog evolution is a separate host change.

## Files macOS catalog publication

Host dev.26 was published on 2026-10-31 as an immutable non-Latest preview;
both draft/public assets, both raw endpoints, the new exact-DMG FULL verification
and the separate six-check public-catalog checkpoint passed. See
[actual identities, outcomes and limits](files-development-preview.md#macos-catalog-distribution).
The sequence below records that historical Files0.5/dev.26 promotion, not a
procedure for later catalog updates. For the later Files0.6 and SSH0.3.1 promotion,
see [Files catalog publication](#files06--ssh031-source-candidate).

Current source selects a separate complete schema1 endpoint,
`distribution/official-extensions-darwin-arm64-v1.json`, only for macOS ARM64.
This is an application change requiring a new host build, not a metadata update
to published dev.21. Its local/link route remains available. The historical
promotion used the following sequence:

1. Bind the macOS entry to the original published Files0.5 archive, embedded
   manifest, checksum and receipt. Do not rebuild it or change its minimum dev.21.
   Preserve the legacy catalog byte-for-byte and copy SSH/Snippets entries
   unchanged; future common-entry promotions update both complete documents.
   The Files generator currently emits Linux-only metadata, not this macOS entry.
2. Independently review the complete host/catalog/fixture/docs candidate. Build
   and verify a new exact macOS DMG, including ordinary FULL startup/PTY/privacy,
   image integrity, packaged resources and complete ad-hoc seal. Reuse unchanged
   primitive and Files0.5 lifecycle evidence with explicit input identity, not
   the old host's FULL result for new bytes.
3. Promote the reviewed endpoint after original asset verification. Read back
   both raw endpoints: new bytes must match source, legacy bytes must remain
   unchanged. Do not redirect legacy clients or add duplicate IDs/schema changes.
4. Publish the new host as a separate non-Latest preview only after applicable
   package verification; verify original draft and anonymous public DMG/checksum
   bytes. Preserve stable Latest and all sealed releases. Record exact build/tag
   identities rather than relabeling dev.21.
5. Run the assigned exact-DMG public-catalog fixture using publicly downloaded
   new host bytes, a fresh profile and actual HTTPS without catalog/archive
   interception. All three install/reinstall operations must use the Files0.5
   catalog card and Official captured-byte consent. Verify dormant installation,
   basic create/move/conflict and exact old-source absence, management, retained
   PTY and active-backend normal Quit. Inspect actual captures and joined exits;
   stale captures are not final-state visual proof. Do not replay the eleven-check
   local lifecycle or native primitive matrices merely for this distribution step.

Source implementation, public endpoint readback, host publication and actual
packaged consumption are distinct outcomes; pending steps are not qualified.
See [catalog semantics](extension-distribution.md) and the
[fixture guide](../test/fixtures/files-dmg.md).

## Files catalog publication

<a id="files06--ssh031-source-candidate"></a>

### Files0.6 / SSH0.3.1 promotion

The promoted catalogs bind the separately built Files0.6.0 and SSH0.3.1 archive
trios to their original receipts and immutable versioned URLs; see
[distribution](extension-distribution.md#files06-and-ssh031-candidate). They are
not bundled into the stable host. The selected local host/archive pair checks
passed, and the original three assets for each extension were published and
anonymously byte-verified; the original receipts remain `not-run`. Do not replay
publication or replace those assets. ROOT integrated the reviewed catalogs,
preserving the newer common Snippets entry, and verified both public endpoint
bytes. A separate [macOS Files0.6 public-HTTPS checkpoint](files-development-preview.md#files-060-macos-public-catalog-checkpoint)
passed with a retained locally built DMG; it is not a downloaded-public stable
host. Other public-HTTPS checkpoints require their own authorization and outcome.
Do not infer them from local qualification or asset readback. Preserve historical release bytes and receipts. Files0.6 replaces the Linux0.4 catalog offer; dev.11–dev.20 users retain
the older archive by explicit local/link installation or can upgrade the host.

### Historical Files 0.4.0 promotion

`ext-files-v0.4.0` was published on 2026-10-30 as an immutable non-Latest
prerelease at original archive source `b6044d65d14345adb8d7ae59340fbca978512107`.
All three original assets passed draft and anonymous public byte readback.
Retain the basename `omxterm-files-language-b6044d6.omxext` and its original
checksum/receipt, including `not-run` and intended dev.12 fields. The
[preview guide](files-development-preview.md#files-040-distribution-and-controlled-qualification)
records exact hashes and separate controlled qualification with the already-public
host0.24.0-dev.11 ARM64 AppImage. No new host build/version is needed for this
catalog/docs/test-only promotion; neither declared dev.20 compatibility nor
source currency is dev.20 execution qualification.

Generate from the retained original set with
`node scripts/create-files-catalog.mjs PATH/omxterm-files-language-b6044d6.omxext CANDIDATE.json`.
The generator emits a **Files-only** catalog. Merge only that entry into the full
`distribution/official-extensions-v1.json`, preserving SSH and Snippets metadata.
Keep historical0.1.0 exception test fixtures independent of the current catalog;
do not change compatibility code or sealed historical releases.

Reviewed catalog integration at `fd7691a972f8e364bd3b3b2ba9ec1d90fcccf8b5`
preserved SSH/Snippets; fixed raw-endpoint readback matched SHA-256
`315c7208328b401a31944c97f8c259d8b449ab6c7185a1ded00c691d997c26f9`.
The separate exact-pair packaged `OMXTERM_FILES_PACKAGED_CATALOG=public`
checkpoint then passed with fresh evidence, no fixture CA/interceptor or
controlled catalog file. See the [public checkpoint](files-development-preview.md#public-files-040-checkpoint)
for seven checks, two consents, normal joined Quit and qualification limits.
Controlled qualification, asset upload, anonymous byte readback and actual
packaged public consumption remain distinct milestones. Future promotions must
repeat the relevant publication sequence with new identities, not mutate sealed
releases or replay already-settled qualification without changed inputs.

### Historical Files 0.1.0 publication

The initial Files catalog preview was published and
[#728](https://github.com/luizomf/omxterm/issues/728) is closed. See the
[Files preview guide](files-development-preview.md) for distributed versions and
qualification limits. The version-specific sequence below records that initial
publication, not outstanding work or permission to recreate its sealed releases.
Future previews require new identities and matching review/qualification.

This partial preview is separate from the complete stable release below. The
integration maintainer owns publication after full candidate review/corrections and
exact packaged qualification. Keep source review SHA, final SHA, host package and
Files archive identities distinct; a reused archive retains its original source
receipt. Historical Files0.1.0 minimum 0.23.0-dev.8 remains valid for local/link
installation; 0.23.0-dev.9 adds catalog browsing. Do not rebuild or replace published same-version bytes.

1. Qualify the final Linux ARM64 host AppImage with the separate Files archive:
   catalog → exact-byte trust → dormant install → Files operation/conflict →
   replacement/management → same live PTY → joined Quit. Record whether transport
   is controlled or actual public HTTPS, plus synthetic-input/dialog limitations.
2. Create separate draft prereleases at exact source commits: host
   `v0.23.0-dev.9` and Files `ext-files-v0.1.0`. Use `--prerelease --latest=false`
   with `gh release create`; neither becomes Latest. Host gets the qualified
   AppImage/checksum (and helper/checksum if included, with helper qualification
   limitations). Files gets its `.omxext`, `.omxext.sha256`, `.omxext.json`.
   Preserve MIT/provenance and explicitly state Linux ARM64 preview/SDK limits.
3. Download draft assets and compare exact sizes/SHA-256 against retained receipts;
   then publish/seal each release. Download public URLs again and verify the same
   bytes, including archive checksum and receipt. Never clobber an existing release.
4. Generate the candidate from those verified archive/receipt/checksum files:
   `node scripts/create-files-catalog.mjs PATH/files-0.1.0.omxext CANDIDATE.json`.
   Inspect its original source commit, immutable release URLs, target, engine range,
   byte count and digest. Promote the reviewed Files entry into
   `distribution/official-extensions-v1.json` only after public availability,
   preserving all other entries.
5. Read back the exact fixed raw catalog endpoint; run one bounded actual packaged
   public-endpoint installation and retained-terminal/management/Quit smoke. Verify
   downloaded bytes against the published release receipt. A localhost transport
   fixture or successful upload does not qualify this boundary.

Record publication URLs, exact readback hashes and actual outcomes. Source
integration or a valid empty catalog is not product distribution: the initial
#728 delivery required both a compatible public host and verified public Files
consumption. No signing infrastructure, stable SDK or broader platform campaign
is implied.

## SSH preview publication

### Historical SSH 0.3.0 publication

For the current SSH 0.3.1 selection, see
[Files0.6 / SSH0.3.1 promotion](#files06--ssh031-promotion).

SSH `ext-ssh-v0.3.0` was published on 2026-10-30 at 20:07:34 UTC as an immutable,
non-Latest prerelease. Its tag identifies original build source
`77937fcf87ae71a68709111df7ace7359fb3f0b6`; final candidate
`ad505f6c96992c4d76a07bf97143b430308760c6` adds only a compatibility-test correction,
and integrated `a2948618fb58c1fcbf3107bacf58909f8a74bc02` has the same final tree.
The original `ssh-0.3.0-77937fc.omxext` is 11,572 bytes, SHA-256
`13b265058ba051bb1dcf57ba1cef9347ed8d6851069a4ad1206af0469feb46cf`.
Draft and anonymous public downloads of all three original assets (archive,
checksum, receipt) matched byte-for-byte. Release notes and the build receipt
remain unchanged: `not-run` and intended host dev.19 are build-time fields,
not a description of subsequent exact-pair qualification.

The new pair reuses already public Linux ARM64 host `v0.24.0-dev.11`, AppImage
SHA-256 `04344920a6229baf695d01e03fedcf5396c897f6805d6ed2ed4b9f4104f67c86`.
Its exact SSH0.3 appearance/language and synthetic Connect qualification is
recorded in the [SSH guide](ssh-connect.md#installing-the-distributed-preview).
No host rebuild/release is required; stable `v0.23.0` remains Latest. Historical
SSH0.1 assets, tags, notes and receipts remain immutable.

The independently reviewed catalog/docs/test promotion replaced only SSH metadata,
preserving Files and Snippets, and was integrated at
`6f4355d6573b0fb4e3f8591655d7db789106a8a7`. Fixed raw catalog readback matched SHA-256
`0a446b1a3c53960508f0d0b16a951e5f889d9998230832624d8f1edddef6dd15`.
The bounded [public SSH checkpoint](ssh-connect.md#public-distribution-checkpoint)
then passed on exact publicdev.11/SSH0.3 with fresh public downloads, without
appearance mode. Its results and initial fixture failure are separate from
prepublication qualification. Catalog/docs/test-only promotion needed no
application-version bump or rebuild. Future promotions must bind actual manifest,
source, target and archive identities after public byte verification, complete
independent review, then verify fixed-endpoint readback and packaged consumption.
Never retrofit sealed notes with later evidence.

### Historical SSH 0.1.0 procedure

The initial SSH milestone followed the partial Linux ARM64 preview topology,
not the twelve-asset stable release below. The following sequence records host
`v0.24.0-dev.0` and separate `ext-ssh-v0.1.0` publication as non-Latest prereleases;
it is not permission to recreate those sealed releases. Do not remove the development
suffix or bump main for catalog/docs/test-only changes: unchanged Files0.1.0 is
explicitly compatible with this exact host version only. A different host version
requires deliberate compatibility reconciliation and rebuilt/verified host bytes.
Stable0.23.0, dev.9 and Files0.1.0 remain immutable.

1. Reuse the qualified AppImage/helper and checksums built at
   `a8a309fe4bd87675d01da193fa7318701e68a460`; host tag target is integrated
   `a09d8530541399f85469c099ed20ac4b102647f8` (only two test files differ).
   Preserve SSH `ssh-6d939f0.omxext` plus original `.sha256`/`.json`, built/tagged
   at `6d939f0e837dba90728e6e892010a4a1889fe0c9`. Its extension inputs are unchanged
   through final host source. Do not rebuild, rename or relabel published-version
   bytes or change the receipt's build-time `not-run` qualification field.
2. After checking proposed tags/releases are absent, create and verify exact tag
   refs, then use `gh release create --verify-tag --draft --prerelease --latest=false`
   with the four host assets and three SSH assets in their respective releases.
   Draft metadata alone does not establish the existence of a tag ref. Download
   and verify all seven filenames, sizes and hashes before publishing host, then
   SSH. Recheck both immutable public releases and anonymously download/hash all
   seven versioned asset URLs. Stable0.23.0 remains Latest.
3. Only after public bytes verify, promote the SSH catalog entry alongside the
   unchanged Files entry. Bind the embedded manifest's ID/version/engine strings,
   original source commit, Linux ARM64 target and exact archive size/digest to the
   immutable release URLs. `create-files-catalog.mjs` is Files-specific, not an SSH
   generator; do not replace the complete catalog with a Files-only output.
4. Read back the exact fixed raw catalog endpoint and compare its bytes to the
   promoted source. Run the bounded [public SSH checkpoint](ssh-connect.md#public-distribution-checkpoint)
   on the exact publicly downloaded host/archive. It uses production HTTPS and
   verifies catalog install/reinstall, dormant activation, management, retained
   local terminal and actual-exit Quit without rerunning the synthetic SSH matrix.
   Record actual receipt hashes/outcomes separately from pre-publication evidence.

The retained host FULL verifier, synthetic SSH campaign and immutable Files
lifecycle may be reused while relevant inputs remain unchanged. None establishes
real SSH authentication/connectivity, other-platform extension support, a stable
SDK or public acquisition before the separate checkpoint. Do not mutate sealed
release notes/assets to retroactively claim later verification.

## Snippets preview preparation and publication

The Linux ARM64 host `0.24.0-dev.11`, macOS ARM64 host `0.24.0-dev.16` and
Linux x64 host `0.24.0-dev.30` Snippets previews are published, each using the
unchanged Snippets `0.1.0` archive. The Linux x64 preview's publication, catalog
promotion and bounded public-HTTPS checkpoint are recorded in the [migration guide](snippets-migration.md#linux-x64-public-catalog-checkpoint).
The macOS release was sealed on 2026-10-30 at 16:25:11 UTC as an immutable,
non-Latest prerelease with only the DMG/checksum. The existing public archive was
verified before host publication; public host/checksum downloads subsequently
verified the exact qualified DMG. Stable `0.23.0` remains Latest. See the
[migration guide](snippets-migration.md#macos-arm64-published-preview) for exact
source/artifact identities, local/offline installation and separate native
nine-scenario/FULL package evidence. Public byte verification is not native macOS
public-HTTPS installation. The separate macOS catalog promotion and bounded
public-HTTPS checkpoint below subsequently passed; no archive or original receipt
was replaced.

The Linux-oriented procedure below applies to future preview pairs, not permission
to recreate any sealed release; source transition alone does not establish
distributed migration. Prepare a partial prerelease, not the complete stable asset
set. The separately published Windows ARM64 dev.36 [partial preview](snippets-migration.md#windows-arm64-published-preview-and-catalog-candidate)
uses its exact retained NSIS/checksum and optional Snippets; earlier Windows hosts
and Windows x64 are unchanged. Its installed public-HTTPS checkpoint remains
separate and pending. Source transition alone does not satisfy platform distribution gates. Source-native qualification does
not substitute for the exact packaged host/archive pair.

1. Select exact committed host and Snippets source identities. Reuse an already
   published compatible archive when its exact bytes and receipt match the selected
   qualification; do not rebuild or replace it. For a new archive, build the host,
   then `node scripts/build-snippets-extension.mjs /absolute/new/snippets.omxext`
   (append the verified full source commit for an exported checkout). Preserve
   archive/checksum/receipt identities; do not overwrite an earlier candidate or
   change the build receipt's `qualification.status: not-run` field. A rebuild,
   including changed embedded documentation/locales, is a new artifact identity.
2. Package and verify the Linux ARM64 host with the normal release tools. Run the
   [exact Snippets AppImage fixture](../test/fixtures/snippets-packaged.md#exact-appimage-adapter)
   against those exact bytes and the chosen archive. Keep its synthetic-input,
   software-rendering and controlled-consent limits explicit. Record full Linux
   verifier evidence separately: extraction-only execution does not qualify FUSE
   launch or helper installation. Include the [migration guide](snippets-migration.md).
3. After complete source review/corrections and matching qualification, check
   that the proposed host tag and release are absent. Check extension tag/release
   absence only when creating a new extension release; never recreate an existing
   one. Create verified exact-source tags and draft prereleases with `--verify-tag
--draft --prerelease --latest=false`. A new Snippets release gets its archive,
   checksum and original receipt; the host gets its qualified AppImage/helper and
   checksum pairs. Bind release notes to actual hashes, versions, source identities
   and limitations, not a generic claim that every compatible host is qualified.
4. Download draft assets and compare exact sizes/SHA-256. **Publish Snippets
   first, or reuse its existing published release, and verify anonymous public
   downloads before publishing a host that removes built-in access.** Then
   publish/download/verify the compatible host.
   Keep stable Latest unchanged. Never replace published same-version bytes,
   move a sealed tag or retrofit assets into an immutable release.
5. Ordinary local-archive installation remains available offline. Catalog
   discovery is a separate optional promotion: publish and verify assets first,
   preserve existing Files/SSH entries, bind the new entry to actual manifest,
   receipt, size/digest and immutable URLs, then verify fixed-endpoint readback
   and actual packaged public acquisition. Do not use the Files-specific generator
   to erase other entries or claim Snippets public consumption from a local test.

Record actual readback/consumption results separately from pre-publication
qualification. A Linux preview does not close #741's other-platform work, create
a stable SDK or imply automatic installation/enablement. Existing user catalogs
remain untouched.

### Snippets catalog promotion

Snippets `0.1.0` is listed for Linux ARM64, macOS ARM64 and Linux x64 alongside
unchanged Files/SSH entries. Catalog integration and exact public endpoint readback
were followed by separate bounded packaged public-HTTPS checkpoints on Linux dev.11,
macOS dev.16 and Linux x64 dev.30. The macOS promotion source was
`dbbc1a9814606f72bcaea226ab68564da4a345fb`; its recorded catalog SHA-256 was
`c86ea2ee6f4f27eb17718e5832ce29a8e862aca99fb91afe358c9572ca844ead`. The later
Linux x64 promotion source is `0164f768b060e4ac3a1fc7afa20b30d4426e6fc8` and its
legacy endpoint readback SHA-256 is
`b1383fe0690b3320433cd9419d9863b6ac8a7b2bcb48b9d2205d3e7248e45d97`.
See [Linux x64 delivery](snippets-migration.md#linux-x64-public-catalog-checkpoint),
[macOS delivery](snippets-migration.md#macos-arm64-catalog-delivery) and
[Linux ARM64 coverage](snippets-migration.md#preview-coverage-and-remaining-platforms)
for exact outcomes and limits. No application-version bump or rebuild was needed;
published releases, tags, assets and original receipts remain unchanged. The
sequence below records completed promotion requirements, not outstanding work or
permission to repeat qualification.

1. Independently download the immutable `ext-snippets-v0.1.0` archive and its
   original `.sha256`/`.json`. Bind 76,653 bytes and SHA-256
   `6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`
   to receipt source `805e95dbc77552dc137707578b18b48ad6d047e9` and the
   embedded manifest: `omxterm.snippets`, `0.1.0`, host `>=0.24.0-dev.8`,
   API `0.1.x`. Preserve the receipt's build-time `not-run` field and original
   Linux build target. The macOS promotion retained `linux-arm64` and added
   `darwin-arm64`; the later Linux x64 promotion added `linux-x64`. The archive
   has no manifest platform restriction. Do not raise
   its engine minimum or rewrite its receipt to describe later qualification.
   The archive and release-page URLs must name the same sealed tag.
2. Review/integrate the complete candidate without changing Files/SSH metadata.
   Read back the fixed raw catalog endpoint and compare with promoted source.
3. Run a separate bounded packaged public-HTTPS checkpoint on the published
   host for each newly promoted target. Linux dev.11 AppImage (SHA-256
   `04344920a6229baf695d01e03fedcf5396c897f6805d6ed2ed4b9f4104f67c86`)
   passed. The macOS checkpoint also passed using the freshly downloaded public
   dev.16 DMG (SHA-256
   `52b8a6b60dce7380b1157755e5ba3dcda0dfdc8e4c54ed2a71b723b160ef061f`).
   Linux x64 also passed on the public dev.30 AppImage (SHA-256
   `8a1e73d16833a97819273c23d566cc2d46af6b6dddf3a475c616d1109a3a2a95`).
   Earlier exact-package campaigns and separate FULL verifier passes were not
   rerun and remain distinct from public-HTTPS consumption evidence.
   Verify actual catalog acquisition, exact-byte trust, dormant install/reinstall,
   deliberate enablement/Toggle Snippets, retained YAML and terminal usability,
   management and joined normal Quit. Record actual archive/host hashes, outcomes
   and input/rendering limits; local download or headless parser tests are not
   this checkpoint. Do not rewrite sealed release notes to claim later evidence.

Maintainer integration/publication and the native checkpoint are distinct
evidence boundaries. Keep explicit local/offline installation available; no new Files/SSH
qualification, other-platform cutover, stable SDK or full #741 completion follows.

## Publication

Create tag `vX.Y.Z` and a draft GitHub Release in `luizomf/omxterm`. Upload every applicable file (twelve with both x64 platforms), download and verify the complete set against local byte counts and SHA-256 records, then publish to seal the immutable release:

- `OMXTerm-<version>-arm64.dmg` and `OMXTerm-<version>-arm64.dmg.sha256`
- `OMXTerm-<version>-arm64.AppImage` and `OMXTerm-<version>-arm64.AppImage.sha256`
- `OMXTerm-<version>-x64.AppImage` and `OMXTerm-<version>-x64.AppImage.sha256` (Linux x64, build-only)
- `linux_install.sh` and `linux_install.sh.sha256` (one common pair: compare ARM64/x64 generated bytes before upload)
- `OMXTerm-<version>-arm64.exe` and `OMXTerm-<version>-arm64.exe.sha256`
- `OMXTerm-<version>-x64.exe` and `OMXTerm-<version>-x64.exe.sha256` (Windows x64)

Before draft assembly, compare each full CI build SHA against the tag inputs using
the build-to-tag procedure above; explain every non-artifact difference. Upload
the common helper pair only once. Preserve platform build-evidence JSON with the
release preparation records (it is not one of the twelve public assets). Include
explicit x64 build-only coverage and unverified boundaries in release notes.

Include release notes covering new features, bug fixes, any configuration changes, SHA-256 checksums, and first-launch Gatekeeper/SmartScreen notes:

- **macOS Gatekeeper:** OMXTerm uses an ad-hoc signature without Apple Developer ID signing or notarization. Verify the SHA-256 checksum and use **System Settings → Privacy & Security → Open Anyway** on first launch.
- **Windows SmartScreen:** OMXTerm for Windows ARM64 and x64 is unsigned. Verify the SHA-256 checksum and choose **More info → Run anyway** on first launch.
