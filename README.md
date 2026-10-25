# <img src="src/shared/icons/hicolor/scalable/apps/omxterm-hero.svg" alt="" width="48" /> OMXTerm

OMXTerm is a fast, open-source desktop terminal for **macOS, Linux and Windows,
on ARM64 and x64**. It starts your shell in tabs and split panes, keeps your SSH
servers one click away, colors command output, and can be customized in plain
JSON, without sending anything over the network unless you turn on its
optional AI assistant.

It is built with Electron and TypeScript on the
[Restty](https://github.com/wiedymi/restty) renderer and
[Ghostty](https://github.com/ghostty-org/ghostty)'s terminal core, and brings
the feature set of [AshyTerm](https://github.com/big-comm/ashyterm) to every
platform.

---

## Sponsor: Hostinger

Need a VPS server (or any other hosting service)? Use my link and coupon code
for 10% discount:

- [hostinger.com/otaviomiranda](https://hostinger.com/otaviomiranda)
- Coupon: `OTAVIOMIRANDA`

---

![OMXTerm on macOS with colorful fastfetch output and a blurred desktop behind the terminal](docs/images/macos.webp)

_macOS, with background transparency and blur._

![OMXTerm on Linux with three tabs: Vim, a file listing and a Git log in split panes](docs/images/linux-split-panes.webp)

_Linux (KDE Plasma), with tabs and split panes._

<details>
<summary>More screenshots: macOS, Windows, and Linux</summary>

### macOS — tabs and snippets

![OMXTerm on macOS with two tabs, fastfetch output, and the snippets sidebar](docs/images/macos-background.webp)

### Fedora KDE Plasma

![OMXTerm on Fedora KDE Plasma with two tabs, a transparent background, and fastfetch system information](docs/images/fedora-kde.webp)

### Windows PowerShell

![OMXTerm on Windows with PowerShell, two tabs, and a blurred background](docs/images/windows.webp)

### Ubuntu GNOME

![OMXTerm on Ubuntu GNOME with overlapping terminal windows showing fastfetch and a shell](docs/images/ubuntu-gnome.webp)

### Omarchy / Hyprland

![OMXTerm on Omarchy with tiled windows showing LazyVim, btop, and a shell](docs/images/omarchy-hyprland.webp)

These setups use custom shell and desktop preferences. The tiled windows in the
Omarchy screenshot are arranged by Hyprland.

</details>

**[Features](#features)** · **[Tour](#tour)** · **[Download](#platforms-and-downloads)** ·
**[Install](#installation)** · **[Shortcuts](#keyboard-shortcuts)** ·
**[Command line](#command-line)** · **[Configuration](#configuration)** ·
**[Build from source](#building-from-source)** ·
**[Architecture](#architecture)** · **[Documentation](docs/README.md)**

## Features

### Terminal

- GPU-rendered terminal (WebGL2) on Ghostty's VT core: true color, Unicode,
  wide characters and emoji, ligatures, and inline Kitty images (Chafa, Pi).
- Bundled Nerd Fonts (FiraCode, JetBrains Mono, DejaVu Sans Mono), or any
  installed font.
- Scrollback up to 100,000 lines and search through it (**Edit → Find…**).
- Clickable web links, previews of local PNG/JPEG images with their details
  and path, and quoted file paths when you drop files on the window.
- **File hover previews:** rest the pointer on a file name printed by `ls`
  (or any path) to see the image, the first PDF page, the first lines of a
  text file or a folder's contents, with size, date and path, and buttons to
  view, open, copy or insert the path.
- **Protected Paste:** pasting multiple lines or control characters asks
  first.

### Workspace

- **Header toolbar** in the title bar: Sessions, Commands, Files, Assistant, Find, Split Right,
  Split Down and Broadcast before the title; New Tab and a **main menu**
  (☰) with every action after it.
- New windows open on the monitor you are working on, at the size and
  position last used on that monitor (each monitor remembers its own).
- Tabs and multiple windows, with hideable title and tab bars, an
  auto-hiding title bar that slides in from the top edge, rounded window
  corners, background transparency and blur, and always-on-top.
- **Split panes:** split right or down (up to 16 panes per tab), move focus by
  direction, maximize, equalize, and drag dividers. New panes open in the
  current pane's folder.
- **Broadcast input:** type into every pane of a tab at once, after a
  confirmation, with a visible indicator.
- **Tab menu:** rename, color, duplicate, move, detach to a new window, close
  others or those to the right, and group tabs into named groups that
  collapse behind a colored chip. Many tabs scroll sideways with the mouse
  wheel, and the ⌄ button lists every open tab.
- **Ctrl+wheel** zooms the terminal font; the right-click menu can **save the
  output to a file** and, in a split tab, **close the pane** you clicked.
- **Restore Windows at Startup** (off by default): reopens your windows, tabs,
  splits, folders, connections and groups.
- **Command palette** to run any action by name.

### Sessions and SSH

- **Sessions sidebar** with folders, favorites, recent sessions and search.
- **Local sessions:** a working directory, a program with literal arguments,
  and a command typed once the shell is ready.
- **SSH sessions** through your system OpenSSH client, which supports:
  - user, port, key file and agent forwarding;
  - jump hosts and port forwards (`L`, `R`, `D`);
  - X11 forwarding, compression, and connection reuse (on by default, so
    the Files panel browses a connected session without asking again);
  - a remote command and extra options.
- **Quick Connect** (`user@host:port`), import from `~/.ssh/config`, and JSON
  import and export.
- A failed connection keeps its screen with **Reconnect** and **Close**; when
  an agent or key session is refused, it also offers switching to a password
  typed when prompted. When ssh fails (exit code 255), **Solution** explains
  the cause and, for a changed host key, removes the old key from
  `known_hosts` only after you check the fingerprint.
- **Password** sessions can keep their password in the system keyring (with a
  show/hide button) or use **Password (typed when prompted)**. A stored
  password reaches ssh only through a one-time askpass answer, never a
  command line, the environment or the terminal.

### Integrated file manager

- **Files sidebar** in step with the focused terminal: it follows the
  shell's folder, and browsing a folder in the panel moves the shell there. Browse,
  filter, open with the default app, show in the system file manager, create,
  rename, copy, move and move to the trash.
- **Remote files over SFTP** for SSH sessions, through your OpenSSH and the
  terminal's shared connection: browse, edit a remote file in a local app
  (each save is uploaded), download, upload, move and delete, with progress
  and cancel.
- Open a folder in the terminal or insert quoted paths with one click.

### Optional AI assistant

- **Off until you turn it on** in Preferences → Assistant. Providers: Groq,
  Google Gemini, OpenRouter, Mistral, Cerebras, GitHub Models, and Ollama or
  LM Studio servers on this computer, your network or your own domain.
- **Get API Key** opens each provider's key page; **Browse Models…** searches
  the provider's models, with a free-only filter where prices are published.
- A sidebar panel with streamed answers; suggested commands can be inserted,
  run (after confirmation) or copied. The conversation is kept between
  sessions until you clear it.
- Nothing is sent until you press Send; API keys live in the system keychain.

### Productivity

- **Output highlighting** (off by default): AshyTerm's 51 rule sets (486
  rules) color errors, warnings, IP addresses, URLs and more. The rule set is
  chosen by the command you run (`ping`, `df`, `systemctl`, `docker`, …). A
  rule editor manages rule sets, ignored commands and your own rules.
- **Command Manager:** 56 ready-made commands for Linux, macOS and Windows
  (files, archives, processes, services, packages, network, SSH, Git,
  Docker), plus your own templates.
  - Every command is previewed before it is inserted or run.
  - **Run in Multiple Terminals…** lists every terminal of the window, all
    checked; uncheck the ones to skip and the same command runs in the rest.
  - Programs that are not installed are flagged.
- **Snippets:** reusable text from `snippets.json`, inserted or run from a
  sidebar.

### Settings and data

- **Preferences window** (☰ → Preferences…, `Ctrl+Shift+X` / `Cmd+,`):
  14 color schemes (OMXTerm's own plus AshyTerm's BigLinux, Solarized,
  Monokai, Dracula, Nord, Tokyo Night, Catppuccin, Rosé Pine and more), font,
  size, line height, ligatures, transparency, blur, rounded corners, padding,
  scrollback, window and tab options (including the auto-hiding title bar),
  a shortcut recorder with conflict checks, file previews, the AI assistant,
  a built-in **config.json editor**, and Restore Defaults. Every change is
  validated, saved to `config.json` and applied to all windows at once.
- Plain-JSON configuration with hot reload, themes, and remappable shortcuts,
  or edit visually with [OMXTerm Studio](https://luizomf.github.io/omxterm-studio/).
- **Back Up / Restore Settings:** one passphrase-encrypted `.omxbackup` file
  (scrypt and AES-256-GCM). Passwords and keys are never included.
- English and Brazilian Portuguese interface.
- No telemetry, and no network requests of its own unless you enable the
  assistant; see [Privacy and security](#privacy-and-security).

## Tour

These screenshots were taken on Linux (KDE Plasma) with OMXTerm 0.22.0.

| Hover a file name to preview it                                                                                                      | View local images with their details                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| ![A preview card with the first page of a PDF, its size, page count and path, over a file listing](docs/images/linux-hover-pdf.webp) | ![The local image preview showing a wallpaper with its type, dimensions, size, date and path](docs/images/linux-image-preview.webp) |
| **Run one command in several terminals**                                                                                             | **Files beside the terminal**                                                                                                       |
| ![The Run in Multiple Terminals dialog listing every tab and pane with check boxes](docs/images/linux-run-multiple.webp)             | ![The Files sidebar showing the folder of the focused terminal](docs/images/linux-files.webp)                                       |
| **Preferences with 14 color schemes**                                                                                                | **Every setting as JSON, validated before saving**                                                                                  |
| ![The Preferences window with the color scheme cards](docs/images/linux-preferences.webp)                                            | ![The config.json editor in Preferences with Format, Reload and Save](docs/images/linux-config-editor.webp)                         |
| **Light themes**                                                                                                                     | **About**                                                                                                                           |
| ![OMXTerm with the Solarized Light scheme, a file listing and Vim](docs/images/linux-light-theme.webp)                               | ![The About dialog with the version, authors, copyleft and Report an Issue](docs/images/linux-about.webp)                           |

## Platforms and downloads

**Latest release:
[0.22.1 — downloads and release notes](https://github.com/ruscher/omxterm/releases/tag/v0.22.1)**

| Platform                                 | Download                                                                                                | Checksum                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Apple Silicon macOS                      | [DMG](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.dmg)            | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.dmg.sha256)       |
| Intel macOS                              | [DMG](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x64.dmg)              | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x64.dmg.sha256)         |
| Linux ARM64                              | [AppImage](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.AppImage)  | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.AppImage.sha256)  |
| Linux ARM64 (Debian, Ubuntu)             | [DEB](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.deb)            | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.deb.sha256)       |
| Linux ARM64 (Fedora, openSUSE)           | [RPM](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-aarch64.rpm)          | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-aarch64.rpm.sha256)     |
| Linux x64                                | [AppImage](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x86_64.AppImage) | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x86_64.AppImage.sha256) |
| Linux x64 (Debian, Ubuntu)               | [DEB](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-amd64.deb)            | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-amd64.deb.sha256)       |
| Linux x64 (Fedora, openSUSE)             | [RPM](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x86_64.rpm)           | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x86_64.rpm.sha256)      |
| Linux application-menu helper (optional) | [linux_install.sh](https://github.com/ruscher/omxterm/releases/download/v0.22.1/linux_install.sh)       | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/linux_install.sh.sha256)               |
| Windows ARM64                            | [Installer](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.exe)      | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-arm64.exe.sha256)       |
| Windows x64                              | [Installer](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x64.exe)        | [SHA-256](https://github.com/ruscher/omxterm/releases/download/v0.22.1/OMXTerm-0.22.1-x64.exe.sha256)         |

Arch Linux, Manjaro and BigLinux build a native package with the included
`PKGBUILD` ([below](#arch-linux-manjaro-and-biglinux)).

### Requirements

- **macOS:** 12 Monterey or newer, Apple Silicon or Intel.
- **Windows:** Windows 10 or 11, ARM64 or x64.
- **Linux:** ARM64 or x64, glibc 2.34 or newer (Ubuntu 22.04+, Debian 12+,
  Fedora 35+, Arch, Manjaro, BigLinux), an X11 or XWayland session, and a GPU
  with WebGL2. Without one (virtual machines without 3D acceleration),
  OMXTerm falls back to Chromium's software WebGL automatically.
- **SSH sessions:** an OpenSSH client (`ssh`, or `ssh.exe` on Windows).

### Signing

The packages are **not signed**. macOS builds carry only an ad-hoc signature,
without Apple Developer ID signing or notarization. Verify the SHA-256
checksum before you install:

- **macOS:** use **System Settings → Privacy & Security → Open Anyway** on
  first launch.
- **Windows:** choose **More info → Run anyway** in SmartScreen.

### Tested desktops

OMXTerm is tested on:

- macOS and Windows 11;
- Linux with Fedora (GNOME and KDE Plasma), Ubuntu GNOME, Debian,
  Omarchy/Hyprland, Manjaro and BigLinux (KDE Plasma).

## Installation

Full steps, checksums, updates and removal for every system are in the
[installation guide](docs/installation.md).

### macOS

Open the DMG, drag OMXTerm to **Applications**, and launch it.

### Windows

Run the installer and start OMXTerm from the Start menu.

### Debian and Ubuntu

```sh
sudo apt install ./OMXTerm-0.22.1-amd64.deb    # arm64: OMXTerm-0.22.1-arm64.deb
```

### Fedora, openSUSE and other RPM systems

```sh
sudo dnf install ./OMXTerm-0.22.1-x86_64.rpm   # arm64: OMXTerm-0.22.1-aarch64.rpm
# openSUSE: sudo zypper install --allow-unsigned-rpm ./OMXTerm-0.22.1-x86_64.rpm
```

### AppImage (any Linux)

```sh
chmod +x OMXTerm-0.22.1-x86_64.AppImage
./OMXTerm-0.22.1-x86_64.AppImage
# Optional: add it to your application menu
sh linux_install.sh install OMXTerm-0.22.1-x86_64.AppImage
```

### Arch Linux, Manjaro and BigLinux

Two PKGBUILDs build the same package for x86_64 or aarch64. Both download npm
packages and Electron during the build.

**From GitHub (BigLinux layout).** `pkgbuild/PKGBUILD` clones this
repository at the release tag (`v0.22.1`) and versions the package from it:

```sh
sudo pacman -S --needed base-devel git nodejs npm
mkdir omxterm-pkg && cd omxterm-pkg
curl -fLO https://raw.githubusercontent.com/ruscher/omxterm/main/pkgbuild/PKGBUILD
makepkg -si
```

Set `OMXTERM_BRANCH` to build a branch instead, for example
`OMXTERM_BRANCH=main makepkg -si`; the version then comes from that branch's
`package.json`.

**From a checkout.** `packaging/arch/PKGBUILD` builds whatever is in your
local tree, committed or not, with the version from `package.json`:

```sh
git clone https://github.com/ruscher/omxterm.git
cd omxterm/packaging/arch
makepkg -si
```

Both PKGBUILDs set `epoch=1`, so `1:0.22.1` upgrades the older date-versioned
packages (such as `26.10.25`) without a "downgrade" warning.

Optional packages:

- `openssh`: SSH sessions, Quick Connect, and remote files over SFTP in the
  Files panel;
- `ollama`: local models for the AI assistant (any OpenAI-compatible server,
  such as LM Studio, also works).
- `poppler`: first-page previews, page counts and titles of PDF files when
  hovering their names;
- `xorg-xrandr`: opening new windows on the active monitor under KDE Plasma
  Wayland (otherwise the monitor under the pointer is used).

The package installs:

- `/usr/lib/omxterm`: the application;
- `/usr/bin/omxterm`: the launcher;
- the menu entry (found by "terminal", "ssh" or "sftp"), theme icons from
  16 px to scalable, this README in `/usr/share/doc/omxterm`, and licenses.

Remove it with `sudo pacman -R omxterm`.

## First session

OMXTerm starts your default shell (Zsh, Bash, Fish, PowerShell, …) in your
home folder. Each tab and pane runs its own session. `Ctrl+C` interrupts the
running command.

The toolbar in the title bar opens the sidebars and splits panes, and the
**☰** button opens the main menu with everything else, including
**Preferences…**. On Linux and Windows, pressing and releasing **Alt** also
opens the application menu; on macOS, use the menu bar.

On first launch OMXTerm creates `config.json`, `snippets.json` and
`themes/omtheme.json` in its [configuration folder](#configuration).

## Keyboard shortcuts

Every shortcut can be changed in **Preferences → Shortcuts**, or under
`keybinds` in `config.json` (the action names are in the second column), and
the menus always show the active ones.

| Action                     | `keybinds` name                          | macOS                        | Linux and Windows              |
| -------------------------- | ---------------------------------------- | ---------------------------- | ------------------------------ |
| New window                 | `newWindow`                              | `Cmd+N`                      | `Ctrl+Shift+N`                 |
| New tab                    | `newTab`                                 | `Cmd+T`                      | `Ctrl+Shift+T`                 |
| Close tab                  | `closeTab`                               | `Cmd+W`                      | `Ctrl+Shift+W`                 |
| Close window               | `closeWindow`                            | `Cmd+Shift+W`                | `Ctrl+Shift+Q`                 |
| Quit                       | `quit`                                   | `Cmd+Q`                      | `Ctrl+Alt+Shift+Q`             |
| Next / previous tab        | `nextTab`, `previousTab`                 | `Ctrl+Tab`, `Ctrl+Shift+Tab` | `Ctrl+PageDown`, `Ctrl+PageUp` |
| Tab 1 … 9                  | `selectTab1` … `selectTab9`              | `Cmd+1` … `Cmd+9`            | `Alt+1` … `Alt+9`              |
| Copy / paste               | `copy`, `paste`                          | `Cmd+C`, `Cmd+V`             | `Ctrl+Shift+C`, `Ctrl+Shift+V` |
| Select all                 | `selectAll`                              | `Cmd+A`                      | `Ctrl+Shift+A`                 |
| Find in terminal           | `find`                                   | `Cmd+F`                      | `Ctrl+Shift+G`                 |
| Command palette            | `commandPalette`                         | `Cmd+Shift+P`                | `Ctrl+Shift+P`                 |
| Zoom in / out / reset      | `zoomIn`, `zoomOut`, `actualSize`        | `Cmd++`, `Cmd+-`, `Cmd+0`    | `Ctrl++`, `Ctrl+-`, `Ctrl+0`   |
| Split right                | `splitRight`                             | `Cmd+D`                      | `Ctrl+Shift+O`                 |
| Split down                 | `splitDown`                              | `Cmd+Shift+E`                | `Ctrl+Shift+E`                 |
| Close pane                 | `closePane`                              | `Cmd+Alt+W`                  | `Ctrl+Shift+K`                 |
| Next / previous pane       | `focusNextPane`, `focusPreviousPane`     | `Cmd+]`, `Cmd+[`             | `Ctrl+Shift+]`, `Ctrl+Shift+[` |
| Pane left/right/up/down    | `focusPaneLeft` … `focusPaneDown`        | `Cmd+Alt+Arrow`              | `Alt+Shift+Arrow`              |
| Maximize / restore pane    | `toggleMaximizePane`                     | `Cmd+Shift+Enter`            | `Ctrl+Shift+Z`                 |
| Equalize panes             | `equalizePanes`                          | `Cmd+Alt+0`                  | `Ctrl+Shift+0`                 |
| Broadcast input            | `toggleBroadcast`                        | `Cmd+Alt+I`                  | `Ctrl+Shift+I`                 |
| Sessions sidebar           | `toggleSessions`                         | `Cmd+Shift+J`                | `Ctrl+Shift+H`                 |
| Commands sidebar           | `toggleCommands`                         | `Cmd+Shift+M`                | `Ctrl+Shift+M`                 |
| Snippets sidebar           | `toggleSnippets`                         | `Cmd+Shift+S`                | `Ctrl+Shift+S`                 |
| Tab bar / title bar        | `toggleTabBar`, `toggleTitleBar`         | `Cmd+Shift+B`, `Cmd+Shift+D` | `Ctrl+Shift+B`, `Ctrl+Shift+D` |
| Full screen                | `toggleFullScreen`                       | `Ctrl+Cmd+F`                 | `Ctrl+Shift+F`                 |
| Reload configuration       | `reloadConfig`                           | `Cmd+Shift+,`                | `Ctrl+Shift+,`                 |
| Preferences                | `preferences`                            | `Cmd+,`                      | `Ctrl+Shift+X`                 |
| Files sidebar              | `toggleFiles`                            | `Cmd+Shift+L`                | `Ctrl+Shift+L`                 |
| Assistant sidebar          | `toggleAssistant`                        | `Cmd+Shift+Y`                | `Ctrl+Shift+Y`                 |
| Rounder / less rounded     | `roundMore`, `roundLess`                 | `Cmd+Alt+Shift+R`, `…+E`     | `Ctrl+Alt+Shift+R`, `…+E`      |
| Auto-hide / show title     | `autoHideTitleBar`, `alwaysShowTitleBar` | `Cmd+Alt+Shift+H`, `…+V`     | `Ctrl+Alt+Shift+H`, `…+V`      |
| Always on top              | `toggleAlwaysOnTop`                      | `Cmd+Alt+Shift+T`            | `Ctrl+Alt+Shift+T`             |
| Developer tools            | `toggleDevTools`                         | `Cmd+Alt+Shift+I`            | `Ctrl+Alt+Shift+I`             |
| Open local image           | `openLocalImage`                         | `Cmd+Alt+Shift+O`            | `Ctrl+Alt+Shift+O`             |
| Highlight output / rules   | `toggleHighlighting`, `highlightRules`   | `Cmd+Alt+Shift+C`, `…+G`     | `Ctrl+Alt+Shift+C`, `…+G`      |
| Back up / restore          | `backUpSettings`, `restoreSettings`      | `Cmd+Alt+Shift+B`, `…+U`     | `Ctrl+Alt+Shift+B`, `…+U`      |
| Restore windows at startup | `toggleRestoreWindows`                   | `Cmd+Alt+Shift+W`            | `Ctrl+Alt+Shift+W`             |
| About OMXTerm              | `about`                                  | `Cmd+Alt+Shift+A`            | `Ctrl+Alt+Shift+A`             |

Every menu item has a shortcut. Right-click a tab (or `Shift+F10`) for its
menu.

## Command line

```text
omxterm [options] [-e <program> [arguments...]]

  -w, --working-directory <dir>  Start the first tab in <dir>
  --ssh <[user@]host[:port]>     Open the first tab as an SSH connection
  --log-level <error|info|debug> Override logLevel for this run
  --debug                        Same as --log-level debug
  -e <program> [arguments...]    Run <program> with literal arguments in
                                 the first tab instead of the shell
  -v, --version                  Print the version and exit
  -h, --help                     Print this help and exit
```

- Everything after `-e` goes to the program unchanged: no shell, no quoting.
- `--ssh` cannot be combined with `-e` or `-w`.
- An invalid option exits with status 2.
- Each launch opens a new window in a new process. On macOS, run
  `/Applications/OMXTerm.app/Contents/MacOS/OMXTerm`.

## Configuration

OMXTerm reads its files from `$XDG_CONFIG_HOME/omxterm` (by default
`~/.config/omxterm` on macOS and Linux, and `%USERPROFILE%\.config\omxterm` on
Windows).

| File                     | Written by          | Contents                                                              |
| ------------------------ | ------------------- | --------------------------------------------------------------------- |
| `config.json`            | you, or Preferences | Fonts, padding, scrollback, window options, theme, shortcuts          |
| `snippets.json`          | you                 | Snippets for the Snippets sidebar                                     |
| `themes/*.json`          | you, or Preferences | Terminal color themes (built-in schemes are written here when chosen) |
| `sessions.json`          | OMXTerm             | Saved sessions and folders                                            |
| `highlights.json`        | OMXTerm             | Output highlighting switches and rules                                |
| `commands.json`          | OMXTerm             | Custom commands, favorites, hidden built-ins                          |
| `workspace.json`         | OMXTerm             | Windows to restore at startup (only when enabled)                     |
| `credentials.json`       | OMXTerm             | Encrypted secrets (AI API keys), protected by the system keychain     |
| `assistant.json`         | OMXTerm             | AI assistant on/off, provider, models and server address (no keys)    |
| `assistant-history.json` | OMXTerm             | The assistant conversation, until you clear it                        |

Every `config.json` key is optional except `"version": 1`. OMXTerm adds the
settings your file does not list yet (with their current values) when it
starts, so the file always shows every option; values you wrote stay as you
wrote them. **Preferences → config.json** edits the file in place. A short
example:

```json
{
  "version": 1,
  "font": { "family": "JetBrainsMono Nerd Font Mono", "size": 15 },
  "scrollback": { "lines": 20000 },
  "window": {
    "transparency": 0.1,
    "blur": true,
    "cornerRadius": 12,
    "autoHideTitleBar": true
  },
  "theme": { "path": "themes/omtheme.json" },
  "keybinds": { "splitRight": "Control+Shift+D" }
}
```

- **Reloading:** changes apply on save or with **Reload Configuration**. An
  invalid file keeps the last good configuration and shows a banner that
  explains the problem.
- **Damaged files:** a damaged file that OMXTerm writes itself is set aside as
  `<name>.corrupt-<time>`, never silently lost.
- **Reference:** the full list of keys, themes and examples is in the
  [configuration guide](docs/configuration.md).

Diagnostic logs (two files of at most 5 MiB) are in
`$XDG_STATE_HOME/omxterm/logs` (by default `~/.local/state/omxterm/logs`).

## Languages

The interface is available in **English** and **Brazilian Portuguese**,
including menus, dialogs and messages from the main process. OMXTerm follows
the system's preferred languages and falls back to English. Translations live
in [`src/shared/locales/`](src/shared/locales/); a test checks that every
message exists in both catalogs with the same placeholders.

## Privacy and security

- OMXTerm collects no telemetry. It makes no network requests of its own
  except, when you turn the assistant on, the chat requests you send to the
  provider you chose. SSH connections start only when you open one.
- The assistant is off by default. It sends only what you type (and the
  terminal selection when you tick the option) with your operating system and
  shell names, never terminal output on its own. API keys are kept in the
  system keychain; suggested commands run only after you confirm.
- Logs record application events only: never terminal output, commands,
  clipboard data, paths or configuration values.
- Passwords and keys are never written to disk in plain text and never
  included in backups or exports. A saved SSH password stays in the system
  keyring; otherwise ssh asks at its prompt.
- The interface runs in an isolated renderer without Node.js. Only the main
  process starts programs, always with literal argument lists, never shell
  strings. Imported SSH settings that would run local programs
  (`ProxyCommand`, `LocalCommand`, …) are refused.

To report a vulnerability privately, see [SECURITY.md](SECURITY.md). The
detailed model is in
[docs/implementation/03-security-and-privacy.md](docs/implementation/03-security-and-privacy.md).

## Troubleshooting

- **Blank or black window on Linux:** OMXTerm needs WebGL2 and falls back to
  software WebGL when the GPU has none. If a broken driver still fails, try
  `omxterm --ignore-gpu-blocklist`
  (see [graphics troubleshooting](docs/linux-desktop.md#graphics-troubleshooting)).
- **Wayland:** OMXTerm runs through XWayland by default; pass
  `--ozone-platform=wayland` to try native Wayland.
- **AppImage does not start:** install FUSE 2 (`libfuse2`) or run it with
  `--appimage-extract-and-run`.
- **A setting has no effect:** a banner at the top of the window explains
  why `config.json` was rejected; the last valid configuration stays active.
- **No PDF thumbnails when hovering file names:** install `poppler`
  (`pdftoppm` and `pdfinfo`). Previews can be turned off in
  **Preferences → Terminal**.
- **macOS "cannot be opened" or Windows SmartScreen:** the packages are not
  signed; see [Signing](#signing).

More answers are in [Everyday use](docs/usage.md) and the
[Linux desktop guide](docs/linux-desktop.md).

## Building from source

### Prerequisites

- Node.js 24 (or 22.13+) and npm, Git, and a C++ compiler (node-pty is
  compiled for your machine).
- Linux packaging: `rpmbuild`, `rpm2cpio`, `cpio`, `ar` and `file`. On ARM64
  hosts, also `fpm`.
- Platform details are in [docs/development.md](docs/development.md).

```sh
git clone https://github.com/ruscher/omxterm.git
cd omxterm
npm ci
npm run dev
```

### Scripts

| Command                                       | What it does                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run dev`                                 | Builds and launches OMXTerm from the source tree                        |
| `npm run build`                               | Bundles main, preload and renderer into `dist/` with esbuild            |
| `npm test -- test/unit`                       | Headless unit tests (Vitest, with jsdom for the interface)              |
| `npm test`                                    | Unit tests plus the graphical integration suites (opens real windows)   |
| `npm run lint` / `npm run typecheck`          | oxlint with type-aware rules / TypeScript                               |
| `npm run format` / `npm run format:check`     | Prettier                                                                |
| `npm run check:portable`                      | Format check, lint, types, tests and build                              |
| `npm run package:linux` / `:mac` / `:win`     | Builds and packages for the host platform and architecture              |
| `npm run package:verify`                      | Verifies the packages (architecture, native modules, licenses, startup) |
| `npm run check:linux` / `check` / `check:win` | Everything above for that platform                                      |
| `node scripts/generate-application-icons.mjs` | Regenerates every icon from the SVG source (needs `rsvg-convert`)       |

Packages are written to `release/`:

- **macOS:** DMG.
- **Linux:** AppImage, DEB, RPM, and `linux_install.sh`.
- **Windows:** NSIS installer.

Each comes with `.sha256` files. Every host packages its own architecture,
because native modules are never cross-compiled. The release procedure is in
[docs/release.md](docs/release.md).

## Architecture

| Layer                   | Role                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/`             | Electron main process: windows, menus, PTY sessions (node-pty), SSH launch, configuration, Application Data, backup, Credential Store, logging |
| `src/preload/`          | A frozen `window.omxterm` bridge that validates every message in both directions                                                               |
| `src/renderer/`         | Tabs, split panes, sidebars, dialogs, command palette, output highlighter; runs with context isolation and without Node.js                     |
| `src/terminal-surface/` | Restty and Ghostty WASM terminal surface, independent of Electron                                                                              |
| `src/shared/`           | Typed IPC contracts, validators, translations, built-in commands, highlight rules, icons                                                       |

- **Stack:** Electron 43, TypeScript 7, Restty 0.3 (Ghostty WASM core),
  node-pty 1.1, esbuild, Vitest, oxlint, Prettier, electron-builder.
- **CI:** GitHub Actions on six runners (Linux, macOS and Windows, each on
  x64 and ARM64) runs format, lint, types, unit tests, build, native PTY
  suites and packaging with verification.
- **Design records:**
  - [docs/spec.md](docs/spec.md): product specification.
  - [CONTEXT.md](CONTEXT.md): domain vocabulary.
  - [docs/adr/](docs/adr/README.md): 35 architecture decision records.
  - [docs/implementation/](docs/implementation/): engineering records,
    including the AshyTerm parity matrix.

## Documentation

- [Installation](docs/installation.md) · [Everyday use](docs/usage.md) ·
  [Configuration](docs/configuration.md) · [How it works](docs/how-it-works.md)
- [Linux desktop integration](docs/linux-desktop.md) ·
  [Linux installer](docs/linux-installer.md)
- [Development](docs/development.md) · [Release](docs/release.md) ·
  [Versioning](docs/versioning.md) · [Documentation index](docs/README.md)

## Contributing

Bug reports, feedback, translations, documentation and code are welcome.

- [Open an issue](https://github.com/luizomf/omxterm/issues) for bugs or
  confusing steps (also **About → Report an Issue** in the app).
- Read [CONTRIBUTING.md](CONTRIBUTING.md) before sending code. It covers the
  engineering standards, tests and pull request workflow.

### Authors

- **Luiz Otávio Miranda** ([luizomf@gmail.com](mailto:luizomf@gmail.com)):
  creator and maintainer of OMXTerm.
- **Rafael Ruscher** ([rruscher@gmail.com](mailto:rruscher@gmail.com)):
  brought AshyTerm's feature set, x64 and native Linux packages, and the
  BigLinux package.

## License

[MIT](LICENSE). OMXTerm includes open-source components such as Electron,
Restty, Ghostty, node-pty, the bundled fonts, and AshyTerm's highlight rules
(MIT), listed in [Third-Party Notices](THIRD_PARTY_NOTICES.md).
