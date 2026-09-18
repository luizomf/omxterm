# OMXTerm

OMXTerm is an open-source personal desktop terminal. Its Terminal Surface is
powered by [Restty](https://github.com/wiedymi/restty) and Restty's pinned
[Ghostty](https://github.com/ghostty-org/ghostty) core.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

The Supported Platforms are exactly:

- Apple Silicon macOS (ARM64), packaged as a DMG;
- Linux ARM64, packaged as an AppImage; and
- Windows ARM64, packaged as an NSIS installer.

x64, Intel macOS, and other operating-system/architecture pairs are deferred,
not current support commitments.

## Release status

### Current published release: 0.12.0 for macOS and Linux

The authenticated
[v0.12.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.12.0)
was published on 2026-09-18 at 23:51:24 UTC. The
[release record](docs/releases/0.12.0.md) describes the material changes,
migration, exact artifact identities, native verification, acceptance,
separate publication authorization, and post-publication download verification.

There is no Windows 0.12.0 candidate after its native gate failed; diagnosis is
deferred to [#310](https://github.com/luizomf/omxterm/issues/310). Windows ARM64
remains a Supported Platform, with the published 0.11.0 installer unchanged and
no 0.12.0 qualification or feature claim. Windows 0.11.0 does not include the
0.12.0 changes.

| Platform                      | Published package                                                                                                       | Checksum                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| macOS ARM64 (0.12.0)          | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.12.0/OMXTerm-0.12.0-arm64.dmg)                            | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.12.0/OMXTerm-0.12.0-arm64.dmg.sha256)                   |
| Linux ARM64 (0.12.0)          | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.12.0/OMXTerm-0.12.0-arm64.AppImage)                  | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.12.0/OMXTerm-0.12.0-arm64.AppImage.sha256)              |
| Linux desktop helper (0.12.0) | [Shell helper](https://github.com/luizomf/omxterm/releases/download/v0.12.0/OMXTerm-0.12.0-arm64.AppImage-installer.sh) | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.12.0/OMXTerm-0.12.0-arm64.AppImage-installer.sh.sha256) |
| Windows ARM64 (0.11.0)        | [NSIS installer](https://github.com/luizomf/omxterm/releases/download/v0.11.0/OMXTerm-0.11.0-arm64.exe)                 | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.11.0/OMXTerm-0.11.0-arm64.exe.sha256)                   |

The packages carry no verified publisher identity. The macOS 0.12.0 app has a
verified ad-hoc integrity seal, but no Apple Developer ID signature or
notarization. Previous release records remain immutable history.

### Publication visibility

The canonical GitHub repository remains **private**. The authenticated
[v0.12.0 GitHub Release](https://github.com/luizomf/omxterm/releases/tag/v0.12.0)
is the current canonical publication record. This documentation does not change
repository visibility. Post-publication asset verification used authenticated
downloads; unauthenticated access to GitHub release and issue links has not been
validated and is not claimed.

## Installation

The macOS and Linux commands below apply to 0.12.0. Windows remains visibly
versioned at 0.11.0. Keep each package and its matching `.sha256` file in the
same directory, verify the checksum before opening the package, and do not
install an artifact whose check fails.

### macOS

Verify the Apple Silicon DMG:

```sh
shasum -a 256 -c OMXTerm-0.12.0-arm64.dmg.sha256
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
sha256sum --check OMXTerm-0.12.0-arm64.AppImage.sha256
chmod +x OMXTerm-0.12.0-arm64.AppImage
./OMXTerm-0.12.0-arm64.AppImage
```

If kernel FUSE mounting is unavailable, use the supported fallback:

```sh
./OMXTerm-0.12.0-arm64.AppImage --appimage-extract-and-run
```

Linux needs the `fontconfig` utilities. OMXTerm defaults to X11, so Wayland
sessions must provide XWayland; native Wayland rendering is not claimed.

OMXTerm runs with `--no-sandbox` on Linux to avoid
startup incompatibilities in some environments. Context isolation and the
minimal preload bridge remain enabled, but do not replace the Chromium sandbox.
Sandboxed Linux support is outside the current maintenance scope; simple,
reproducible contributions are welcome. Run OMXTerm as an ordinary user;
no administrator sandbox setup is needed. See [the launch policy](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).

To add the verified AppImage to the desktop without administrator access,
ensure the helper's `file` command prerequisite is installed, then verify the
optional helper separately before running it:

```sh
sha256sum --check OMXTerm-0.12.0-arm64.AppImage.sha256
sha256sum --check OMXTerm-0.12.0-arm64.AppImage-installer.sh.sha256
chmod +x OMXTerm-0.12.0-arm64.AppImage OMXTerm-0.12.0-arm64.AppImage-installer.sh
./OMXTerm-0.12.0-arm64.AppImage-installer.sh install ./OMXTerm-0.12.0-arm64.AppImage
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
$installerName = "OMXTerm-0.11.0-arm64.exe"
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

Run `OMXTerm-0.11.0-arm64.exe`; it installs per-user without administrator
elevation. The unsigned installer may trigger a Microsoft Defender SmartScreen
unknown-publisher warning. Review the source and proceed only if you trust the
exact, checksum-verified artifact. If you choose to continue, SmartScreen's
`More info -> Run anyway` applies to that one file. Do not disable SmartScreen
or other system-wide Windows security protections.

## Quick start

Launch OMXTerm to open one Terminal Window and one Terminal Tab running the
Default Shell in your home directory. New tabs and windows run independent Live
Terminal Sessions; closing one terminates its session. The Terminal Surface
requires working WebGL2; there is no software or second-renderer fallback, and a
Surface initialization failure starts no shell.

- Learn tabs, controls, shortcuts, copy and paste, file-path insertion, and
  privacy-safe local logs in [Everyday OMXTerm use](docs/usage.md).
- OMXTerm works without configuration. To change defaults or add keybinds,
  Snippets, or an external Terminal Theme, follow the
  [User Configuration guide](docs/configuration.md).
- Browse user, contributor, contract, decision, and release documents in the
  [documentation map](docs/README.md).
- To build or contribute, use the single authoritative
  [contribution and development guide](CONTRIBUTING.md). The
  [Restty Terminal Surface guide](docs/restty-development.md) records its
  runtime, failure, resource-limit, and reproducible-source contracts.

## Scope, security, and privacy

The terminal is the product. AI assistance, SSH brokering, splits, saved or
reconnectable sessions, Shell Integration, automatic updates, and remote
terminal features are outside the current product contract.

Privileged capabilities stay in the Electron main process. The renderer uses
context isolation and no Node integration, and a minimal typed preload bridge
validates IPC. Chromium sandboxing remains enabled on macOS and Windows;
Linux uses the launch policy described above. Terminal Payload, clipboard data, configuration
contents, commands, arguments, titles, and transcripts are excluded from
Operational Events. OMXTerm itself makes no telemetry, analytics, crash-report,
update-check, or remote-log network requests; processes launched in a Live
Terminal Session retain their normal operating-system access.

Report suspected vulnerabilities through the private route in the
[security policy](SECURITY.md), which also defines the sensitive data that
reports must exclude.

The maintained [product contract](docs/spec.md) is authoritative for observable
behavior and boundaries. OMXTerm Web is a separate browser-based SSH broker,
not a variant or runtime dependency of OMXTerm.

## License and acknowledgements

OMXTerm source code is available under the [MIT License](LICENSE). Its Terminal
Surface is built with [Restty](https://github.com/wiedymi/restty) and Restty's
pinned [Ghostty](https://github.com/ghostty-org/ghostty) core. Bundled
third-party components retain their own terms as recorded in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
