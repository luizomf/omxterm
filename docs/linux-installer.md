# Linux desktop installer

Add OMXTerm to your application menu with `linux_install.sh`. Get the helper and
matching AppImage from the [release downloads](../README.md#platforms-and-downloads).
For your first install, start with the [Linux installation guide](installation.md#linux).

## Normal installation

Download the AppImage, helper and both checksums from the **same release**.
Replace `VERSION` below with the version you downloaded, then run as your
**ordinary user**:

```sh
appimage=./OMXTerm-VERSION-arm64.AppImage
sha256sum --check "$appimage.sha256" &&
  sha256sum --check linux_install.sh.sha256 &&
  chmod +x linux_install.sh &&
  ./linux_install.sh install "$appimage"
```

Open **OMXTerm** from your application menu. The helper installs the local app,
icon, and menu entry in your user folder. It automatically chooses mounting or
extraction and uses X11/XWayland. Spaces, literal percent signs and double quotes
in your home folder's path are preserved; no renaming or manual escaping is needed.

For a blank window, go to [graphics troubleshooting](#only-if-graphics-fail).
Blur depends on your desktop compositor; it is not required to use OMXTerm.

## Only if graphics fail

For a blank window or graphics initialization failure in a VM or with an
incompatible driver, try the one optional installation mode:

```sh
./linux_install.sh install --compatibility "$appimage"
```

Then open OMXTerm from the application menu again. **Compatibility mode may be
slower or less stable**, so start with normal installation. Run `install` without
the option to return to normal mode. These changes apply on the next launch.

<details>
<summary>What does compatibility mode change?</summary>

Only the installed desktop entry gets `env LIBGL_ALWAYS_SOFTWARE=1` and
`--ignore-gpu-blocklist`, alongside `--ozone-platform=x11`. Mesa then uses CPU
rendering and Chromium's GPU compatibility blocklist is bypassed for that
process. OMXTerm still needs a functioning WebGL2 implementation. These options
apply only when launched through the installed menu entry.

Launching a bare AppImage or a separately created wrapper bypasses the desktop
entry and its options. Compatibility installation also does not change
`npm run dev`. For a direct AppImage launch, see
[graphics troubleshooting](linux-desktop.md#graphics-troubleshooting).

</details>

## Interface size on Hyprland

When installed from an active Hyprland session, the helper can match the interface
to the monitor scale automatically. It does so only when XWayland zero-scaling is
enabled and **all reported monitors have the same scale**. It reports the chosen
scale after installation.

This is an install-time choice, not live monitor detection. Reinstall from your
current desktop session after changing displays to refresh it. Mixed-scale
monitors, missing optional `hyprctl`/`timeout`/`awk` tools, unavailable session data
or failed queries leave normal Electron scaling unchanged. Terminal font zoom
is independent. For a manual adjustment or undo, back up
`~/.local/share/applications/omxterm.desktop` and edit/remove only its
`--force-device-scale-factor=...` argument; reinstalling replaces that menu entry.
See the [HiDPI tips](linux-desktop.md#small-interface-text-on-a-hidpi-display).

For blur and other desktop preferences, see the
[Hyprland/Omarchy tips](linux-desktop.md#hyprland-including-omarchy).

## Update, help and uninstall

For an update, verify the new release's two downloads and rerun `install` with its
AppImage. Repeat `--compatibility` only if you still need it; a normal installation
resets that choice. Custom desktop-entry edits are replaced.

Keep a copy of your old AppImage if you want to return to that version.
To see help, check the helper version, or remove the installed app:

```sh
./linux_install.sh --help
./linux_install.sh --version
./linux_install.sh uninstall
```

Uninstall removes only these three files and keeps your settings:

- `~/.local/opt/omxterm/OMXTerm.AppImage`
- `~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png`
- `~/.local/share/applications/omxterm.desktop`

## If installation fails

Read the error before retrying. The next step depends on when installation stopped:

- **Invalid package or conflicting destination:** the previous installation is
  unchanged. If an owned filename above is a directory or another unsupported
  entry, move that entry somewhere safe before installing again.
- **Failure during replacement:** the helper tries to restore the previous
  installation. If it reports **recovery incomplete**, keep the reported backups,
  resolve the filesystem error, and recover those originals before retrying or
  uninstalling.
- **Failure during final cleanup:** the new app, icon, and desktop entry may
  already be installed despite the failure status. Check the three files above
  and the error output before retrying or removing remaining
  `.omxterm-*-backup.*` directories. Some old backups may already be gone.
- **Mount-probe shutdown timeout:** if the error names a remaining process and
  staging directory, preserve them for diagnosis. Check the reported process and
  mount before removing staging or retrying; a kernel-stuck process may need
  OS-level recovery.

Existing regular files and symlinks at the three owned filenames are replaced
as entries. Symlink targets stay unchanged; uninstall also removes only the
link itself. For the full replacement and recovery behavior, see the
[installer contract](spec.md#configuration-and-local-state).
