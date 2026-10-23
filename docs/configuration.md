# User configuration

> [!TIP]
> **Prefer a settings window?** Open **☰ → Preferences…** (`Ctrl+Shift+X` on Linux and Windows, `Cmd+,` on macOS). It edits the settings below, offers 14 built-in color schemes, records shortcuts with conflict checks, and applies every change to all windows at once. It writes the same `config.json` described here and keeps settings it does not manage, such as `windowsShell`.
>
> **Prefer visual editing?** [OMXTerm Studio](#edit-visually-with-omxterm-studio) lets you import, customize, and export your settings, themes, and shortcuts in the browser.

OMXTerm works out of the box with its bundled font, theme, and default shortcuts. On your first launch, it creates three editable starter files:

```text
omxterm/
├── config.json
├── snippets.json
└── themes/
    └── omtheme.json
```

You can find them in:

- **macOS and Linux:** `~/.config/omxterm` (or `$XDG_CONFIG_HOME/omxterm`)
- **Windows:** `%USERPROFILE%\.config\omxterm`

**The basic workflow: edit, save, reload.** Edit your files in any text editor or [OMXTerm Studio](#edit-visually-with-omxterm-studio), then choose **View → Reload User Configuration** (`Cmd+Shift+,` on macOS, `Ctrl+Shift+,` on Linux/Windows). Snippets reload automatically whenever you open the Snippets sidebar (`Cmd+Shift+S` / `Ctrl+Shift+S`).

- [Make your first display change](#add-one-display-change)
- [Find or create your configuration folder](#create-the-configuration-directory)
- [Edit visually with OMXTerm Studio](#edit-visually-with-omxterm-studio)
- [Background transparency and blur](#background-transparency-and-blur)
- [All settings reference](#configuration-reference)
- [Choose the Windows default shell](#choose-the-windows-default-shell)
- [Custom keyboard shortcuts](#keybinds)
- [Snippets](#snippets) and [Themes](#terminal-themes)
- [Reloading behavior and validation](#reloading-user-configuration)

## Add one display change

Open `config.json`, update `font.size` (for example, from `16` to `18`), save, and reload (`Cmd+Shift+,` / `Ctrl+Shift+,`) to resize your terminal text immediately:

```json
{
  "version": 1,
  "font": {
    "size": 18
  }
}
```

You can also adjust line height (`"lineHeight": 1.1`), disable programming ligatures (`"ligatures": false`), or customize padding around the terminal grid:

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

- **Font family:** by default, OMXTerm uses its bundled `FiraCode Nerd Font Mono`. To use an installed system font, set `font.family` to its exact, case-sensitive family name.
- **Line height and font family:** apply immediately to new tabs; restart OMXTerm to apply them to already-open tabs.
- **Temporary zoom:** use `Cmd++` / `Cmd+-` (`Ctrl++` / `Ctrl+-` on Linux/Windows) to zoom a window temporarily, and `Cmd+0` / `Ctrl+0` (**Actual Size**) to reset to your configured size.

## Configuration basics

Every setting except `"version": 1` is optional. Anything you leave out uses the built-in default, so this is a valid `config.json`:

```json
{
  "version": 1
}
```

### Create the configuration directory

OMXTerm creates this folder on first launch. If you deleted it or want to find it from your terminal:

**macOS and Linux:**

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir"
printf '%s\n' "$config_dir/config.json"
```

**Windows (PowerShell):**

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
$configDirectory = Join-Path $configRoot "omxterm"
New-Item -ItemType Directory -Force $configDirectory
Invoke-Item -LiteralPath $configDirectory
```

### Writing valid JSON

- Wrap all keys and string values in straight double quotes (`"`).
- Separate properties with commas, with no trailing comma after the last item.
- Write numbers and booleans (`true`/`false`) without quotes.
- Keep `"version": 1` at the top level (this identifies the config schema version, not the OMXTerm app version).
- Do not include comments or undocumented keys.

## Edit visually with OMXTerm Studio

[OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) is a local-first web editor for OMXTerm settings, themes, and shortcuts:

1. Select your OS under **Configuration → Target platform** so shortcut checks match your platform.
2. Click **Import config** and **Import theme** to load your existing files, or start from the built-in `omtheme` or `omtheme-darkice` presets.
3. Customize your colors in **Theme**, preferences in **Configuration**, and bindings in **Keyboard shortcuts** (click **Apply shortcuts** or **Apply JSON** when editing those sections).
4. Export your changes:
   - **Theme JSON:** save inside `themes/` next to `config.json` and point `theme.path` to it.
   - **Config JSON:** save as `config.json`.
   - **Download edited pair:** downloads both `config.json` and `themes/theme.json` pre-linked together.
5. Place the files in your [configuration directory](#create-the-configuration-directory) and reload in OMXTerm (`Cmd+Shift+,` / `Ctrl+Shift+,`).

## Background transparency and blur

Set `window.transparency` above `0` (up to `1`) to let your desktop show through the terminal background, and enable `window.blur` to soften the background behind the window:

```json
{
  "version": 1,
  "window": {
    "blur": true,
    "transparency": 0.2
  }
}
```

Both settings update live across all open windows when you reload. Text, cursor, selection, and inline images keep full opacity so your terminal stays crisp and readable.

| Platform | Behavior                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS    | Uses native macOS background blur (with a system vibrancy fallback).                                                                                        |
| Windows  | Enable **both** `"blur": true` and `"transparency"` above `0` to use Windows 11 Acrylic. With blur off, the window stays opaque.                            |
| Linux    | Transparency uses your X11/XWayland desktop compositor. KDE Plasma honors `window.blur` via `xprop`; GNOME and Hyprland configure blur in desktop settings. |

Note that full-screen terminal apps (like Neovim or `btop`) that paint an explicit background color over cells will render those cells opaque unless configured to use the terminal's default background (`SGR 49`).

### Linux desktop tips

See the [Linux desktop guide](linux-desktop.md) for compositor-specific setup:

<a id="ubuntu-with-gnome-blur-my-shell"></a>

- [GNOME: Blur my Shell](linux-desktop.md#ubuntu-with-gnome-blur-my-shell)

<a id="fedora-with-kde-plasma-and-other-kde-desktops"></a>

- [KDE Plasma: Blur desktop effect](linux-desktop.md#fedora-with-kde-plasma-and-other-kde-desktops)

<a id="hyprland-including-omarchy"></a>

- [Hyprland and Omarchy](linux-desktop.md#hyprland-including-omarchy)

<a id="small-interface-text-on-a-hidpi-display"></a>

- [HiDPI interface scaling](linux-desktop.md#small-interface-text-on-a-hidpi-display)

<a id="graphics-troubleshooting"></a>

- [VM and driver graphics troubleshooting](linux-desktop.md#graphics-troubleshooting)

## Configuration reference

Every field except `version` is optional and falls back to its default when omitted:

| Preference                | Accepted value                          | Default                          |
| ------------------------- | --------------------------------------- | -------------------------------- |
| `version`                 | `1`                                     | required                         |
| `confirmClose`            | boolean                                 | `true`                           |
| `logLevel`                | `"error"`, `"info"`, or `"debug"`       | `"info"`                         |
| `windowsShell`            | non-empty absolute executable path      | Windows PowerShell, then ComSpec |
| `font.family`             | exact installed system font-family name | bundled FiraCode Nerd Font Mono  |
| `font.size`               | integer `8` – `72` (CSS px)             | `16`                             |
| `font.lineHeight`         | number `1.0` – `2.0`                    | `1.0`                            |
| `font.ligatures`          | boolean                                 | `true`                           |
| `terminal.padding.top`    | integer `0` – `128` (CSS px)            | `0`                              |
| `terminal.padding.right`  | integer `0` – `128` (CSS px)            | `8`                              |
| `terminal.padding.bottom` | integer `0` – `128` (CSS px)            | `8`                              |
| `terminal.padding.left`   | integer `0` – `128` (CSS px)            | `8`                              |
| `scrollback.lines`        | integer `0` – `100000`                  | `10000`                          |
| `keyboard.optionAsAlt`    | `"none"`, `"left"`, `"right"`, `"both"` | `"none"`                         |
| `window.alwaysOnTop`      | boolean                                 | `false`                          |
| `window.blur`             | boolean                                 | `false`                          |
| `window.transparency`     | number `0` – `1`                        | `0`                              |
| `window.showTitleBar`     | boolean                                 | `true`                           |
| `window.showTabBar`       | boolean                                 | `true`                           |
| `theme.path`              | relative or absolute file path          | bundled `omtheme`                |
| `keybinds.<action>`       | Electron accelerator string             | built-in shortcut per action     |

### Notes on specific settings

- **`scrollback.lines`:** kept in memory per tab (up to a 10 MB per-screen core ceiling). Setting `0` clears and disables scrollback history.
- **`keyboard.optionAsAlt` (macOS only):** `"none"` keeps standard macOS Option character input (like accented letters or symbols); `"left"`, `"right"`, or `"both"` sends terminal `Alt` sequences instead.
- **`window.showTitleBar`, `window.showTabBar`, and `window.alwaysOnTop`:** set the initial state for new windows. Use the **View** and **Window** menus to toggle them in your current window.

### Start with hidden bars

To open new windows with a minimal, borderless layout:

```json
{
  "version": 1,
  "window": {
    "showTitleBar": false,
    "showTabBar": false
  }
}
```

### Choose the Windows default shell

On Windows, set `windowsShell` to the full executable path of your preferred shell (remember to double backslashes in JSON).

**Git Bash:**

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

**PowerShell 7:**

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
}
```

Reload your configuration and open a new tab to start the new shell. Only the executable path is accepted (no CLI flags or environment variables). macOS and Linux ignore `windowsShell` and use your OS account's login shell.

### Keybinds

Customize application shortcuts under `keybinds` using [Electron accelerator](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators) syntax (or edit them with conflict checking in [OMXTerm Studio](#edit-visually-with-omxterm-studio)):

| Action                      | macOS default               | Linux/Windows default     |
| --------------------------- | --------------------------- | ------------------------- |
| `quit`                      | `CommandOrControl+Q`        | `Control+Alt+Shift+Q`     |
| `copy`                      | `CommandOrControl+C`        | `Control+Shift+C`         |
| `paste`                     | `CommandOrControl+V`        | `Control+Shift+V`         |
| `selectAll`                 | `CommandOrControl+A`        | `Control+Shift+A`         |
| `newWindow`                 | `CommandOrControl+N`        | `Control+Shift+N`         |
| `newTab`                    | `CommandOrControl+T`        | `Control+Shift+T`         |
| `closeTab`                  | `CommandOrControl+W`        | `Control+Shift+W`         |
| `closeWindow`               | `CommandOrControl+Shift+W`  | `Control+Shift+Q`         |
| `nextTab`                   | `Control+Tab`               | `Control+PageDown`        |
| `previousTab`               | `Control+Shift+Tab`         | `Control+PageUp`          |
| `selectTab1` … `selectTab9` | `CommandOrControl+1` … `9`  | `Alt+1` … `9`             |
| `zoomIn`                    | `CommandOrControl+Plus`     | `Control+Plus`            |
| `zoomOut`                   | `CommandOrControl+-`        | `Control+-`               |
| `actualSize`                | `CommandOrControl+0`        | `Control+0`               |
| `toggleFullScreen`          | `Control+Command+F`         | `Control+Shift+F`         |
| `toggleSnippets`            | `CommandOrControl+Shift+S`  | `Control+Shift+S`         |
| `toggleTabBar`              | `CommandOrControl+Shift+B`  | `Control+Shift+B`         |
| `toggleTitleBar`            | `CommandOrControl+Shift+D`  | `Control+Shift+D`         |
| `reloadConfig`              | `CommandOrControl+Shift+,`  | `Control+Shift+,`         |
| `splitRight`                | `Command+D`                 | `Control+Shift+O`         |
| `splitDown`                 | `Command+Shift+E`           | `Control+Shift+E`         |
| `closePane`                 | `Command+Alt+W`             | `Control+Shift+K`         |
| `focusNextPane`             | `Command+]`                 | `Control+Shift+]`         |
| `focusPreviousPane`         | `Command+[`                 | `Control+Shift+[`         |
| `focusPaneLeft` … `Down`    | `Command+Alt+Left` … `Down` | `Alt+Shift+Left` … `Down` |
| `toggleMaximizePane`        | `Command+Shift+Enter`       | `Control+Shift+Z`         |
| `equalizePanes`             | `Command+Alt+0`             | `Control+Shift+0`         |
| `toggleBroadcast`           | `Command+Alt+I`             | `Control+Shift+I`         |
| `toggleSessions`            | `Command+Shift+J`           | `Control+Shift+H`         |
| `toggleCommands`            | `Command+Shift+M`           | `Control+Shift+M`         |
| `commandPalette`            | `Command+Shift+P`           | `Control+Shift+P`         |
| `find`                      | `Command+F`                 | `Control+Shift+G`         |
| `preferences`               | `Command+,`                 | `Control+Shift+X`         |

Example overriding a single shortcut:

```json
{
  "version": 1,
  "keybinds": {
    "newWindow": "CommandOrControl+G"
  }
}
```

- Every shortcut needs one key plus at least one modifier other than Shift (such as `CommandOrControl`, `Control`, `Alt`, or `AltGr`), so a shortcut can never swallow normal typing.
- Use literal punctuation characters (such as `Control+Shift+,`), except for `+`, which is written as `Plus`.
- Each action needs its own shortcut. If you bind an action on Linux or Windows to a bare `Ctrl+<key>` that terminal programs use (like `Ctrl+C` or `Ctrl+D`), OMXTerm keeps the binding but shows a warning, since that key no longer reaches your shell.

## Saved sessions file

Saved sessions live in `sessions.json` next to `config.json`. OMXTerm writes this file itself; edit sessions in the Sessions sidebar rather than by hand. If the file is damaged, OMXTerm renames it to `sessions.json.corrupt-<time>` and starts with an empty list, so nothing is silently lost. Secrets are never stored in it.

## Commands file

The Command Manager keeps your own commands, favorites and hidden built-in commands in `commands.json` next to `config.json`. OMXTerm writes this file itself; create and edit commands in the Commands sidebar. A damaged file is renamed to `commands.json.corrupt-<time>` and OMXTerm starts with only the built-in commands.

## Snippets

Snippets let you save commonly used commands or text in `snippets.json` (next to `config.json`) and insert them from the Snippets sidebar (`Cmd+Shift+S` / `Ctrl+Shift+S`).

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

- With `"execute": false` (the default), clicking a snippet inserts its text into the prompt so you can edit or review it before pressing Enter.
- Set `"execute": true` if you want OMXTerm to append `Enter` automatically after inserting the snippet.
- Up to 512 snippets are supported (`name` up to 128 characters, `body` up to 65,536 characters, optional `description` up to 512 characters).

## Terminal themes

On first launch, OMXTerm copies its default theme to `themes/omtheme.json` and links it in `config.json`. You can edit `themes/omtheme.json` directly, design a palette in [OMXTerm Studio](#edit-visually-with-omxterm-studio), or create a new theme file such as `themes/my-theme.json`:

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

Point `config.json` to your theme file (relative to `config.json` or as an absolute path) and reload:

```json
{
  "version": 1,
  "theme": {
    "path": "./themes/my-theme.json"
  }
}
```

### Theme troubleshooting

A valid theme file requires `"version": 1`, a single-line `"name"` (1–64 characters), and all 21 color fields formatted as 6-digit hex strings (`#RRGGBB`). For transparency, use `window.transparency` in `config.json` rather than alpha hex codes. See [`docs/omtheme.json`](omtheme.json) for the canonical palette.

<details>
<summary>Convert a Ghostty theme from a source checkout</summary>

From a local clone of the OMXTerm repository, you can convert a Ghostty theme file to OMXTerm's JSON format:

```sh
node scripts/convert-ghostty-theme.mjs input-theme output-theme.json
```

</details>

## Backing up and restoring settings

**File → Back Up Settings…** saves your `config.json`, `snippets.json`, themes, saved sessions, highlight rules and commands in one `.omxbackup` file, encrypted with a passphrase of at least 8 characters. Keep the passphrase: without it the backup cannot be opened. Passwords and keys are never stored in a backup.

**File → Restore Settings…** asks for the file and its passphrase, then replaces those settings in every open window. Files that are not in the backup, such as an extra theme, are kept. If any part of the backup is invalid, nothing is changed.

## Reloading user configuration

Choose **View → Reload User Configuration** (`Cmd+Shift+,` / `Ctrl+Shift+,`) after saving edits to `config.json` or your theme file:

| Scope                 | Settings updated                                              |
| --------------------- | ------------------------------------------------------------- |
| Existing and new tabs | Theme, font size, ligatures, padding, scrollback, Option keys |
| All windows and tabs  | Background transparency and blur                              |
| App behavior          | Close confirmation, log level, keyboard shortcuts             |
| New tabs (or restart) | Font family, line height, Windows shell                       |
| New windows           | Always-on-Top, title-bar, and tab-bar initial defaults        |

If validation finds an error in your JSON, OMXTerm shows a banner naming the file and field to fix:

- **On manual reload:** your previous valid configuration stays active until you fix the error and reload again.
- **At app startup:** an invalid `config.json` falls back to built-in defaults (or the bundled `omtheme` if only the theme file is invalid) without overwriting your files.
