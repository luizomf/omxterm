# Install OMXTerm

Get the **[latest download and its checksum](../README.md#platforms-and-downloads)**
for your system. OMXTerm is ready to run; building from source is for development.

**[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** ·
**[Update or uninstall](#updating-or-uninstalling)**

OMXTerm is distributed as standalone packages for **ARM64** devices (Apple Silicon macOS, Linux ARM64, and Windows 11 ARM64). Download the installer for your platform and follow the steps below.

## macOS

1. Ensure your Mac uses an **Apple Silicon chip (M1 or later)** running **macOS 12 Monterey or newer**.
2. Download the **DMG** from the [latest release](../README.md#platforms-and-downloads).
3. Open the DMG, drag **OMXTerm.app** to your **Applications** folder, and eject the DMG.
4. Launch OMXTerm from Applications or Spotlight.

### First launch on macOS

On the first launch, macOS may show a prompt indicating an unverified developer. To open the app:

1. Open **System Settings → Privacy & Security**.
2. Scroll to the **Security** section.
3. Click **Open Anyway** next to the OMXTerm notice.

macOS will also ask for permission when you access protected folders (such as Documents or Downloads).

<details>
<summary>Optional: Verify download checksum</summary>

In Terminal, navigate to your download folder and run:

```sh
shasum -a 256 -c OMXTerm-0.20.2-arm64.dmg.sha256
```

A valid file prints `OK`.

</details>

## Linux

### Requirements

Run these commands in your terminal to check compatibility:

```sh
uname -m
getconf GNU_LIBC_VERSION
```

> [!NOTE]
> OMXTerm requires an **`aarch64`** processor and **glibc 2.42 or newer** (standard on modern rolling distributions and newer releases such as Fedora, Arch, and Ubuntu 25+). Ubuntu 24.04 LTS includes an older glibc version.

Install necessary desktop dependencies if not already present:

```sh
# Ubuntu / Debian-based systems
sudo apt install fontconfig file xwayland

# Fedora
sudo dnf install fontconfig file xorg-x11-server-Xwayland
```

### Quick launch (AppImage)

Download the **AppImage** and make it executable:

```sh
chmod +x OMXTerm-0.20.2-arm64.AppImage
./OMXTerm-0.20.2-arm64.AppImage
```

If your system does not have FUSE installed, launch with temporary extraction:

```sh
./OMXTerm-0.20.2-arm64.AppImage --appimage-extract-and-run
```

### Add to application menu (optional helper)

Download **linux_install.sh** alongside the AppImage and run:

```sh
chmod +x linux_install.sh
./linux_install.sh install ./OMXTerm-0.20.2-arm64.AppImage
```

OMXTerm will appear in your desktop application launcher. See the [desktop helper guide](linux-installer.md) for details.
For optional blur, HiDPI scaling, or VM graphics help, use
[Linux desktop tips](linux-desktop.md).

<details>
<summary>Optional: Verify download checksum</summary>

```sh
sha256sum --check OMXTerm-0.20.2-arm64.AppImage.sha256
```

</details>

## Windows

1. Ensure your PC runs an **ARM-based processor** (**Settings → System → About**).
2. Install the [Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist) if needed.
3. Download and run the **EXE installer** (`OMXTerm-0.20.2-arm64.exe`).
4. If Windows SmartScreen displays an informational prompt, click **More info → Run anyway**.
5. Launch **OMXTerm** from your Start menu.

By default, OMXTerm starts Windows PowerShell. You can easily [switch to PowerShell 7 or Git Bash](configuration.md#choose-the-windows-default-shell) in your settings.

<details>
<summary>Optional: Verify download checksum</summary>

In PowerShell, in your download folder:

```powershell
Get-FileHash .\OMXTerm-0.20.2-arm64.exe -Algorithm SHA256
```

Compare the resulting hash with the string in `OMXTerm-0.20.2-arm64.exe.sha256`.

</details>

## Ready to go

Try your [first session](../README.md#first-session), then explore
[everyday controls](usage.md) or [change a setting](configuration.md).

If a command says “file not found,” check that your terminal is in the download
folder and that both filenames match the commands. For other problems, see
[installation troubleshooting](usage.md#the-download-will-not-open) or
[ask for help](../CONTRIBUTING.md#report-a-problem).

## Updating or uninstalling

Updates are manual. Download the new release and matching checksum, verify it,
and quit OMXTerm before replacing it. Back up your settings before updating.

| System                 | Update                                                        | Uninstall                                               |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| macOS                  | Replace OMXTerm.app in Applications.                          | Move the app to Trash.                                  |
| Linux, direct AppImage | Replace the file you launch.                                  | Delete that file.                                       |
| Linux, desktop helper  | Verify the new AppImage and helper, then run `install` again. | Run your verified `./linux_install.sh uninstall`.       |
| Windows                | Run the verified new installer.                               | Settings → Apps → Installed apps → OMXTerm → Uninstall. |

Your settings, themes, snippets, and local logs stay in place. Their locations
are in [Configuration](configuration.md) and [Local diagnostics](usage.md#local-diagnostics).
