# Install OMXTerm

OMXTerm is a desktop terminal: the window where you type commands. Choose your
computer below, check its requirements, then follow the steps.

The app download is a DMG on macOS (the Mac app file), an installer on Windows,
or an AppImage on Linux (a single file you run without installing). The Linux
helper installs OMXTerm for your user and adds it to your menu; `.sha256` files
check a download rather than run it. The
[device chooser](../README.md#platforms-and-downloads) has the table.

The examples use the published `0.25.0` file names. Substitute the version from
your download row if it differs.

The x64 (Intel/AMD) downloads are **untested**: they build and pass automated
checks, but nobody has used them on a real desktop yet. Please
[report problems](../CONTRIBUTING.md#report-a-problem) if you try them.

**[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** ·
**[Update or uninstall](#updating-or-uninstalling)** ·
**[Optional tools](#optional-tools)**

## macOS

You need an Apple Silicon Mac (M1 or later) with macOS 12 Monterey or newer. To
check, choose Apple menu → **About This Mac** and look for an Apple M-series
chip. There is no Intel Mac build.

1. Download the **DMG**.
2. Open it and drag **OMXTerm.app** to your **Applications** folder.

### First launch on macOS

The first launch is blocked because the project has no Apple Developer ID, so
Apple has not verified this app. You must allow OMXTerm once.

1. Open OMXTerm. macOS refuses to open it and shows a warning.
2. Verify the download using the checksum steps below, then allow it: open
   **System Settings → Privacy & Security**, scroll down to **Security**, and
   click **Open Anyway** next to the OMXTerm message. On macOS 12 Monterey, open
   **System Preferences → Security & Privacy → General** and click **Open
   Anyway** there. See
   [Apple's instructions](https://support.apple.com/en-us/102445) or the
   [Monterey instructions](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/12.0/mac).
3. Open OMXTerm again. A window opens with your shell.

Later, macOS may also ask before OMXTerm opens protected folders such as
Documents or Downloads.

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file, then run this in the folder where both
files are:

```sh
shasum -a 256 -c OMXTerm-0.25.0-arm64.dmg.sha256
```

A valid file prints `OK`.

</details>

## Linux

Installing OMXTerm needs a terminal window, and your desktop already has one.
Open your app launcher and search for **Terminal**.

Run `uname -m` there if you are unsure which file to pick: `aarch64` means ARM64
(choose `-arm64.AppImage`), and `x86_64` means Intel/AMD (choose
`-x64.AppImage`). Other results have no matching download.

The examples below use ARM64. On Intel/AMD, substitute `x64` in the AppImage and
checksum file names.

### Requirements

The ARM64 AppImage needs an `aarch64` processor and **glibc 2.42 or newer**.
glibc is the core system library your Linux distribution ships. Check both with:

```sh
uname -m
getconf GNU_LIBC_VERSION
```

Ubuntu 24.04 LTS and older releases ship an older glibc and do not meet the
requirement.

If your distribution release does not meet it, there is no supported prebuilt
package. Upgrade to a release that meets it, or
[build OMXTerm from source](../CONTRIBUTING.md#development-environment). A
source build is a development path, not a supported installation. If neither is
possible, there is no supported way to run OMXTerm on that system.

Linux x64 is untested, so we can't say yet which distributions it runs on.

OMXTerm uses X11, a Linux window system. On Wayland desktops, a compatibility
layer called XWayland lets X11 apps run; most desktops already provide it.
Install the few desktop packages it relies on if any are missing:

```sh
# Ubuntu / Debian
sudo apt install fontconfig file xwayland

# Fedora
sudo dnf install fontconfig file xorg-x11-server-Xwayland
```

### Run the AppImage

1. Download the AppImage for your architecture from the
   [download table](../README.md#platforms-and-downloads).
2. In the terminal, go to the folder with the download (for example,
   `cd ~/Downloads`).
3. Optional: download the matching `.sha256` file into the same folder, then run
   `sha256sum --check OMXTerm-0.25.0-arm64.AppImage.sha256`. A valid file prints
   `OK`.
4. Make the file executable (allow it to run) with
   `chmod +x OMXTerm-0.25.0-arm64.AppImage`.
5. Start OMXTerm with `./OMXTerm-0.25.0-arm64.AppImage`.
6. A window opens with your shell in your home folder.

If you get a FUSE error, run it this way instead. FUSE is the system component
that lets a single downloaded file run like an installed app.

```sh
./OMXTerm-0.25.0-arm64.AppImage --appimage-extract-and-run
```

### Add it to your application menu (optional)

Download the AppImage, `linux_install.sh`, and both matching `.sha256` files from
the same target row. Put them in one folder and run the commands below from that
folder (for example, `cd ~/Downloads`).

1. Verify both downloads:

   ```sh
   sha256sum --check OMXTerm-0.25.0-arm64.AppImage.sha256
   sha256sum --check linux_install.sh.sha256
   ```

2. If both checks pass, make the helper executable and install the app:

   ```sh
   chmod +x linux_install.sh
   ./linux_install.sh install ./OMXTerm-0.25.0-arm64.AppImage
   ```

3. OMXTerm appears in your application launcher.

The [Linux installer guide](linux-installer.md) has the details. For blur,
HiDPI scaling, or VM graphics, see [Linux desktop tips](linux-desktop.md).

## Windows

Windows 11 ARM64 is tested; Windows 11 x64 and Windows 10 are untested. Choose
`-arm64.exe` for an ARM-based processor or `-x64.exe` for an x64-based
processor; the x64 build is untested. If unsure, check **System type** in
**Settings → System → About**; a Surface can use either.

1. Install the
   [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
   for your architecture if you do not have it yet.
2. Download and run the matching installer: `OMXTerm-0.25.0-arm64.exe` or
   `OMXTerm-0.25.0-x64.exe` for the published version.
3. The installer is unsigned. If SmartScreen warns about an unrecognized app,
   verify the download as described below, then click **More info → Run
   anyway**.
4. Open **OMXTerm** from the Start menu. A PowerShell window opens in your home
   folder.

<details>
<summary>Optional: verify the download</summary>

In PowerShell, in your download folder:

```powershell
$name = "OMXTerm-0.25.0-arm64.exe" # Use OMXTerm-0.25.0-x64.exe on Intel/AMD
Get-FileHash $name -Algorithm SHA256
```

Compare the result with the hash inside the matching `$name.sha256` file.

</details>

## Ready to go

Try your [first session](../README.md#first-session), then
[everyday use](usage.md) or [change a setting](configuration.md). Stuck? Check
[installation troubleshooting](usage.md#the-download-will-not-open) or
[ask for help](../CONTRIBUTING.md#report-a-problem).

## Updating or uninstalling

OMXTerm does not update itself. To update, quit, download the new version, and
replace the old one:

| System                 | Update                                                  | Uninstall                                               |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| macOS                  | Drag the new OMXTerm.app into Applications.             | Move the app to the Trash.                              |
| Linux, AppImage only   | Replace the AppImage file.                              | Delete the AppImage file.                               |
| Linux, with the helper | Run `./linux_install.sh install` with the new AppImage. | Run `./linux_install.sh uninstall`.                     |
| Windows                | Run the new installer.                                  | Settings → Apps → Installed apps → OMXTerm → Uninstall. |

Update and uninstall never touch your settings, themes, snippets, or logs. See
[Configuration](configuration.md) and
[Local diagnostics](usage.md#local-diagnostics) for where they live.

## Optional tools

Snippets comes with the app. On a new installation, OMXTerm tries to add it once
on most systems; it stays off until you open it. Windows x64 has it built in.
Files and SSH Connect you install yourself in Settings → Extensions; OMXTerm
asks you to confirm, because add-ons are trusted code with the app's access.
Each guide says which OMXTerm versions and systems it works with.

- **Files** shows folders and files and can move or delete them with
  confirmation. Linux and Mac versions differ; it cannot insert a path into the
  terminal. See [Files availability](files-availability.md).
- **SSH Connect** lists targets and opens SSH connections in normal terminal tabs.
  Linux and macOS ARM64 only; Windows is untested. [SSH Connect guide](ssh-connect.md)
- **Snippets** stores reusable text; updates are manual. Windows ARM64 public-install
  Snippets scenarios have unresolved failures of unknown cause. See
  [Snippets availability](snippets-availability.md#windows-arm64-known-issue).
