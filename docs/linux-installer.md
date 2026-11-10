# Linux desktop installer

An AppImage is a single Linux app file you can run without installing it. You can also use `linux_install.sh` to put OMXTerm in your user folder and add it to your application menu.

Get the AppImage, `linux_install.sh`, and their `.sha256` files from your computer's row in the [download index](../README.md#platforms-and-downloads). ARM64 is for 64-bit Arm computers; x64 is for Intel/AMD. For system requirements, see the [Linux installation guide](installation.md#linux).

## Install to your application menu

Download the files from the same target row. Open Terminal, go to the folder containing them (for example, `cd ~/Downloads`), and replace `VERSION` with your downloaded version. Use `x64` instead of `arm64` on Intel/AMD. The download table lists a helper for each target, but x64 helper installation has not been tested ([coverage](installation.md#linux)). Run as your normal user; you do not need `sudo`:

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

It checks whether your system can open an AppImage directly or needs `--appimage-extract-and-run` instead. It configures the launcher to use X11, a Linux window system; on Wayland desktops, a compatibility layer called XWayland runs X11 apps.

## Only if graphics fail

If normal launch fails, you can try the optional compatibility mode. It may still fail, is slower, and has lower security guarantees; see the [graphics decision](adr/0037-allow-the-linux-software-webgl-fallback.md). Install with the `--compatibility` flag:

```sh
./linux_install.sh install --compatibility "$appimage"
```

Compatibility mode adds `LIBGL_ALWAYS_SOFTWARE=1` to force CPU rendering and `--ignore-gpu-blocklist` to tell Chromium to ignore its graphics blocklist. To switch back to normal mode later, run `./linux_install.sh install "$appimage"` without `--compatibility`.

See [graphics troubleshooting](linux-desktop.md#graphics-troubleshooting) if you are launching the AppImage directly from a terminal instead of the app menu.

## Interface size on Hyprland

When you run `linux_install.sh` in Hyprland with XWayland zero-scaling enabled and all monitors using the same scale factor, the installer adds `--force-device-scale-factor` to the menu entry so controls match your display.

If you change monitor scales later, rerun `./linux_install.sh install "$appimage"` to refresh the desktop entry, or see [high-resolution display tips](linux-desktop.md#small-interface-text-on-a-hidpi-display) and [Hyprland/Omarchy tips](linux-desktop.md#hyprland-including-omarchy).

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
