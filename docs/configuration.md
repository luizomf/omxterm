# User configuration

OMXTerm works without configuration files. Add them only when you want to
change a default, create Snippets, or use an external Terminal Theme.

Settings live in strict JSON files; OMXTerm reads them without rewriting them.

- [Edit visually with OMXTerm Studio](#edit-visually-with-omxterm-studio)
- [Create a configuration](#quick-start-use-the-bundled-defaults)
- [Change fonts and spacing](#add-one-display-change)
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
and native Window Chrome can differ. Browser font names use a monospace fallback;
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

In a plain-text editor, save the JSON above at that printed path. By default it
is `~/.config/omxterm/config.json`; a non-empty `XDG_CONFIG_HOME` selects another
configuration root.

On Windows, the common default path is
`%USERPROFILE%\.config\omxterm\config.json`. This PowerShell sequence also
honors a non-empty `XDG_CONFIG_HOME`:

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
$configDirectory = Join-Path $configRoot "omxterm"
New-Item -ItemType Directory -Force $configDirectory
```

Save the JSON as `config.json` inside `$configDirectory`.

After saving, choose `View -> Reload User Configuration`. The built-in shortcut
is `Cmd+Shift+,` on macOS and `Ctrl+Shift+,` on Linux and Windows. A missing
file also selects all defaults and is not an error.

### Writing valid JSON

Each User Configuration example in this section is a complete valid JSON
document. Copy one, save it as `config.json`, and reload. When combining
examples, keep exactly one root object and one `"version": 1` property.

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
| `theme.path`              | non-empty filesystem path without NUL   | bundled `omtheme`                |
| `keybinds.<action>`       | accelerator with a non-Shift modifier   | built-in shortcut per action     |

### Settings that need explanation

- **Scrollback** is memory-only and separate per tab. Zero immediately clears
  history and disables retention; restoring a positive value retains only new
  output. Positive line counts are approximate because the core evicts whole
  pages and also has a 10,000,000-byte ceiling.
- **Option keys** apply only on macOS. `none` preserves native Unicode input;
  `left`, `right`, and `both` choose which Option keys send terminal Alt sequences.
- **Padding** begins below native window chrome. macOS adds a 30 px title inset
  while windowed; native fullscreen removes that inset, not your padding or the
  system safe area.
- **Font family and line height** apply to new tabs immediately after reload;
  existing tabs retain their original values until restart. Font size and
  ligatures apply live. Ligatures do not change copied text or terminal cells.
- **Font styles** use available bold/italic faces from your selected family,
  synthesizing missing styles. Missing glyphs use bundled and local fallback
  fonts. Custom variable-font axes are not supported. An invalid configured
  family is an error rather than a silent substitution.
- **Always on Top** sets the default for new windows. The Window menu toggles
  one current window without changing that default.

### Choose the Windows Default Shell

On Windows, `windowsShell` selects the executable for future Default Shell
sessions. Use an absolute Windows filesystem path:

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

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

`keybinds.toggleTabBar` changes the shortcut, not the bar's default visibility.
The [tab-bar toggle](usage.md#windows-tabs-and-sessions) is temporary per window.

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
the bundled canonical `omtheme`.

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
    "selectionBackground": "#3b4fa6",
    "selectionForeground": "#ffffff",
    "black": "#000000",
    "red": "#ff7e9a",
    "green": "#37feb7",
    "yellow": "#ffda76",
    "blue": "#88aaf2",
    "magenta": "#ff87bc",
    "cyan": "#6bccff",
    "white": "#f0f0ff",
    "brightBlack": "#505068",
    "brightRed": "#ffa8bb",
    "brightGreen": "#72ffcd",
    "brightYellow": "#ffeab2",
    "brightBlue": "#b2cbff",
    "brightMagenta": "#ff88ef",
    "brightCyan": "#77c6ff",
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
keys, alpha colors, CSS names, functions, variables, transparency, inheritance,
imports, and URLs are unsupported.

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
| App actions           | Close confirmation, logging, keybinds                         |
| New tabs              | Font family, line height, Windows shell                       |
| New windows           | Always-on-Top default                                         |

Existing sessions keep running. A notice explains when font family or line
height needs a restart to apply everywhere. Existing windows retain their zoom
delta, tab-bar choice, and Always-on-Top state. Actual Size returns zoom to the
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
