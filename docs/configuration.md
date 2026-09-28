# User configuration

On first opening, OMXTerm creates a small starter kit in
`$XDG_CONFIG_HOME/omxterm`, or `~/.config/omxterm` when unset or empty
(`%USERPROFILE%\.config\omxterm` on Windows). `~` means your home folder;
`XDG_CONFIG_HOME` is an optional environment variable that chooses a different
settings folder. If you have not set it, use the default path:

```text
omxterm/
├── config.json
├── snippets.json
└── themes/
    └── omtheme.json
```

The configuration uses OMXTerm defaults and selects `themes/omtheme.json`.
The snippet is a greeting command with `execute: false`; insertion does not
append Enter. No external font, Git Bash, or personal dotfiles are required.
Edit these files and use `View -> Reload User Configuration` for settings and
theme changes; reopen the sidebar to reread snippets.

**If `config.json` already exists, the entire kit is skipped**, even if that
configuration is invalid. Existing snippets and themes are never overwritten.
The theme copy is yours: updates do not replace it. Creation happens when the
app opens, not when copying/installing the package, and never during reload.
A creation failure shows a non-blocking notice; the terminal still opens using
normal configuration loading and its built-in fallbacks.

Settings live in **JSON**, a plain-text format of named values. Use a text
editor, not a word processor, or use Studio below. After initial creation OMXTerm
reads these files without rewriting them. **Saving a file alone does not apply
it:** reload settings or reopen the snippets sidebar as appropriate.

On Linux and Windows, press and release **Alt alone** to open the application
menu. On macOS, use the menu bar at the top of the screen.

- [Edit visually with OMXTerm Studio](#edit-visually-with-omxterm-studio)
- [Create a configuration](#quick-start-use-the-bundled-defaults)
- [Change fonts and spacing](#add-one-display-change)
- [Background transparency and blur](#background-transparency-and-blur)
- [All settings and defaults](#configuration-reference)
- [Choose a Windows shell](#choose-the-windows-default-shell)
- [Remap shortcuts](#keybinds)
- [Add snippets](#snippets)
- [Create a theme](#terminal-themes)
- [Reload and troubleshoot](#reloading-user-configuration)

Prefer a complete example? Follow the [macOS](quick-start/macos.md),
[Linux](quick-start/linux.md), or [Windows](quick-start/windows.md) tutorial.
The [product contract](spec.md#configuration-and-local-state) holds the complete
technical rules; this guide covers setup and reference.

## Edit visually with OMXTerm Studio

[Open OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) to edit a Terminal
Theme or User Configuration in your browser. It is an optional, separate editor,
not a terminal session or a dependency of the desktop application. You can still
[edit the JSON by hand](#quick-start-use-the-bundled-defaults).

1. **Back up your current files and select the target.** In Studio, open
   **Configuration → Target platform** and choose the system that will use the
   files. Do this before importing configuration: imports immediately check
   shortcut conflicts against the selected platform.
2. **Import your files.** Use **Import config** to preserve your existing
   preferences and **Import theme** to load your palette. These imports are
   independent: importing `config.json` never opens its `theme.path`. You can
   also start a theme from the original `omtheme` or `omtheme-darkice` preset.
3. **Edit and preview.** Adjust colors in **Theme** while comparing fictional
   terminal text, fastfetch, htop, tmux, tabs, and snippets. In **Configuration**,
   adjust supported settings. **Keyboard shortcuts** lets you filter actions,
   type combinations, restore defaults, and check conflicts for that target.
4. **Apply pending edits before downloading.** Use **Apply shortcuts** or
   **Apply JSON** for those editors; unapplied text is not included in downloads.
   Complete any invalid theme name or hex value before exporting a theme.
5. **Export and review the files.** Choose the workflow you need:
   - **Theme JSON** downloads only the palette. Save it in a `themes` directory
     beside your existing `config.json`, and update only `theme.path` to select
     that file; keep your other preferences. The [manual theme example](#terminal-themes)
     shows the directory and relative-path setup.
   - **Download edited pair** produces a ZIP containing `config.json` and
     `themes/theme.json`. Its configuration already points to
     `./themes/theme.json`. After reviewing both files and backing up anything
     they would replace, copy them together into your
     [configuration directory](#create-the-configuration-directory), retaining
     that layout. Import your existing configuration in step 2 before using this
     option to preserve its settings.
   - **Config JSON** downloads only the applied configuration and leaves its
     existing `theme.path` unchanged; it does not automatically point to the
     palette being edited. Review the export and, after backing up the existing
     file, save it as `config.json` in your
     [configuration directory](#create-the-configuration-directory) before
     reloading.
6. **Reload in OMXTerm.** Choose `View -> Reload User Configuration`. Theme colors
   apply live; font family and line height apply to new tabs, while existing
   tabs need a restart. See the [reload reference](#reloading-user-configuration)
   for the other settings.

Imported files are not uploaded; editing and exports run locally in the browser.
**Remember this draft on this device** is optional and stores only validated,
applied documents. Apply and download unfinished work before closing the page.
Studio never installs files, reloads OMXTerm, or executes the preview's commands.

The preview uses DOM/CSS, not Restty: fonts, dim text, cell spacing, ligatures,
and native window controls can differ. Desktop transparency and native blur
must be checked in OMXTerm, not judged from a browser simulation. Browser font names use a monospace fallback;
Studio cannot certify installed fonts, filesystem paths, shell executables, or
operating-system-reserved shortcuts. OMXTerm still performs its own complete
validation when you load the exported files.

## Quick start: use the bundled defaults

Start with the smallest valid `config.json`. If you already have one, back it
up and edit only the settings you want to change:

```json
{
  "version": 1
}
```

This file works on every Supported Platform. It uses bundled FiraCode Nerd Font
Mono regular and bold faces, the bundled `omtheme` Terminal Theme, and every
other built-in default. It does not require an installed font or another file.

### Create the configuration directory

On macOS or Linux, create the configuration directory and print its path:

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir"
printf '%s\n' "$config_dir/config.json"
```

In a plain-text editor, open the existing `config.json` or save the JSON above
at that printed path. By default it is `~/.config/omxterm/config.json`; a non-empty
`XDG_CONFIG_HOME` selects another configuration root. Folders beginning with `.`
are hidden: use **Cmd+Shift+G** in Finder to enter the folder path, or **Ctrl+L**
in a Linux file manager. macOS TextEdit users should select **Format → Make Plain
Text**, disable smart quotes, and keep the `.json` filename.

On Windows, the common default path is
`%USERPROFILE%\.config\omxterm\config.json`. This PowerShell sequence also
honors a non-empty `XDG_CONFIG_HOME`:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
$configDirectory = Join-Path $configRoot "omxterm"
New-Item -ItemType Directory -Force $configDirectory
```

Open that folder with `Invoke-Item -LiteralPath $configDirectory`, then save the
JSON as `config.json` inside it. In Notepad's Save As dialog, choose **All files**
and UTF-8 so the name does not become `config.json.txt`. In Explorer, enable
**View → Show → File name extensions** to check the real filename.

After saving, choose `View -> Reload User Configuration`. The built-in shortcut
is `Cmd+Shift+,` on macOS and `Ctrl+Shift+,` on Linux and Windows. A missing
file also selects all defaults and is not an error.

### Writing valid JSON

Each User Configuration example in this section is a complete valid JSON
document. Copy one, save it as `config.json`, and reload. **Replacing your file
with an example resets omitted settings to defaults.** To keep existing choices,
back up the file and merge only the fields you want into its existing objects.
Keep one root object, one `"version": 1`, and only one of each named key; do not
paste a second `window`, `font`, or `keybinds` object beside the first.

Use straight double quotes (`"`) around names and string values, commas between
properties, and no comma after the last property. Write booleans as `true`/`false`
and numbers without quotes. `"version": 1` is the configuration format, **not**
your installed OMXTerm version.

JSON comments, trailing commas, unknown or misspelled keys, duplicate
accelerators, unsupported versions, and values outside the documented ranges
are reported as validation errors. The configuration is validated as a whole
before it is applied.

At startup, invalid `config.json` uses every built-in default and reports the
exact problem without changing the file. During a manual reload, an invalid
file keeps the complete last valid in-memory configuration active. Fix the
reported problem and reload again.

## Add one display change

Once the minimal file loads, try changing only the font size. The bundled font
remains selected:

```json
{
  "version": 1,
  "font": {
    "size": 18
  }
}
```

Next, add line height and disable programming ligatures while keeping the
previous change:

```json
{
  "version": 1,
  "font": {
    "size": 18,
    "lineHeight": 1.1,
    "ligatures": false
  }
}
```

`font.ligatures` defaults to `true`. Setting it to `false` keeps programming
operators such as `=>` as distinguishable source characters without changing
the configured font or terminal text.

Then add per-side padding:

```json
{
  "version": 1,
  "font": {
    "size": 18,
    "lineHeight": 1.1,
    "ligatures": false
  },
  "terminal": {
    "padding": {
      "top": 4,
      "right": 8,
      "bottom": 8,
      "left": 8
    }
  }
}
```

Choose values for your own display rather than treating these as alternate
defaults. To select a system font later, add `font.family` with its exact
installed family name. A missing configured family is an error; omit
`font.family` to keep using the bundled font. Exact native legacy and typographic
family names are supported, with font metadata checked before loading. Similar
names and automatic family substitutions are not accepted.

The Terminal Surface is a grid of whole character cells. Cell dimensions depend
on font family, size, line height, and renderer, so leftover window pixels are
not automatically redistributed. Choose font size and line height first, then
tune each padding side by eye. Window Font Zoom is temporary and does not edit
configuration; Actual Size (`Cmd+0` on macOS or `Ctrl+0` on Linux and Windows)
returns to the configured size.

## Background transparency and blur

Available in **OMXTerm 0.17.0 and newer**. Transparency lets the desktop show
through the terminal background; blur softens what is behind it. Merge these
optional settings into your existing `window` object, then reload:

```json
{
  "version": 1,
  "window": {
    "blur": true,
    "transparency": 0.35
  }
}
```

Both settings apply live to every current and future window and tab, without
restarting shells. Defaults are `blur: false` and `transparency: 0` (opaque).
Transparency accepts finite fractions from 0 through 1; invalid values reject
the complete reload rather than being clamped. `1` removes OMXTerm's background
tint, not text, cursor, selection, images or foreground controls. Theme colors
stay `#RRGGBB`; do not add alpha to the theme file.

| Platform | What to expect                                                                                                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | Native blur with a fixed strength; OMXTerm has no strength slider. A system material is used if the preferred effect is unavailable.                                                                                                   |
| Windows  | **Enable both blur and positive transparency.** Windows 11 22H2 or later can provide Acrylic (Windows' translucent blur material). With blur off, unsupported Windows versions, or failed native effects, the theme stays opaque.      |
| Linux    | Transparency depends on the desktop's compositor (the component that combines windows on screen). KDE Plasma can honor OMXTerm's blur request; GNOME needs an extension; Hyprland controls blur in its compositor settings. See below. |

Effects are best effort: system policy, accessibility settings, graphics drivers,
and desktop versions may keep the window opaque. At transparency `0`, blur is
not visible. OMXTerm does not alter system settings, install extensions, or
rewrite your requested values when an effect is unavailable. Keep the terminal
readable; try `0.2` before increasing transparency.

The macOS implementation uses undocumented APIs with a fallback, so OS updates
may affect it. [ADR 0029](adr/0029-compose-background-effects-with-explicit-cell-identity.md)
and [ADR 0030](adr/0030-prefer-direct-macos-background-blur.md) explain the technical
tradeoffs; the [release record](releases/0.17.0.md) distinguishes tested systems
from unverified appearance.

**Explicit application backgrounds stay opaque**, even if the application picks
exactly the theme's background RGB. Only implicit terminal default backgrounds
(including SGR 49) reveal the shared tint. A TUI that fills its screen with
explicit backgrounds can therefore remain opaque. Inverse, ANSI colors, image
alpha, selection and normal glyph antialiasing keep their terminal meaning;
OMXTerm never fades the whole window.

### Linux desktop tips

These are **optional desktop customizations**, not OMXTerm dependencies or a
promise of identical results on every system. GNOME and KDE Plasma are desktop
environments, not processor architectures or distributions: Ubuntu commonly
uses GNOME, while Fedora has both GNOME and KDE editions. Choose the instructions
for your desktop, not just the distribution name. OMXTerm still runs through
X11/XWayland; these tips do not enable native Wayland rendering.

#### Ubuntu with GNOME: Blur my Shell

The following route has worked for OMXTerm on Ubuntu GNOME:

1. Install **Extension Manager**, the application used to manage GNOME extensions:

   ```sh
   sudo apt install gnome-shell-extension-manager
   ```

2. Open **Extension Manager**, browse for **Blur my Shell**, and install/enable
   the extension by **aunetx**. Use a version compatible with your GNOME release.
3. Open Blur my Shell's preferences and find **Applications**. Enable application
   blur and add the running **OMXTerm** window to its application list (the
   allowlist/whitelist). Labels vary between extension versions.
4. In OMXTerm, set `window.transparency` above `0` and reload. Adjust the blur
   in the extension's settings to taste. The extension supplies GNOME blur;
   OMXTerm's `window.blur` switch alone does not configure GNOME.

Keep the extension's whole-window opacity at full opacity if you want text to
stay solid; use OMXTerm's transparency setting for background-only fading.
Extension blur can affect desktop performance. To undo it, remove OMXTerm from
its application list or disable the extension, and restore OMXTerm transparency
to `0` if desired.

See the [Blur my Shell project](https://github.com/aunetx/blur-my-shell) for
supported GNOME versions, application blur options, and troubleshooting. OMXTerm
does not install, maintain, or configure that extension.

#### Fedora with KDE Plasma (and other KDE desktops)

KDE Plasma already includes a **Blur** desktop effect; no GNOME extension is
needed. Open **System Settings**, search for
[Desktop Effects](https://docs.kde.org/stable_kf6/en/kwin/kcontrol/kwineffects/index.html),
enable **Blur**, and open its settings to adjust the available strength options. The location
and labels depend on your Plasma version.

In OMXTerm, set `window.blur` to `true` and `window.transparency` above `0`, then
reload. Its KDE request uses `xprop`, a small X11 utility. If the request has no
effect, check whether it is installed with `command -v xprop`. The package is
`xprop` on Fedora (`sudo dnf install xprop`) or `x11-utils` on Ubuntu/Kubuntu
(`sudo apt install x11-utils`). Missing `xprop` never prevents terminal startup.

To undo only OMXTerm's requested effect, set `blur` to `false` and transparency
to `0`, then reload. Changes made to KDE's desktop effects may also affect other
applications; those settings remain under your control.

#### Hyprland, including Omarchy

Hyprland is a Wayland compositor, not a distribution or processor architecture.
Omarchy supplies an Arch-based desktop configured around it. OMXTerm still uses
**X11 through XWayland** in this environment; this does not establish native
Wayland support. Published Linux packages are ARM64, not x86_64.

Some desktop configurations export `ELECTRON_OZONE_PLATFORM_HINT=wayland`.
OMXTerm honors that explicit environment override. Select the supported backend
for this launch instead:

```sh
./OMXTerm-0.17.0-arm64.AppImage --ozone-platform=x11
```

Use your downloaded filename. If using the optional desktop installer, the
installed executable is `~/.local/opt/omxterm/OMXTerm.AppImage`. An invocation
in a terminal does not change the application-menu launcher.

**Blur is built into Hyprland; no GNOME extension is needed.** The tested
Omarchy setup disabled it in its default look-and-feel configuration. Check
the running session with:

```sh
hyprctl getoption decoration:blur:enabled
```

For the **Lua configuration used by Hyprland 0.56.1 / this Omarchy setup**, back
up `~/.config/hypr/looknfeel.lua` and add the following user override. Keep your
other settings; do not edit the defaults under `/usr/share/omarchy`:

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
the blur option again. Keep `window.transparency` above `0` in OMXTerm and reload
its configuration separately. OMXTerm's `window.blur` switch sends a KDE-specific
hint on Linux; it does not configure Hyprland or override its blur policy.

This enables compositor blur for transparent windows **in general**, not just
OMXTerm. Text stays solid when you use OMXTerm's background transparency rather
than whole-window opacity. Existing per-window rules can still suppress blur.
Start with one pass, especially in a VM; increasing size/passes can cost graphics
performance. To undo, restore the backed-up user file, or set this override's
`enabled` to `false`, and reload Hyprland. Setting only OMXTerm's `blur` to `false`
does not turn off compositor-managed blur; set its transparency to `0` if you
want an opaque terminal.

For a cleaner tiled layout, optionally merge `"showTitleBar": false` into
OMXTerm's existing `window` object. That preference applies to new windows;
`Ctrl+Shift+D` toggles the current window without restarting its shell. The tab
bar is independent, and pressing and releasing Alt alone still opens the menu.
This is a user preference, not automatic Hyprland detection.

Other Hyprland versions and non-Omarchy setups may use different configuration
files or syntax. Follow the installed version's
[Hyprland blur documentation](https://wiki.hypr.land/Configuring/Basics/Variables/#blur)
rather than mixing older hyprlang snippets with Lua.

##### Small interface text on a HiDPI display

The [upcoming Linux helper](linux-installer.md#interface-size-on-hyprland) can
record a uniform Hyprland monitor scale at installation time. For the current
0.17.0 helper, direct AppImage launches or manual adjustments, use the tips below.

Terminal font zoom (`Ctrl++` / `Ctrl+-`) does not resize the title row, tabs, or
sidebar. Toolkit text-size preferences are also distinct from Electron's display
scale. Check the monitor scale and XWayland policy:

```sh
hyprctl monitors
hyprctl getoption xwayland:force_zero_scaling
```

When the monitor uses scale `2` and `force_zero_scaling` is enabled, XWayland
windows are not enlarged by the compositor. In the tested setup, adding
`--force-device-scale-factor=2` to the working OMXTerm launch command made the
whole interface readable while retaining independent terminal font zoom. Add it
before `-e` if launching an explicit terminal command. This is an Electron launch
option, not a `config.json` key, and takes effect on the next app launch.

Use the value appropriate to your display; `2` is not a universal default. Test
without changing the compositor's global scale policy or your preferred text
size. To keep the result, add the option to your application launcher (the
wrapper below is one example); launching a bare AppImage still bypasses that
customization. Remove the option if the interface becomes too large or when
changing to a display setup where automatic scaling works. See Hyprland's
[XWayland scaling notes](https://wiki.hypr.land/Configuring/Advanced-and-Cool/XWayland/).

##### Try Omarchy VM: graphics troubleshooting

[Try Omarchy](https://github.com/omacom/try-omarchy) bundles an ARM64 Linux VM for
Apple Silicon Macs. Its virtual graphics path is not equivalent to Hyprland on
physical Linux hardware. A visible window alone does not prove that the Terminal
Surface or a shell initialized.

In a test of the unchanged **0.17.0 AppImage** with Hyprland **0.56.1**, XWayland
**24.1.13** and Mesa **26.2.2**, VirGL advertised OpenGL **2.1** / OpenGL ES **3.0**.
The XWayland window opened, but Chromium failed to create its graphics context
and the Surface reported a rendering-backend initialization failure. Selecting
ANGLE GLES explicitly did not resolve it. The same package displayed a shell
using this **per-process VM workaround**:

```sh
LIBGL_ALWAYS_SOFTWARE=1 ./OMXTerm-0.17.0-arm64.AppImage \
  --ozone-platform=x11 --ignore-gpu-blocklist
```

`LIBGL_ALWAYS_SOFTWARE=1` selects Mesa's CPU renderer; `--ignore-gpu-blocklist`
opts this process out of Chromium's GPU compatibility blocklist. The CPU driver
alone was still blocked from WebGL2 in that test. These are diagnostic launch
options, **not defaults or requirements for every Hyprland installation**.
Do not export them globally. They can trade performance or stability for
compatibility; this is not evidence of working GPU acceleration, native Wayland,
or complete compatibility across VMs. OMXTerm still requires an actual WebGL2
backend and has no automatic fallback Surface.

The [upcoming `linux_install.sh` helper](linux-installer.md#only-if-graphics-fail)
can save this workaround with `install --compatibility`; it never enables it
merely because the desktop is Hyprland. That option is not in the published
0.17.0 helper. Its manual launcher setup follows.

If you deliberately keep this workaround in a disposable VM, apply it to the
launcher too. For an installation made by the **0.17.0** desktop helper:

1. Back up `~/.local/share/applications/omxterm.desktop` and inspect its original
   `Exec=` line. If it contains `--appimage-extract-and-run`, keep that runtime
   option in the wrapper as described below; the installer selected it because
   its FUSE mounting probe failed.
2. Create `~/.local/bin/omxterm` with the script below. If that name already
   exists, preserve it and choose another launcher name rather than overwriting
   unrelated work. Create `~/.local/bin` if necessary.
3. Make it executable with `chmod +x ~/.local/bin/omxterm`.
4. In the desktop file, replace only its `Exec=` line with the wrapper's
   **absolute path**, for example `Exec="/home/YOUR_USER/.local/bin/omxterm" %U`.
   Replace `YOUR_USER`; desktop entries do not expand `~` or `$HOME` like a shell.

```sh
#!/bin/sh
# Local Try Omarchy VM workaround, not an OMXTerm runtime default.
exec env LIBGL_ALWAYS_SOFTWARE=1 \
  "$HOME/.local/opt/omxterm/OMXTerm.AppImage" \
  --ozone-platform=x11 --ignore-gpu-blocklist "$@"
```

**Preserve extraction mode when present in the original desktop entry.** Insert
`--appimage-extract-and-run` immediately after the AppImage path in the script,
before `--ozone-platform=x11`. Do not remove that option merely to add graphics
flags: doing so can break startup on systems without working FUSE. Keep any
separately tested UI-scale option in the wrapper too; for a 2x display, add
`--force-device-scale-factor=2` before `"$@"`.

The application-menu entry and wrapper now use the same options. Launching the
AppImage file itself still bypasses the wrapper. The `omxterm` command is also
available when `~/.local/bin` is on your `PATH`. No AppImage bytes are modified.

To remove the workaround, restore the original desktop entry and remove only
the wrapper you created. Keep the X11 override separately if your session still
forces Wayland. Reinstalling/upgrading through the desktop helper can replace
the customized desktop entry; reapply it only if the VM still needs the workaround.

## Add one behavior change

Preferences can stay small and focused. For example, this document changes only
scrollback retention:

```json
{
  "version": 1,
  "scrollback": {
    "lines": 20000
  }
}
```

Omitted preferences keep their defaults. Use the reference below to add only
the settings you need.

## Configuration reference

All preferences other than `version` are optional. Objects and the root reject
unknown keys.

| Preference                | Accepted value                          | Default                          |
| ------------------------- | --------------------------------------- | -------------------------------- |
| `version`                 | exactly `1`                             | required                         |
| `confirmClose`            | boolean                                 | `true`                           |
| `logLevel`                | `error`, `info`, or `debug`             | `info`                           |
| `windowsShell`            | non-empty string without NUL            | Windows PowerShell, then ComSpec |
| `font.family`             | exact installed system font-family name | bundled FiraCode Nerd Font Mono  |
| `font.size`               | integer from 8 through 72 CSS pixels    | `16`                             |
| `font.lineHeight`         | number from 1.0 through 2.0             | `1.0`                            |
| `font.ligatures`          | boolean                                 | `true`                           |
| `terminal.padding.top`    | integer from 0 through 128 CSS pixels   | `0`                              |
| `terminal.padding.right`  | integer from 0 through 128 CSS pixels   | `8`                              |
| `terminal.padding.bottom` | integer from 0 through 128 CSS pixels   | `8`                              |
| `terminal.padding.left`   | integer from 0 through 128 CSS pixels   | `8`                              |
| `scrollback.lines`        | integer from 0 through 100,000          | `10000`                          |
| `keyboard.optionAsAlt`    | `none`, `left`, `right`, or `both`      | `none`                           |
| `window.alwaysOnTop`      | boolean                                 | `false`                          |
| `window.blur`             | boolean                                 | `false`                          |
| `window.transparency`     | finite number from 0 through 1          | `0`                              |
| `window.showTitleBar`     | boolean                                 | `true`                           |
| `window.showTabBar`       | boolean                                 | `true`                           |
| `theme.path`              | non-empty filesystem path without NUL   | bundled `omtheme`                |
| `keybinds.<action>`       | accelerator with a non-Shift modifier   | built-in shortcut per action     |

### Settings that need explanation

- **Scrollback** is memory-only and separate per tab. Zero immediately clears
  history and disables retention; restoring a positive value retains only new
  output. Positive line counts are approximate because the core evicts whole
  pages and also has a 10,000,000-byte ceiling.
- **Option keys** apply only on macOS. `none` preserves native Unicode input;
  `left`, `right`, and `both` choose which Option keys send terminal Alt sequences.
- **Padding** begins below visible title chrome: a 30 px inset on macOS or a
  34 px app-drawn row on Linux/Windows. Hiding the title bar or entering fullscreen
  removes that title space, not your padding or the macOS system safe area.
- **Font family and line height** apply to new tabs immediately after reload;
  existing tabs retain their original values until restart. Font size and
  ligatures apply live. Ligatures do not change copied text or terminal cells.
- **Font styles** use available bold/italic faces from your selected family,
  synthesizing missing styles. Missing glyphs use bundled and local fallback
  fonts. Custom variable-font axes are not supported. An invalid configured
  family is an error rather than a silent substitution.
- **Always on Top** sets the default for new windows. The Window menu toggles
  one current window without changing that default.
- **Title and tab bars** also set defaults for new windows. Reloading does not
  override the choices in existing windows. The View menu toggles each bar for
  the current window without editing the file. An enabled tab bar appears only
  when there are two or more tabs.
- **Application menu** on Linux and Windows opens as a native popup when you
  press and release Alt alone, including with hidden title chrome or fullscreen.
  It uses the current effective shortcuts after reload. This fixed behavior has
  no configuration key; Alt combinations and macOS Option input are unchanged.

### Start with hidden bars

To open new windows without either bar:

```json
{
  "version": 1,
  "window": {
    "showTitleBar": false,
    "showTabBar": false
  }
}
```

Reload, then open a new window. Existing windows keep their current choices;
use **View → Toggle Title Bar** or **View → Toggle Tab Bar** to change them.
With the title bar hidden, move the pointer into the upper part of the window
and drag the three dots that appear at the top center. Other terminal text
remains selectable. Fullscreen hides the handle as well.

On macOS the visible title area retains native controls on the left and blends
into the terminal background. Linux and Windows use a compact themed title row
with controls on the right. Both forms hide and restore without restarting
sessions. See [window controls](usage.md#window-controls).

### Choose the Windows Default Shell

On Windows, `windowsShell` selects the executable for future Default Shell
sessions. Use an absolute Windows filesystem path:

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

This example requires Git for Windows to be installed at that location first.
For PowerShell 7, a common installed path is
`C:\\Program Files\\PowerShell\\7\\pwsh.exe` in JSON. Check the actual executable
on your machine; OMXTerm does not install these shells. To return to Windows
PowerShell, remove the `windowsShell` property, reload, and open a new tab.

The path must resolve to an existing regular file. Write it literally: OMXTerm
does not expand `~` or environment variables and does not accept arguments in
this setting. Backslashes must be escaped as `\\` in JSON.

Reload, then open a new tab to use the selected shell. Existing sessions are
unchanged. macOS and Linux accept this setting but ignore it, continuing to use
the account shell. You can therefore share the file between platforms.

`wsl.exe` inherits OMXTerm's Windows home as its Initial Working Directory. WSL
commonly exposes that directory as `/mnt/c/Users/<user>` rather than starting in
the Linux distribution's home. OMXTerm does not translate the working directory
for WSL.

### Keybinds

`keybinds` remaps application-menu shortcuts. The keys are a fixed action
vocabulary; values are [Electron accelerator](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators)
strings. For a visual editor with per-action restoration and conflict feedback,
use [OMXTerm Studio](#edit-visually-with-omxterm-studio) → **Configuration → Keyboard
shortcuts**. Omitted actions keep their defaults:

| Action                      | macOS default              | Linux/Windows default |
| --------------------------- | -------------------------- | --------------------- |
| `quit`                      | `CommandOrControl+Q`       | `Control+Alt+Shift+Q` |
| `copy`                      | `CommandOrControl+C`       | `Control+Shift+C`     |
| `paste`                     | `CommandOrControl+V`       | `Control+Shift+V`     |
| `selectAll`                 | `CommandOrControl+A`       | `Control+Shift+A`     |
| `newWindow`                 | `CommandOrControl+N`       | `Control+Shift+N`     |
| `newTab`                    | `CommandOrControl+T`       | `Control+Shift+T`     |
| `closeTab`                  | `CommandOrControl+W`       | `Control+Shift+W`     |
| `closeWindow`               | `CommandOrControl+Shift+W` | `Control+Shift+Q`     |
| `nextTab`                   | `Control+Tab`              | `Control+PageDown`    |
| `previousTab`               | `Control+Shift+Tab`        | `Control+PageUp`      |
| `selectTab1` … `selectTab9` | `CommandOrControl+1` … `9` | `Alt+1` … `9`         |
| `zoomIn`                    | `CommandOrControl+Plus`    | `Control+Plus`        |
| `zoomOut`                   | `CommandOrControl+-`       | `Control+-`           |
| `actualSize`                | `CommandOrControl+0`       | `Control+0`           |
| `toggleFullScreen`          | `Control+Command+F`        | `Control+Shift+F`     |
| `toggleSnippets`            | `CommandOrControl+Shift+S` | `Control+Shift+S`     |
| `toggleTabBar`              | `CommandOrControl+Shift+B` | `Control+Shift+B`     |
| `toggleTitleBar`            | `CommandOrControl+Shift+D` | `Control+Shift+D`     |
| `reloadConfig`              | `CommandOrControl+Shift+,` | `Control+Shift+,`     |

For example, this changes only New Window:

```json
{
  "version": 1,
  "keybinds": {
    "newWindow": "CommandOrControl+G"
  }
}
```

Accelerators are case-insensitive and require exactly one key plus at least one
modifier other than Shift. Common aliases work: `Ctrl` and `Control` are the
same modifier, as are `CmdOrCtrl` and `CommandOrControl`, `Cmd` and `Command`,
and `Alt` and `Option`. `CommandOrControl` follows the platform: Command on
macOS, Control on Linux and Windows. `Super` and `Meta` use Electron's Command
accelerator family.

Write a printable key as the character itself. For example, the reload shortcut
ends in the literal comma character: `Control+Shift+,`. `Comma` is not a named
key in OMXTerm's accelerator grammar. The plus key is the exception because `+`
separates accelerator parts; write its logical symbol as `Plus`, such as
`Control+Plus`.

A logical accelerator describes the resulting key, while the physical gesture
also depends on the keyboard layout. If `+` shares the `=` key, typing
`Control+Plus` typically means pressing `Ctrl+Shift+=`. The macOS default
`CommandOrControl+Plus` similarly becomes `Cmd+Shift+=` on that layout. A
keypad with a dedicated `+` sends the same logical Plus without Shift.

Shift written explicitly remains meaningful. If one action uses
`Control+Shift+Plus` and another uses `Control+Plus`, a shifted main-keyboard
`+` matches the explicit Shift binding first; an unshifted keypad `+` can match
the latter. OMXTerm only treats the Shift needed to produce logical `+` as an
implicit fallback, so these bindings are not interchangeable remappings.

A bare key or Shift-only accelerator is rejected so it cannot swallow ordinary
terminal typing. Two actions cannot share one effective accelerator, and a
remap cannot collide with another action's remaining default. Collisions are
checked after platform aliases such as `CommandOrControl` are resolved.

A matched application keybind is consumed and does not reach the PTY. On Linux
and Windows, a macOS-authored `CommandOrControl` binding can therefore shadow a
bare terminal control key such as `Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`,
`Ctrl+U`, `Ctrl+W`, `Ctrl+A`, or `Ctrl+E`. OMXTerm keeps a valid binding active
but warns which action and control key conflict. Add `Shift` or choose another
key when the control key should continue to reach the shell.

`keybinds.toggleTabBar` and `keybinds.toggleTitleBar` change shortcuts, not initial
visibility. Set `window.showTabBar` and `window.showTitleBar` for new-window
defaults. Both toggles are temporary per window and survive configuration reload.

## Snippets

Create `snippets.json` beside `config.json` to add your own snippets. Like the
configuration, it is strict JSON and stays under your control. Without it, the
Snippets Sidebar is empty.

Start with one generic, single-line snippet that inserts text but does not add
Enter:

```json
{
  "version": 1,
  "snippets": [
    {
      "name": "Show current directory",
      "body": "pwd",
      "description": "Insert a command that prints the current directory"
    }
  ]
}
```

Save it as `snippets.json` in the same directory as `config.json`. Open
`View -> Toggle Snippets` (`Cmd+Shift+S` on macOS or `Ctrl+Shift+S` on Linux
and Windows), then click the snippet. Review the inserted command and press
Enter yourself.

Next, opt one non-destructive snippet into automatic submission:

```json
{
  "version": 1,
  "snippets": [
    {
      "name": "Show current directory",
      "body": "pwd",
      "description": "Print the current directory",
      "execute": true
    },
    {
      "name": "List directory",
      "body": "ls",
      "description": "Insert a command that lists directory entries"
    }
  ]
}
```

Snippet bodies use [Protected Paste](usage.md#protected-paste), just like ordinary
paste. `execute: true` appends Enter after the body and any closing bracketed-paste
marker; `false` appends nothing. Embedded newlines or control characters can still
execute input when bracketed paste is unavailable, even with `execute: false`.
Use single-line bodies when you want to review a command before pressing Enter.

The `snippets` array accepts at most 512 entries. Each entry has:

| Field         | Accepted value                                     | Default  |
| ------------- | -------------------------------------------------- | -------- |
| `name`        | non-empty string, at most 128 UTF-16 code units    | required |
| `body`        | non-empty string, at most 65,536 UTF-16 code units | required |
| `description` | string, at most 512 UTF-16 code units              | none     |
| `execute`     | boolean                                            | `false`  |

The sidebar filters by name and description. Opening it rereads
`snippets.json`; there is no file watching. If the file is invalid, the sidebar
shows the exact path and field problem instead of the list, while the terminal
continues working. Fix the file and reopen the sidebar.

## Terminal Themes

A Terminal Theme is a complete OMXTerm palette in another strict JSON file. You
do not need an external theme: omitting `theme` from `config.json` always uses
the bundled canonical `omtheme`. The initial kit copies the current palette only
for new users; existing user-owned theme files are never updated automatically.
To use a later bundled revision, omit `theme` and reload, or deliberately update
your own copy from the [canonical palette](omtheme.json).

For a visual edit-and-preview workflow, use [OMXTerm Studio](#edit-visually-with-omxterm-studio).
The following steps show how to create and select the same JSON format by hand.

To make your own theme, first create a `themes` directory beside
`config.json`.

On macOS or Linux:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/omxterm/themes"
```

On Windows, this PowerShell sequence handles both the common default and a
non-empty `XDG_CONFIG_HOME`:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
$themesDirectory = Join-Path $configRoot "omxterm\themes"
New-Item -ItemType Directory -Force $themesDirectory
```

Save the following complete starter palette as `themes/my-theme.json`. It uses
the bundled palette's colors so you can first verify the file and path, then
change one `#RRGGBB` color at a time:

```json
{
  "version": 1,
  "name": "My theme",
  "colors": {
    "background": "#000000",
    "foreground": "#f0f0ff",
    "cursor": "#f0f0ff",
    "selectionBackground": "#505064",
    "selectionForeground": "#f0f0ff",
    "black": "#000000",
    "red": "#ff80aa",
    "green": "#00ffbf",
    "yellow": "#ffd480",
    "blue": "#80aaff",
    "magenta": "#e2a1f7",
    "cyan": "#80d4ff",
    "white": "#f0f0ff",
    "brightBlack": "#505068",
    "brightRed": "#ff99bb",
    "brightGreen": "#66ffd9",
    "brightYellow": "#fee59a",
    "brightBlue": "#99bbff",
    "brightMagenta": "#ebb4fd",
    "brightCyan": "#99ddff",
    "brightWhite": "#ffffff"
  }
}
```

Now select it with a path relative to `config.json`:

```json
{
  "version": 1,
  "theme": {
    "path": "./themes/my-theme.json"
  }
}
```

The same relative path works on macOS, Linux, and Windows. It avoids embedding a
machine-specific absolute path and requires neither a source checkout nor a
custom font. Choose `View -> Reload User Configuration` to validate and apply
the complete configuration and palette.

A Terminal Theme root contains exactly `version`, `name`, and `colors`.
`version` is `1`; `name` is one printable non-empty line of at most 64 Unicode
code points; and `colors` contains every field shown above. Every color is an
exact, case-insensitive hexadecimal `#RRGGBB` value. Partial palettes, extra
keys, alpha colors, CSS names, functions, variables, inheritance, imports, and
URLs are unsupported. Set transparency and blur in `config.json` under `window`,
not in the Terminal Theme.

Absolute `theme.path` values are used as written. Relative values resolve from
the directory containing `config.json`. OMXTerm does not expand `~`,
environment variables, shell syntax, or URLs inside the JSON string. A symlink
is accepted only when its final target is a readable regular file.

### Theme troubleshooting

If a theme does not load, keep `config.json` as the small theme-selection
example above until the path works. Then check the persistent in-app error and
stderr for the configured and resolved paths and the exact invalid field.
Common causes are:

- saving `my-theme.json` outside the `themes` directory beside `config.json`;
- putting `~`, `$HOME`, `%USERPROFILE%`, or another variable in `theme.path` and
  expecting expansion;
- omitting one of the five interface colors or 16 normal and bright ANSI
  colors;
- using a color other than exact `#RRGGBB` form;
- adding a comment, trailing comma, unsupported key, or partial palette; or
- selecting a missing, unreadable, or non-regular file.

At startup, an invalid or missing selected theme uses bundled `omtheme` while
other validated settings remain active. A rejected manual reload instead keeps
the complete last valid in-memory configuration and theme. OMXTerm leaves both
files unchanged. Fix the reported problem and reload again; there is no file
watcher or theme-only reload.

The repository's [canonical palette](omtheme.json) is also a complete reference.
An optional source-checkout helper can convert a downloaded Ghostty palette:

```sh
node scripts/convert-ghostty-theme.mjs input-theme output-theme.json
```

Run this helper from a source checkout, then select the generated JSON with
`theme.path`. It converts palette syntax; the resulting theme follows the same
validation rules as a handwritten theme. Check the source theme's license
before redistributing it.

## Reloading User Configuration

`View -> Reload User Configuration` rereads and validates the complete
`config.json` through the startup boundary. It can select a changed
`theme.path`; Snippets are instead reread whenever their sidebar opens. There
is no automatic reload or file watching.

After a successful reload:

| Applies to            | Settings                                                      |
| --------------------- | ------------------------------------------------------------- |
| Existing and new tabs | Theme, font size, ligatures, padding, scrollback, Option keys |
| All windows and tabs  | Background transparency and best-effort native blur           |
| App actions           | Close confirmation, logging, keybinds                         |
| New tabs              | Font family, line height, Windows shell                       |
| New windows           | Always-on-Top, title-bar and tab-bar defaults                 |

Existing sessions keep running. A notice explains when font family or line
height needs a restart to apply everywhere. Existing windows retain their zoom
delta, title-bar and tab-bar choices, and Always-on-Top state. Actual Size returns zoom to the
latest configured baseline.

A rejected reload applies nothing and preserves the complete last valid
in-memory configuration. Removing `config.json` and reloading is a valid way to
select all built-in defaults without creating another file.

## Sharing configuration and diagnostics

Keep credentials out of snippets. Commands run with your ordinary account's
permissions, just as if you typed them. Review example commands before using them.

Validation errors identify the exact file and field locally; redact account
names, paths, and sensitive contents before sharing screenshots or files.
See [Local diagnostics](usage.md#local-diagnostics) for log locations and
Developer Tools guidance.
