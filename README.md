# OMXTerm

OMXTerm is an open-source desktop terminal for Apple Silicon macOS, Linux ARM64,
and Windows ARM64. Work across tabs and windows, and customize fonts, themes,
keyboard shortcuts, and snippets.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

Built with [Restty](https://github.com/wiedymi/restty) and its pinned
[Ghostty](https://github.com/ghostty-org/ghostty) core, OMXTerm includes bundled
Nerd Fonts, programming ligatures, Protected Paste, drag-and-drop file paths,
local PNG/JPEG previews, and inline images in direct Pi/Chafa sessions.

**Start here:** [Install](#installation) → [Use](docs/usage.md) →
[Customize](docs/configuration.md).

## Platforms and downloads

The latest published release is **0.15.1**. These docs follow the
**0.15.2-dev.0** source tree; [release notes](docs/releases/0.15.1.md) record
the published package identities and verification.

OMXTerm requires **ARM64** and a working **WebGL2** graphics backend. Intel
macOS, x64 builds, and software rendering are not supported.

| Platform                        | Package                                                                                                                 | SHA-256                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Apple Silicon macOS             | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.dmg)                            | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.dmg.sha256)                   |
| Linux ARM64                     | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.AppImage)                  | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.AppImage.sha256)              |
| Linux desktop helper (optional) | [Shell helper](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.AppImage-installer.sh) | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.AppImage-installer.sh.sha256) |
| Windows ARM64                   | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.exe)                      | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.15.1/OMXTerm-0.15.1-arm64.exe.sha256)                   |

The repository is currently private; downloads require a GitHub account with
repository access.

## Installation

Download your package and its `.sha256` file into the same directory. Open a
terminal in that directory and follow your platform's steps. Stop if checksum
verification fails. Checksums detect changed downloads, but do not establish
publisher identity; the packages are unsigned.

### macOS

1. Verify the DMG:

   ```sh
   shasum -a 256 -c OMXTerm-0.15.1-arm64.dmg.sha256
   ```

2. Open the DMG, drag **OMXTerm.app** to **Applications**, and eject the DMG.
3. Launch OMXTerm from Applications.

The app has an ad-hoc integrity seal, but no Apple Developer ID signature or
notarization. If macOS blocks it and you trust the verified package, follow
Apple's [Open Anyway instructions](https://support.apple.com/102445) in
**System Settings → Privacy & Security**. Keep system-wide protections enabled.

Replacing a build may require renewed macOS privacy approval. Ordinary terminal
use does not require Full Disk Access; approve only access your work needs.

### Linux

You need `fontconfig` and X11, or XWayland on a Wayland desktop. The optional
desktop helper also needs `file`. On Ubuntu/Debian:

```sh
sudo apt install fontconfig file
```

Verify the AppImage and launch it:

```sh
sha256sum --check OMXTerm-0.15.1-arm64.AppImage.sha256 &&
  chmod +x OMXTerm-0.15.1-arm64.AppImage &&
  ./OMXTerm-0.15.1-arm64.AppImage
```

If FUSE mounting is unavailable, launch the verified file in extraction mode:

```sh
./OMXTerm-0.15.1-arm64.AppImage --appimage-extract-and-run
```

**Linux runs without the Chromium sandbox**, in both launch modes and through
the desktop helper. Context isolation remains enabled but is not a replacement
for that sandbox. Run as an ordinary user, not with `sudo`.
[Why this policy exists](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).

#### Add to the application menu

Download the optional helper and its checksum beside the AppImage, then run:

```sh
sha256sum --check OMXTerm-0.15.1-arm64.AppImage.sha256 &&
  sha256sum --check OMXTerm-0.15.1-arm64.AppImage-installer.sh.sha256 &&
  chmod +x OMXTerm-0.15.1-arm64.AppImage OMXTerm-0.15.1-arm64.AppImage-installer.sh &&
  ./OMXTerm-0.15.1-arm64.AppImage-installer.sh install ./OMXTerm-0.15.1-arm64.AppImage
```

Launch **OMXTerm** from your application menu. The helper installs for your user
only and chooses the appropriate FUSE or extraction launch mode. It does not
need `sudo` or download anything.

### Windows

1. Install the [Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
   if it is missing.
2. In PowerShell, verify the installer:

   ```powershell
   $installerName = "OMXTerm-0.15.1-arm64.exe"
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

3. Run **OMXTerm-0.15.1-arm64.exe**. It installs for your user without
   administrator elevation.

The installer is unsigned. If SmartScreen warns about an unknown publisher and
you trust the verified package, use **More info → Run anyway** for that file.
Keep SmartScreen enabled.

Windows PowerShell is the default shell. You can [select another installed
shell](docs/configuration.md#choose-the-windows-default-shell), including Git Bash.

## First session

Launch OMXTerm to open your default shell in your home directory. Each tab runs
an independent session; closing it ends that session. Use a tool such as tmux
for work that needs to survive closing the terminal.

| Action        | macOS             | Linux and Windows   |
| ------------- | ----------------- | ------------------- |
| New tab       | `Cmd+T`           | `Ctrl+Shift+T`      |
| Copy          | `Cmd+C`           | `Ctrl+Shift+C`      |
| Paste         | `Cmd+V`           | `Ctrl+Shift+V`      |
| Zoom in / out | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |

For `+`, include the Shift needed to type that symbol on your keyboard. On Linux
and Windows, press and release `Alt` to reveal the application menu.

On first opening, OMXTerm creates an editable configuration, a snippet example
and the default theme in your configuration directory. If `config.json` already
exists, it leaves the entire kit alone. No manual setup is required. When you
want more:

- [Everyday use](docs/usage.md) — all shortcuts, tabs, images, paste, and troubleshooting.
- Complete setup examples: [macOS](docs/quick-start/macos.md),
  [Linux](docs/quick-start/linux.md), [Windows](docs/quick-start/windows.md).
- [Configuration reference](docs/configuration.md) — individual settings, themes,
  keybinds, and snippets.
- [OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) — preview and edit
  themes, configuration, and keyboard shortcuts in your browser, then
  [apply the exported files](docs/configuration.md#edit-visually-with-omxterm-studio)
  in OMXTerm.

OMXTerm focuses on local terminal sessions. Run SSH clients and coding agents as
ordinary CLI tools inside it. Built-in splits, session restoration, AI assistance,
SSH brokering, shell integration, and automatic updates are not included.

## Privacy and security

OMXTerm sends no telemetry, analytics, crash reports, update checks, or remote
logs. Its bounded local logs exclude terminal input/output, clipboard data,
configuration contents, commands, and titles. Programs you launch retain their
normal filesystem and network access.

The renderer uses context isolation and disabled Node integration. Chromium
sandboxing is enabled on macOS and Windows, with the Linux exception described
above. The [product contract](docs/spec.md) documents the full boundaries.
Report vulnerabilities privately through the [security policy](SECURITY.md).

## Contributing and license

Bug reports, documentation improvements, and code contributions are welcome.
See [Contributing](CONTRIBUTING.md) for setup and checks, or the
[documentation map](docs/README.md) for development references.

OMXTerm is available under the [MIT License](LICENSE). Thanks to
[Restty](https://github.com/wiedymi/restty),
[Ghostty](https://github.com/ghostty-org/ghostty), and the other projects that
make it possible. Bundled components retain their terms in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
