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
**[Customize](docs/configuration.md)** · **[Get help](#help-improve-omxterm)**

## Platforms and downloads

**Latest release: [0.20.1 — downloads and release notes](https://github.com/luizomf/omxterm/releases/tag/v0.20.1)**

Downloads are **ARM64 only**. Check your processor in **About This Mac**, with
`uname -m` on Linux (`aarch64`), or under **Settings → System → About** on Windows
(ARM-based processor). x64/Intel builds are not available yet.

| Platform                                 | Download                                                                                               | Checksum                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Apple Silicon macOS                      | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.20.1/OMXTerm-0.20.1-arm64.dmg)           | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.1/OMXTerm-0.20.1-arm64.dmg.sha256)      |
| Linux ARM64                              | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.20.1/OMXTerm-0.20.1-arm64.AppImage) | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.1/OMXTerm-0.20.1-arm64.AppImage.sha256) |
| Linux application-menu helper (optional) | [linux_install.sh](https://github.com/luizomf/omxterm/releases/download/v0.20.1/linux_install.sh)      | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.1/linux_install.sh.sha256)              |
| Windows ARM64                            | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.20.1/OMXTerm-0.20.1-arm64.exe)     | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.20.1/OMXTerm-0.20.1-arm64.exe.sha256)      |

Linux needs **glibc 2.42+** and X11/XWayland; Ubuntu 24.04 is too old for this
AppImage. macOS and Windows may show an unknown-developer warning because the
packages have no verified publisher signature. The installation guide walks you
through verification and first launch.

### Exercised desktops

All rows below are **ARM64**. Automated results cover `check:portable` (tests and
unpackaged build), **not release/package qualification**. Baseline source:
[`96ef089`](https://github.com/luizomf/omxterm/commit/96ef08933a987fad12ed2461f973985aa1902c04).
Later main adds failure-only fixture diagnostics; the full matrix was not rerun.
Detailed evidence and retained failures: [#586](https://github.com/luizomf/omxterm/issues/586).

| OS                      | Desktop          | Automated baseline result                                                                                      |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Ubuntu 26.04.1          | GNOME 50.1       | Prepared + CLEAN-restored: **PASS**                                                                            |
| Fedora 44               | KDE Plasma 6.7.5 | Prepared + CLEAN-restored: **PASS**                                                                            |
| Omarchy                 | Hyprland 0.56.2  | Prepared + CLEAN-restored: **PASS**                                                                            |
| macOS 27.0.1            | macOS desktop    | Prepared + maintainer-recreated: **PASS**; earlier CLEAN incomplete **FAIL**                                   |
| Windows 11, build 26200 | Windows desktop  | Maintainer-reported CLEAN: **PASS**; prepared **FAIL** ([#605](https://github.com/luizomf/omxterm/issues/605)) |

macOS/Windows later passes have retained test reports and verified baseline source;
final builds and recreation/restoration provenance are maintainer-reported, not a
controlled clean pair. The earlier macOS GPU-hang trigger and Windows
publication-failure cause remain unknown; later passes do not erase those failures.

Additional maintainer-reported checks: setup, `check:portable`, dev,
package/install, configuration, themes and keybinds. Exact source SHA unrecorded:

| OS                   | Desktop                | Maintainer-reported result |
| -------------------- | ---------------------- | -------------------------- |
| Debian 13.4 (Trixie) | KDE Plasma 6 / Wayland | **PASS**                   |
| Fedora 44            | GNOME Shell 50.5       | **PASS**                   |

For downloads, use the [published release above](#platforms-and-downloads), not
the development validation baseline. See [test scope and precautions](docs/development.md#running-native-tests).

## Installation

Download the package and checksum for your system, then follow its guide:

- [macOS](docs/installation.md#macos): verify the DMG, drag OMXTerm to
  Applications, and follow the first-open instructions.
- [Linux](docs/installation.md#linux): verify and run the AppImage. The optional
  helper adds it to your application menu.
- [Windows](docs/installation.md#windows): install the required ARM64 Microsoft
  runtime, verify the installer, and follow the SmartScreen instructions.

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

OMXTerm creates settings, a sample snippet, and a theme on first launch.
[Change one setting](docs/configuration.md#add-one-display-change), or use a
complete setup for [macOS](docs/quick-start/macos.md#complete-ready-to-use-setup-optional),
[Linux](docs/quick-start/linux.md#complete-ready-to-use-setup-optional), or
[Windows / Git Bash](docs/quick-start/windows.md#complete-ready-to-use-setup-optional).
The setup guides include files, destinations, and reload steps. Back up your
preferences before replacing them; shell and Vim settings are optional.

You can also edit settings and themes in
[OMXTerm Studio](https://luizomf.github.io/omxterm-studio/), then
[apply the files](docs/configuration.md#edit-visually-with-omxterm-studio).
[Everyday use](docs/usage.md) covers shortcuts, images, paste, troubleshooting,
and current limitations.

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
documentation fixes, and code contributions are all welcome, especially reports
from Linux and Windows users.

See [Contributing](CONTRIBUTING.md) to get involved, including efforts to add
[Linux x64](https://github.com/luizomf/omxterm/issues/223) and
[Windows x64](https://github.com/luizomf/omxterm/issues/224).
The [documentation map](docs/README.md) has the full guide and developer references.

## License

[MIT](LICENSE). Thanks to Restty, Ghostty, and the other open-source projects
that make OMXTerm possible. See [Third-Party Notices](THIRD_PARTY_NOTICES.md)
for bundled components.
