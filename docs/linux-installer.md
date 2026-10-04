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

<details>
<summary>Recorded Cinnamon, Xfce and MATE compatibility checks</summary>

These are reports from specific development environments, not a promise for all
Linux desktops. The records below do not identify full source commits, so the
shared development version cannot establish exact-build equivalence.

## Additional verified compatibility: Cinnamon (X11)

A maintainer verified OMXTerm `0.20.1-dev.0` on **Fedora 44 ARM64 with
Cinnamon 6.6.7 and Muffin (X11)**, using the standard **Cinnamon** login-session
entry, not **Cinnamon on Wayland (Experimental)**. The following worked:

- Dependency installation with `npm ci`.
- Linux packaging with `npm run package:linux`.
- Installation with `linux_install.sh` and use of the installed terminal.
- Development mode with `npm run dev`.

Known limitations in that environment:

- Background blur was unavailable. Blur is [best effort](configuration.md), not
  a requirement for using the terminal.
- The test suite finished with **2,194 passed, 41 skipped and two failed**. Both
  failures were the DPR 1 and DPR 2 cases in
  `test/integration/restty-hover-readiness.test.ts`, reporting
  `Restty hover stimulus-invalidated`. Their cause has not been established;
  this is neither a full-suite pass nor proof of broken user-visible hover.

This is additional verified desktop compatibility within Linux ARM64, not a
claim that every feature or every distribution running Cinnamon was tested.
The experimental Wayland session has the separate, limited working route below.

## Additional verified compatibility: Xfce

On the same Fedora 44 ARM64 installation, a maintainer also verified the Xfce
session with OMXTerm `0.20.1-dev.0`:

- `npm run dev`, `npm run package:linux`, and normal installation/uninstallation
  through `linux_install.sh` worked, without `--compatibility`.
- Configuration, fonts, shortcuts, snippets, showing/hiding the title and tab
  bars, dragging through the drag handles, and the Alt menu worked.
- Background transparency worked; background blur was unavailable.
- `npm run check:portable` completed with **2,196 passed, 41 skipped and zero
  failures**, followed by a successful build.

This verifies the tested Xfce environment, not a minimal Xfce-only installation:
GNOME and Cinnamon packages were also present. No desktop-performance comparison
is claimed because the session locked during the run.

Blur depends on the compositor and is separate from terminal functionality and
transparency. On GNOME, for example, application blur requires an extension such
as [Blur my Shell](quick-start/linux-desktop.md#ubuntu-with-gnome-blur-my-shell);
OMXTerm's blur setting alone is not enough.

## Additional verified compatibility: MATE

On the same Fedora 44 ARM64 installation, a maintainer verified `npm ci`,
`npm run dev`, `npm run package:linux`, and normal installation/uninstallation
through `linux_install.sh` in the MATE session. Title-bar controls, tabs, snippets
and background transparency also worked in manual use.

The maintainer reported one test failure: the DPR 1 fractional-geometry case in
`test/integration/restty-hover-readiness.test.ts`. The DPR 1.5 and DPR 2 cases
passed, as did the remaining tests in the run. The underlying error was not
captured in the supplied test summary, so it is not established as the same
failure as Cinnamon's. This is verified compatibility with a known test failure,
not a full-suite pass or qualification of a minimal MATE-only installation.

</details>

## Only if graphics fail

For a blank window or graphics initialization failure in a VM or with an
incompatible driver, try the one optional installation mode:

```sh
./linux_install.sh install --compatibility "$appimage"
```

Then open OMXTerm from the application menu again. **Compatibility mode may be
slower or less stable**, so start with normal installation. Run `install` without
the option to return to normal mode. These changes apply on the next launch.

In the tested Fedora environment, **Cinnamon on Wayland (Experimental)** failed
graphics initialization with the normal launch. Installing with
`--compatibility` and opening OMXTerm from the application menu produced a usable
terminal. **Development mode (`npm run dev`) did not work in that session**;
compatibility installation does not apply its launch options to development mode.
This is a working installed-terminal route, not full development or test-suite
compatibility for the experimental session. The standard Cinnamon (X11) session
does not require this workaround in the verified setup.

<details>
<summary>What does compatibility mode change?</summary>

Only the installed desktop entry gets `env LIBGL_ALWAYS_SOFTWARE=1` and
`--ignore-gpu-blocklist`, alongside `--ozone-platform=x11`. Mesa then uses CPU
rendering and Chromium's GPU compatibility blocklist is bypassed for that
process. OMXTerm still needs a functioning WebGL2 implementation. These options
apply only when launched through the installed menu entry.

Launching a bare AppImage or a separately created wrapper bypasses the desktop
entry and its options. See the [tested Try Omarchy workaround](quick-start/linux-desktop.md#try-omarchy-vm-graphics-troubleshooting)
for the older 0.17.0 helper and manual launches.

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
See the [HiDPI tips](quick-start/linux-desktop.md#small-interface-text-on-a-hidpi-display).

For blur and other desktop preferences, see the
[Hyprland/Omarchy tips](quick-start/linux-desktop.md#hyprland-including-omarchy).

## Update, help and uninstall

For an update, verify the new release's two downloads and rerun `install` with its
AppImage. Repeat `--compatibility` only if you still need it; a normal installation
resets that choice. Custom desktop-entry edits are replaced.

Once staging begins, failures before replacement completes trigger rollback.
Invalid input is rejected before replacing installed files. If restoration
succeeds, the previous installation is restored. If the
filesystem prevents restoration, the helper reports **recovery incomplete** and
the locations of retained originals. Preserve those backups before retrying or
uninstalling; resolve the filesystem error and recover the originals from the
reported locations. The initial installation error remains in the output and
exit status.

**Cleanup limitation:** after all three replacements succeed, the helper disables
rollback and removes staging and old backups. A failure in this final cleanup
can return a nonzero status even though the new app, icon, and desktop entry are
already installed. It does not restore the previous installation or provide the
structured recovery report above; some old backups may already be gone. Check
the three installed files and the error output before retrying or removing any
remaining `.omxterm-*-backup.*` directories. Keep a separate copy of the old
AppImage if you want to be able to return to it.

The install-time mount probe has bounded discovery and TERM/KILL shutdown. A
shutdown timeout is a failed installation, not a reason to silently install or
retry. Interruption also cleans up the owned mount child. If the helper cannot
confirm termination, it reports the child PID and retains its staging directory
(including `mount-output`); preserve that state and inspect the reported child
and mount before removing staging or retrying. A kernel-stuck child may require
OS-level recovery; the helper does not claim that KILL always completes.

```sh
./linux_install.sh --help
./linux_install.sh --version
./linux_install.sh uninstall
```

Uninstall removes these three files and keeps your settings:

- `~/.local/opt/omxterm/OMXTerm.AppImage`
- `~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png`
- `~/.local/share/applications/omxterm.desktop`

Install checks all three filenames before replacing anything. If one is a
directory or another unsupported entry (such as a FIFO), it stops and leaves
the previous installation and unrelated contents unchanged. Move the conflicting
entry somewhere safe before retrying; do not delete it just to install OMXTerm.
Existing regular files and symlinks are replaced. Symlink targets are never
changed, including when the link is dangling or points to a directory; uninstall
also removes only the link itself.
