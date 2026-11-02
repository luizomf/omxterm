# Install OMXTerm

OMXTerm targets Apple Silicon Macs, Linux ARM64 or x64, and Windows 11 ARM64 or x64. The x64 lanes are **build-only**: they do not qualify desktop, GPU, installer or ordinary-user integration. Version 0.24.0 is [published as the latest stable release](https://github.com/luizomf/omxterm/releases/tag/v0.24.0). Check its notes for platform coverage and the unresolved Windows ARM64 public Snippets checkpoint.

The examples below use the selected `0.24.0` naming: a macOS ARM64 DMG, Linux ARM64/x64 AppImages and Windows ARM64/x64 installers, each with a `.sha256` file, plus the common Linux `linux_install.sh` helper and its checksum. All twelve release assets were verified by draft and anonymous public download. Download verification does not extend the platform execution coverage described in the release notes.

**[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** · **[Update or uninstall](#updating-or-uninstalling)**

## Optional Files preview

Files is separately installed, never bundled. The official catalogs select
Files0.6.0 for Linux and macOS ARM64 with host `>=0.24.0-dev.21` and API `0.1.x`;
publication and target qualification are separate. The earlier catalog offered
[Files 0.4.0](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.4.0),
requiring host `>=0.24.0-dev.8` on Linux ARM64. For that historical pair, use the
[Linux ARM64 host 0.24.0-dev.11 prerelease](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11),
the exact host used for controlled qualification. Download the versioned AppImage
and matching checksum, not `/latest/download`. Files and this host are non-Latest
previews, not a stable SDK or Files support for Linux x64.

The separate release provides `omxterm-files-language-b6044d6.omxext`, its checksum
and original build receipt. Verify the checksum and use **Install local .omxext…**
or **Install from link** for dev.11–dev.20 after Files0.6 promotion: the catalog's
single Files entry no longer offers a compatible version to these hosts. Upgrading
the host is another option when a compatible release is available. Exact-pair
controlled installation/operations/management/Quit qualification passed, followed by a
separate actual public-HTTPS consumption checkpoint on the same pair. See
[the checkpoint and its limits](files-development-preview.md#public-files-040-checkpoint);
publication and checksum readback alone are not native qualification.

Stable [host 0.23.0](https://github.com/luizomf/omxterm/releases/tag/v0.23.0)
remains unchanged and requires the historical
[Files 0.1.0 archive](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.1.0)
via local/link installation, not the newer catalog entries. Historical
preview hosts support local/link installation from `0.23.0-dev.8` and catalog
browsing from `0.23.0-dev.9`; that does not make current Files compatible. The
historical Files0.1 archive does not admit host0.24.0.

On a compatible supported host, open Settings → Extensions → **Browse official
extensions**. Choose Install/Update/Reinstall, then review the exact version/digest
and trusted-code warning. Installation is dormant until you explicitly open Files
from the palette or File menu. Official means project-maintained, not sandboxed.
The catalog connects only on Browse/Refresh; installed management and local `.omxext`
installation remain usable offline. A catalog error is not an empty list; failed
refresh shows the last successful snapshot as stale. No npm/Python or source build
is required for a published archive. See [Files](files-development-preview.md#official-catalog)
for compatibility and evidence limits.

## Optional SSH Connect preview

SSH Connect0.3.0 requires host0.24.0-dev.8 or later; use the qualified
[Linux ARM64 host0.24.0-dev.11 prerelease](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11).
It does not run on stable0.23.0 or 0.23.0-dev.9. Download the preview AppImage,
matching checksum and version-matched helper from that release, not `/latest/download`. Verify the
checksums before launch/install. The earlier catalog offered Files0.4.0 to this
host; historical Files0.1.0 compatibility on dev.0 does not extend to dev.11.

The [separate SSH0.3.0 release](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.0)
provides the verified prebuilt archive/checksum/original receipt for local-file or
**Install from link** installation in Settings → Extensions. Review the trusted-code
warning and deliberately install/update the extension; upgrading the host alone
does not update it. Open SSH Connect separately from File or the Command Palette;
installation remains dormant. The earlier catalog offered 0.3.0; fixed-endpoint
readback and bounded public installation/management qualification passed on the
exact dev.11 host. The separately published SSH0.3.1 is selected by the official
catalog; public-consumption qualification is separate.
Historical0.1.0 assets remain immutable.
No source build is needed. Both releases are non-Latest previews;
only Linux ARM64 is qualified, with synthetic clients rather than real SSH
authentication/connectivity. See [SSH Connect](ssh-connect.md) for requirements,
source/qualification distinctions and grammar limits. Extensions are trusted
code, not sandboxed; OpenSSH configuration and authentication remain OpenSSH's
responsibility.

## Optional Snippets preview

In `0.24.0` source, Linux ARM64/x64, macOS ARM64 and Windows ARM64 use the
separately installed [Snippets 0.1.0 archive](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
Windows x64 retains built-in Snippets. The earlier 0.23.0 host also keeps its
built-in tool. Existing `snippets.yaml` files are not rewritten or deleted.

On those four optional-Snippets targets, download and verify the archive and its
checksum, then choose **Settings → Extensions → Install local .omxext…**. Review
the trusted-code prompt, enable the extension if needed, and open **View → Toggle
Snippets**. Alternatively, use **Browse official extensions** where your host and
target have a compatible offer. Installation is deliberate and remains dormant
until activation; extensions are trusted code, not sandboxed. On those targets,
without an enabled package, the shortcut opens Extensions guidance; Windows x64
instead opens built-in Snippets.

The separately published Linux/macOS and Windows ARM64 previews have their own
exact-pair and public-consumption boundaries. In particular, the Windows dev.36
installed public-HTTPS checkpoint is separate from its published installer and
catalog source. Its installer can replace an existing per-user installation; it
is not isolated side-by-side. See the [migration guide](snippets-migration.md) for
PowerShell and offline verification, historical preview links, and current limits.

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
shasum -a 256 -c OMXTerm-0.24.0-arm64.dmg.sha256
```

A valid file prints `OK`.

</details>

## Linux

Use `-arm64.AppImage` on `aarch64` (ARM64), or `-x64.AppImage` on `x86_64`
(Intel/AMD). The examples below use ARM64; substitute `x64` in both the AppImage
and checksum filenames on Intel/AMD. The common `linux_install.sh` helper accepts
either architecture and rejects mismatched host/ELF architectures before
execution.

Linux x64 is a **build-only** target for native hosted CI. Desktop/GPU, FUSE
launch, helper installation and ordinary-user integration are not established
by that lane. See the selected release notes for the checks actually completed.

### Requirements

The ARM64 AppImage needs an `aarch64` processor and **glibc 2.42 or newer**. Check your architecture and glibc with:

```sh
uname -m
getconf GNU_LIBC_VERSION
```

Recent releases such as Fedora 43, Ubuntu 25.10, and Arch meet the ARM64 requirement. Ubuntu 24.04 LTS and other older releases ship an older glibc and cannot run the ARM64 package.

A historical 0.23.0 Linux x64 headless check used Ubuntu 22.04 with glibc 2.35. That observation is not a minimum-version or broad distro compatibility guarantee and does not qualify a later package; do not infer x64 requirements from the ARM64 package.

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
chmod +x OMXTerm-0.24.0-arm64.AppImage
./OMXTerm-0.24.0-arm64.AppImage
```

If you get a FUSE error, run it this way instead:

```sh
./OMXTerm-0.24.0-arm64.AppImage --appimage-extract-and-run
```

### Add it to your application menu (optional)

Download `linux_install.sh` next to the AppImage and run:

```sh
chmod +x linux_install.sh
./linux_install.sh install ./OMXTerm-0.24.0-arm64.AppImage
```

OMXTerm now shows up in your application launcher. The [Linux installer guide](linux-installer.md) has the details. For blur, HiDPI scaling, or VM graphics, see [Linux desktop tips](linux-desktop.md).

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file next to the AppImage and run:

```sh
sha256sum --check OMXTerm-0.24.0-arm64.AppImage.sha256
```

</details>

## Windows

You need a Windows 11 PC with an ARM64 or x64 (Intel/AMD) processor (check **System type** in **Settings → System → About**). Use the `-arm64.exe` installer on ARM and the `-x64.exe` installer on Intel/AMD.

The Windows x64 native hosted CI lane is **build-only**, not ARM64 emulation. It does not execute NSIS, prove its payload equivalent to the inspected tree, or spawn real ConPTY. Desktop/GPU, ordinary-user integration, Windows 11 and SmartScreen/UAC are not established by that lane. See the selected release notes for separate ARM64 and x64 coverage.

1. Install the Microsoft Visual C++ Redistributable for your architecture (ARM64 or x64) if you don't have it yet. See [Microsoft's download page](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).
2. Download and run the matching installer: `OMXTerm-0.24.0-arm64.exe` or `OMXTerm-0.24.0-x64.exe` for the illustrated version.
3. If SmartScreen warns about an unrecognized app, click **More info → Run anyway**.
4. Launch **OMXTerm** from the Start menu.

OMXTerm starts Windows PowerShell by default. You can [switch to PowerShell 7 or Git Bash](configuration.md#choose-the-windows-default-shell) in your settings.

<details>
<summary>Optional: verify the download</summary>

In PowerShell, in your download folder:

```powershell
$name = "OMXTerm-0.24.0-arm64.exe" # Use OMXTerm-0.24.0-x64.exe on Intel/AMD
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
