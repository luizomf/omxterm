# Native release procedures

This guide covers building, verifying, and publishing native ARM64 releases for macOS (`.dmg`) and Linux (`.AppImage` + `linux_install.sh`), and ARM64/x64 releases for Windows (`.exe` NSIS installer). Build support alone does not qualify an installer. Native verification is the default; the explicit Windows x64 emulation exception in [ADR 0034](adr/0034-support-native-windows-x64-packages.md) requires honest host/target and coverage disclosure.

See [versioning.md](versioning.md) for SemVer rules and [development.md](development.md#platform-prerequisites) for platform setup.

## Release workflow

1. Select the release version `X.Y.Z` under [versioning.md](versioning.md) and ensure `package.json` and `package-lock.json` match.
2. Build and verify native packages on each target platform: macOS ARM64, Linux ARM64, Windows ARM64, and Windows x64.
3. Collect the verified installers and `.sha256` checksum files in the ignored `release/` directory.
4. Tag `vX.Y.Z`, create a draft GitHub Release with the [qualified release assets](#publication) (ten including Windows x64; eight without it), verify the uploaded bytes, and publish. Update download links in `README.md` and `docs/installation.md`. Published releases are immutable: finish uploading all assets before publication; never move a published tag, replace an asset, or disable immutability to add a missing platform.
5. Bump `main` to the next `-dev.0` baseline after release.

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
- Git tag `vX.Y.Z` and all release asset filenames

## Build and automated verification

<a id="resume-and-version-only-commands"></a>

### Resume and version-only commands

- `npm run check` (macOS), `npm run check:linux` (Linux), and `npm run check:win` (Windows) run `check:portable`, package the build via `package-built:*`, and run `package:verify`.
- Standalone `npm run package:mac`, `npm run package:linux`, `npm run package:win` (Windows ARM64), and `npm run package:win:x64` (Windows x64) run `npm run build` and package the installer without running the test suite.
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

Build and verify each Windows architecture natively on a host of that architecture. An explicitly maintainer-approved x64 build may instead use x64 Node and Electron under Windows ARM64 emulation (ADR 0034); record that distinction and pending native qualification in the release notes. `check:win` picks `package-built:win` (ARM64) or `package-built:win:x64` (x64) from Node's process architecture. The x64 installer is `OMXTerm-<version>-x64.exe`; the x64 unpacked directory is `release/win-unpacked`.

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

## Publication

Create tag `vX.Y.Z` and a draft GitHub Release in `luizomf/omxterm`. Upload every applicable file (ten when Windows x64 is released), download and verify the complete set against local byte counts and SHA-256 records, then publish to seal the immutable release:

- `OMXTerm-<version>-arm64.dmg` and `OMXTerm-<version>-arm64.dmg.sha256`
- `OMXTerm-<version>-arm64.AppImage` and `OMXTerm-<version>-arm64.AppImage.sha256`
- `linux_install.sh` and `linux_install.sh.sha256`
- `OMXTerm-<version>-arm64.exe` and `OMXTerm-<version>-arm64.exe.sha256`
- `OMXTerm-<version>-x64.exe` and `OMXTerm-<version>-x64.exe.sha256` (Windows x64)

Include release notes covering new features, bug fixes, any configuration changes, SHA-256 checksums, and first-launch Gatekeeper/SmartScreen notes:

- **macOS Gatekeeper:** OMXTerm uses an ad-hoc signature without Apple Developer ID signing or notarization. Verify the SHA-256 checksum and use **System Settings → Privacy & Security → Open Anyway** on first launch.
- **Windows SmartScreen:** OMXTerm for Windows ARM64 and x64 is unsigned. Verify the SHA-256 checksum and choose **More info → Run anyway** on first launch.
