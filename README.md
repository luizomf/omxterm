# OMXTerm

OMXTerm is an open-source desktop terminal you can make your own. Open a few tabs,
choose your colors and shortcuts, and get to work. Available for **Apple Silicon
macOS, Linux ARM64, and Windows ARM64**.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

- **Ready to use:** your local shell, bundled Nerd Fonts, and programming ligatures.
- **Make it yours:** themes, fonts, keyboard shortcuts, and reusable text snippets.
- **Room for your work:** tabs, windows, hideable title and tab bars, optional
  background transparency and blur.
- **Everyday conveniences:** drag files to insert their paths, preview local images,
  and use [Protected Paste](docs/usage.md#protected-paste) in apps that need it.

Built with [Restty](https://github.com/wiedymi/restty) and
[Ghostty](https://github.com/ghostty-org/ghostty). Run your usual command-line tools,
SSH clients, and coding agents inside it.

**[Install](#installation)** · **[First session](#first-session)** ·
**[Customize](docs/configuration.md)** · **[Get help](#help-improve-omxterm)**

## Platforms and downloads

**Latest release: [0.18.0](https://github.com/luizomf/omxterm/releases/tag/v0.18.0)**
— [what changed](docs/releases/0.18.0.md).

Downloads are **ARM64 only**. Check your processor in **About This Mac**, with
`uname -m` on Linux (`aarch64`), or under **Settings → System → About** on Windows
(ARM-based processor). x64/Intel builds are not available yet.

| Platform                                 | Download                                                                                               | Checksum                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Apple Silicon macOS                      | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.dmg)           | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.dmg.sha256)      |
| Linux ARM64                              | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.AppImage) | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.AppImage.sha256) |
| Linux application-menu helper (optional) | [linux_install.sh](https://github.com/luizomf/omxterm/releases/download/v0.18.0/linux_install.sh)      | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.18.0/linux_install.sh.sha256)              |
| Windows ARM64                            | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.exe)     | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.exe.sha256)      |

Linux needs **glibc 2.42+** and X11/XWayland; Ubuntu 24.04 is too old for this
AppImage. macOS and Windows may show an unknown-developer warning because the
packages have no verified publisher signature. The installation guide walks you
through verification and first launch.

## Installation

Download the package and checksum for your system, then follow its guide:

### macOS

[Verify the download and install →](docs/installation.md#macos)
Drag OMXTerm to Applications; the guide also explains macOS's first-open warning.

### Linux

[Verify and run the AppImage →](docs/installation.md#linux)
Optionally add OMXTerm to your application menu with the desktop helper.

### Windows

[Verify and run the installer →](docs/installation.md#windows)
The guide includes the required ARM64 Microsoft runtime and SmartScreen steps.

## First session

Open OMXTerm and you're ready: it starts your shell in your home folder. The
**shell** is the program that reads your commands, such as Zsh, Bash, or
PowerShell. Try `pwd` and press Enter to see your current folder.

| Action             | macOS             | Linux and Windows   |
| ------------------ | ----------------- | ------------------- |
| New tab            | `Cmd+T`           | `Ctrl+Shift+T`      |
| Copy selected text | `Cmd+C`           | `Ctrl+Shift+C`      |
| Paste              | `Cmd+V`           | `Ctrl+Shift+V`      |
| Zoom in / out      | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |

For `+`, include Shift if your keyboard needs it to type that symbol.
**Ctrl+C interrupts a running command.** On Linux and Windows, press and release
**Alt alone** to open the app menu; on macOS, use the menu bar.

Each tab is a separate session. Closing it ends its work; use a tool such as tmux
if you need sessions that survive closing the terminal.

### Make it yours

OMXTerm creates editable settings, a sample snippet, and a theme on first launch.
Start with one change or try a complete example:

- [Change your first setting](docs/configuration.md) — fonts, colors, shortcuts,
  and more.
- Ready-to-use setups: [macOS](docs/quick-start/macos.md),
  [Linux](docs/quick-start/linux.md), [Windows](docs/quick-start/windows.md).
- [OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) — edit settings and
  themes visually, then [apply your files](docs/configuration.md#edit-visually-with-omxterm-studio).
- [Everyday use](docs/usage.md) — all shortcuts, images, paste, and troubleshooting.

## Updating or uninstalling

Updates are manual: download and verify the new release, quit OMXTerm, then
replace the app. [Platform-specific update and uninstall steps →](docs/installation.md#updating-or-uninstalling)
Your settings are kept when you uninstall.

## Privacy and security

OMXTerm sends no telemetry or other network requests. Local diagnostic logs leave
out your terminal contents, commands, and clipboard. Programs you run inside it
have their usual filesystem and network access.

On Linux, OMXTerm runs **without the Chromium sandbox**, an extra security
isolation layer. [Linux launch policy](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).
Report vulnerabilities privately through the [security policy](SECURITY.md).

## Help improve OMXTerm

Found a confusing instruction or something that doesn't work?
[Tell us about it](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md).
Your version, system, and what happened are enough to start. Everyday feedback,
documentation fixes, and code contributions are all welcome — especially reports
from Linux and Windows users.

See [Contributing](CONTRIBUTING.md) to get involved, including efforts to add
[Linux x64](https://github.com/luizomf/omxterm/issues/223) and
[Windows x64](https://github.com/luizomf/omxterm/issues/224).
The [documentation map](docs/README.md) has the full guide and developer references.

## License

[MIT](LICENSE). Thanks to Restty, Ghostty, and the other open-source projects
that make OMXTerm possible. See [Third-Party Notices](THIRD_PARTY_NOTICES.md)
for bundled components.
