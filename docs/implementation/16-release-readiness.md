# Release readiness: architectures, formats and verification

Engineering record for x64 + ARM64 packaging and the Linux DEB, RPM and Arch
packages. User steps live in [`installation.md`](../installation.md); the
maintainer procedure lives in [`release.md`](../release.md).

## Formats and architectures

| Platform | ARM64                                           | x64                                             | Signing                                                  |
| -------- | ----------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| macOS    | DMG `-arm64.dmg`                                | DMG `-x64.dmg`                                  | ad-hoc only (identity `-`), no Developer ID, unnotarized |
| Linux    | `-arm64.AppImage`, `-arm64.deb`, `-aarch64.rpm` | `-x86_64.AppImage`, `-amd64.deb`, `-x86_64.rpm` | unsigned (no AppImage signature, no GPG)                 |
| Linux    | `linux_install.sh` (architecture-independent)   | same file                                       | unsigned                                                 |
| Arch     | `packaging/arch/PKGBUILD` builds `aarch64`      | builds `x86_64`                                 | local build, not published to the AUR                    |
| Windows  | NSIS `-arm64.exe`                               | NSIS `-x64.exe`                                 | unsigned                                                 |

Names come from the pinned electron-builder (26.15.3) for
`artifactName: ${productName}-${version}-${arch}.${ext}`; it maps x64 to
`x86_64` (AppImage, RPM) and `amd64` (DEB), and ARM64 to `aarch64` (RPM).
`test/unit/linux-package-assets.test.ts` pins this against the packager.

## Architecture selection

- `scripts/package.mjs <mac|linux|win>` (the `package-built:*` scripts) packages
  `process.arch` only (`arm64` or `x64`, anything else fails) and keeps
  `--publish never`. Native inputs are host-built: node-pty's exec-status
  `pty.node` (Linux `build/Release`, macOS `prebuilds/darwin-<arch>`), the macOS
  blur addon, and the selected Windows prebuild. Nothing is cross-compiled.
- `electron-builder.yml` uses `${arch}` in file patterns:
  `!node_modules/node-pty/prebuilds/!(darwin-${arch})/**` (macOS),
  `!(win32-${arch})` plus `win32-${arch}/*.pdb` (Windows), and `${arch}` in
  `asarUnpack`. Linux excludes all prebuilds. Targets carry no arch list, so a
  bare electron-builder run also defaults to the host architecture.
  `test/unit/packaging-file-patterns.test.ts` runs the packager's own matchers
  for both architectures.
- Linux runs electron-builder twice: AppImage first, then DEB and RPM with
  `--prepackaged release/linux[-arm64]-unpacked`, so all three carry the same
  application and DEB/RPM packaging resources never enter the AppImage.

## Linux DEB/RPM decisions

- ADR 0024 requires `--no-sandbox` **before Electron bootstrap**
  (`src/main/chromium-sandbox-policy.ts`: app main is too late). The packager's
  default `/usr/bin` symlink would start Electron without it, and its default
  post-install script makes `chrome-sandbox` setuid root when user namespaces
  are unavailable and installs an AppArmor user-namespace profile. Instead:
  `/usr/bin/omxterm` is a packaged script (`packaging/linux/omxterm`) that execs
  `/opt/OMXTerm/omxterm --no-sandbox "$@"`; the desktop entry's `Exec` passes
  `--no-sandbox` (`executableArgs`); `packaging/linux/after-install.tpl` and
  `after-remove.tpl` only refresh the desktop database. X11 relaunch (ADR 0020)
  reuses `process.execPath` and argv, so the flag survives it.
- `beforePack` (`prepare-linux-launcher.mjs`) only guards the AppImage
  generator; DEB/RPM do not use AppRun. The Arch package installs its own
  `/usr/bin/omxterm` wrapper with the same flag.
- Dependencies: electron-builder's defaults plus `fontconfig` (OMXTerm runs
  `/usr/bin/fc-match`). DEB recommends `openssh-client`; RPM adds a
  `Recommends: openssh-clients` weak dependency and owns `/opt/OMXTerm`.
- `linux.publish: null`: without it the packager derived GitHub update
  metadata from the checkout's git remote and wrote `app-update.yml` (and a
  racy `package-type`) into the unpacked application. This also removes the
  previously embedded `app-update.yml` from the AppImage. OMXTerm has no
  automatic updates. macOS and Windows are unchanged and may still embed it when
  built from a GitHub checkout.
- The packager still copies an unused `resources/apparmor-profile` into DEB/RPM
  payloads; it is never installed. Electron's `chrome-sandbox` ships as a
  normal 0755 file.
- `homepage` was added to `package.json`: DEB/RPM require a project URL, which
  otherwise came from the local git remote (a fork's URL on a fork).
- Maintainer field is `Luiz Otávio Miranda` without an e-mail address
  (`package.json` has none). Debian policy expects one; the maintainer decides.

## Checksums

Each packaging run writes `<artifact>.sha256` for every artifact and
`SHA256SUMS-<mac|linux|win>-<arch>.txt`. The CI job re-checks the list.

## Verification

`package:verify` (`scripts/verify-packaged-app.mjs`) takes the host
architecture and keeps every previous check. Machine checks accept only the
expected architecture: Mach-O (`file -b`, the other architecture and universal
binaries rejected), ELF, and PE (`0xAA64` ARM64, `0x8664` x64). New checks:

- Linux: every ELF in the extracted AppImage, DEB and RPM must match the host
  architecture and no Mach-O or PE file may ship; no updater metadata.
- DEB/RPM (`scripts/verify-linux-packages.mjs`): checksum record; package name,
  version (`0.20.3~dev.0` style) and architecture; `fontconfig` dependency and
  OpenSSH recommendation; no setuid/setgid entry; reviewed maintainer scripts
  only; only `/opt/OMXTerm`, `/usr/bin/omxterm`, the desktop entry, the icon and
  the Debian changelog; launcher, icon, licenses, `app.asar` entries and
  version; `app.asar` and `pty.node` byte-identical to the AppImage's.
- `--static-only` runs every content check without launching the app or the
  Windows installer and reports `STATIC ONLY`.

### What was verified, where

| Target                               | Evidence                                                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux x64 (Manjaro host, glibc 2.44) | `npm run package:linux`; `APPIMAGELAUNCHER_DISABLE=1 npm run package:verify`: FULL (helper install, direct and extract-and-run startup) plus DEB and RPM content checks; `sha256sum --check SHA256SUMS-linux-x64.txt` |
| Arch x64 (same host)                 | `makepkg --nodeps` with `BUILDDIR` outside the tree, no install: package built; tree checked for x64-only ELF files, `app.asar` entries, licenses, no updater metadata; `namcap` reviewed                             |
| Linux ARM64                          | CI `package` job only (no run yet)                                                                                                                                                                                    |
| macOS ARM64 and x64                  | CI `package` job: build, `--static-only`, `hdiutil verify` (no run yet). Startup on a desktop not verified                                                                                                            |
| Windows ARM64 and x64                | CI `package` job: build, `--static-only` (no run yet). Startup and exact NSIS installation not verified (ADR 0023)                                                                                                    |

The x64 artifacts built on the Manjaro host are 127.6 MB (AppImage), 108.0 MB
(DEB) and 94.0 MB (RPM).

Not verified anywhere yet: installing the DEB or RPM with `apt`/`dnf` on a
real Debian/Ubuntu/Fedora system, the Arch package with `pacman -U`, and any
macOS, Windows or ARM64 package. The glibc floor follows the build host: the
Manjaro-built `pty.node` needs `GLIBC_2.42`, while packages built on the
`ubuntu-24.04` runners need at most glibc 2.39.

Host note: AppImageLauncher (`binfmt_misc`) intercepts AppImage execution and
can move the AppImage into its own folder; run verification with
`APPIMAGELAUNCHER_DISABLE=1`.
