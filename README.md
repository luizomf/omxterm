# OMXTerm

OMXTerm is an open-source desktop terminal for Apple Silicon macOS, Linux ARM64,
and Windows ARM64. Work across tabs and windows, and customize fonts, themes,
keyboard shortcuts, and snippets. Show or hide the title and tab bars, and try
optional [background transparency and blur](docs/configuration.md#background-transparency-and-blur)
without fading terminal text.

<p align="center">
  <img src="docs/images/omxterm-hero.png" alt="OMXTerm icon: a light blue terminal prompt on a dark rounded square" width="480" />
</p>

Built with [Restty](https://github.com/wiedymi/restty) and its pinned
[Ghostty](https://github.com/ghostty-org/ghostty) core, OMXTerm includes bundled
Nerd Fonts, programming ligatures, Protected Paste, drag-and-drop file paths,
local PNG/JPEG previews, and inline images in direct Pi/Chafa sessions.

**Start here:** [Install](#installation) → [First session](#first-session) →
[Customize](docs/configuration.md). No coding or configuration is needed to use it.

## Platforms and downloads

The latest release is **[0.18.0](https://github.com/luizomf/omxterm/releases/tag/v0.18.0)**.
The source tree is at **0.18.1-dev.0**, a development baseline, not a newer download.
[Release notes](docs/releases/0.18.0.md) record the changes, tested systems, and known limits.

**Check your processor before downloading.** ARM64 (also called `aarch64`) and
x64 (`x86_64`/AMD64, common on Intel and AMD PCs) are different architectures.
These downloads are **ARM64 only**:

- **macOS:** Apple menu → **About This Mac** must show an Apple Silicon chip,
  such as Apple M1 or later, not an Intel processor.
- **Linux:** run `uname -m` in your existing terminal. You need `aarch64`, not
  `x86_64`.
- **Windows:** open **Settings → System → About → System type** and look for an
  ARM-based processor, not an x64-based processor.

Have an x64 Linux or Windows machine? Help with [Linux #223](https://github.com/luizomf/omxterm/issues/223)
or [Windows #224](https://github.com/luizomf/omxterm/issues/224). Those builds are
not available yet. Intel macOS is also unsupported. OMXTerm needs **WebGL2**,
the graphics capability used to draw its terminal; there is no software-rendering fallback.

| Platform                        | Package                                                                                                | SHA-256                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Apple Silicon macOS             | [DMG](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.dmg)           | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.dmg.sha256)      |
| Linux ARM64                     | [AppImage](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.AppImage) | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.AppImage.sha256) |
| Linux desktop helper (optional) | [Shell helper](https://github.com/luizomf/omxterm/releases/download/v0.18.0/linux_install.sh)          | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.18.0/linux_install.sh.sha256)              |
| Windows ARM64                   | [Installer](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.exe)     | [Checksum](https://github.com/luizomf/omxterm/releases/download/v0.18.0/OMXTerm-0.18.0-arm64.exe.sha256)      |

## Installation

Download your package and its matching `.sha256` file into the same folder.
A **checksum** is a fingerprint of the downloaded file; the commands below check
that it matches the release. Stop if verification fails. Checksums detect changed
or incomplete downloads, but do not establish publisher identity. These packages
have no verified publisher signature.

Use your system's existing terminal for these steps. Copy commands without the
code-block language label. If you see “file not found,” check that your terminal
is in the folder containing the download and that the filename matches exactly.

### macOS

1. Open **Terminal** from Applications → Utilities. Type `cd ` (including the
   space), drag the download folder from Finder into Terminal, then press Enter.
2. Verify the DMG; success ends in `OK`:

   ```sh
   shasum -a 256 -c OMXTerm-0.18.0-arm64.dmg.sha256
   ```

3. Open the DMG, drag **OMXTerm.app** to **Applications**, and eject the DMG.
4. Launch OMXTerm from Applications.

The app has an ad-hoc integrity seal, but no Apple Developer ID signature or
notarization. If macOS blocks it and you trust the verified package, follow
Apple's [Open Anyway instructions](https://support.apple.com/102445) in
**System Settings → Privacy & Security**. Keep system-wide protections enabled.

macOS may separately ask for access to folders you use, such as Documents.
Approve only access your work needs. **Full Disk Access is not required for
ordinary terminal use.** An update may ask for folder access again.

### Linux

An **AppImage** bundles the application into one executable file; you do not
need to compile it or install a `.deb`/`.rpm` package.

**Check your distribution too:** the AppImage requires **glibc 2.42 or
newer**, a core system library. See the [release record](docs/releases/0.18.0.md)
for the exact tested distribution and desktop. Older distributions, including Ubuntu 24.04, cannot
run this package even on ARM64. Run `getconf GNU_LIBC_VERSION` to check. Do not
replace glibc manually; use a compatible distribution or discuss a source build
with the project.

You need `fontconfig` (font discovery) and X11, or **XWayland** on a Wayland
desktop. XWayland lets this X11 application run in a Wayland session; OMXTerm
uses it automatically, so you do not need to switch desktop sessions. The
optional desktop helper also uses `file` to identify the package. Install these
prerequisites with your distribution's package manager:

```sh
# Ubuntu / Debian-based systems with compatible system libraries
sudo apt install fontconfig file xwayland
```

```sh
# Fedora
sudo dnf install fontconfig file xorg-x11-server-Xwayland
```

`sudo` requests administrator permission to install those system packages.
**Do not run OMXTerm or its desktop helper with sudo.**

Open the download folder in your file manager and choose **Open in Terminal**
(the label varies by desktop). Verify, mark the file as runnable, and launch:

```sh
sha256sum --check OMXTerm-0.18.0-arm64.AppImage.sha256 &&
  chmod +x OMXTerm-0.18.0-arm64.AppImage &&
  ./OMXTerm-0.18.0-arm64.AppImage
```

The checksum command should print `OK`. `chmod +x` grants this file permission
to run; `./` means “the file in this folder.” The `&&` chain stops if a step fails.

If you see a **FUSE** or mounting error, use this instead after verification:

```sh
./OMXTerm-0.18.0-arm64.AppImage --appimage-extract-and-run
```

FUSE is the Linux facility normally used to open an AppImage's bundled
filesystem. Extraction mode unpacks it temporarily and runs the same app without
FUSE mounting. This build does **not** require installing `libfuse2`; do not change
system permissions or security settings just to enable mounting.

**Linux runs without the Chromium sandbox**, an additional isolation layer,
in both launch modes and through the desktop helper. Context isolation remains
enabled but is not a replacement for that sandbox. Run as an ordinary user.
[Why this policy exists](docs/adr/0024-disable-the-chromium-sandbox-on-linux.md).

#### Add to the application menu

Download the optional helper and its checksum beside the AppImage, then run:

```sh
sha256sum --check OMXTerm-0.18.0-arm64.AppImage.sha256 &&
  sha256sum --check linux_install.sh.sha256 &&
  chmod +x linux_install.sh &&
  ./linux_install.sh install ./OMXTerm-0.18.0-arm64.AppImage
```

Launch **OMXTerm** from your application menu. The helper copies it into your
user folder and chooses the FUSE or extraction mode automatically. It does not
need `sudo` or download anything. Keep the helper if you want to uninstall later.

The **`linux_install.sh`** helper supports one optional compatibility mode for
graphics failures and conservative Hyprland interface-scale setup. Start with
normal installation; see the [helper guide](docs/linux-installer.md) if needed.

Want blur on GNOME, KDE Plasma, or Hyprland? See the optional
[Linux desktop tips](docs/configuration.md#linux-desktop-tips), including
[Try Omarchy VM graphics troubleshooting](docs/configuration.md#try-omarchy-vm-graphics-troubleshooting);
extensions are
not required to use OMXTerm.

### Windows

1. Install the [Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
   if it is missing. This supplies Microsoft runtime libraries that the app needs;
   choose **ARM64**, not x64. Its installer may ask for administrator approval.
2. Open the download folder in Explorer. Type `powershell` in its address bar
   and press Enter to open PowerShell in that folder. Paste the verification
   block below; it reads the two downloaded files and installs nothing.

   <details>
   <summary>PowerShell checksum verification — expand and copy the whole block</summary>

   ```powershell
   $installerName = "OMXTerm-0.18.0-arm64.exe"
   $checksumRecord = Get-Content -LiteralPath "$installerName.sha256" -Raw -ErrorAction Stop
   $checksumMatch = [regex]::Match(
     $checksumRecord,
     '\A(?<digest>[0-9A-Fa-f]{64})[ \t]+(?<filename>\*?\S+)(?:\r?\n)?\z'
   )

   if (-not $checksumMatch.Success) { throw "The checksum file is malformed." }
   $recordedName = $checksumMatch.Groups['filename'].Value.TrimStart('*')
   if ($recordedName -cne $installerName) { throw "The checksum names another installer." }
   $expectedHash = $checksumMatch.Groups['digest'].Value
   $actualHash = (Get-FileHash -LiteralPath $installerName -Algorithm SHA256 -ErrorAction Stop).Hash
   if (-not [StringComparer]::OrdinalIgnoreCase.Equals($actualHash, $expectedHash)) {
     throw "SHA-256 verification failed."
   }

   Write-Host "SHA-256 verification succeeded for $installerName"
   ```

   </details>

3. Only after verification succeeds, run **OMXTerm-0.18.0-arm64.exe**. It installs
   for your user without administrator elevation. Open OMXTerm from Start.

The installer is unsigned. If SmartScreen warns about an unknown publisher and
you trust the verified package, use **More info → Run anyway** for that file.
Keep SmartScreen and Defender enabled; do not bypass an organizational policy.

Windows PowerShell is the default shell. A **shell** is the program that reads
your commands inside the terminal. You can [choose another installed shell](docs/configuration.md#choose-the-windows-default-shell),
such as PowerShell 7 or Git Bash; neither is required to start using OMXTerm.
Windows 11 ARM64 build 26200 was used for this release's verification.

## First session

Launch OMXTerm to open your shell in your home folder. Each tab runs an
independent session; closing it ends that session. OMXTerm does not restore
closed tabs. For persistent work, a separate tool such as tmux can manage sessions.

Try `pwd` followed by Enter to show the current directory in the default shells.
You do not need extra fonts, dotfiles, or a theme to get started.

| Action             | macOS             | Linux and Windows   |
| ------------------ | ----------------- | ------------------- |
| New tab            | `Cmd+T`           | `Ctrl+Shift+T`      |
| Copy selected text | `Cmd+C`           | `Ctrl+Shift+C`      |
| Paste              | `Cmd+V`           | `Ctrl+Shift+V`      |
| Zoom in / out      | `Cmd++` / `Cmd+-` | `Ctrl++` / `Ctrl+-` |
| Reload settings    | `Cmd+Shift+,`     | `Ctrl+Shift+,`      |

For `+`, include the Shift needed to type that symbol on your keyboard. On Linux
and Windows, press and release **Alt alone** to open the application menu,
even with the title bar hidden. On macOS, use the menu bar at the top of the screen.
**Ctrl+C interrupts a running command; it does not copy text.**

On first opening, OMXTerm creates an editable configuration, a snippet example,
and the default theme. If `config.json` already exists, it leaves the entire
starter kit alone. No manual setup is required. When you want more:

- [Everyday use](docs/usage.md) — shortcuts, tabs, images, paste, and troubleshooting.
- Complete setup examples: [macOS](docs/quick-start/macos.md),
  [Linux](docs/quick-start/linux.md), [Windows](docs/quick-start/windows.md).
- [Configuration reference](docs/configuration.md) — settings, themes, keybinds,
  and snippets, with live-reload and restart guidance.
- [OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) — edit themes and
  configuration in your browser, then [apply the exported files](docs/configuration.md#edit-visually-with-omxterm-studio).

OMXTerm focuses on local terminal sessions. Run SSH clients and coding agents as
ordinary CLI tools inside it. Built-in splits, session restoration, AI assistance,
SSH brokering, shell integration, and automatic updates are not included.

## Updating or uninstalling

There is no automatic updater. Download a new release and verify its checksum,
then quit OMXTerm before replacing it. Back up your configuration first.

- **macOS:** replace OMXTerm.app in Applications. To uninstall, move that app to Trash.
- **Linux, direct AppImage:** replace the file you launch; delete it to uninstall.
- **Linux, desktop helper:** verify the new AppImage and matching helper, then run
  that helper's `install` command again. To remove the installed app and menu entry,
  run your verified helper with `uninstall`, for example
  `./linux_install.sh uninstall`.
- **Windows:** run the verified new installer to update. To uninstall, use
  **Settings → Apps → Installed apps → OMXTerm → Uninstall**.

These steps leave your configuration, themes, snippets, and local logs alone.
Their locations are in [Configuration](docs/configuration.md) and
[Local diagnostics](docs/usage.md#local-diagnostics).

## Privacy and security

OMXTerm sends no telemetry, analytics, crash reports, update checks, or remote
logs. Its bounded local logs exclude terminal input/output, clipboard data,
configuration contents, commands, and titles. Programs you launch retain their
normal filesystem and network access.

The renderer uses context isolation and disabled Node integration. Chromium
sandboxing is enabled on macOS and Windows, with the Linux exception described
above. The [product contract](docs/spec.md) documents the full boundaries.
Report vulnerabilities privately through the [security policy](SECURITY.md).

## Help improve OMXTerm

**You do not need to write code to help.** Use it in your everyday work, tell us
what failed, point out a confusing instruction, or help reproduce an existing
report. Linux and Windows feedback is especially welcome.

[Open a bug report](https://github.com/luizomf/omxterm/issues/new?template=bug-report.md)
with your OMXTerm version, operating system/architecture, what you did, and what
you expected. You do not need to diagnose the cause. Review screenshots and
remove sensitive information before sharing. For x64 development, start with
[Linux #223](https://github.com/luizomf/omxterm/issues/223) or
[Windows #224](https://github.com/luizomf/omxterm/issues/224).

See [Contributing](CONTRIBUTING.md) for the contribution path and development
setup, or the [documentation map](docs/README.md) for more references.

## License

OMXTerm is available under the [MIT License](LICENSE). Thanks to
[Restty](https://github.com/wiedymi/restty),
[Ghostty](https://github.com/ghostty-org/ghostty), and the other projects that
make it possible. Bundled components retain their terms in
[Third-Party Notices](THIRD_PARTY_NOTICES.md).
