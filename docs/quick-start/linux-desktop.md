# Linux desktop tips

Use this guide when you want background blur, a larger interface on a HiDPI
display, or help starting OMXTerm in a Try Omarchy VM. For ordinary setup, start
with [Linux installation](../installation.md#linux) and the
[Linux quick start](linux.md).

OMXTerm uses X11, or XWayland in a Wayland desktop session. Published Linux
packages are ARM64. The desktop controls transparency and blur; choose the
section for your desktop rather than just your distribution:

- [GNOME](#ubuntu-with-gnome-blur-my-shell)
- [KDE Plasma](#fedora-with-kde-plasma-and-other-kde-desktops)
- [Hyprland / Omarchy](#hyprland-including-omarchy)
- [HiDPI interface size](#small-interface-text-on-a-hidpi-display)
- [Try Omarchy VM graphics](#try-omarchy-vm-graphics-troubleshooting)

For background-only transparency, keep whole-window opacity at full strength
in your desktop's settings and use OMXTerm's
[`window.transparency`](../configuration.md#background-transparency-and-blur).
That keeps text solid. Desktop-wide blur settings can affect other applications
and graphics performance.

## Ubuntu with GNOME: Blur my Shell

First check the [AppImage's glibc requirement](../installation.md#check-requirements).
These desktop preferences do not make an older distribution such as Ubuntu
24.04 compatible with the current package.

1. Install **Extension Manager**:

   ```sh
   sudo apt install gnome-shell-extension-manager
   ```

2. Open it, find **Blur my Shell** by **aunetx**, and install/enable a version
   compatible with your GNOME release.
3. In the extension's **Applications** preferences, enable application blur
   and add the running **OMXTerm** window to its allowlist/whitelist. Labels
   vary by extension version.
4. Set OMXTerm's `window.transparency` above `0` and reload its configuration.
   Adjust blur strength in the extension. On GNOME, the extension supplies blur;
   OMXTerm's `window.blur` setting alone is not enough.

To undo, remove OMXTerm from the application list or disable the extension.
Set transparency to `0` for an opaque terminal. See the
[Blur my Shell project](https://github.com/aunetx/blur-my-shell) for supported
GNOME versions and troubleshooting.

## Fedora with KDE Plasma (and other KDE desktops)

KDE Plasma includes a **Blur** desktop effect. In **System Settings**, search
for [Desktop Effects](https://docs.kde.org/stable_kf6/en/kwin/kcontrol/kwineffects/index.html),
enable **Blur**, and adjust its strength if desired.

Set OMXTerm's `window.blur` to `true` and `window.transparency` above `0`, then
reload. Its KDE request uses `xprop`. If blur has no effect, check for it:

```sh
command -v xprop
```

Install the `xprop` package on Fedora (`sudo dnf install xprop`) or `x11-utils`
on Ubuntu/Kubuntu (`sudo apt install x11-utils`) if needed. Missing `xprop`
affects the blur request, not terminal startup.

To return to an opaque terminal, set `blur` to `false` and transparency to `0`.

## Hyprland, including Omarchy

Omarchy is an Arch-based desktop built around Hyprland. OMXTerm uses
**X11 through XWayland** here. Some setups export
`ELECTRON_OZONE_PLATFORM_HINT=wayland`; for a direct AppImage launch, explicitly
select X11 if needed:

```sh
./OMXTerm-0.17.0-arm64.AppImage --ozone-platform=x11
```

Use your downloaded filename. The desktop installer places the executable at
`~/.local/opt/omxterm/OMXTerm.AppImage`. The
[helper available since 0.18.0](../linux-installer.md) records X11 in its desktop
entry; a command typed in a terminal only affects that launch.

Hyprland provides its own blur. Check whether it is enabled:

```sh
hyprctl getoption decoration:blur:enabled
```

The tested Omarchy setup had it disabled. For the **Lua configuration used by
Hyprland 0.56.1 in that setup**, back up `~/.config/hypr/looknfeel.lua` and add
this user override, retaining your other settings:

```lua
hl.config({
  decoration = {
    blur = {
      enabled = true,
      size = 8,
      passes = 1,
    },
  },
})
```

Reload with `hyprctl reload config-only`, then check `hyprctl configerrors` and
the blur option again. In OMXTerm, keep `window.transparency` above `0` and
reload its configuration separately. The `window.blur` setting sends a
KDE-specific hint; Hyprland uses its own policy instead.

This enables blur for transparent windows generally. Per-window rules can
still suppress it. Start with one pass, especially in a VM; higher size/pass
counts can cost performance. To undo the desktop change, restore your backup
or set this override's `enabled` to `false`, then reload Hyprland. To make only
OMXTerm opaque, set its transparency to `0`.

Edit your user configuration rather than defaults under `/usr/share/omarchy`.
Other versions may use different files or syntax; follow the installed version's
[Hyprland blur documentation](https://wiki.hypr.land/Configuring/Basics/Variables/#blur)
instead of mixing Lua and older hyprlang examples.

For a compact tiled layout, optionally set OMXTerm's `window.showTitleBar` to
`false` for new windows, or toggle the current window with `Ctrl+Shift+D`.
Press and release Alt alone to open the menu with the title bar hidden.

## Small interface text on a HiDPI display

Terminal font zoom (`Ctrl++` / `Ctrl+-`) changes terminal text, while Electron's
display scale also affects the title row, tabs, and sidebar.

The [Linux helper since 0.18.0](../linux-installer.md#interface-size-on-hyprland)
can record a uniform Hyprland monitor scale at installation time. For direct
AppImage launches, the older helper, or manual adjustments, inspect:

```sh
hyprctl monitors
hyprctl getoption xwayland:force_zero_scaling
```

With monitor scale `2` and zero-scaling enabled, XWayland windows are not
enlarged by the compositor. In the tested setup, adding
`--force-device-scale-factor=2` to the OMXTerm launch command made the whole
interface readable. Choose the value for your display; `2` is only an example.

This is an Electron launch option, not a `config.json` key. Add it before `-e`
when launching a command. To keep it, add it to your application launcher; a
bare AppImage launch bypasses that customization. Remove it if the interface
becomes too large or automatic scaling works after a display change. See
Hyprland's [XWayland scaling notes](https://wiki.hypr.land/Configuring/Advanced-and-Cool/XWayland/).

## Try Omarchy VM: graphics troubleshooting

[Try Omarchy](https://github.com/omacom/try-omarchy) bundles an ARM64 Linux VM
for Apple Silicon Macs. If OMXTerm opens a window but reports a rendering-backend
initialization failure, its virtual GPU may not provide the WebGL2 backend
needed before the shell can start.

A test of the unchanged **0.17.0 AppImage**, Hyprland **0.56.1**, XWayland
**24.1.13**, and Mesa **26.2.2** reproduced this failure with VirGL advertising
OpenGL **2.1** / OpenGL ES **3.0**. Selecting ANGLE GLES did not fix it. This
per-process workaround displayed a shell:

```sh
LIBGL_ALWAYS_SOFTWARE=1 ./OMXTerm-0.17.0-arm64.AppImage \
  --ozone-platform=x11 --ignore-gpu-blocklist
```

Use your AppImage filename. `LIBGL_ALWAYS_SOFTWARE=1` selects Mesa's CPU
renderer; `--ignore-gpu-blocklist` bypasses Chromium's GPU compatibility
blocklist for this process. Both were needed in that test. They can reduce
performance or stability, so keep them local to this launch rather than
exporting them globally. This is a VM workaround, not a general Hyprland
requirement or evidence of working GPU acceleration. OMXTerm still needs a
working WebGL2 backend.

The [helper since 0.18.0](../linux-installer.md#only-if-graphics-fail) can save
these options with `install --compatibility`. A normal reinstall removes them.

<details>
<summary>Keep the workaround with the older 0.17.0 desktop helper</summary>

If the workaround helps your VM and you want it in the application-menu
launcher:

1. Back up `~/.local/share/applications/omxterm.desktop` and inspect its `Exec=`
   line. Note whether it contains `--appimage-extract-and-run`.
2. Create `~/.local/bin` if needed and save the script below as
   `~/.local/bin/omxterm`. If that name already exists, choose another rather
   than replacing it.
3. Make the script executable with `chmod +x ~/.local/bin/omxterm`.
4. Replace only the desktop entry's `Exec=` line with the wrapper's absolute
   path, for example `Exec="/home/YOUR_USER/.local/bin/omxterm" %U`. Replace
   `YOUR_USER`; desktop entries do not expand `~` or `$HOME`.

```sh
#!/bin/sh
# Local Try Omarchy VM workaround.
exec env LIBGL_ALWAYS_SOFTWARE=1 \
  "$HOME/.local/opt/omxterm/OMXTerm.AppImage" \
  --ozone-platform=x11 --ignore-gpu-blocklist "$@"
```

**Keep extraction mode if the original entry used it.** Add
`--appimage-extract-and-run` immediately after the AppImage path and before
`--ozone-platform=x11`. The installer selected it because FUSE mounting failed;
removing it can break startup. Keep any separately tested scale option too,
such as `--force-device-scale-factor=2`, before `"$@"`.

The desktop entry and wrapper now share these options. A bare AppImage launch
bypasses them. The `omxterm` command is available when `~/.local/bin` is on
`PATH`; the AppImage itself remains unchanged.

To undo, restore the original desktop entry and remove only your wrapper.
Keep the X11 override if your session still forces Wayland. A helper reinstall
can replace the customized desktop entry; reapply only the options still needed.

</details>
