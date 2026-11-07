# <img src="docs/images/omxterm-hero.png" alt="" width="48" /> OMXTerm

OMXTerm is a fast, minimal, open-source desktop terminal you can make your own.
Open a few tabs, customize your theme and shortcuts, and get to work. Available
for **Apple Silicon macOS, Linux ARM64 or x64, and Windows ARM64 or x64**
(x64 downloads have build-only qualification; see below).

---

**Sponsor: Hostinger**

Need a VPS server (or any other hosting service)? Use my link and coupon code
for 10% discount:

- [hostinger.com/otaviomiranda](https://hostinger.com/otaviomiranda)
- Coupon: `OTAVIOMIRANDA`

---

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

- **Ready out of the box:** starts your local shell with bundled Nerd Fonts and
  programming ligatures.
- **Make it yours:** change fonts, preferences, and keyboard shortcuts in native
  [Settings](docs/configuration.md#settings), and customize theme files and
  reusable text snippets with the [configuration guide](docs/configuration.md).
- **Clean workspace:** tabs, multiple windows, hideable title and tab bars, and
  optional background transparency and blur.
- **Everyday conveniences:** drag files to insert quoted paths, click to preview
  local PNG/JPEG images, render inline Kitty images (Chafa and Pi), and use
  [Protected Paste](docs/usage.md#protected-paste).

Powered by [Restty](https://github.com/wiedymi/restty) and
[Ghostty](https://github.com/ghostty-org/ghostty)'s terminal core, OMXTerm works
great with your everyday CLI tools, TUI editors, SSH sessions, and coding
agents.

**[Install](#installation)** · **[First session](#first-session)** ·
**[Customize](docs/configuration.md)** · **[Everyday use](docs/usage.md)** ·
**[How it works](docs/how-it-works.md)** · **[Documentation](docs/README.md)**

## Platforms and downloads

### Choose your device

- **Mac with an M-series chip:** choose **Apple Silicon macOS**. Open the DMG,
  drag OMXTerm to Applications, and launch it. To check, choose Apple menu →
  **About This Mac** and look for an Apple M-series chip. There is no Intel Mac build.
- **Windows PC:** choose **Windows ARM64** for an ARM-based PC (such as one
  with Snapdragon), or **Windows x64** for an Intel/AMD PC. If unsure, check
  **Settings → System → About → System type** for an ARM-based or x64-based
  processor; a Surface can be either. Run the installer, then open OMXTerm
  from the Start menu.
- **Linux PC:** choose **Linux ARM64** for ARM or **Linux x64** for Intel/AMD.
  If unsure, open a terminal and run `uname -m`: `aarch64` means ARM64 and
  `x86_64` means x64. Other results have no matching download here. Make the
  AppImage executable and run it; see the [Linux steps](docs/installation.md#linux).

In the table, the DMG, installer, or AppImage is the application download.
The Linux helper is optional: it adds the app to your menu, but is not the app.
The `.sha256` files are for verifying downloads, not programs to run. See the
[installation guide](docs/installation.md) for requirements, verification and
first-launch security warnings.

This index lists the latest available stable application version for each target;
platforms can ship at different times. GitHub's global Latest is the legacy
[0.25.0 complete bundle](https://github.com/luizomf/omxterm/releases/tag/v0.25.0),
not this per-platform index. Both x64 packages have **build-only qualification**
from native hosted CI, not desktop, GPU, installer or ordinary-user integration
qualification. See each release's notes for actual coverage.

| Platform                 | App version | Download                                                                                                                                                                                                 | Checksum                                                                                                                                                                                                                      | Notes                                                                    |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Apple Silicon macOS      | 0.25.0      | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-arm64.dmg)                                                                                                             | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-arm64.dmg.sha256)                                                                                                                       | [Release notes](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) |
| Linux ARM64              | 0.25.0      | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-arm64.AppImage), [optional helper](https://github.com/luizomf/omxterm/releases/download/v0.25.0/linux_install.sh) | [AppImage SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-arm64.AppImage.sha256), [helper SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/linux_install.sh.sha256) | [Release notes](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) |
| Linux x64 (build-only)   | 0.25.0      | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-x64.AppImage), [optional helper](https://github.com/luizomf/omxterm/releases/download/v0.25.0/linux_install.sh)   | [AppImage SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-x64.AppImage.sha256), [helper SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/linux_install.sh.sha256)   | [Release notes](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) |
| Windows ARM64            | 0.25.0      | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-arm64.exe)                                                                                                       | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-arm64.exe.sha256)                                                                                                                       | [Release notes](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) |
| Windows x64 (build-only) | 0.25.0      | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-x64.exe)                                                                                                         | [SHA-256](https://github.com/luizomf/omxterm/releases/download/v0.25.0/OMXTerm-0.25.0-x64.exe.sha256)                                                                                                                         | [Release notes](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) |

Linux ARM64 requires **glibc 2.42+** and X11/XWayland (for example Fedora 43+,
Ubuntu 25.10+, or Arch). Linux x64 headless checks ran on Ubuntu 22.04 with
glibc 2.35; this is not a minimum-version or broad distro compatibility promise.
First-launch notes for macOS Gatekeeper and Windows SmartScreen are in the
[installation guide](docs/installation.md).

<a id="exercised-desktops"></a>

Linux and Windows x64 downloads come from manual native hosted CI lanes
([artifact delivery](docs/release.md#hosted-x64-build-only-artifact-delivery)).
Both load the packaged addon in the packaged Electron Run-as-Node runtime;
Linux additionally checks real headless PTY output/exit/resize. Windows inspects
the unpacked app, not NSIS execution or payload equivalence, and does not spawn
ConPTY. Desktop/GPU, installer and ordinary-user integration remain unverified;
Linux FUSE/helper installation and Windows 11/SmartScreen/UAC are also unverified.
These are not release gates for the build-only lanes.

## Installation

See the [device chooser](#choose-your-device) and follow the
[installation guide](docs/installation.md) for requirements and detailed steps.

### Optional Snippets

Stable **0.25.0** supports optional Snippets on Linux ARM64/x64, macOS ARM64
and Windows ARM64. Its bundled default is Snippets 0.1.0; the official catalog
offers 0.1.1.
New packaged profiles try to install the
[removable default](docs/default-snippets.md) once, ready to open but inactive at
startup. Existing profiles still choose installation; your YAML and disabled or
removed choices stay intact. Windows x64 retains built-in Snippets.

[Snippets 0.1.1](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.1)
is a separate non-Latest patch that fixes catalog home resolution. Install or
update deliberately through **Settings → Extensions → Browse official extensions**
and approve the trust prompt, or use the verified local archive; see the
[steps and limits](docs/snippets-migration.md#install-deliberately). The bundled
default remains 0.1.0; there is no automatic update.

**Windows ARM64:** public-install Snippets tests still have unresolved failures,
and the full graphical suite did not run. Read the
[known limits](docs/snippets-migration.md#stable-0250-release-disposition) before
upgrading if you depend on the previous built-in experience.

Historical previews:

[Linux ARM64 host 0.24.0-dev.11, macOS ARM64 host 0.24.0-dev.16, Linux x64 host 0.24.0-dev.30 and Windows ARM64 host 0.24.0-dev.36](docs/installation.md#optional-snippets-preview)
originally used the separate Snippets 0.1.0 archive. These non-Latest prereleases require
deliberate installation; existing catalogs stay intact. Separate bounded
public-HTTPS checkpoints passed for the three Linux/macOS pairs. Windows public
consumption is separate from its published preview and catalog source. Stable
**0.23.0**, earlier Windows hosts and Windows x64 retain built-in Snippets.
Follow the [migration guide](docs/snippets-migration.md) for exact pairings and
qualification limits.

### Tested desktops

OMXTerm is tested on Apple Silicon macOS, Windows 11 ARM64, and Linux ARM64
desktops including Fedora (GNOME and KDE Plasma), Ubuntu GNOME, Debian, and
Omarchy/Hyprland.

## First session

When you open OMXTerm, it starts your default shell (such as Zsh, Bash, or
PowerShell) in your home folder. Each tab runs an independent session.

| Action             | macOS             | Linux and Windows   |
| ------------------ | ----------------- | ------------------- |
| New tab            | `Cmd+T`           | `Ctrl+Shift+T`      |
| Copy selected text | `Cmd+C`           | `Ctrl+Shift+C`      |
| Paste              | `Cmd+V`           | `Ctrl+Shift+V`      |
| Zoom in / out      | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |

`Ctrl+C` sends an interrupt signal to the running command. On Linux and Windows,
press and release **Alt** to open the application menu; on macOS, use the top
menu bar.

### Make it yours

On first launch, stable OMXTerm creates `config.json` and `themes/omtheme.json`
in `~/.config/omxterm`. Choose **Settings…** in the application menu to change
fonts, preferences, and shortcuts without editing JSON. Stable 0.25.0 also lets
you [create, import and edit themes](docs/configuration.md#author-a-theme) in
Appearance, with live transparency and blur controls. It creates
`snippets.yaml` on Windows x64, which retains built-in Snippets. Linux ARM64/x64
and macOS/Windows ARM64 use optional Snippets and do not create that file; follow
the [migration guide](docs/snippets-migration.md#install-deliberately) to create a catalog.

See [Everyday use](docs/usage.md) for all keyboard shortcuts, image previews,
and tips.

## Updating or uninstalling

To update, download the latest release, quit OMXTerm, and replace the
application. Your custom settings, themes, and snippets are always kept intact.
See
[platform-specific update and uninstall steps](docs/installation.md#updating-or-uninstalling).

## Privacy and security

OMXTerm collects no telemetry and does not automatically acquire or update
extensions. Catalog Browse/Refresh and archive downloads require an explicit
selection or HTTPS link ([transport and trust policy](docs/files-development-preview.md#https-archive-installation));
the new-profile Snippets default uses bundled bytes. Windows verification did
observe system-proxy traffic; see the [network-test limit](docs/snippets-migration.md#stable-0250-release-disposition).
See the [published Files preview](docs/installation.md#optional-files-preview).
Local diagnostic
logs exclude your terminal output, commands, clipboard data, and settings. To
report a security vulnerability privately, see [SECURITY.md](SECURITY.md).

## Contributing

Bug reports, feedback, documentation improvements, and code contributions are
welcome!

- Found a bug or confusing step?
  [Open an issue](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md).
- Want to build from source or contribute code? Read
  [CONTRIBUTING.md](CONTRIBUTING.md) and the
  [documentation index](docs/README.md). Native desktop testing and feedback for
  the build-only x64 packages are welcome in
  [Linux #223](https://github.com/luizomf/omxterm/issues/223) and
  [Windows #224](https://github.com/luizomf/omxterm/issues/224).

## License

[MIT](LICENSE). Built with Restty, Ghostty, and other open-source components
listed in [Third-Party Notices](THIRD_PARTY_NOTICES.md).
