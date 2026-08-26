# OMXTerm

OMXTerm is an open-source personal desktop terminal.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

The Supported Platforms are exactly:

- Apple Silicon macOS (ARM64), packaged as a DMG;
- Linux ARM64, packaged as an AppImage; and
- Windows ARM64, packaged as an NSIS installer.

x64, Intel macOS, and other operating-system/architecture pairs are deferred,
not current support commitments.

## Current release

The current published release is **0.9.0**:

- [v0.9.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.9.0)
- [0.9.0 release notes](docs/releases/0.9.0.md)

The release notes record the exact filenames, byte sizes, SHA-256 identities,
changes, compatibility, native verification evidence, optional owner
observations, and known limitations. The exact eight published ARM64 assets are:

- `OMXTerm-0.9.0-arm64.dmg` and its `.sha256` record for macOS;
- `OMXTerm-0.9.0-arm64.AppImage`, its `.sha256` record,
  `OMXTerm-0.9.0-arm64.AppImage-installer.sh`, and the helper's `.sha256`
  record for Linux; and
- `OMXTerm-0.9.0-arm64.exe` and its `.sha256` record for Windows.

Otávio accepted these exact artifact identities after optional observations on
every Supported Platform. Those observations are factual non-automation,
non-reusable provenance, not a release gate for another artifact or version.
The packages are ARM64-only and carry no verified publisher identity. The macOS
app passed its complete ad-hoc integrity seal verification but has no Apple
Developer ID signature or notarization.

Earlier published releases remain immutable. The previous
[0.8.0 release notes](docs/releases/0.8.0.md) preserve that version's exact
identities and historical evidence.

### Publication visibility

The canonical GitHub repository remains **private**. The authenticated
[v0.9.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.9.0)
is the canonical published release record. This documentation does not change
repository visibility. Unauthenticated access to GitHub release and issue links
has not been validated and is not claimed.

## Installation

The commands below apply to the published 0.9.0 assets. Keep each package and
its matching `.sha256` file in the same directory, verify the checksum before
opening the package, and do not install an artifact whose check fails.

### macOS

Verify the Apple Silicon DMG:

```sh
shasum -a 256 -c OMXTerm-0.9.0-arm64.dmg.sha256
```

Open the DMG, drag `OMXTerm.app` to Applications, eject the DMG, and launch the
app from Applications.

Because OMXTerm has no Apple Developer ID signature and is not notarized, macOS
may warn that it cannot verify the developer or check the app for malicious
software. Review the source and proceed only if you trust the exact,
checksum-verified artifact. If you choose to open it, follow Apple's current
[Open Anyway instructions](https://support.apple.com/102445) in System Settings
-> Privacy & Security. Do not disable system-wide macOS security protections.

### Linux

Verify the unsigned AppImage, make it executable, and run it:

```sh
sha256sum --check OMXTerm-0.9.0-arm64.AppImage.sha256
chmod +x OMXTerm-0.9.0-arm64.AppImage
./OMXTerm-0.9.0-arm64.AppImage
```

If kernel FUSE mounting is unavailable, use the supported fallback:

```sh
./OMXTerm-0.9.0-arm64.AppImage --appimage-extract-and-run
```

Linux needs the `fontconfig` utilities. OMXTerm defaults to X11, so Wayland
sessions must provide XWayland; native Wayland rendering is not claimed.

To add the verified AppImage to the desktop without administrator access,
ensure the helper's `file` command prerequisite is installed, then verify the
optional helper separately before running it:

```sh
sha256sum --check OMXTerm-0.9.0-arm64.AppImage.sha256
sha256sum --check OMXTerm-0.9.0-arm64.AppImage-installer.sh.sha256
chmod +x OMXTerm-0.9.0-arm64.AppImage OMXTerm-0.9.0-arm64.AppImage-installer.sh
./OMXTerm-0.9.0-arm64.AppImage-installer.sh install ./OMXTerm-0.9.0-arm64.AppImage
```

The helper structurally validates the supplied local Linux ARM64 AppImage, but
does not authenticate a publisher or replace either checksum check. It uses
only the supplied local files and performs no download or system-wide
installation. See the
[product contract](docs/spec.md#configuration-and-local-state) for its ownership
and transaction guarantees.

### Windows

Install the
[Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
if it is not already present. Then verify that the checksum record names and
matches the exact NSIS installer:

```powershell
$installerName = "OMXTerm-0.9.0-arm64.exe"
$checksumRecord = Get-Content -LiteralPath "$installerName.sha256" -Raw
$checksumMatch = [regex]::Match(
  $checksumRecord,
  '\A(?<digest>[0-9A-Fa-f]{64})[ \t]+(?<filename>\*?\S+)(?:\r?\n)?\z'
)

if (-not $checksumMatch.Success) { throw "The checksum file is malformed." }
$recordedName = $checksumMatch.Groups['filename'].Value.TrimStart('*')
if ($recordedName -cne $installerName) { throw "The checksum names another installer." }
$expectedHash = $checksumMatch.Groups['digest'].Value
$actualHash = (Get-FileHash -LiteralPath $installerName -Algorithm SHA256).Hash
if (-not [StringComparer]::OrdinalIgnoreCase.Equals($actualHash, $expectedHash)) {
  throw "SHA-256 verification failed."
}

Write-Host "SHA-256 verification succeeded for $installerName"
```

Run `OMXTerm-0.9.0-arm64.exe`; it installs per-user without administrator
elevation. The unsigned installer may trigger a Microsoft Defender SmartScreen
unknown-publisher warning. Review the source and proceed only if you trust the
exact, checksum-verified artifact. If you choose to continue, SmartScreen's
`More info -> Run anyway` applies to that one file. Do not disable SmartScreen
or other system-wide Windows security protections.

## Quick start

Launch OMXTerm to open one Terminal Window and one Terminal Tab running the
Default Shell in your home directory. New tabs and windows run independent Live
Terminal Sessions; closing one terminates its session.

- Learn tabs, controls, shortcuts, copy and paste, file-path insertion, and
  privacy-safe local logs in [Everyday OMXTerm use](docs/usage.md).
- OMXTerm works without configuration. To change defaults or add keybinds,
  Snippets, or an external Terminal Theme, follow the
  [User Configuration guide](docs/configuration.md).
- Browse user, contributor, contract, decision, and release documents in the
  [documentation map](docs/README.md).
- To build or contribute, use the single authoritative
  [contribution and development guide](CONTRIBUTING.md).

## Scope, security, and privacy

The terminal is the product. AI assistance, SSH brokering, splits, saved or
reconnectable sessions, Shell Integration, automatic updates, and remote
terminal features are outside the current product contract.

Privileged capabilities stay in the Electron main process. The renderer remains
sandboxed with context isolation and no Node integration, and a minimal typed
preload bridge validates IPC. Terminal Payload, clipboard data, configuration
contents, commands, arguments, titles, and transcripts are excluded from
Operational Events. OMXTerm itself makes no telemetry, analytics, crash-report,
update-check, or remote-log network requests; processes launched in a Live
Terminal Session retain their normal operating-system access.

The maintained [product contract](docs/spec.md) is authoritative for observable
behavior and boundaries. OMXTerm Web is a separate browser-based SSH broker,
not a variant or runtime dependency of OMXTerm.

## License

OMXTerm source code is available under the [MIT License](LICENSE). Bundled
third-party components retain their own terms as recorded in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
