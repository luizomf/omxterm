# Linux desktop tips

Use this guide for background blur, a larger interface on a HiDPI display, or
VM and driver graphics troubleshooting. For ordinary setup, start with
[Linux installation](installation.md#linux) and [configuration](configuration.md).

OMXTerm uses X11, or XWayland in a Wayland desktop session. Published Linux
packages are ARM64. The desktop controls transparency and blur; choose the
section for your desktop rather than just your distribution:

- [GNOME](#ubuntu-with-gnome-blur-my-shell)
- [KDE Plasma](#fedora-with-kde-plasma-and-other-kde-desktops)
- [Hyprland / Omarchy](#hyprland-including-omarchy)
- [HiDPI interface size](#small-interface-text-on-a-hidpi-display)
- [Graphics troubleshooting](#graphics-troubleshooting)

For background-only transparency, keep whole-window opacity at full strength
in your desktop's settings and use OMXTerm's
[`window.transparency`](configuration.md#background-transparency-and-blur).
That keeps text solid. Desktop-wide blur settings can affect other applications
and graphics performance.

## Ubuntu with GNOME: Blur my Shell

First check the [AppImage's glibc requirement](installation.md#requirements).
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
select X11 if needed. Replace `VERSION` with your downloaded version:

```sh
./OMXTerm-VERSION-arm64.AppImage --ozone-platform=x11
```

The desktop installer places the executable at
`~/.local/opt/omxterm/OMXTerm.AppImage`. The [helper](linux-installer.md)
records X11 in its desktop entry; a command typed in a terminal only affects
that launch.

Hyprland provides its own blur. Check whether it is enabled:

```sh
hyprctl getoption decoration:blur:enabled
```

Back up the user configuration file used by your installation before editing it.
For a **Lua-based Hyprland configuration**, add this override, retaining your
other settings. Omarchy can use `~/.config/hypr/looknfeel.lua`; check that your
installation loads that file rather than creating an unused one.

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

For this Lua configuration, reload with `hyprctl reload config-only`, then check
`hyprctl configerrors` and the blur option again. In OMXTerm, keep
`window.transparency` above `0` and reload its configuration separately.
OMXTerm's `window.blur` setting sends a KDE-specific hint; Hyprland uses its own
policy instead.

This enables blur for transparent windows generally. Per-window rules can
still suppress it. Start with one pass, especially in a VM; higher size/pass
counts can cost performance. To undo the desktop change, restore your backup
or set this override's `enabled` to `false`, then reload Hyprland. To make only
OMXTerm opaque, set its transparency to `0`.

Edit your user configuration rather than defaults under `/usr/share/omarchy`.
Follow your installed version's
[Hyprland blur documentation](https://wiki.hypr.land/Configuring/Basics/Variables/#blur)
for its files and syntax; do not mix Lua and hyprlang examples.

For a compact tiled layout, optionally set OMXTerm's `window.showTitleBar` to
`false` for new windows, or toggle the current window with `Ctrl+Shift+D`.
Press and release Alt alone to open the menu with the title bar hidden.

## Small interface text on a HiDPI display

Terminal font zoom (`Ctrl++` / `Ctrl+-`) changes terminal text, while Electron's
display scale also affects the title row, tabs, and sidebar.

The [Linux helper](linux-installer.md#interface-size-on-hyprland) can record a
uniform Hyprland monitor scale at installation time. For direct AppImage
launches or manual adjustments, inspect:

```sh
hyprctl monitors
hyprctl getoption xwayland:force_zero_scaling
```

With monitor scale `2` and zero-scaling enabled, XWayland windows are not
enlarged by the compositor. Add `--force-device-scale-factor=2` to the OMXTerm
launch command if the interface is too small. Choose the value for your display;
`2` is only an example.

This is an Electron launch option, not a `config.json` key. Add it before `-e`
when launching a command. To keep it, add it to your application launcher; a
bare AppImage launch bypasses that customization. Remove it if the interface
becomes too large or automatic scaling works after a display change. See
Hyprland's [XWayland scaling notes](https://wiki.hypr.land/Configuring/Advanced-and-Cool/XWayland/).

## Graphics troubleshooting

OMXTerm needs a working **WebGL2** backend before its shell can start. A VM's
virtual GPU or an incompatible driver can prevent initialization. Start with
normal installation; if the window is blank or reports a rendering-backend
failure, try the [helper's compatibility mode](linux-installer.md#only-if-graphics-fail).

For a direct AppImage launch, replace `VERSION` with your downloaded version:

```sh
LIBGL_ALWAYS_SOFTWARE=1 ./OMXTerm-VERSION-arm64.AppImage \
  --ozone-platform=x11 --ignore-gpu-blocklist
```

`LIBGL_ALWAYS_SOFTWARE=1` selects Mesa's CPU renderer; `--ignore-gpu-blocklist`
bypasses Chromium's GPU compatibility blocklist for this process. Use these
options only for a graphics failure: they can reduce performance or stability. Keep them local to this launch rather than exporting them globally.
If initialization still fails, include the error and your GPU or VM details in
a [problem report](../CONTRIBUTING.md#report-a-problem).

For a FUSE mounting error, add `--appimage-extract-and-run` immediately after
the AppImage path, before the Electron options. The helper chooses this mode
automatically when installing. Its `install --compatibility` command also saves
the graphics options in the application-menu entry; a normal reinstall removes
them. A bare AppImage launch bypasses that entry.
