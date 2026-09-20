# OMXTerm

OMXTerm is an open-source personal desktop terminal for Apple Silicon macOS,
Linux ARM64, and Windows ARM64. Open your shell, work across tabs and windows,
and make it your own with fonts, themes, keyboard shortcuts, and snippets.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

Built with [Restty](https://github.com/wiedymi/restty) and its pinned
[Ghostty](https://github.com/ghostty-org/ghostty) core, OMXTerm includes:

- independent shell sessions in tabs and windows;
- bundled Nerd Fonts, programming ligatures, and configurable colors;
- explicit copy and paste, with Protected Paste for multiline or control-character
  input when the receiving program has not enabled bracketed paste;
- file and folder path insertion by drag and drop;
- local PNG/JPEG previews and inline images from direct Pi/Chafa sessions.

OMXTerm is actively developed through everyday use, bug reports, and automated
checks on all three platforms. Version 0.12.2 fixes Neovim/TUI display corruption
after zoom and configuration reload. We keep improving the terminal as problems
surface; reproducible reports help us decide what to tackle next.

## Platforms and downloads

OMXTerm supports ARM64 on all three platforms below. Intel macOS and x64 builds
are not available. A working **WebGL2** graphics backend is required; there is no
software-rendering fallback.

Download [OMXTerm 0.12.2](https://github.com/luizomf/omxterm/releases/tag/v0.12.2)
for your platform below, along with its checksum file.

| Platform                        | 0.12.2 package                                                                                                          | SHA-256 checksum                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Apple Silicon macOS             | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.dmg)                            | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.dmg.sha256)                   |
| Linux ARM64                     | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.AppImage)                  | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.AppImage.sha256)              |
| Linux desktop helper (optional) | [Shell helper](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.AppImage-installer.sh) | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.AppImage-installer.sh.sha256) |
| Windows ARM64                   | [NSIS installer](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.exe)                 | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.12.2/OMXTerm-0.12.2-arm64.exe.sha256)                   |

The repository is currently private; GitHub downloads require an account with
repository access. See the [0.12.2 release notes and record](docs/releases/0.12.2.md)
for changes, compatibility, platform limitations, and verification details.

## Installation

Download the package and its matching `.sha256` file into the same directory.
Run the commands below from that directory, and stop if verification fails.
Checksums detect changed downloads; they do not establish publisher identity.
The packages are unsigned; the platform instructions below explain what to
expect when installing them.

### macOS

Verify the Apple Silicon DMG:

```sh
shasum -a 256 -c OMXTerm-0.12.2-arm64.dmg.sha256
```

After verification succeeds, open the DMG, drag `OMXTerm.app` to Applications,
eject the DMG, and launch the app from Applications.

The app has an ad-hoc integrity seal, but no Apple Developer ID signature or
notarization. macOS may warn that it cannot verify the developer or check for
malicious software. If you trust the verified package, follow Apple's
[Open Anyway instructions](https://support.apple.com/102445) in System Settings
-> Privacy & Security. Do not disable system-wide macOS security protections.

### Linux

Install the `fontconfig` utilities if needed. OMXTerm uses X11; Wayland sessions
need XWayland. Native Wayland rendering is not supported.

Verify the AppImage, make it executable, and run it:

```sh
sha256sum --check OMXTerm-0.12.2-arm64.AppImage.sha256 &&
  chmod +x OMXTerm-0.12.2-arm64.AppImage &&
  ./OMXTerm-0.12.2-arm64.AppImage
```

If kernel FUSE mounting is unavailable, run the verified AppImage with:

```sh
./OMXTerm-0.12.2-arm64.AppImage --appimage-extract-and-run
```

**Linux runs without the Chromium sandbox** (`--no-sandbox`) to avoid startup
incompatibilities. This applies to normal, extraction, and desktop-helper
launches. Context isolation and the minimal preload bridge remain enabled but
do not replace that sandbox. Run as an ordinary user; no administrator sandbox
setup is needed. See the [Linux launch policy](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).

To add OMXTerm to your desktop menu, install the `file` command if needed and
use the optional helper. Verify both downloads first:

```sh
sha256sum --check OMXTerm-0.12.2-arm64.AppImage.sha256 &&
  sha256sum --check OMXTerm-0.12.2-arm64.AppImage-installer.sh.sha256 &&
  chmod +x OMXTerm-0.12.2-arm64.AppImage OMXTerm-0.12.2-arm64.AppImage-installer.sh &&
  ./OMXTerm-0.12.2-arm64.AppImage-installer.sh install ./OMXTerm-0.12.2-arm64.AppImage
```

The helper installs the verified local files for your user only, without
additional downloads or system-wide changes. See the
[local installation details](docs/spec.md#configuration-and-local-state).

### Windows

Install the
[Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
if it is not already present. In PowerShell, verify the installer and confirm
that the checksum file names the same package:

```powershell
$installerName = "OMXTerm-0.12.2-arm64.exe"
$checksumRecord = Get-Content -LiteralPath "$installerName.sha256" -Raw -ErrorAction Stop
$checksumMatch = [regex]::Match(
  $checksumRecord,
  '\A(?<digest>[0-9A-Fa-f]{64})[ \t]+(?<filename>\*?\S+)(?:\r?\n)?\z'
)

if (-not $checksumMatch.Success) { throw "The checksum file is malformed." }
$recordedName = $checksumMatch.Groups['filename'].Value.TrimStart('*')
if ($recordedName -cne $installerName) { throw "The checksum names another installer." }
$expectedHash = $checksumMatch.Groups['digest'].Value
$actualHash = (Get-FileHash -LiteralPath $installerName -Algorithm SHA256 -ErrorAction Stop).Hash
if (-not [StringComparer]::OrdinalIgnoreCase.Equals($actualHash, $expectedHash)) {
  throw "SHA-256 verification failed."
}

Write-Host "SHA-256 verification succeeded for $installerName"
```

After verification succeeds, run `OMXTerm-0.12.2-arm64.exe`. It installs for your
user without administrator elevation.

The installer is unsigned, so Microsoft Defender SmartScreen may show an
unknown-publisher warning. If you trust the verified package, use
`More info -> Run anyway` for that file. Do not disable SmartScreen or other
system-wide Windows security protections.

## Everyday use

Launch OMXTerm to open your default shell in your home directory. Use
`File -> New Tab` or `File -> New Window` for another independent session.
Closing a tab ends its session; sessions are not saved or restored.

| Action        | macOS             | Linux and Windows   |
| ------------- | ----------------- | ------------------- |
| New tab       | `Cmd+T`           | `Ctrl+Shift+T`      |
| New window    | `Cmd+N`           | `Ctrl+Shift+N`      |
| Copy          | `Cmd+C`           | `Ctrl+Shift+C`      |
| Paste         | `Cmd+V`           | `Ctrl+Shift+V`      |
| Zoom in / out | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |

On Linux and Windows, press and release `Alt` to show the application menu.
OMXTerm works without configuration files. When you want to customize it:

- [Everyday OMXTerm use](docs/usage.md) covers tabs, shortcuts, paste, paths,
  links, images, and troubleshooting through local diagnostics.
- [User configuration](docs/configuration.md) walks through fonts, themes,
  keybinds, and reusable snippets.
- The [documentation map](docs/README.md) links to the rest of the guides.

OMXTerm focuses on local terminal sessions. Use your usual shells and CLI tools,
including SSH clients and coding agents, directly inside it. Built-in splits,
session restoration, AI assistance, SSH brokering, shell integration, and
automatic updates are outside the current feature set.

## Privacy and security

OMXTerm makes no telemetry, analytics, crash-report, update-check, or remote-log
network requests. Its bounded local operational logs exclude terminal input
and output, clipboard data, configuration contents, commands, arguments,
titles, and transcripts. Processes you launch keep their normal filesystem
and network access.

The renderer uses context isolation and disabled Node integration, with a
minimal typed bridge to the main process. Chromium sandboxing is enabled on
macOS and Windows; Linux uses the exception described above. For the complete
behavior and boundaries, see the [product contract](docs/spec.md).

Please report suspected vulnerabilities through the private route in the
[security policy](SECURITY.md), and leave sensitive data out of reports.

## Contributing

Contributions and practical bug reports are welcome. Start with the
[contribution and development guide](CONTRIBUTING.md) for setup and workflow.
The [Restty development guide](docs/restty-development.md) explains the terminal
renderer and its pinned dependencies.

## License and acknowledgements

OMXTerm source code is available under the [MIT License](LICENSE). Thanks to
[Restty](https://github.com/wiedymi/restty),
[Ghostty](https://github.com/ghostty-org/ghostty), and the other projects that
make it possible. Bundled components retain their own terms in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
