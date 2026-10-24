# Install OMXTerm

OMXTerm ships ready-to-run packages for Apple Silicon Macs, Linux ARM64, and Windows 11 ARM64 or x64. Grab the file for your system from the [downloads table](../README.md#platforms-and-downloads) and follow the steps below.

**[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** · **[Update or uninstall](#updating-or-uninstalling)**

## macOS

You need an Apple Silicon Mac (M1 or later) with macOS 12 Monterey or newer.

1. Download the **DMG**.
2. Open it and drag **OMXTerm.app** to your **Applications** folder.
3. Launch OMXTerm from Applications or Spotlight.

### First launch on macOS

OMXTerm is not notarized by Apple, so macOS blocks it the first time. To allow it:

1. Open **System Settings → Privacy & Security**.
2. Scroll down to **Security**.
3. Click **Open Anyway** next to the OMXTerm message.

You only do this once. Later, macOS may also ask before OMXTerm opens protected folders such as Documents or Downloads.

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file, then run this in the folder where both files are:

```sh
shasum -a 256 -c OMXTerm-0.21.0-arm64.dmg.sha256
```

A valid file prints `OK`.

</details>

## Linux

### Requirements

OMXTerm needs an `aarch64` (ARM64) processor and **glibc 2.42 or newer**. Check both with:

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

### Run the AppImage

Make the AppImage executable and run it:

```sh
chmod +x OMXTerm-0.21.0-arm64.AppImage
./OMXTerm-0.21.0-arm64.AppImage
```

If you get a FUSE error, run it this way instead:

```sh
./OMXTerm-0.21.0-arm64.AppImage --appimage-extract-and-run
```

### Add it to your application menu (optional)

Download `linux_install.sh` next to the AppImage and run:

```sh
chmod +x linux_install.sh
./linux_install.sh install ./OMXTerm-0.21.0-arm64.AppImage
```

OMXTerm now shows up in your application launcher. The [Linux installer guide](linux-installer.md) has the details. For blur, HiDPI scaling, or VM graphics, see [Linux desktop tips](linux-desktop.md).

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file next to the AppImage and run:

```sh
sha256sum --check OMXTerm-0.21.0-arm64.AppImage.sha256
```

</details>

## Windows

You need a Windows 11 PC with an ARM64 or x64 (Intel/AMD) processor (check **System type** in **Settings → System → About**). Use the `-arm64.exe` installer on ARM and the `-x64.exe` installer on Intel/AMD. Windows x64 validation uses emulation on Windows ARM64; native Intel/AMD qualification remains pending. See the [release notes](https://github.com/luizomf/omxterm/releases/tag/v0.21.0) for coverage.

1. Install the Microsoft Visual C++ Redistributable for your architecture (ARM64 or x64) if you don't have it yet. See [Microsoft's download page](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).
2. Download and run the matching installer: `OMXTerm-0.21.0-arm64.exe` or `OMXTerm-0.21.0-x64.exe`.
3. If SmartScreen warns about an unrecognized app, click **More info → Run anyway**.
4. Launch **OMXTerm** from the Start menu.

OMXTerm starts Windows PowerShell by default. You can [switch to PowerShell 7 or Git Bash](configuration.md#choose-the-windows-default-shell) in your settings.

<details>
<summary>Optional: verify the download</summary>

In PowerShell, in your download folder:

```powershell
$name = "OMXTerm-0.21.0-arm64.exe" # Use OMXTerm-0.21.0-x64.exe on Intel/AMD
Get-FileHash $name -Algorithm SHA256
```

Compare the result with the hash inside the matching `$name.sha256` file.

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
| Windows                | Run the new installer.                                  | Settings → Apps → Installed apps → OMXTerm → Uninstall. |

Updating or uninstalling never touches your settings, themes, snippets, or logs. See [Configuration](configuration.md) and [Local diagnostics](usage.md#local-diagnostics) for where they live.
