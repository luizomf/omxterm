# User configuration

> [!TIP]
> **Prefer visual editing?** [OMXTerm Studio](#edit-visually-with-omxterm-studio)
> lets you import, edit, and export settings and themes in your browser.

OMXTerm is ready to use with its bundled font, colors, and your default shell.
When you open it without an existing configuration, it creates three editable
starter files:

```text
omxterm/
├── config.json
├── snippets.json
└── themes/
    └── omtheme.json
```

Find them in `~/.config/omxterm` on macOS and Linux, or
`%USERPROFILE%\.config\omxterm` on Windows.

Keep these defaults to start; no separate preset download is needed. Back up
existing files before replacing them, or merge only the settings you want.

**The basic workflow: edit, save, reload.** Use a plain-text editor or
[OMXTerm Studio](#edit-visually-with-omxterm-studio), then choose
**View → Reload User Configuration** (`Cmd+Shift+,` on macOS,
`Ctrl+Shift+,` on Linux/Windows). On Linux and Windows, press and release
**Alt alone** to open the menu. Snippets are reloaded whenever you open their sidebar.

- [Make a first change](#add-one-display-change)
- [Find or create your configuration file](#create-the-configuration-directory)
- [Transparency and blur](#background-transparency-and-blur)
- [Snippets](#snippets) and [themes](#terminal-themes)
- [All settings](#configuration-reference), [Windows shells](#choose-the-windows-default-shell), and [shortcuts](#keybinds)
- [Reload behavior and errors](#reloading-user-configuration)

## Add one display change

Open `config.json`, find the `font` object, and adjust the `size` value (for example, change `16` to `18`). Save and reload the configuration (`Cmd+Shift+,` / `Ctrl+Shift+,`) to see your larger text immediately.

If you are creating a new configuration from scratch, here is a complete minimal example:

```json
{
  "version": 1,
  "font": {
    "size": 18
  }
}
```

When updating your configuration, simply add or update these keys inside your existing file to preserve your other settings.

For more space between rows, add `"lineHeight": 1.1` inside `font`. It applies
to new tabs after reload; restart OMXTerm to apply it to existing tabs. To turn
off programming ligatures such as joined `=>` operators, add
`"ligatures": false`. Ligatures change appearance, not copied text.

Here is a complete example combining those changes with padding:

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

The bundled font stays selected. To use an installed font, set `font.family`
to its exact, case-sensitive family name; a missing family is a validation
error. Tune font size and line height before padding: the terminal uses whole
character cells, so small unused margins can remain.

For a temporary change, use font zoom. **Actual Size** (`Cmd+0` on macOS,
`Ctrl+0` elsewhere) returns to the configured size without editing the file.

## Quick start: use the bundled defaults

The smallest valid `config.json` selects all built-in defaults:

```json
{
  "version": 1
}
```

This uses bundled FiraCode Nerd Font Mono, bundled `omtheme`, and the default
shortcuts. Reloading with a missing configuration file also selects defaults;
opening the app without one first attempts to create the starter kit. This minimal
configuration does not create `snippets.json` or an editable theme file. If
those are missing, create `snippets.json` with the [single-line example](#snippets)
or create and select a [complete theme](#terminal-themes).

### Create the configuration directory

Usually the first launch has already created this folder. To find or create it
on macOS or Linux, run:

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir"
printf '%s\n' "$config_dir/config.json"
```

OMXTerm uses the environment it had when the app started. Setting
`XDG_CONFIG_HOME` inside a terminal shell does not move the app's settings; use
the app's original location if the shell's value differs.

Open the printed path in a plain-text editor. To reach the hidden `.config`
folder, use **Cmd+Shift+G** in Finder or **Ctrl+L** in a Linux file manager.
In TextEdit, choose **Format → Make Plain Text** and disable smart quotes.

On Windows, run this in PowerShell:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
$configDirectory = Join-Path $configRoot "omxterm"
New-Item -ItemType Directory -Force $configDirectory
Invoke-Item -LiteralPath $configDirectory
```

Open or create `config.json` in that folder. In Notepad's Save As dialog, choose
**All files** and UTF-8. Explorer's **View → Show → File name extensions** helps
check that the name is `config.json`, not `config.json.txt`.

### Writing valid JSON

JSON is a plain-text format of named values:

- Use straight double quotes (`"`) around names and string values.
- Separate properties with commas, leaving no comma after the last one.
- Write numbers and `true`/`false` without quotes.
- Keep `"version": 1`; this is the file format, not the OMXTerm release number.
- Use only documented keys, and leave out comments.

The whole configuration is validated before applying it. A notice identifies
invalid JSON, misspelled keys, unsupported versions, shortcut conflicts, and
out-of-range values. See [reload behavior](#reloading-user-configuration) for
what remains active after an error.

<details>
<summary>How the first-launch starter files work</summary>

The starter configuration includes default settings and selects the copied
`themes/omtheme.json`. Background effects start off, and the greeting snippet
has `execute: false` so inserting it does not append Enter.

An existing `config.json` entry skips the entire kit, even if invalid. Existing
snippets and themes are preserved. The copied theme is yours; application
updates do not replace it. Remove the `theme` setting to follow the bundled
palette instead.

Creation happens when the app opens, not during installation or reload. If it
fails, a non-blocking notice appears and normal configuration loading continues.
After creation, OMXTerm reads your files without rewriting them.

</details>

## Edit visually with OMXTerm Studio

[OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) is an optional browser
editor for configuration and themes.

1. **Choose your platform** in **Configuration → Target platform**, before
   importing. Shortcut checks use that selection.
2. **Import config** and **Import theme** separately to keep your current
   preferences. Importing configuration does not load the file at `theme.path`.
   For a new palette, you can also start from `omtheme` or `omtheme-darkice`.
3. Edit colors in **Theme**, settings in **Configuration**, and shortcuts in
   **Keyboard shortcuts**. Use **Apply shortcuts** or **Apply JSON** after
   editing those fields so the download includes your changes.
4. Download using the option that fits your changes:

   | Export                   | What to do with it                                                                                      |
   | ------------------------ | ------------------------------------------------------------------------------------------------------- |
   | **Theme JSON**           | Save in `themes/` beside `config.json`, then set `theme.path` to that file.                             |
   | **Config JSON**          | Save as `config.json`. Its existing `theme.path` is unchanged.                                          |
   | **Download edited pair** | Extract `config.json` and `themes/theme.json` together; the configuration already points to that theme. |

5. Back up files before replacing them in your
   [configuration directory](#create-the-configuration-directory), then reload
   in OMXTerm. Theme colors apply live; font family and line height apply to
   new tabs, or everywhere after restart.

Imports, editing, and exports stay local to the browser. **Remember this draft
on this device** saves validated, applied documents only; apply and download
work you want to keep before closing the page. Fix invalid theme names or hex
colors before export.

Studio previews colors and layout with DOM/CSS. Check fonts, spacing, native
controls, transparency, and blur in OMXTerm itself. Installed fonts, filesystem
paths, shell executables, and OS-reserved shortcuts also need a local check.
Copying the exports and reloading remain your final steps.

## Background transparency and blur

Transparency reveals the desktop behind the terminal background; blur softens
it. Try a modest value such as `0.2` first:

```json
{
  "version": 1,
  "window": {
    "blur": true,
    "transparency": 0.2
  }
}
```

Edit the existing `window` fields if you already have them, then reload.
Both settings apply live to all windows and tabs. Defaults are `blur: false`
and `transparency: 0` (opaque). Transparency ranges from `0` to `1`; at `1`,
OMXTerm's background tint disappears where the platform supports it. Text,
cursor, selection, images, and foreground controls stay visible.

| Platform | What to expect                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | Native blur has fixed strength, with a system-material fallback. It uses undocumented APIs, so OS updates can change its appearance or availability. |
| Windows  | Enable **both** blur and positive transparency. Windows 11 22H2 or later can provide Acrylic. With blur off or unavailable, the theme stays opaque.  |
| Linux    | Transparency depends on your desktop compositor. KDE Plasma can honor OMXTerm's blur request; GNOME and Hyprland need desktop-side setup.            |

System policy, accessibility settings, drivers, and desktop versions can keep
the window opaque. At transparency `0`, blur is invisible. Your requested
settings remain saved even when an effect is unavailable.

Applications that paint explicit backgrounds remain opaque, even when the
color matches the theme. Implicit terminal backgrounds, including a reset to
the default background (SGR 49), reveal the tint. Theme colors remain
`#RRGGBB`; set transparency here rather than adding alpha to the palette.

### Linux desktop tips

For optional desktop setup, use the [Linux desktop guide](linux-desktop.md):

<a id="ubuntu-with-gnome-blur-my-shell"></a>

- [GNOME: Blur my Shell](linux-desktop.md#ubuntu-with-gnome-blur-my-shell)

<a id="fedora-with-kde-plasma-and-other-kde-desktops"></a>

- [KDE Plasma: Blur desktop effect](linux-desktop.md#fedora-with-kde-plasma-and-other-kde-desktops)

<a id="hyprland-including-omarchy"></a>

- [Hyprland and Omarchy](linux-desktop.md#hyprland-including-omarchy)

<a id="small-interface-text-on-a-hidpi-display"></a>

- [HiDPI interface size](linux-desktop.md#small-interface-text-on-a-hidpi-display)

<a id="graphics-troubleshooting"></a>

- [VM and driver graphics troubleshooting](linux-desktop.md#graphics-troubleshooting)

## Add one behavior change

For example, retain more scrollback with:

```json
{
  "version": 1,
  "scrollback": {
    "lines": 20000
  }
}
```

Omitted preferences keep their defaults. The reference below lists all settings.

## Configuration reference

Every preference except `version` is optional.

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

- **Close confirmation** asks before closing busy sessions. On Windows, every
  live session counts as busy. See [closing sessions](usage.md).
- **Scrollback** is memory-only and separate per tab. Zero immediately clears
  history and disables retention; increasing it later retains only new output.
  Positive line counts are approximate: the core evicts whole pages and also
  has a 10,000,000-byte ceiling.
- **Option keys** apply only on macOS. `none` preserves native Unicode input;
  `left`, `right`, and `both` choose which keys send terminal Alt sequences.
- **Padding** sits below the visible title area: 30 px on macOS, 34 px on
  Linux/Windows. Hiding that area or entering fullscreen removes its space,
  while preserving your padding and the macOS system safe area.
- **Font styles** use available bold/italic faces in the selected family,
  synthesizing missing styles. Missing glyphs use bundled and local fallback
  fonts. Exact native legacy and typographic family names are accepted;
  custom variable-font axes are unsupported.
- **Always on Top, title bar, and tab bar** set defaults for new windows.
  Their menu toggles affect only the current window and survive reload.
  An enabled tab bar appears when there are at least two tabs.
- **The Linux/Windows application menu** opens by pressing and releasing Alt
  alone, even with a hidden title bar or fullscreen. This gesture is fixed;
  configured shortcuts appear inside the menu.

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

Reload, then open a new window. For the current window, use
**View → Toggle Title Bar** or **View → Toggle Tab Bar**. When the title bar is
hidden, move the pointer near the top and drag the three dots that appear at
the center. Fullscreen hides that handle too. See [window controls](usage.md#window-controls).

### Choose the Windows Default Shell

Set `windowsShell` to an installed shell's absolute executable path. For
example, with Git for Windows installed at its usual location:

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

PowerShell 7 commonly uses `C:\\Program Files\\PowerShell\\7\\pwsh.exe` in JSON.
Check your actual installation path. Backslashes are doubled in JSON, the
final target must be an existing regular file, and the setting accepts only
the executable path: arguments, `~`, and environment-variable expansion are
unsupported.

Reload and open a new tab; existing sessions keep their shell. Remove the
property to return to Windows PowerShell, with ComSpec as fallback. macOS and
Linux accept but ignore this setting, using the account shell instead.

With `wsl.exe`, sessions inherit OMXTerm's Windows home directory, commonly
mapped to `/mnt/c/Users/<user>`, rather than the distribution's Linux home.
File drops and pasted file lists use **PowerShell quoting** regardless of the
selected Windows shell; review them before pressing Enter in Bash or WSL.

### Keybinds

`keybinds` remaps application-menu shortcuts using
[Electron accelerator](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators)
strings. Omitted actions keep their defaults. For a visual editor with conflict
feedback, use [Studio](#edit-visually-with-omxterm-studio)'s **Keyboard shortcuts**.

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

This example changes only New Window:

```json
{
  "version": 1,
  "keybinds": {
    "newWindow": "CommandOrControl+G"
  }
}
```

Accelerators are case-insensitive and need exactly one key plus at least one
modifier other than Shift. Aliases include `Ctrl`/`Control`, `Cmd`/`Command`,
`Alt`/`Option`, and `CmdOrCtrl`/`CommandOrControl`. `CommandOrControl` means
Command on macOS and Control elsewhere; `Super` and `Meta` use Electron's
Command family. `AltGr` is a separate modifier: `Alt+J` and `AltGr+J` can
belong to different actions. Plain Alt does not activate an AltGr binding;
`Control+Alt` is not an AltGr alias.

Use the printable character for punctuation, such as the literal comma in
`Control+Shift+,`, rather than `Comma`. The exception is `+`, written as `Plus`
because plus signs separate accelerator parts. A binding cannot duplicate
another action's effective shortcut, including an unchanged default. Shifted
symbols count as their native key plus Shift: `Control+!` conflicts with
`Control+Shift+1`, for example.

**Application shortcuts consume the key instead of sending it to the shell.**
For example, importing a macOS `CommandOrControl+C` binding on Linux/Windows
shadows terminal `Ctrl+C`. OMXTerm warns but keeps valid bindings active. Add
Shift or choose another key when you want the shell's control key to remain
available. Warnings cover `Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`, `Ctrl+U`,
`Ctrl+W`, `Ctrl+A`, and `Ctrl+E`.

<details>
<summary>Plus-key behavior across keyboard layouts</summary>

Accelerators describe the resulting key. On a layout where `+` shares the `=`
key, `Control+Plus` usually means `Ctrl+Shift+=`; a keypad `+` needs no Shift.
The same applies to Command on macOS.

`Control+Plus`, `Control+Shift+Plus`, and `Control+Shift+=` have the same
native identity and cannot be assigned to different actions. As a convenience,
`Control+Plus` also accepts an unshifted logical `+`; adding explicit Shift
requires Shift. Logical keypad input (including keypad Minus for Zoom Out)
continues to work; a specific keypad binding such as `Control+numadd` takes
precedence over these conveniences. Ordinary `Ctrl+=` is not a Plus alias.
OMXTerm does not translate arbitrary keyboard layouts.

</details>

The `toggleTabBar` and `toggleTitleBar` keybinds change shortcuts. Use
`window.showTabBar` and `window.showTitleBar` for initial visibility.

## Snippets

Snippets are saved text you can insert into the current tab. Edit
`snippets.json` beside `config.json`, then reopen **View → Toggle Snippets**
(`Cmd+Shift+S` on macOS, `Ctrl+Shift+S` on Linux/Windows).

Here is a complete single-line example:

```json
{
  "version": 1,
  "snippets": [
    {
      "name": "Show current directory",
      "body": "pwd",
      "description": "Insert a command that prints the current directory",
      "execute": false
    }
  ]
}
```

Click the snippet, review the inserted command, and press Enter. To submit a
snippet automatically, set its `execute` field to `true`.

**For commands you want to review before running, use a single-line body without
control characters and `execute: false`.** The flag controls only the appended
Enter: embedded newlines or controls may still execute input. Snippets use the
same [Protected Paste](usage.md#protected-paste) handling as ordinary paste.

The file contains `"version": 1` and a `snippets` array of at most 512 entries:

| Field         | Accepted value                                     | Default  |
| ------------- | -------------------------------------------------- | -------- |
| `name`        | non-empty string, at most 128 UTF-16 code units    | required |
| `body`        | non-empty string, at most 65,536 UTF-16 code units | required |
| `description` | string, at most 512 UTF-16 code units              | none     |
| `execute`     | boolean                                            | `false`  |

The sidebar filters by name and description. A missing file gives an empty
sidebar; an invalid file shows its path and field error instead of the list.
Fix the file and reopen the sidebar. The sidebar is 280 px wide and does not
shrink; the window's minimum width does not reserve that space. In a narrow
window, especially with large padding, it can hide the terminal grid. Enlarge
the window or hide the sidebar with **View → Toggle Snippets**.

## Terminal Themes

The starter kit selects an editable copy at `themes/omtheme.json`. Change a
color there and reload, or use [Studio](#edit-visually-with-omxterm-studio).
To follow the bundled palette through app updates, remove the `theme` setting.
Your copied palette stays unchanged until you edit it.

To make another theme, create a `themes` folder beside `config.json` and save
this complete palette as `themes/my-theme.json`:

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

Select it in `config.json` with a path relative to that file:

```json
{
  "version": 1,
  "theme": {
    "path": "./themes/my-theme.json"
  }
}
```

Reload to apply it. This relative path works on all three platforms. Absolute
paths work too, but `~`, environment variables, and URLs are not expanded.
The final target, including through a symlink, must be a readable regular file.

A theme has exactly `version`, `name`, and `colors`. Use version `1`, a printable
single-line name of 1–64 Unicode code points, and every color shown above in
`#RRGGBB` form. Palettes are complete rather than inherited; extra keys, partial
palettes, and alpha colors are rejected. Background transparency belongs in
`config.json` under `window`.

### Theme troubleshooting

Read the in-app error for the configured/resolved paths and invalid field.
Check the filename, all 21 color fields, exact `#RRGGBB` values, and JSON syntax.
For a relative path, the starting folder is the one containing `config.json`.

At startup, an invalid selected theme falls back to bundled `omtheme` while
other validated settings remain active. A manual reload rejected by theme
validation keeps the previous configuration and theme. Fix the file and reload;
neither file is rewritten. Unexpected failures while applying valid settings
have a separate [reload limitation](#reloading-user-configuration).

The [canonical palette](omtheme.json) is another complete example.

<details>
<summary>Convert a Ghostty palette from a source checkout</summary>

From the repository root, run:

```sh
node scripts/convert-ghostty-theme.mjs input-theme output-theme.json
```

Select the resulting file with `theme.path`. Check the source theme's license
before redistributing it.

</details>

## Reloading User Configuration

Saving a file does not apply it automatically. **View → Reload User
Configuration** validates the complete configuration and selected theme.
Snippets are read separately when their sidebar opens.

| Applies to            | Settings                                                      |
| --------------------- | ------------------------------------------------------------- |
| Existing and new tabs | Theme, font size, ligatures, padding, scrollback, Option keys |
| All windows and tabs  | Background transparency and best-effort native blur           |
| App actions           | Close confirmation, logging, keybinds                         |
| New tabs              | Font family, line height, Windows shell                       |
| New windows           | Always-on-Top, title-bar and tab-bar defaults                 |

A successful reload updates existing sessions in place. A notice explains when
font family or line height needs a restart to apply everywhere. Existing tabs
keep their creation-time values; live-safe settings update initializing tabs
when initialization finishes. Reloading the same values again keeps the notice
while an older tab survives; after closing those tabs, another reload clears it.
Existing windows keep their zoom adjustment, bar visibility, and Always-on-Top
choices. **Actual Size** returns zoom to the latest configured size.

**Font-family timing limitation:** changing `font.family` while a tab is still
acquiring its fonts can reject that pending acquisition and close the tab before
its shell starts. Wait until tabs have finished starting before reloading a
family change, or save your work and restart to apply it everywhere.

If validation fails:

- **At startup:** invalid `config.json` selects all built-in defaults; an invalid
  selected theme alone uses bundled `omtheme` with the other validated settings.
- **During reload:** no settings change; the complete last valid in-memory
  configuration stays active.

Correct the reported file or field, save, and reload again. If an unexpected
error happens **while applying otherwise valid settings**, changes can be partly
applied even if the notice says the previous configuration was kept. Save your
work and restart OMXTerm to load one consistent configuration, then report the
error and affected settings.

Removing `config.json` and reloading also selects defaults, without recreating
the file.
The [product contract](spec.md#configuration-and-local-state) has the full
validation rules.

## Sharing configuration and diagnostics

Keep credentials out of snippets. Commands run with your account's permissions,
so review examples before using them. Validation errors can include local paths;
redact account names, paths, and sensitive contents before sharing files or
screenshots. See [Local diagnostics](usage.md#local-diagnostics) for log locations
and Developer Tools guidance.
