# <img src="docs/images/omxterm-hero.png" alt="" width="48" /> OMXTerm

OMXTerm is an open-source desktop terminal you can make your own. Open a few tabs,
choose your colors and shortcuts, and get to work. Available for **Apple Silicon
macOS, Linux ARM64, and Windows ARM64**.

![OMXTerm on macOS with colorful fastfetch output and a blurred desktop behind the terminal](docs/images/macos.webp)

_macOS, with background transparency and blur._

<details>
<summary>More screenshots: macOS, Windows, and Linux</summary>

**macOS — tabs and snippets**

![OMXTerm on macOS with two tabs, fastfetch output, and the snippets sidebar](docs/images/macos-background.webp)

**Fedora KDE Plasma**

![OMXTerm on Fedora KDE Plasma with two tabs, a transparent background, and fastfetch system information](docs/images/fedora-kde.webp)

**Windows**

![OMXTerm on Windows with PowerShell, two tabs, and a blurred background](docs/images/windows.webp)

**Ubuntu GNOME**

![OMXTerm on Ubuntu GNOME with overlapping terminal windows showing fastfetch and a shell](docs/images/ubuntu-gnome.webp)

**Omarchy / Hyprland**

![OMXTerm on Omarchy with tiled windows showing LazyVim, btop, and a shell](docs/images/omarchy-hyprland.webp)

These setups use custom shell and desktop preferences. The tiled windows in the
Omarchy screenshot are arranged by Hyprland.

</details>

- **Ready to use:** your local shell, bundled Nerd Fonts, and programming ligatures.
- **Make it yours:** themes, fonts, keyboard shortcuts, and reusable text snippets.
- **Room for your work:** tabs, windows, hideable title and tab bars, optional
  background transparency and blur.
- **Everyday conveniences:** drag files to insert their paths, preview local images,
  and use [Protected Paste](docs/usage.md#protected-paste) in apps that need it.

Built with [Restty](https://github.com/wiedymi/restty) and
[Ghostty](https://github.com/ghostty-org/ghostty), it runs your usual command-line
tools, SSH clients, and coding agents.

**[Install](#installation)** · **[First session](#first-session)** ·
**[Customize](docs/configuration.md)** · **[How it works](docs/how-it-works.md)** ·
**[Get help](#help-improve-omxterm)**

## Platforms and downloads

**Latest release: [0.20.2 — downloads and release notes](https://github.com/luizomf/omxterm/releases/tag/v0.20.2)**

Downloads are **ARM64 only**. Check your processor in **About This Mac**, with
`uname -m` on Linux (`aarch64`), or under **Settings → System → About** on Windows
(ARM-based processor). x64/Intel builds are not available yet.

| Platform                                 | Download                                                                                               | Checksum                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Apple Silicon macOS                      | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.20.2/OMXTerm-0.20.2-arm64.dmg)           | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.2/OMXTerm-0.20.2-arm64.dmg.sha256)      |
| Linux ARM64                              | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.20.2/OMXTerm-0.20.2-arm64.AppImage) | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.2/OMXTerm-0.20.2-arm64.AppImage.sha256) |
| Linux application-menu helper (optional) | [linux_install.sh](https://github.com/luizomf/omxterm/releases/download/v0.20.2/linux_install.sh)      | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.2/linux_install.sh.sha256)              |
| Windows ARM64                            | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.20.2/OMXTerm-0.20.2-arm64.exe)     | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.2/OMXTerm-0.20.2-arm64.exe.sha256)      |

Linux requires **glibc 2.42+** and X11/XWayland (Fedora, Arch, Ubuntu 25+; note that Ubuntu 24.04 LTS includes an older glibc). macOS and Windows provide standard first-launch approvals as described in the [installation guide](docs/installation.md).

<a id="exercised-desktops"></a>

### Tested desktops

OMXTerm is tested on Apple Silicon macOS, Windows 11 ARM64, and Linux ARM64 environments including Fedora (GNOME/KDE), Debian, and Omarchy/Hyprland.

## Installation

Download the package for your system and follow the quick guide:

- [macOS](docs/installation.md#macos): open the DMG, drag OMXTerm to Applications, and launch.
- [Linux](docs/installation.md#linux): make the AppImage executable and run it, or use the optional helper to add it to your app menu.
- [Windows](docs/installation.md#windows): run the installer and open OMXTerm from Start.

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

Each tab runs an independent session, letting you organize different tasks side by side.

### Make it yours

OMXTerm creates settings, a sample snippet, and a theme on first launch when no
configuration exists. Keep those defaults, [change one setting](docs/configuration.md#add-one-display-change),
or use [OMXTerm Studio](docs/configuration.md#edit-visually-with-omxterm-studio)
to edit settings and themes visually, export them, and reload in OMXTerm.
[Everyday use](docs/usage.md) covers shortcuts, images, paste, and tips.

## Updating or uninstalling

Updates are simple: download the new release, quit OMXTerm, and
replace the app. [Platform-specific update and uninstall steps →](docs/installation.md#updating-or-uninstalling)
Your custom settings and themes are always preserved.

## Privacy and security

OMXTerm sends no telemetry or network requests. Local diagnostic logs keep
your terminal contents, commands, and clipboard completely private. Programs you run inside it
have their usual filesystem and network access. Report vulnerabilities privately through the [security policy](SECURITY.md).

## Help improve OMXTerm

Found a confusing instruction or something that doesn't work?
[Tell us about it](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md).
Your version, system, and what happened are enough to start. Everyday feedback,
documentation fixes, and code contributions are all welcome, especially reports
from Linux and Windows users.

See [Contributing](CONTRIBUTING.md) to get involved, including efforts to add
[Linux x64](https://github.com/luizomf/omxterm/issues/223) and
[Windows x64](https://github.com/luizomf/omxterm/issues/224).
The [documentation map](docs/README.md) separates user guides, contribution
instructions, shared technical references, and maintainer procedures.

## License

[MIT](LICENSE). Thanks to Restty, Ghostty, and the other open-source projects
that make OMXTerm possible. See [Third-Party Notices](THIRD_PARTY_NOTICES.md)
for bundled components.
