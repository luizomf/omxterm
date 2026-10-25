# Release procedures

This guide covers building, verifying, and publishing native releases for macOS (`.dmg`), Linux (`.AppImage` + `linux_install.sh`, `.deb`, `.rpm`), and Windows (`.exe` NSIS installer), each for ARM64 and x64. Arch Linux and Manjaro users build [`packaging/arch/PKGBUILD`](../packaging/arch/PKGBUILD) from source; it is not published to the AUR.

Every host packages **its own architecture**: `scripts/package.mjs` passes `--arm64` or `--x64` to electron-builder from `process.arch`, because node-pty, its exec-status build, and the macOS blur addon are compiled or selected for the host and are never cross-compiled. Build each architecture on a native machine or runner.

| Platform | ARM64 artifacts                                                                      | x64 artifacts                                                                        |
| -------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| macOS    | `OMXTerm-<version>-arm64.dmg`                                                        | `OMXTerm-<version>-x64.dmg`                                                          |
| Linux    | `OMXTerm-<version>-arm64.AppImage`, `-arm64.deb`, `-aarch64.rpm`, `linux_install.sh` | `OMXTerm-<version>-x86_64.AppImage`, `-amd64.deb`, `-x86_64.rpm`, `linux_install.sh` |
| Windows  | `OMXTerm-<version>-arm64.exe`                                                        | `OMXTerm-<version>-x64.exe`                                                          |

Each packaging run also writes a `.sha256` record per artifact and a `SHA256SUMS-<mac|linux|win>-<arm64|x64>.txt` list. `linux_install.sh` is identical for both architectures.

Signing status: macOS apps carry only an **ad-hoc** signature (identity `-`), with no Developer ID and no notarization. Windows installers, AppImages, DEBs, and RPMs are **unsigned**. Never describe them as signed or notarized.

See [versioning.md](versioning.md) for SemVer rules and [development.md](development.md#platform-prerequisites) for platform setup.

## Release workflow

1. Select the release version `X.Y.Z` under [versioning.md](versioning.md) and ensure `package.json` and `package-lock.json` match.
2. Update `pkgver` in `packaging/arch/PKGBUILD` to the version with `-` removed (`test/unit/package-release-plan.test.ts` enforces this).
3. Build and verify native packages on each target platform and architecture: macOS, Linux, and Windows, each on ARM64 and x64.
4. Collect the verified installers, `.sha256` records, and `SHA256SUMS-*.txt` lists in the ignored `release/` directory.
5. Tag `vX.Y.Z`, publish the GitHub Release with the [release assets](#publication), update download links in `README.md` and `docs/installation.md`, and verify the uploaded assets.
6. Bump `main` to the next `-dev.0` baseline after release.

The CI `package` job ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) builds unsigned packages for all six targets on every push and pull request and uploads them as short-lived workflow artifacts. They are review builds: CI never tags, publishes, or bumps versions, and it does not replace the native verification below (CI runs startup verification only on Linux; macOS and Windows are checked with `--static-only`).

The CI `install` and `arch` jobs then install those Linux packages on clean distributions (DEB on Ubuntu 24.04 and Debian 12, RPM on Fedora and openSUSE Tumbleweed, the AppImage on Ubuntu 22.04, and both PKGBUILDs on Arch Linux) and run [`scripts/ci-installed-smoke.sh`](../scripts/ci-installed-smoke.sh) under Xvfb without graphics flags. It checks `omxterm --version` and waits for the first terminal session, which starts only after the Terminal Surface has rendered with Chromium's software WebGL.

<a id="changed-inputs-and-build-to-tag-comparison"></a>

## Reusing test and build results

When preparing a release across multiple machines or VMs, you only need to rerun steps whose inputs have changed:

- **Documentation-only changes** do not change packaged application binaries.
- **Test-only changes** only require running the affected tests, not rebuilding packages.
- **Version-only bumps** require rebuilding packages and running `package:verify`, without needing to rerun the full behavioral test suite if the code is otherwise identical.
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
- `pkgver` in `packaging/arch/PKGBUILD` (`X.Y.Z`; development versions drop the `-`, for example `0.20.3dev.0`)
- Git tag `vX.Y.Z` and all release asset filenames

## Build and automated verification

<a id="resume-and-version-only-commands"></a>

### Resume and version-only commands

- `npm run check` (macOS), `npm run check:linux` (Linux), and `npm run check:win` (Windows) run `check:portable`, package the build via `package-built:*` (`node scripts/package.mjs <mac|linux|win>` for the host architecture), and run `package:verify`.
- `npm run package:verify -- --static-only` checks package contents (architecture, native modules, forbidden files, licenses, versions, signatures) without launching the app or running the Windows installer. It reports `STATIC ONLY` and is not startup evidence.
- Standalone `npm run package:mac`, `npm run package:linux`, and `npm run package:win` run `npm run build` and package the installer without running the test suite.
- If `npm run build` (or `check:portable`) has already completed on the current source, you can package and verify directly:

```sh
npm run package-built:mac    # or package-built:linux / package-built:win
npm run package:verify      # Windows requires -- --disposable-vm-allow-omxterm-replacement
```

For a version-only bump when behavioral tests have already passed on the same code:

```sh
npm version X.Y.Z --no-git-tag-version --ignore-scripts
# Set pkgver=X.Y.Z in packaging/arch/PKGBUILD
npx vitest run test/unit/release-version.test.ts test/unit/package-release-plan.test.ts
npm run package:mac         # or package:linux / package:win
npm run package:verify      # Windows: -- --disposable-vm-allow-omxterm-replacement
```

<a id="macos-arm64"></a>

### macOS (ARM64 and x64)

On Apple Silicon (ARM64) or Intel (x64) macOS with Xcode Command Line Tools:

```sh
npm ci
npm run check
```

`npm run check` verifies the staged app (`release/mac-arm64/OMXTerm.app` on ARM64, `release/mac/OMXTerm.app` on x64): every Mach-O must be for the host architecture only. Afterwards, mount and verify the final `.dmg` image:

```sh
(
  set -eu
  version="$(node -p 'require("./package.json").version')"
  dmg="release/OMXTerm-$version-$(node -p process.arch).dmg"
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

<a id="linux-arm64"></a>

### Linux (ARM64 and x64)

On an unlocked Linux X11/XWayland desktop (or under `xvfb-run`) with [Linux prerequisites](development.md#linux), plus `rpmbuild`, `rpm2cpio`, `cpio`, `ar`, and `file` for the DEB/RPM build and checks (Ubuntu: `sudo apt install rpm cpio binutils file`):

```sh
npm ci
npm run check:linux
```

`package-built:linux` first builds the AppImage, then builds the DEB and RPM from the same unpacked application (`--prepackaged`). electron-builder downloads `fpm` on x64 hosts; on ARM64 hosts install it with `sudo gem install --no-document fpm -v 1.17.0` and set `USE_SYSTEM_FPM=true`.

This produces `OMXTerm-<version>-<arch>.AppImage`, `linux_install.sh`, the `.deb` and `.rpm`, their `.sha256` files, and `SHA256SUMS-linux-<arch>.txt` in `release/`. `package:verify` verifies AppImage contents, the `--no-sandbox` launcher configuration, per-user helper installation in an isolated home directory and packaged startup, then extracts the DEB and RPM and checks their metadata (architecture, version, `fontconfig` dependency, OpenSSH recommendation), maintainer scripts (no setuid `chrome-sandbox`, AppArmor profile or `update-alternatives`), `/usr/bin/omxterm` launcher, desktop entry, icon, licenses, that every ELF file matches the host architecture, and that they carry the AppImage's exact `app.asar` and `pty.node`.

If AppImageLauncher is installed, it intercepts AppImage execution through `binfmt_misc` and can move the AppImage into its own folder. Run verification with `APPIMAGELAUNCHER_DISABLE=1 npm run package:verify`.

<a id="windows-arm64"></a>

### Windows (ARM64 and x64)

> **Warning:** Full Windows NSIS verification installs and uninstalls the real package and can replace an existing OMXTerm installation on the system ([ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)). Always run it inside a disposable Windows 11 VM (ARM64 or x64, matching the package) with a clean recovery snapshot.

In an interactive desktop PowerShell session with [Windows prerequisites](development.md#windows):

```powershell
npm ci
npm run check:win -- --disposable-vm-allow-omxterm-replacement
```

For unpacked-only diagnostics without running the NSIS installer:

```powershell
npm run package:win
npm run package:verify -- --windows-unpacked-only
```

### Checksums

`package-built:*` writes a `sha256sum`-compatible `.sha256` record next to each artifact and a `SHA256SUMS-<platform>-<arch>.txt` list of all of them. Verify them inside `release/`:

```sh
# macOS
shasum -a 256 -c SHA256SUMS-mac-<arch>.txt

# Linux
sha256sum --check SHA256SUMS-linux-<arch>.txt
./linux_install.sh --version
```

```powershell
# Windows
Get-Content SHA256SUMS-win-<arch>.txt
Get-FileHash OMXTerm-<version>-<arch>.exe -Algorithm SHA256
```

## Publication

Create tag `vX.Y.Z` and publish the GitHub Release in `luizomf/omxterm` with every verified artifact and its `.sha256` record, plus the `SHA256SUMS-*.txt` lists:

- macOS: `OMXTerm-<version>-arm64.dmg`, `OMXTerm-<version>-x64.dmg`
- Linux: `OMXTerm-<version>-arm64.AppImage`, `OMXTerm-<version>-x86_64.AppImage`, `OMXTerm-<version>-arm64.deb`, `OMXTerm-<version>-amd64.deb`, `OMXTerm-<version>-aarch64.rpm`, `OMXTerm-<version>-x86_64.rpm`, and `linux_install.sh` (once)
- Windows: `OMXTerm-<version>-arm64.exe`, `OMXTerm-<version>-x64.exe`
- `SHA256SUMS-mac-arm64.txt`, `SHA256SUMS-mac-x64.txt`, `SHA256SUMS-linux-arm64.txt`, `SHA256SUMS-linux-x64.txt`, `SHA256SUMS-win-arm64.txt`, `SHA256SUMS-win-x64.txt`

Publish only artifacts whose architecture was built and verified natively; omit any target that was not.

Include release notes covering new features, bug fixes, any configuration changes, SHA-256 checksums, and first-launch Gatekeeper/SmartScreen notes:

- **macOS Gatekeeper:** OMXTerm uses an ad-hoc signature without Apple Developer ID signing or notarization. Verify the SHA-256 checksum and use **System Settings → Privacy & Security → Open Anyway** on first launch.
- **Windows SmartScreen:** OMXTerm for Windows (ARM64 and x64) is unsigned. Verify the SHA-256 checksum and choose **More info → Run anyway** on first launch.
