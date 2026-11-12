# Install OMXTerm

Download the file for your computer from the
**[latest release](https://github.com/luizomf/omxterm/releases/latest)**, then
follow your system below.

| Your computer                                | Download file     |
| -------------------------------------------- | ----------------- |
| **Mac** with an Apple chip (M1, M2, M3, M4…) | `-arm64.dmg`      |
| **Windows** PC, most laptops and desktops    | `-x64.exe`        |
| **Windows** PC with a Snapdragon / ARM chip  | `-arm64.exe`      |
| **Linux** PC, most laptops and desktops      | `-x64.AppImage`   |
| **Linux** on an ARM computer                 | `-arm64.AppImage` |

Not sure? On a Mac, open Apple menu → **About This Mac** ("Apple M…" is right;
Intel Macs aren't supported). On Windows, open **Settings → System → About →
System type** ("x64-based" or "ARM-based"). On Linux, run `uname -m` (`x86_64`
is x64, `aarch64` is arm64).

The Intel/AMD builds (Windows and Linux x64) are new and **untested on real
desktops**. If one misbehaves,
[tell us](../CONTRIBUTING.md#report-a-problem).

**[macOS](#macos)** · **[Windows](#windows)** · **[Linux](#linux)** ·
**[Update or uninstall](#updating-or-uninstalling)** ·
**[Optional tools](#optional-tools)**

## macOS

Needs a Mac with an Apple chip and macOS 12 or newer.

1. Open the `.dmg` and drag **OMXTerm** to **Applications**.
2. Open OMXTerm.

### First launch on macOS

macOS blocks the first launch because Apple hasn't checked the app (OMXTerm is
not notarized). You allow it once:

1. Open OMXTerm and dismiss the warning.
2. Open **System Settings → Privacy & Security**, scroll to **Security**, and
   click **Open Anyway** next to the OMXTerm message. On macOS 12, use **System
   Preferences → Security & Privacy → General**.
3. Open OMXTerm again.

<details>
<summary>Details</summary>

Apple's own steps: [macOS 13 and newer](https://support.apple.com/en-us/102445),
[macOS 12](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/12.0/mac).

Builds after 0.27.0 are signed with OMXTerm's own certificate, so permissions
you grant (such as folder access) stay granted when you update. The first
update from 0.27.0 or older asks once more. macOS may also ask before OMXTerm
opens protected folders such as Documents or Downloads.

</details>

## Windows

1. Run the `.exe` installer.
2. If Windows says it doesn't recognize the app, click **More info → Run
   anyway**.
3. Open **OMXTerm** from the Start menu.

## Linux

Needs glibc 2.35 or newer: Ubuntu 22.04, Debian 12, Fedora 36 or later. Check
with `getconf GNU_LIBC_VERSION`. (Up to 0.28.0, the ARM64 AppImage needed 2.42.)

The AppImage is a single file you run without installing. Open a terminal, go to
the folder with the download, then:

```sh
cd ~/Downloads
chmod +x OMXTerm-*.AppImage
./OMXTerm-*.AppImage
```

If you get a FUSE error, run `./OMXTerm-*.AppImage --appimage-extract-and-run`
instead.

To add OMXTerm to your application menu, download `linux_install.sh` from the
same release and follow the [Linux installer guide](linux-installer.md). For
blur, HiDPI, or VM graphics, see [Linux desktop tips](linux-desktop.md).

### X11 and XWayland

OMXTerm uses X11. Wayland desktops run it through XWayland, which most already
have. If something is missing:

```sh
# Ubuntu / Debian
sudo apt install fontconfig file xwayland

# Fedora
sudo dnf install fontconfig file xorg-x11-server-Xwayland
```

## Verify a download (optional)

Each file has a `.sha256` file next to it. Download both into one folder.

```sh
# macOS
shasum -a 256 -c OMXTerm-*-arm64.dmg.sha256

# Linux
sha256sum --check OMXTerm-*.AppImage.sha256
```

A good file prints `OK`. On Windows, run
`Get-FileHash <installer>.exe -Algorithm SHA256` in PowerShell and compare it
with the hash in the `.sha256` file.

## Ready to go

Try your [first session](../README.md#first-session), then
[everyday use](usage.md) or [change a setting](configuration.md). Stuck? See
[troubleshooting](usage.md#the-download-will-not-open) or
[ask for help](../CONTRIBUTING.md#report-a-problem).

## Updating or uninstalling

OMXTerm doesn't update itself. To update, quit it, download the new version
and replace the old one. Settings, themes, snippets and logs are kept.

| System                 | Update                                                  | Uninstall                                               |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| macOS                  | Drag the new OMXTerm.app into Applications.             | Move the app to the Trash.                              |
| Linux, AppImage only   | Replace the AppImage file.                              | Delete the AppImage file.                               |
| Linux, with the helper | Run `./linux_install.sh install` with the new AppImage. | Run `./linux_install.sh uninstall`.                     |
| Windows                | Run the new installer.                                  | Settings → Apps → Installed apps → OMXTerm → Uninstall. |

<details>
<summary>macOS: <code>ping</code> inside tmux stops reaching your local network</summary>

Since macOS 15, apps need **Local Network** permission, and macOS checks it
against the app that started the tmux server. After you quit that app, `ping`
inside the old tmux server may stop reaching devices on your network, while
`ssh` and other TCP connections keep working. This isn't OMXTerm and happens
with other terminals too. Updating OMXTerm usually brings `ping` back;
otherwise, restart tmux: save your sessions, run `tmux kill-server`, then start tmux
again from OMXTerm.

</details>

## Optional tools

Add-ons you install from **Settings → Extensions → Browse official extensions**.
OMXTerm asks you to confirm, because add-ons run with your account's access.

- [Files](files-availability.md): browse, move and delete files.
- [SSH Connect](ssh-connect.md): open a session on another computer.
- [Snippets](snippets-availability.md): save commands and insert them.
  Comes with the app on new installs.
