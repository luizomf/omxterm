# Linux desktop installer

**Availability:** `linux_install.sh` is prepared on the development branch for
the release after **0.17.0**. It has not been published yet. For the current
release, use the [0.17.0 download and installation instructions](../README.md#linux).
Those original version-bearing helper assets remain unchanged.

## Normal installation

Download the AppImage, helper and both checksums from the **same release**.
Replace `VERSION` below with the version you downloaded, then run as your normal
user, **not with sudo**:

```sh
appimage=./OMXTerm-VERSION-arm64.AppImage
sha256sum --check "$appimage.sha256" &&
  sha256sum --check linux_install.sh.sha256 &&
  chmod +x linux_install.sh &&
  ./linux_install.sh install "$appimage"
```

Open **OMXTerm** from your application menu. There is no desktop/GPU questionnaire:
the helper installs the local AppImage, icon and menu entry, chooses the available
FUSE/extraction mode, and selects the supported X11/XWayland backend. It downloads
nothing, installs no system packages and does not change your terminal preferences.
Checksums detect changed bytes; they do not establish publisher trust.

## Only if graphics fail

For a blank window or graphics initialization failure in a VM or with an
incompatible driver, try the one optional installation mode:

```sh
./linux_install.sh install --compatibility "$appimage"
```

Then open OMXTerm from the application menu again. **Compatibility mode may be
slower or less stable**; do not enable it merely because you use Hyprland or
Omarchy. It is not a fix for every startup or configuration error. A normal
`install` without the option removes it. Already running windows are unchanged.

<details>
<summary>What does compatibility mode change?</summary>

Only the installed desktop entry gets `env LIBGL_ALWAYS_SOFTWARE=1` and
`--ignore-gpu-blocklist`, alongside `--ozone-platform=x11`. Mesa then uses CPU
rendering and Chromium's GPU compatibility blocklist is bypassed for that
process. OMXTerm still requires a functioning WebGL2 implementation; this is not
an alternate Surface or a guarantee of graphics support. The AppImage bytes,
sandbox policy and global environment are unchanged. Extraction mode, if needed,
remains before the Electron options.

Launching a bare AppImage or a separately created wrapper bypasses the desktop
entry and its options. See the [tested Try Omarchy workaround](configuration.md#try-omarchy-vm-graphics-troubleshooting)
for the older 0.17.0 helper and manual launches.

</details>

## Interface size on Hyprland

When installed from an active Hyprland session, the helper can match the interface
to the monitor scale automatically. It does so only when XWayland zero-scaling is
enabled and **all reported monitors have the same scale**. It reports the chosen
scale after installation; it never assumes every display needs 2x.

This is an install-time choice, not live monitor detection. Reinstall from your
current desktop session after changing displays to refresh it. Mixed-scale
monitors, missing optional `hyprctl`/`timeout`/`awk` tools, unavailable session data
or failed queries leave normal Electron scaling unchanged. Terminal font zoom
is independent. For a manual adjustment or undo, back up
`~/.local/share/applications/omxterm.desktop` and edit/remove only its
`--force-device-scale-factor=...` argument; reinstalling replaces that menu entry.
See the [HiDPI tips](configuration.md#small-interface-text-on-a-hidpi-display).

The helper never changes your desktop's scale, compositor blur, title bar or
configuration files. For those preferences, use the optional
[Hyprland/Omarchy desktop tips](configuration.md#hyprland-including-omarchy).

## Update, help and uninstall

For an update, verify the new release's two downloads and rerun `install` with its
AppImage. Repeat `--compatibility` only if you still need it; a normal installation
resets that choice. Custom desktop-entry edits are replaced. A failed installation
restores the complete previous installation.

```sh
./linux_install.sh --help
./linux_install.sh --version
./linux_install.sh uninstall
```

The stable filename does not hide the release identity: `--version`, the versioned
release URL and its checksum identify the helper. Uninstall removes only these
three owned files, preserving your settings, other files and parent directories:

- `~/.local/opt/omxterm/OMXTerm.AppImage`
- `~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png`
- `~/.local/share/applications/omxterm.desktop`
