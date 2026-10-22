# Install OMXTerm

OMXTerm packages are built for **ARM64** and **x64** computers: Apple Silicon and Intel Macs, Linux, and Windows 11. Grab the file for your system from the [downloads table](../README.md#platforms-and-downloads) and follow the steps below.

> Releases up to 0.20.2 ship ARM64 packages only (DMG, AppImage, and Windows installer). x64 packages and the Linux DEB and RPM packages are available from the releases that list them.

**[Pick a file](#pick-the-right-file)** · **[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** · **[Update or uninstall](#updating-or-uninstalling)**

## Pick the right file

| System                   | ARM64                                        | x64                                          |
| ------------------------ | -------------------------------------------- | -------------------------------------------- |
| macOS                    | `OMXTerm-<version>-arm64.dmg`                | `OMXTerm-<version>-x64.dmg`                  |
| Linux (any distribution) | `OMXTerm-<version>-arm64.AppImage`           | `OMXTerm-<version>-x86_64.AppImage`          |
| Debian, Ubuntu           | `OMXTerm-<version>-arm64.deb`                | `OMXTerm-<version>-amd64.deb`                |
| Fedora, openSUSE         | `OMXTerm-<version>-aarch64.rpm`              | `OMXTerm-<version>-x86_64.rpm`               |
| Arch Linux, Manjaro      | [Build from source](#arch-linux-and-manjaro) | [Build from source](#arch-linux-and-manjaro) |
| Windows 11               | `OMXTerm-<version>-arm64.exe`                | `OMXTerm-<version>-x64.exe`                  |

Not sure which one you have?

- **macOS:** Apple menu → **About This Mac**. "Chip: Apple M…" is ARM64; "Processor: Intel" is x64.
- **Linux:** run `uname -m`. `aarch64` is ARM64; `x86_64` is x64.
- **Windows:** **Settings → System → About → System type**. "ARM-based processor" is ARM64; "x64-based processor" is x64.

Each release also lists a `SHA256SUMS-<platform>-<arch>.txt` file and a `.sha256` file per download for verifying what you downloaded.

## macOS

You need an Apple Silicon Mac (M1 or later) or an Intel Mac, with macOS 12 Monterey or newer.

1. Download the **DMG** for your Mac (`arm64` for Apple Silicon, `x64` for Intel).
2. Open it and drag **OMXTerm.app** to your **Applications** folder.
3. Launch OMXTerm from Applications or Spotlight.

### First launch on macOS

OMXTerm is not notarized by Apple and has no Developer ID signature (only an ad-hoc signature), so macOS blocks it the first time. To allow it:

1. Open **System Settings → Privacy & Security**.
2. Scroll down to **Security**.
3. Click **Open Anyway** next to the OMXTerm message.

You only do this once. Later, macOS may also ask before OMXTerm opens protected folders such as Documents or Downloads.

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file, then run this in the folder where both files are:

```sh
shasum -a 256 -c OMXTerm-<version>-arm64.dmg.sha256
```

A valid file prints `OK`.

</details>

## Linux

### Requirements

OMXTerm needs an `aarch64` (ARM64) or `x86_64` (x64) processor and a recent glibc (**2.42 or newer** for the current releases; the minimum follows the system the release was built on). Check both with:

```sh
uname -m
getconf GNU_LIBC_VERSION
```

Recent releases such as Fedora 43, Ubuntu 25.10, and Arch meet this requirement. Ubuntu 24.04 LTS and other older releases ship an older glibc and cannot run the current package.

Then install the few desktop packages OMXTerm relies on (most desktops already have them):

```sh
# Ubuntu / Debian
sudo apt install fontconfig file xwayland

# Fedora
sudo dnf install fontconfig file xorg-x11-server-Xwayland
```

OMXTerm deliberately runs without Chromium's sandbox on Linux, so no package installs a setuid helper or an AppArmor profile.

### Install the DEB package (Debian, Ubuntu)

```sh
sudo apt install ./OMXTerm-<version>-amd64.deb    # or -arm64.deb
```

`apt` installs the required libraries and recommends the OpenSSH client for SSH sessions. OMXTerm is installed in `/opt/OMXTerm`, appears in your application menu, and starts from a terminal with `omxterm`.

### Install the RPM package (Fedora, openSUSE)

```sh
sudo dnf install ./OMXTerm-<version>-x86_64.rpm   # or -aarch64.rpm
```

The RPM is not GPG-signed. On openSUSE, use `sudo zypper install --allow-unsigned-rpm ./OMXTerm-<version>-x86_64.rpm` after verifying its checksum.

### Arch Linux and Manjaro

OMXTerm is not in the AUR. Build a native package from the source tree with the included `PKGBUILD` (needs `base-devel`, `git`, `nodejs`, and `npm`; the build downloads npm dependencies and Electron):

```sh
git clone https://github.com/luizomf/omxterm.git
cd omxterm/packaging/arch
makepkg -si
```

It installs OMXTerm in `/usr/lib/omxterm` with the `omxterm` command, an application menu entry, and its licenses in `/usr/share/licenses/omxterm`.

On **BigLinux**, [`pkgbuild/PKGBUILD`](../pkgbuild/PKGBUILD) follows BigLinux's packaging conventions: it clones the repository's default branch and versions the package by build date (`YY.MM.DD-HHMM`). It installs the same files:

```sh
mkdir omxterm-pkg && cd omxterm-pkg
curl -fLO https://raw.githubusercontent.com/ruscher/omxterm/main/pkgbuild/PKGBUILD
makepkg -si
```

### Run the AppImage

The AppImage runs on any distribution without installation. Make it executable and run it:

```sh
chmod +x OMXTerm-<version>-x86_64.AppImage   # or -arm64.AppImage
./OMXTerm-<version>-x86_64.AppImage
```

If you get a FUSE error, run it this way instead:

```sh
./OMXTerm-<version>-x86_64.AppImage --appimage-extract-and-run
```

### Add it to your application menu (optional)

Download `linux_install.sh` next to the AppImage and run:

```sh
chmod +x linux_install.sh
./linux_install.sh install ./OMXTerm-<version>-x86_64.AppImage
```

OMXTerm now shows up in your application launcher. The [Linux installer guide](linux-installer.md) has the details. For blur, HiDPI scaling, or VM graphics, see [Linux desktop tips](linux-desktop.md).

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file next to your download and run:

```sh
sha256sum --check OMXTerm-<version>-x86_64.AppImage.sha256
```

Or check every Linux file you downloaded against the release's list:

```sh
sha256sum --check --ignore-missing SHA256SUMS-linux-x64.txt   # or -linux-arm64.txt
```

</details>

## Windows

You need a Windows 11 PC with an ARM64 or x64 processor (check **Settings → System → About**).

1. Install the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) for your processor (ARM64 or x64) if you don't have it yet.
2. Download and run the installer for your processor (`OMXTerm-<version>-arm64.exe` or `OMXTerm-<version>-x64.exe`).
3. The installer is unsigned. If SmartScreen warns about an unrecognized app, click **More info → Run anyway**.
4. Launch **OMXTerm** from the Start menu.

OMXTerm starts Windows PowerShell by default. You can [switch to PowerShell 7 or Git Bash](configuration.md#choose-the-windows-default-shell) in your settings.

<details>
<summary>Optional: verify the download</summary>

In PowerShell, in your download folder:

```powershell
Get-FileHash .\OMXTerm-<version>-x64.exe -Algorithm SHA256
```

Compare the result with the hash inside `OMXTerm-<version>-x64.exe.sha256` (or the `-arm64` files).

</details>

## Ready to go

Try your [first session](../README.md#first-session), then explore [everyday use](usage.md) or [change a setting](configuration.md).

Something went wrong? Check [installation troubleshooting](usage.md#the-download-will-not-open) or [ask for help](../CONTRIBUTING.md#report-a-problem).

## Updating or uninstalling

OMXTerm does not update itself. To update, quit OMXTerm, download the new version, and replace the old one:

| System                 | Update                                                  | Uninstall                                               |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| macOS                  | Replace OMXTerm.app in Applications.                    | Move the app to the Trash.                              |
| Linux, AppImage only   | Replace the AppImage file.                              | Delete the AppImage file.                               |
| Linux, with the helper | Run `./linux_install.sh install` with the new AppImage. | Run `./linux_install.sh uninstall`.                     |
| Linux, DEB package     | `sudo apt install ./` the new `.deb` file.              | `sudo apt remove omxterm`                               |
| Linux, RPM package     | `sudo dnf install ./` the new `.rpm` file.              | `sudo dnf remove omxterm`                               |
| Arch Linux, Manjaro    | Pull the new source and run `makepkg -si` again.        | `sudo pacman -R omxterm`                                |
| Windows                | Run the new installer.                                  | Settings → Apps → Installed apps → OMXTerm → Uninstall. |

Updating or uninstalling never touches your settings, themes, snippets, or logs. See [Configuration](configuration.md) and [Local diagnostics](usage.md#local-diagnostics) for where they live.
