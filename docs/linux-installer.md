# Linux desktop installer

You can run the OMXTerm AppImage directly, or use `linux_install.sh` to install it into your user folder and add OMXTerm to your desktop application menu.

Get the AppImage, `linux_install.sh`, and their `.sha256` files from the [latest release](../README.md#platforms-and-downloads). For system requirements, see the [Linux installation guide](installation.md#linux).

## Install to your application menu

Download the files from the same release, replace `VERSION` with your downloaded version, and run as your normal user (no `sudo` needed):

```sh
appimage=./OMXTerm-VERSION-arm64.AppImage
sha256sum --check "$appimage.sha256" &&
  sha256sum --check linux_install.sh.sha256 &&
  chmod +x linux_install.sh &&
  ./linux_install.sh install "$appimage"
```

Once installed, open **OMXTerm** from your application launcher. The script places three files in your user directory:

- `~/.local/opt/omxterm/OMXTerm.AppImage`
- `~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png`
- `~/.local/share/applications/omxterm.desktop`

It automatically detects whether your system supports direct FUSE mounting or needs `--appimage-extract-and-run`, and configures the launcher to use X11/XWayland.

## Only if graphics fail

OMXTerm already falls back to software WebGL when the GPU cannot provide WebGL2, as in virtual machines without 3D acceleration. If it still opens a blank window or reports a WebGL2 initialization error, for example with an older GPU driver, install with the `--compatibility` flag:

```sh
./linux_install.sh install --compatibility "$appimage"
```

Compatibility mode adds `LIBGL_ALWAYS_SOFTWARE=1` (Mesa software rendering) and `--ignore-gpu-blocklist` to the application-menu launcher. Because software rendering uses the CPU, only enable this mode if normal installation fails. To switch back to normal mode later, run `./linux_install.sh install "$appimage"` without `--compatibility`.

See [graphics troubleshooting](linux-desktop.md#graphics-troubleshooting) if you are launching the AppImage directly from a terminal instead of the app menu.

## Interface size on Hyprland

When you run `linux_install.sh` inside an active Hyprland session where XWayland zero-scaling is enabled and all monitors use the same scale factor, the installer automatically adds `--force-device-scale-factor` to the desktop entry so UI controls match your display.

If you change monitor scales later, rerun `./linux_install.sh install "$appimage"` to refresh the desktop entry, or see [HiDPI tips](linux-desktop.md#small-interface-text-on-a-hidpi-display) and [Hyprland/Omarchy tips](linux-desktop.md#hyprland-including-omarchy).

## Update or uninstall

- **Update:** download the new release's AppImage and `linux_install.sh`, verify their checksums, quit OMXTerm, and run `./linux_install.sh install "$appimage"` again (include `--compatibility` if you still use it).
- **Uninstall:** remove the installed app, icon, and menu entry while keeping your configuration files in `~/.config/omxterm`:

```sh
./linux_install.sh uninstall
```

- **Help and version:**

```sh
./linux_install.sh --help
./linux_install.sh --version
```

<a id="if-installation-fails"></a>

## Troubleshooting installation errors

- **Conflicting file or directory:** if one of the three destination paths above is a directory instead of a file, move it out of the way and run `install` again.
- **Interrupted update:** if an error occurs while replacing an existing installation, the script automatically restores your previous files from temporary backups. If a filesystem error prevents automatic rollback, the script prints the backup paths so you can restore them manually.
