# Linux desktop tips

You only need this page for extras: background blur, a bigger interface on a HiDPI screen, or a VM that cannot draw the window. For a normal setup, see [Linux installation](installation.md#linux).

OMXTerm runs on X11, or through XWayland on Wayland desktops. Your desktop, not your distribution, decides how transparency and blur work, so pick the section that matches it:

- [GNOME](#ubuntu-with-gnome-blur-my-shell)
- [KDE Plasma](#fedora-with-kde-plasma-and-other-kde-desktops)
- [Hyprland / Omarchy](#hyprland-including-omarchy)
- [HiDPI interface size](#small-interface-text-on-a-hidpi-display)
- [Graphics troubleshooting](#graphics-troubleshooting)

> [!TIP]
> Use OMXTerm's [`window.transparency`](configuration.md#background-transparency-and-blur) instead of your desktop's whole-window opacity. That way only the background fades and your text stays solid.

## Ubuntu with GNOME: Blur my Shell

GNOME has no built-in blur for app windows, so you need the **Blur my Shell** extension:

1. Install Extension Manager:

   ```sh
   sudo apt install gnome-shell-extension-manager
   ```

2. Open it, search for **Blur my Shell** (by aunetx), and install it.
3. In the extension's **Applications** settings, turn on application blur and add **OMXTerm** to the list of blurred apps.
4. In OMXTerm's `config.json`, set `window.transparency` above `0` and reload.

Adjust the blur strength in the extension. OMXTerm's `window.blur` setting has no effect on GNOME. To undo, remove OMXTerm from the extension's list or set transparency back to `0`.

## Fedora with KDE Plasma (and other KDE desktops)

1. In **System Settings → Desktop Effects**, make sure **Blur** is enabled.
2. In OMXTerm's `config.json`, set `window.blur` to `true` and `window.transparency` above `0`, then reload.

OMXTerm asks KDE for blur using the `xprop` tool. If blur does not appear, install it:

```sh
sudo dnf install xprop          # Fedora
sudo apt install x11-utils      # Ubuntu / Kubuntu
```

## Hyprland, including Omarchy

OMXTerm runs through XWayland on Hyprland. If your setup forces Electron apps to use Wayland (for example with `ELECTRON_OZONE_PLATFORM_HINT=wayland`), launch the AppImage with X11 explicitly (replace `VERSION` with the version you downloaded):

```sh
./OMXTerm-VERSION-arm64.AppImage --ozone-platform=x11
```

The [Linux installer](linux-installer.md) already adds this to the application-menu entry.

Hyprland handles blur itself. Check whether it is on:

```sh
hyprctl getoption decoration:blur:enabled
```

To turn it on with a Lua-based configuration (Omarchy uses `~/.config/hypr/looknfeel.lua`), add this and keep your other settings:

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

Reload with `hyprctl reload config-only` and check `hyprctl configerrors`. Then set OMXTerm's `window.transparency` above `0` and reload OMXTerm too. On Hyprland, `window.blur` is not needed.

A few tips:

- Edit your own configuration, not the defaults under `/usr/share/omarchy`.
- If your setup uses hyprlang instead of Lua, follow the [Hyprland blur documentation](https://wiki.hypr.land/Configuring/Basics/Variables/#blur) for the matching syntax.
- Start with one blur pass, especially in a VM. Higher values cost performance.
- For a compact tiled layout, hide the title bar with `Ctrl+Shift+D` (or set `window.showTitleBar` to `false`). Press and release **Alt** to open the menu.

## Small interface text on a HiDPI display

Terminal zoom (`Ctrl++` / `Ctrl+-`) only changes terminal text. If the tabs, title bar, and sidebar look too small, Electron's display scale is the issue.

On Hyprland, this usually happens when XWayland zero-scaling is on. Check with:

```sh
hyprctl monitors
hyprctl getoption xwayland:force_zero_scaling
```

If your monitor scale is `2` and zero-scaling is enabled, launch OMXTerm with a matching scale factor:

```sh
./OMXTerm-VERSION-arm64.AppImage --force-device-scale-factor=2
```

Use the value that matches your display. This is a launch option, not a `config.json` setting. The [Linux installer](linux-installer.md#interface-size-on-hyprland) detects it for you when all monitors share the same scale. See also Hyprland's [XWayland scaling notes](https://wiki.hypr.land/Configuring/Advanced-and-Cool/XWayland/).

## Graphics troubleshooting

OMXTerm needs **WebGL2** to draw the terminal. When the GPU cannot provide it, as in VMs without 3D acceleration, OMXTerm falls back to Chromium's built-in software WebGL automatically. It uses more CPU, but no flags are needed.

If you still see a blank window or a rendering error instead of a shell, your driver is probably exposed but broken. If you use the [Linux installer](linux-installer.md#only-if-graphics-fail), reinstall with `--compatibility`. If you launch the AppImage directly, run:

```sh
LIBGL_ALWAYS_SOFTWARE=1 ./OMXTerm-VERSION-arm64.AppImage \
  --ozone-platform=x11 --ignore-gpu-blocklist
```

This switches to CPU rendering and skips Chromium's GPU blocklist. It is slower, so use it only when normal launch fails, and keep it to this command instead of exporting it globally.

If you also need `--appimage-extract-and-run` (no FUSE), put it right after the AppImage path, before the other options.

Still not working? [Open a bug report](../CONTRIBUTING.md#report-a-problem) with the error message and your GPU or VM details.
