# Install OMXTerm

Get the **[latest download and its checksum](../README.md#platforms-and-downloads)**
for your system. OMXTerm is ready to run; building from source is for development.

**[macOS](#macos)** · **[Linux](#linux)** · **[Windows](#windows)** ·
**[Update or uninstall](#updating-or-uninstalling)**

The packages below are version **0.20.0**, for **ARM64** processors. A checksum
is a file's fingerprint: checking it catches incomplete or changed downloads.
It does not verify the publisher's identity; these packages have no verified
publisher signature. Continue with installation only if the check succeeds and
you trust the download.

## macOS

1. Check **Apple menu → About This Mac** for an **Apple Silicon chip (M1 or
   later)** and **macOS 12 Monterey or newer**. This is the runtime minimum,
   not a claim that every compatible macOS version has been tested.
2. Download the **DMG** and its **.sha256** file into the same folder.
3. Open **Terminal** from Applications → Utilities. Type `cd ` (including the
   space), drag that folder from Finder into Terminal, and press Enter.
4. Paste this command and press Enter. A successful check ends in `OK`:

   ```sh
   shasum -a 256 -c OMXTerm-0.20.0-arm64.dmg.sha256
   ```

5. Open the DMG, drag **OMXTerm.app** to **Applications**, and eject the DMG.
6. Open OMXTerm from Applications.

### If macOS blocks the first launch

The app isn't Apple Developer ID-signed or notarized, so macOS may warn that it
cannot verify the developer. If you trust the verified download, follow Apple's
[Open Anyway instructions](https://support.apple.com/102445) in
**System Settings → Privacy & Security**. This approves that app while keeping
system-wide protections enabled.

macOS may also ask for access to folders you use, such as Documents. Approve the
access your work needs; ordinary terminal use doesn't require Full Disk Access.
An update may ask for folder access again.

## Linux

### Check requirements

Run these in your existing terminal:

```sh
uname -m
getconf GNU_LIBC_VERSION
```

You need **`aarch64`** and **glibc 2.42 or newer**. Older distributions, including
Ubuntu 24.04, cannot run this AppImage. Use a compatible distribution rather than
replacing its system glibc. The [release record](releases/0.20.0.md) lists the
tested environment.

OMXTerm also needs `fontconfig` for fonts and X11 or **XWayland** for its window.
XWayland lets it run on a Wayland desktop. The optional desktop helper uses
`file` to identify the package. Install missing prerequisites with your package
manager:

```sh
# Ubuntu / Debian-based systems with compatible system libraries
sudo apt install fontconfig file xwayland
```

```sh
# Fedora
sudo dnf install fontconfig file xorg-x11-server-Xwayland
```

`sudo` is for installing these system packages. Run OMXTerm and its helper as
**your ordinary user**. OMXTerm runs without the Chromium sandbox on Linux;
[read about this security tradeoff](adr/0024-disable-the-chromium-sandbox-on-linux.md).

### Verify and launch

Download the **AppImage** and its **.sha256** file into the same folder. An
AppImage bundles the app into one runnable file.

Open that folder in your file manager and choose **Open in Terminal** (the label
varies by desktop), then run:

```sh
sha256sum --check OMXTerm-0.20.0-arm64.AppImage.sha256 &&
  chmod +x OMXTerm-0.20.0-arm64.AppImage &&
  ./OMXTerm-0.20.0-arm64.AppImage
```

The checksum should print `OK`. `chmod +x` makes the file runnable; `./` means
“the file in this folder.” The `&&` chain stops if a step fails.

If you see a **FUSE** or mounting error, use extraction mode after verification:

```sh
./OMXTerm-0.20.0-arm64.AppImage --appimage-extract-and-run
```

This temporarily unpacks the app instead of mounting its bundled filesystem.
It works without installing `libfuse2` or changing system security settings.

### Add to the application menu (optional)

Download **linux_install.sh** and its checksum from the same release, beside
the AppImage. In that folder, run:

```sh
sha256sum --check OMXTerm-0.20.0-arm64.AppImage.sha256 &&
  sha256sum --check linux_install.sh.sha256 &&
  chmod +x linux_install.sh &&
  ./linux_install.sh install ./OMXTerm-0.20.0-arm64.AppImage
```

Open **OMXTerm** from your application menu. The helper copies it into your user
folder and chooses mounting or extraction automatically. Keep the helper for
updates and uninstalling. See the [desktop helper guide](linux-installer.md)
for graphics compatibility and Hyprland display scaling.

## Windows

1. Check **Settings → System → About → System type** for an **ARM-based processor**.
2. Install the [Microsoft Visual C++ Redistributable for ARM64](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist)
   if it's missing. These are runtime libraries OMXTerm needs. That install may
   request administrator approval.
3. Download the **EXE installer** and its **.sha256** file into the same folder.
4. Open that folder in Explorer. Type `powershell` in its address bar and press
   Enter. Expand and paste the whole verification block below:

   <details>
   <summary>Verify the Windows download</summary>

   ```powershell
   $installerName = "OMXTerm-0.20.0-arm64.exe"
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

5. After **“SHA-256 verification succeeded”** appears, run
   **OMXTerm-0.20.0-arm64.exe**. It installs for your user. Open OMXTerm from Start.

The installer is unsigned. If SmartScreen warns about an unknown publisher and
you trust the verified package, choose **More info → Run anyway** for that file.
Keep SmartScreen and Defender enabled. On a managed computer, follow your
organization's installation policy.

OMXTerm starts Windows PowerShell by default. You can later
[choose another installed shell](configuration.md#choose-the-windows-default-shell),
such as PowerShell 7 or Git Bash.

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
