# Install OMXTerm

Start with the [device chooser and downloads](../README.md#platforms-and-downloads) if you are unsure which file to pick. Each row links its available application version, exact downloads, checksums and release notes; targets may ship at different times. GitHub's global Latest is not this index. The x64 downloads are **build-only**: their desktop, GPU and installer behavior has not been tested. Windows ARM64 0.25.0 also has [unresolved public-install Snippets failures and an unrun graphical suite](snippets-migration.md#stable-0250-release-disposition).

The examples below use the published `0.25.0` filenames; substitute the version in your target's index row when different. The legacy [0.25.0 complete bundle](https://github.com/luizomf/omxterm/releases/tag/v0.25.0) has all twelve assets, checked by size and SHA-256 before and after publication.

**[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** · **[Update or uninstall](#updating-or-uninstalling)**

The main download is the app: a DMG on macOS, an AppImage on Linux, or an installer on Windows. The optional Linux helper adds the app to your menu; it does not replace the AppImage. A `.sha256` file is for checking a download, not an app to run. Verification steps are below for each system.

Already installed? See the optional [Files](#optional-files-preview), [SSH Connect](#optional-ssh-connect-preview), and [Snippets](#optional-snippets-preview) details below.

## macOS

You need an Apple Silicon Mac (M1 or later) with macOS 12 Monterey or newer. To check, choose Apple menu → **About This Mac** and look for an Apple M-series chip. There is no Intel Mac build.

1. Download the **DMG**.
2. Open it and drag **OMXTerm.app** to your **Applications** folder.
3. Launch OMXTerm from Applications or Spotlight.

### First launch on macOS

OMXTerm is not signed with an Apple Developer ID or notarized by Apple, so macOS blocks it the first time. Verify the download as described below, then review and allow OMXTerm specifically:

- On current macOS, open **System Settings → Privacy & Security**, scroll down to **Security**, and click **Open Anyway** next to the OMXTerm message. See [Apple's instructions](https://support.apple.com/en-us/102445).
- On macOS 12 Monterey, open **System Preferences → Security & Privacy → General** and click **Open Anyway** next to the OMXTerm message. See [Apple's Monterey instructions](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/12.0/mac).

You only do this once. Later, macOS may also ask before OMXTerm opens protected folders such as Documents or Downloads.

<details>
<summary>Optional: verify the download</summary>

Download the matching `.sha256` file, then run this in the folder where both files are:

```sh
shasum -a 256 -c OMXTerm-0.25.0-arm64.dmg.sha256
```

A valid file prints `OK`.

</details>

## Linux

Open a terminal and run `uname -m` if you are unsure which download to use.
Choose `-arm64.AppImage` for `aarch64` (ARM64), or `-x64.AppImage` for
`x86_64` (Intel/AMD). Other results have no matching download here. The examples
below use ARM64; substitute `x64` in both the AppImage and checksum filenames
on Intel/AMD, and the version from your target's row if different. The optional
`linux_install.sh` is a separate helper for adding the app to your menu, not the
app itself. If you use it, download it and its checksum from the same row as the
AppImage. The helper accepts either architecture and rejects mismatched host/ELF
architectures before execution.

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

You can run the AppImage directly without a conventional installation or the menu helper. Copying only the AppImage does not move your settings, themes, snippets, extensions, Electron profile, or logs into a folder beside it; they remain in their normal per-user locations. See [Configuration](configuration.md) and [Local diagnostics](usage.md#local-diagnostics) for details.

For direct launch, you can verify the AppImage first: download its matching `.sha256` file into the same folder, then run `sha256sum --check OMXTerm-0.25.0-arm64.AppImage.sha256` there. The menu helper steps below require verification of both files.

In a terminal, change to the folder containing the downloaded AppImage (for example, `cd ~/Downloads`), then make it executable and run it:

```sh
chmod +x OMXTerm-0.25.0-arm64.AppImage
./OMXTerm-0.25.0-arm64.AppImage
```

If you get a FUSE error, run it this way instead:

```sh
./OMXTerm-0.25.0-arm64.AppImage --appimage-extract-and-run
```

### Add it to your application menu (optional)

Download the AppImage, `linux_install.sh`, and both matching `.sha256` files from the same target row. Place them in the same folder and run the following there. Both checksum checks must succeed before the helper is made executable and run:

```sh
sha256sum --check OMXTerm-0.25.0-arm64.AppImage.sha256 &&
  sha256sum --check linux_install.sh.sha256 &&
  chmod +x linux_install.sh &&
  ./linux_install.sh install ./OMXTerm-0.25.0-arm64.AppImage
```

OMXTerm now shows up in your application launcher. The [Linux installer guide](linux-installer.md) has the details. For blur, HiDPI scaling, or VM graphics, see [Linux desktop tips](linux-desktop.md).

## Windows

You need a Windows 11 PC with an ARM64 or x64 (Intel/AMD) processor. If unsure, check **System type** in **Settings → System → About**: choose `-arm64.exe` for an ARM-based processor or `-x64.exe` for an x64-based processor. A Surface can use either; check its system type rather than assuming.

The Windows x64 native hosted CI lane is **build-only**, not ARM64 emulation. It does not execute NSIS, prove its payload equivalent to the inspected tree, or spawn real ConPTY. Desktop/GPU, ordinary-user integration, Windows 11 and SmartScreen/UAC are not established by that lane. See the selected release notes for separate ARM64 and x64 coverage.

1. Install the Microsoft Visual C++ Redistributable for your architecture (ARM64 or x64) if you don't have it yet. See [Microsoft's download page](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).
2. Download and run the matching installer: `OMXTerm-0.25.0-arm64.exe` or `OMXTerm-0.25.0-x64.exe` for the published version.
3. The Windows installer is unsigned. If SmartScreen warns about an unrecognized app, verify the download as described below, then click **More info → Run anyway**.
4. Launch **OMXTerm** from the Start menu.

OMXTerm starts Windows PowerShell by default. You can [switch to PowerShell 7 or Git Bash](configuration.md#choose-the-windows-default-shell) in your settings.

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

## Optional Files preview

Files is separately installed, never bundled. The source catalogs select
Files0.6.0 for Linux ARM64 (host `>=0.24.0-dev.21`) and candidate Files0.7.0
for macOS ARM64 (host `>=0.25.0-dev.10`), both API `0.1.x`. The macOS change
is not yet an actual public-catalog checkpoint. macOS hosts including 0.24.0
can install the unchanged [Files0.6 archive](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.6.0)
locally or by HTTPS link, or upgrade.
See the guide for tested pairs. Stable 0.25.0 cannot run Files 0.8 or its
path insertion/terminal drop feature. The earlier Linux catalog offered
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

SSH Connect is a separate extension; updating OMXTerm alone does not install or
update it. The published catalogs offer the same unchanged
[SSH0.3.1](https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.1) archive
on Linux and macOS ARM64. The exact stable0.24.0 macOS host/SSH0.3.1 pair has
bounded local-install, controlled loopback OpenSSH and separate public-catalog
consumption evidence. These are not general remote-connectivity qualification;
Windows remains unqualified.

On a supported offer, use Settings → Extensions → **Browse official extensions**,
review the version/digest and trusted-code warning, then open SSH Connect separately
from File or the Command Palette. Installation stays dormant. A local-file or
**Install from link** operation checks host/API but does not enforce catalog platform
targets; successful manual installation is not proof of support. SSH0.3.1 requires
host0.24.0-dev.8 or later, which alone does not establish platform support. Its older
archive's capability-unavailable message still says Linux ARM64 only. Earlier
SSH0.3.0/dev.11 and historical0.1.0 assets remain unchanged. See
[SSH Connect](ssh-connect.md) for exact evidence, limitations and grammar.
Extensions are trusted code, not sandboxed; OpenSSH owns configuration and
authentication.

## Optional Snippets preview

Published **OMXTerm 0.25.0** uses optional Snippets on Linux ARM64/x64, macOS
ARM64 and Windows ARM64, using the unchanged [Snippets 0.1.0 archive](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
Windows x64 retains built-in Snippets. The earlier 0.23.0 host also keeps its
built-in tool. Existing `snippets.yaml` files are not rewritten or deleted.

Positively new packaged profiles on those four targets make one attempt to install
the [removable default](default-snippets.md), enabled but dormant. Existing
profiles are not enrolled; disabled or removed choices are preserved. For manual
installation or reinstallation, download and verify the archive and its checksum,
then choose **Settings → Extensions → Install local .omxext…**. Review
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

The 0.25.0 default uses bundled bytes, not startup acquisition, and creates no user
YAML. Toggle remains deliberate activation; uninstall never silently restores the
package. Developer startup and Windows x64 are excluded. See the
[0.25.0 known limits](snippets-migration.md#stable-0250-release-disposition) for
Windows's unresolved failures and failed network-silence test.
