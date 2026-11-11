# Native release procedures

This guide covers native ARM64 macOS (`.dmg`) and ARM64/x64 Linux (`.AppImage` + `linux_install.sh`) and Windows (`.exe` NSIS) releases, plus separately published extension archives. Linux and Windows x64 packages use owner-approved **build-only qualification**: native CI and enumerated headless checks, with desktop, GPU, installer and ordinary-user integration unverified and not release gates ([ADR 0036](adr/0036-distribute-build-only-x64-ci-artifacts.md)).

See [versioning.md](versioning.md) for SemVer rules and [development.md](development.md#platform-prerequisites) for platform setup. Per-release evidence, decisions and limits belong in each GitHub release's notes, not in this guide.

## Release workflow

1. Select application version `X.Y.Z` under [versioning.md](versioning.md), remove the development suffix and review one frozen source cut. Record its full commit SHA. All targets for that application version use this cut; they need not ship together.
2. Build and verify a ready target using the relevant procedure below. Retain the actual build SHA, checksums and evidence; prove any build-to-cut differences are non-artifact changes. Collect its files in the ignored `release/` directory.
3. Create its target tag and draft, upload its complete [asset set](#publication), read back sizes and hashes, publish, and verify public downloads. Update that target's exact links in the README download index. A target that is not ready does not block another.
4. Advance the development baseline once for the selected application cut, not for each later target, after reviewing [extension compatibility](versioning.md#development-baseline-between-releases) for the new family.

For example, Linux ARM64 can ship `linux-arm64-v0.26.0` first; macOS ARM64 can later ship `macos-arm64-v0.26.0` from the same frozen cut without an artificial version bump or rebuilding Linux. If product code, dependencies or build inputs need correction after a target ships, select a new application version and cut for the correction. Do not change a sealed release, move its tag, or create a later roll-up release.

## Verification and release decisions

Follow [ADR 0019's risk-based verification and reuse policy](adr/0019-support-native-arm64-releases-on-macos-linux-and-windows.md#verification-and-evidence-reuse):
assess failures and gaps for their relevance to the cut. A real product
regression blocks the affected target. An environment-specific or flaky test
failure can be accepted with a recorded reason. If a test cannot run safely,
leave it unrun and continue independent work.

Record the selected cut, assets, actual failures, missing coverage and the
release decision in the release notes. Version/source correspondence,
uploaded-byte checks and immutable tags/assets still belong to the publication
transaction.

<a id="changed-inputs-and-build-to-tag-comparison"></a>

## Reusing test and build results

When preparing a release across multiple machines or VMs, you only need to rerun steps whose inputs have changed:

- **Documentation-only changes** do not change packaged application binaries.
- **Test-only changes** only require running the affected tests, not rebuilding packages.
- **Version-only bumps** require rebuilding packages and running `package:verify` (x64 build-only lanes use `--inspection-only`), without needing to rerun the full behavioral test suite if the code is otherwise identical.
- **Code, asset, dependency, or build-script changes** require running tests, building new packages, and verifying the resulting artifacts.

To compare a package build commit against the frozen cut (replace the placeholders with full SHAs):

```sh
git merge-base --is-ancestor <build-sha> <cut-sha>
git diff --stat <build-sha> <cut-sha>
git diff <build-sha> <cut-sha>
```

Review the actual differences and build inputs, not just the summary, to establish that they cannot affect artifacts. The target tag points to the cut.

## Version consistency

Before tagging a release, verify that the final `X.Y.Z` version (with no `-dev` suffix) matches across:

- `package.json` and `package-lock.json`
- The packaged app version and `TERM_PROGRAM_VERSION`
- `linux_install.sh --version`
- The `X.Y.Z` portion of the target tag and all release asset filenames

## Build and automated verification

<a id="resume-and-version-only-commands"></a>

### Resume and version-only commands

On macOS, graphical tests and packaged Electron probes (FULL and inspection-only
verification and the standalone commands below) can change OS preferences; see
[side effects on your desktop](development.md#side-effects-on-your-desktop).

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

On Apple Silicon macOS with Xcode Command Line Tools (see
[side effects on your desktop](development.md#side-effects-on-your-desktop)),
run the verifier on both the staged app and the mounted DMG:

```sh
npm ci
npm run check
```

`npm run check` runs `check:portable`, builds the staged app
(`release/mac-arm64/OMXTerm.app`) and verifies it. Afterwards, mount and verify
the final `.dmg` image:

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
and `npm run package:verify -- --inspection-only`. No GUI suite, NSIS or Linux
helper installation runs. The default `package:verify` and even
`--windows-unpacked-only` launch the GUI: do not use those modes on a headless runner.

Only successful jobs upload the binary, its `.sha256`, `build-evidence.json`
and (Linux only) the common helper/checksum pair, retained for **7 days**.
Download before expiry and verify every file against `build-evidence.json`;
the artifact ZIP digest is not the binary checksum. On Linux, restore executable
bits with `chmod +x <AppImage> linux_install.sh` after checking contents; Actions
ZIPs do not preserve modes.

Desktop/GPU, ordinary-user OS integration, FUSE launch, actual helper/NSIS
installation, Windows 11 and SmartScreen/UAC remain unverified and are **not
release gates** for these lanes. Say so in the release notes.

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
# Write LF, not CRLF, so `shasum -c` / `sha256sum --check` also accept it
$line = "$((Get-FileHash $name -Algorithm SHA256).Hash.ToLower())  $name`n"
[IO.File]::WriteAllText("$PWD\$name.sha256", $line)
Get-Content "$name.sha256"
```

## Publication

For application version `X.Y.Z`, create a separate stable, non-prerelease release for each ready target. The exact tags are `linux-arm64-vX.Y.Z`, `linux-x64-vX.Y.Z`, `macos-arm64-vX.Y.Z`, `windows-arm64-vX.Y.Z`, and `windows-x64-vX.Y.Z`. Each tag points to the same reviewed frozen cut for that application version. Filenames and embedded application versions remain `X.Y.Z`, without the target prefix.

Each draft contains only its target's complete assets:

| Target                   | Assets (each with its `.sha256`)                   |
| ------------------------ | -------------------------------------------------- |
| macOS ARM64              | `OMXTerm-X.Y.Z-arm64.dmg`                          |
| Linux ARM64              | `OMXTerm-X.Y.Z-arm64.AppImage`, `linux_install.sh` |
| Linux x64 (build-only)   | `OMXTerm-X.Y.Z-x64.AppImage`, `linux_install.sh`   |
| Windows ARM64            | `OMXTerm-X.Y.Z-arm64.exe`                          |
| Windows x64 (build-only) | `OMXTerm-X.Y.Z-x64.exe`                            |

Each Linux release carries its own matching helper and checksum. When the second Linux target is prepared for the same cut, compare both helper and checksum bytes with the first target's retained or downloaded pair; they must agree. Keep platform build-evidence JSON in the preparation records, not as a required public asset. Before draft assembly, compare each actual full build SHA against the frozen cut with the [build-to-tag procedure](#changed-inputs-and-build-to-tag-comparison).

Create the target draft in `luizomf/omxterm` at the frozen full SHA with `--latest=false`, without `--prerelease`. Ensure the target tag does not already exist at another commit; `--target` does not retarget an existing tag. For example, with `VERSION`, `CUT` (the full frozen SHA), and `NOTES` (a prepared notes-file path) set for a Linux ARM64 cut:

```sh
tag="linux-arm64-v$VERSION"
gh release create "$tag" --target "$CUT" --draft --latest=false --title "OMXTerm $VERSION — Linux ARM64" --notes-file "$NOTES"
gh release upload "$tag" "release/OMXTerm-$VERSION-arm64.AppImage" "release/OMXTerm-$VERSION-arm64.AppImage.sha256" release/linux_install.sh release/linux_install.sh.sha256
```

Download the draft assets and compare every byte count and SHA-256 with the local records before publication. Publish explicitly as non-Latest, then anonymously download each public asset and repeat the size/hash comparison:

```sh
gh release edit "$tag" --draft=false --latest=false
```

Verify the release is stable, non-Latest and points to the frozen cut. Never move a published tag, replace assets, disable immutability, or add platforms to a sealed release. When it is the newest application version for its target, update that row in the [README index](../README.md#platforms-and-downloads), using exact tag URLs for its version, download, checksum and release notes; Linux rows also link their own helper and checksum. An older backfill does not replace a newer indexed version. Leave other rows at their latest available versions. Target rows use exact tag URLs, not `/latest/download`.

### Complete release

Once every target of a version is published, publish one complete release so
`/releases/latest` offers the newest version for every platform:

1. Download each target release's assets and check them with `shasum -a 256 -c`.
   Linux helpers must be byte-identical across Linux targets; upload one copy.
2. `gh release create "v$VERSION" --target "$CUT" --draft --title "OMXTerm $VERSION" --notes-file NOTES.md` with every installer and its `.sha256`, plus `linux_install.sh` and its `.sha256`.
3. Notes start with a plain **Which file do I download?** table (Mac with an
   Apple chip, Windows Intel/AMD, Windows ARM/Snapdragon, Linux Intel/AMD,
   Linux ARM), how to tell which one you have, first-launch steps per platform,
   then what's new, links to the target releases and a SHA-256 table. Write
   for someone who doesn't know what ARM64, x64, DMG or AppImage mean.
4. Publish with `gh release edit "v$VERSION" --draft=false --latest`, then
   download each asset anonymously from
   `https://github.com/luizomf/omxterm/releases/latest/download/<file>` and
   compare SHA-256 with the target releases.

Write release notes in plain words for people who use the terminal: new features, fixes, configuration changes, SHA-256 checksums, the frozen cut SHA, and first-launch notes:

- **macOS Gatekeeper:** OMXTerm uses an ad-hoc signature without Apple Developer ID signing or notarization. Verify the SHA-256 checksum and use **System Settings → Privacy & Security → Open Anyway** on first launch.
- **Windows SmartScreen:** OMXTerm for Windows ARM64 and x64 is unsigned. Verify the SHA-256 checksum and choose **More info → Run anyway** on first launch.

Mark x64 releases as build-only and untested on a desktop. Record accepted test failures and missing coverage with a short reason.

## Extension archives

Files, SSH Connect and Snippets ship as separate `.omxext` archives with their
own non-Latest prereleases (`ext-<name>-vX.Y.Z`), not inside a host target
release. See [extension distribution](extension-distribution.md) for catalog
semantics.

### Building an extension archive

On an exact, clean committed source (the builder refuses a dirty checkout):

```sh
npm ci
npm run build
node scripts/build-files-extension.mjs   # or build-ssh-extension.mjs / build-snippets-extension.mjs
OMXTERM_FILES_BUILD=1 npm test -- test/integration/files-extension-build.test.ts
```

Build after `npm run build` (which clears `dist`) and before packaging a host, so
host exclusion is checked. The archive and its `.sha256`/`.json` sidecars land in
`dist/extensions`; the builders also accept `OUTPUT [FULL_SOURCE_COMMIT]` for a
private path or an exported source tree. Version, host range, API and
capabilities come from `extensions/<name>/extension.json`. An existing
destination is never overwritten. Keep archives and sidecars outside Git, and
inspect archive members for checkout or host path disclosure before publication;
fix the inputs rather than editing generated bytes. The `.json` receipt's
`qualification.status: not-run` is a build-time field; never rewrite it.

Before publishing, run the extension on a published host of each target
platform from those exact bytes. For Files, that is the
[packaged Files smoke](files-development-preview.md#packaged-files-smoke): it
installs the archive, lists a directory and inserts a path into the terminal.
For SSH Connect, it is the
[packaged SSH smoke](ssh-connect-development.md#packaged-ssh-smoke): it installs
the archive, picks an alias and checks what the ssh client received. For
Snippets, it is the
[packaged Snippets smoke](snippets-migration.md#packaged-snippets-smoke): it
installs the archive, then inserts and runs a snippet in the terminal.

### Publishing an extension archive

1. Check that the `ext-<name>-vX.Y.Z` tag does not exist. Never replace or
   rebuild a published same-version archive; a changed archive needs a new
   version.
2. Create the prerelease at the archive's exact source commit with the archive,
   `.sha256` and `.json` receipt:
   `gh release create "$tag" --target "$SOURCE" --prerelease --latest=false --notes-file NOTES.md ARCHIVE ARCHIVE.sha256 ARCHIVE.json`.
3. Download the public archive anonymously and compare its SHA-256 with the
   local file.

Publish an extension before a host release that depends on it (for example, a
host that stops bundling a built-in feature).

Release notes name the required host range, the HTTPS archive link for
**Settings → Extensions → HTTPS archive link → Install from link**, the archive
size/SHA-256, the source commit and the qualified platforms.

### Catalog promotion

Catalog discovery is optional and separate from archive publication. Promote
only a published archive:

1. Bind the entry to the published archive URL, size, SHA-256, embedded manifest
   (ID, version, host range, API), source commit and release URL.
   `node scripts/create-files-catalog.mjs ARCHIVE CANDIDATE.json` emits a
   Files-only Linux ARM64 entry; there is no generator for SSH, Snippets or the
   macOS catalog, so edit those entries by hand.
2. Update `distribution/official-extensions-v1.json` (Linux ARM64, Linux x64)
   and `distribution/official-extensions-darwin-arm64-v1.json` (macOS ARM64)
   without changing other entries. The schema allows one release per extension
   ID per catalog: hosts that the new entry's range or capabilities exclude lose
   the catalog offer and keep local/link installation.
3. After merge, check that a published host offers the new entry under
   **Settings → Extensions → Browse official extensions**.
