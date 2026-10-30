# Native release procedures

This guide covers native ARM64 macOS (`.dmg`) and ARM64/x64 Linux (`.AppImage` + `linux_install.sh`) and Windows (`.exe` NSIS) releases. Linux and Windows x64 packages use owner-approved **build-only qualification**: native CI and enumerated headless checks, with desktop, GPU, installer and ordinary-user integration unverified and not release gates ([ADR 0036](adr/0036-distribute-build-only-x64-ci-artifacts.md)). ARM64 checks and full-verifier safety boundaries are unchanged.

See [versioning.md](versioning.md) for SemVer rules and [development.md](development.md#platform-prerequisites) for platform setup.

## Release workflow

1. Select the release version `X.Y.Z` under [versioning.md](versioning.md) and ensure `package.json` and `package-lock.json` match.
2. Build and verify ARM64 packages on each target platform; collect native Linux/Windows x64 build-only artifacts using the manual lanes below.
3. Collect the verified installers and `.sha256` checksum files in the ignored `release/` directory.
4. Tag `vX.Y.Z`, create a draft GitHub Release with the [qualified release assets](#publication) (twelve including both x64 platforms, with one common Linux helper pair), verify the uploaded bytes, and publish. Update download links in `README.md` and `docs/installation.md`. Published releases are immutable: finish uploading all assets before publication; never move a published tag, replace an asset, or disable immutability to add a missing platform.
5. Bump `main` to the next `-dev.0` baseline after release.

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

On Apple Silicon macOS with Xcode Command Line Tools:

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
Files `0.4.0` with minimum host `0.24.0-dev.8`. The immutable published Files
`0.1.0` archive retains its historical minimum host `0.23.0-dev.8`; neither archive
supports `v0.22.0`. When building an exported source
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

Root/maintainers decide publication after review and qualification. If publishing
a partial Linux ARM64 preview, label it explicitly as a prerelease and not Latest,
keep Files as a separately downloadable versioned artifact, and disclose missing
platform/SDK/catalog qualification. Do not mutate an already published release to
add it. Public readback/checksums and a compatible public host are needed before
claiming distribution; neither a branch, local artifact nor CI upload is shipment.
The normal stable-release procedure and its complete asset set remain unchanged.

## Files catalog publication

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
receipt. Files0.1.0 minimum dev.8 remains valid for local/link installation; dev.9
adds catalog browsing. Do not rebuild or replace published same-version bytes.

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
   byte count and digest. Promote this reviewed JSON to
   `distribution/official-extensions-v1.json` only after public availability.
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

The selected SSH milestone follows the partial Linux ARM64 preview topology,
not the twelve-asset stable release below. Publish host `v0.24.0-dev.0` and separate
`ext-ssh-v0.1.0` as prereleases with `--latest=false`. Do not remove the development
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

The initial Linux ARM64 host `0.24.0-dev.11` / Snippets `0.1.0` preview is
published; see the [migration guide](snippets-migration.md) for exact identities,
installation and qualification limits. The procedure below applies to future
preview pairs; source transition alone does not establish distributed migration.
Prepare a partial prerelease, not the complete stable asset set. Other targets
retain built-in Snippets until their own replacement is qualified. Source-native
qualification does not substitute for the exact packaged host/archive pair.

1. Select exact committed host and Snippets source identities. Build the host,
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
   that the proposed host/extension tags and releases are absent. Create verified
   exact-source tags and separate draft prereleases with `--verify-tag --draft
--prerelease --latest=false`. The Snippets release gets its archive, checksum
   and original receipt; the host gets its qualified AppImage/helper and checksum
   pairs. Bind release notes to actual hashes, versions, source identities and
   limitations, not a generic claim that every compatible host is qualified.
4. Download draft assets and compare exact sizes/SHA-256. **Publish Snippets
   first and verify anonymous public downloads before publishing a host that
   removes built-in access.** Then publish/download/verify the compatible host.
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
