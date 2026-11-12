# User configuration

OMXTerm works with bundled defaults. On first launch, it creates these editable files:

```text
omxterm/
├── config.json
└── themes/
    └── omtheme.json
```

On systems with built-in Snippets, OMXTerm also creates `snippets.yaml`. Optional Snippets installs leave this file absent until you create it. Configuration files live in `$XDG_CONFIG_HOME/omxterm` when the `XDG_CONFIG_HOME` environment setting (used by some apps) has a nonempty value. If it is unset or empty, they live in `.config/omxterm` under your account home. On Windows, the ordinary path is `%USERPROFILE%\.config\omxterm`.

Use **Settings…** in the application menu for preferences and shortcuts. To edit files, save your changes and choose **View → Reload User Configuration** (`Cmd+Shift+,` on macOS, `Ctrl+Shift+,` on Linux and Windows). Snippets reload when you open its sidebar.

- [Settings](#settings)
- [Configuration file](#configuration-file)
- [Display and window settings](#display-and-window-settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Snippets](#snippets)
- [Themes](#themes)
- [Reload and troubleshooting](#reload-and-troubleshooting)

## Settings

Choose **Settings…** from the application menu. Preference changes are saved and applied as you make them, except theme drafts and the **Config File** editor, which require explicit saving. Use **General** for language and close confirmation, **Appearance** for fonts, themes, transparency and blur, **Terminal** for terminal preferences, **Window** for window defaults, and **Shortcuts** to record, reset or unbind application shortcuts.

Settings has local theme cards with inline editing, font controls, and transparency and blur controls. **Config File** provides a text editor for `config.json`; choose **Save** explicitly. Snippets are edited in `snippets.yaml`.

Settings shows status for saved changes and errors. Some preferences apply to new tabs or windows; font family and line height require a restart to update existing tabs. If a save or reload fails, follow the status message, fix the reported problem, and reload again.

### Language

**General → Language** selects English (United States) (`en-US`) or Português (Brasil) (`pt-BR`). The default is English; OMXTerm does not infer the language from your system. You can also set `language` in `config.json`.

### Terminal context menu

In **Settings → Terminal**, clear **Terminal context menu** to disable the popup over terminal content and padding. To set it in JSON:

```json
{
  "version": 1,
  "terminal": { "contextMenuEnabled": false }
}
```

This hides the popup in all mouse modes. It does not disable terminal mouse input, clipboard actions or OSC 52. Existing context menu actions and keybindings remain available.

## Configuration file

<a id="create-the-configuration-directory"></a>

Every setting except `"version": 1` is optional. Omitted settings use their defaults:

```json
{ "version": 1 }
```

JSON uses double quotes around keys and text, commas between properties, and no trailing comma. Numbers and booleans are unquoted. JSON does not support comments or undocumented keys.

### Settings reference

All fields are optional except `version`. The built-in defaults are shown below.

| Field                                      | Accepted values                         | Default                         |
| ------------------------------------------ | --------------------------------------- | ------------------------------- |
| `version`                                  | `1`                                     | required                        |
| `language`                                 | `"en-US"`, `"pt-BR"`                    | `"en-US"`                       |
| `confirmClose`                             | boolean                                 | `true`                          |
| `logLevel`                                 | `"error"`, `"info"`, `"debug"`          | `"info"`                        |
| `windowsShell`                             | absolute executable path                | PowerShell, then ComSpec        |
| `font.family`                              | installed font family name              | bundled FiraCode Nerd Font Mono |
| `font.size`                                | integer 8–72 CSS px                     | `16`                            |
| `font.lineHeight`                          | number 1.0–2.0                          | `1.0`                           |
| `font.ligatures`                           | boolean                                 | `true`                          |
| `terminal.contextMenuEnabled`              | boolean                                 | `true`                          |
| `terminal.padding.top/right/bottom/left`   | integer 0–128 CSS px                    | `12` on every side              |
| `scrollback.lines`                         | integer 0–100000                        | `10000`                         |
| `keyboard.optionAsAlt`                     | `"none"`, `"left"`, `"right"`, `"both"` | `"none"`                        |
| `window.alwaysOnTop`                       | boolean                                 | `false`                         |
| `window.blur`                              | boolean                                 | `false`                         |
| `window.transparency`                      | number 0–1                              | `0`                             |
| `window.showTitleBar`, `window.showTabBar` | boolean                                 | `true`                          |
| `window.auxiliaryPanelSide`                | `"left"`, `"right"`                     | `"right"`                       |
| `theme.path`                               | relative or absolute file path          | bundled theme                   |
| `keybinds.<action>`                        | accelerator string or `null`            | built-in shortcut               |

`keyboard.optionAsAlt` affects terminal input on macOS. The `keybinds` options are listed in [Keyboard shortcuts](#keyboard-shortcuts).

OMXTerm creates the configuration folder on first launch. If needed, locate it from a terminal:

**macOS and Linux:**

```sh
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
mkdir -p "$config_dir"
printf '%s\n' "$config_dir/config.json"
```

**Windows PowerShell:**

```powershell
$configRoot = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME ".config" }
$configDirectory = Join-Path $configRoot "omxterm"
New-Item -ItemType Directory -Force $configDirectory
Invoke-Item -LiteralPath $configDirectory
```

If the shell's home differs from the OS account home, use the actual account configuration path. OMXTerm follows the environment it receives at launch.

## Display and window settings

### Font and terminal spacing

In **Settings → Appearance**, choose the font family and size. To set a font size in JSON:

```json
{
  "version": 1,
  "font": { "size": 18 }
}
```

`font.size` accepts integers from 8 to 72 CSS pixels. `font.family` must match an installed system font; the default is the bundled FiraCode Nerd Font Mono. `font.lineHeight` accepts 1.0–2.0 and `font.ligatures` is a boolean. Font family and line height apply to new tabs; restart to update open tabs.

Terminal padding is set in CSS pixels from 0 to 128. The default is 12 on every side. `scrollback.lines` accepts 0–100000 lines and defaults to 10000; setting it to 0 disables history. On Linux, installed optional fonts can provide emoji and CJK fallback.

### Transparency and blur

<a id="background-transparency-and-blur"></a>

Use **Settings → Appearance** or set `window.transparency` from 0 to 1 and `window.blur` to a boolean:

```json
{
  "version": 1,
  "window": { "transparency": 0.2, "blur": true }
}
```

Transparency lets the desktop show through the terminal background; blur support depends on the platform and compositor. Windows 11 Acrylic requires both blur enabled and transparency above 0. Linux transparency depends on the compositor; see the [Linux desktop guide](linux-desktop.md) for GNOME, KDE Plasma, Hyprland and HiDPI tips. Full-screen terminal apps that paint their own background may cover the effect.

### Window defaults

`window.alwaysOnTop`, `window.showTitleBar` and `window.showTabBar` set initial defaults for new windows. Use the **View** and **Window** menus to change the current window. `window.auxiliaryPanelSide` accepts `"left"` or `"right"` and sets the default side for the shared auxiliary panel.

To start new windows without title and tab bars:

```json
{
  "version": 1,
  "window": { "showTitleBar": false, "showTabBar": false }
}
```

### Windows default shell

<a id="choose-the-windows-default-shell"></a>

On Windows, set `windowsShell` to the full executable path of your shell. Double the backslashes in JSON:

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

You can also use a PowerShell 7 executable such as `C:\\Program Files\\PowerShell\\7\\pwsh.exe`. Reload and open a new tab. macOS and Linux use your account's login shell.

### Legacy OMXTerm Studio

[OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) remains available as a browser-only palette workshop for existing drafts. Its compatibility baseline is OMXTerm 0.17.1-dev.0; it does not support current configuration fields or all theme options. Use native Settings for current preferences. Keep your original files and download Studio edits to a new theme file; do not replace the current configuration with a Studio export.

## Keyboard shortcuts

<a id="keybinds"></a>

Use **Settings → Shortcuts** to record, reset or unbind application shortcuts. To edit JSON, use `keybinds` with [Electron accelerator syntax](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators). For example:

```json
{
  "version": 1,
  "keybinds": { "newWindow": "CommandOrControl+G" }
}
```

Every shortcut needs a key and at least one modifier other than Shift. Function keys F1–F24 can stand alone. Set an action to `null` to unbind it; omit the action to keep its default. Conflicting shortcuts are rejected. A shortcut used by a terminal program, such as Ctrl+C, will be handled by OMXTerm instead of reaching the shell.

| Action                                                    | macOS default                                                         | Linux/Windows default                      |
| --------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `commandPalette`                                          | `Cmd+Shift+P`                                                         | `Ctrl+Shift+P`                             |
| `quit`                                                    | `Cmd+Q`                                                               | `Ctrl+Alt+Shift+Q`                         |
| `copy` / `paste`                                          | `Cmd+C` / `Cmd+V`                                                     | `Ctrl+Shift+C` / `Ctrl+Shift+V`            |
| `selectAll` / `find`                                      | `Cmd+A` / `Cmd+F`                                                     | `Ctrl+Shift+A` / `Ctrl+Shift+F`            |
| `newWindow` / `newTab`                                    | `Cmd+N` / `Cmd+T`                                                     | `Ctrl+Shift+N` / `Ctrl+Shift+T`            |
| `closeTab` / `closeWindow`                                | `Cmd+W` / `Cmd+Shift+W`                                               | `Ctrl+Shift+W` / `Ctrl+Shift+Q`            |
| `nextTab` / `previousTab`                                 | `Ctrl+Tab` / `Ctrl+Shift+Tab`                                         | `Ctrl+PageDown` / `Ctrl+PageUp`            |
| `selectTab1` … `selectTab9`                               | `Cmd+1` … `Cmd+9`                                                     | `Alt+1` … `Alt+9`                          |
| `splitRight` / `splitDown`                                | `Cmd+D` / `Cmd+Shift+E`                                               | `Ctrl+Shift+O` / `Ctrl+Shift+E`            |
| `closePane`                                               | `Cmd+Option+W`                                                        | `Ctrl+Shift+K`                             |
| `focusNextPane` / `focusPreviousPane`                     | `Cmd+]` / `Cmd+[`                                                     | `Ctrl+Shift+]` / `Ctrl+Shift+[`            |
| `focusPaneLeft` / `focusPaneRight`                        | `Cmd+Option+Left` / `Cmd+Option+Right`                                | `Alt+Shift+Left` / `Alt+Shift+Right`       |
| `focusPaneUp` / `focusPaneDown`                           | `Cmd+Option+Up` / `Cmd+Option+Down`                                   | `Alt+Shift+Up` / `Alt+Shift+Down`          |
| `equalizePanes`                                           | `Cmd+Ctrl+=`                                                          | `Ctrl+Shift+0`                             |
| `zoomIn` / `zoomOut` / `actualSize`                       | `CommandOrControl+Plus` / `CommandOrControl+-` / `CommandOrControl+0` | `Control+Plus` / `Control+-` / `Control+0` |
| `toggleFullScreen`                                        | `Ctrl+Cmd+F`                                                          | `F11`                                      |
| `toggleSnippets`                                          | `Cmd+Shift+S`                                                         | `Ctrl+Shift+S`                             |
| `toggleFiles`, `toggleSshConnect`, `toggleAuxiliaryPanel` | unbound                                                               | unbound                                    |
| `moveAuxiliaryPanel`                                      | `Cmd+Shift+Option+P`                                                  | `Ctrl+Shift+Alt+P`                         |
| `toggleTabBar` / `toggleTitleBar`                         | `Cmd+Shift+B` / `Cmd+Shift+D`                                         | `Ctrl+Shift+B` / `Ctrl+Shift+D`            |
| `reloadConfig`                                            | `Cmd+Shift+,`                                                         | `Ctrl+Shift+,`                             |

The Command Palette is also available from **View → Command Palette…** when its shortcut is unbound. On Linux and Windows, Find uses Ctrl+Shift+F and full screen uses F11; remove conflicting custom bindings if upgrading an older configuration.

## Snippets

Snippets save reusable text or commands in `snippets.yaml`, beside `config.json`. Return from Settings to a terminal tab, then open the Snippets sidebar with `Cmd+Shift+S` or `Ctrl+Shift+S`; the shortcut does nothing in Settings. See [Snippets availability](snippets-availability.md) for where it is offered.

Create `snippets.yaml` if it is absent, and save this example:

```yaml
version: 1
snippets:
  - name: Print a message
    body: |-
      echo Hello
    execute: false
  - name: Show current directory
    body: pwd
```

Close and reopen the sidebar after saving. **Print a message** works in POSIX shells, PowerShell and Command Prompt. For **Show current directory**, use `pwd` in POSIX shells or PowerShell; in Command Prompt, change the body to `cd`. OMXTerm does not translate commands. `execute: false` inserts text without pressing Enter, while `true` presses Enter after insertion. Snippets are not run automatically when you open the sidebar. Existing `snippets.json` files are not migrated automatically.

## Themes

<a id="terminal-themes"></a>

On first launch, OMXTerm copies its default theme to `themes/omtheme.json`. Choose a local theme or edit one in **Settings → Appearance**. After editing, choose **Save** (or **Save copy** for a new theme), then **Use saved theme**. Saving alone does not apply the theme. See [theme authoring notes](dev/configuration-development.md#author-a-theme) for details. You can also set `theme.path` to a relative path under the configuration folder or an absolute path, then reload:

```json
{
  "version": 1,
  "theme": { "path": "./themes/my-theme.json" }
}
```

Theme JSON uses `"version": 1`, a name, and 21 required colors in `#RRGGBB` format. For transparency, use `window.transparency` rather than alpha colors. See the default [omtheme.json](omtheme.json) as a palette example.

Optional `appearance` theme fields can change pane and panel divider colors and the active pane highlight. They have no Settings controls and older app builds may reject them. See the [theme development notes](dev/configuration-development.md#pane-and-panel-appearance) for the supported fields.

## Reload and troubleshooting

<a id="reloading-user-configuration"></a>

<a id="theme-troubleshooting"></a>

Choose **View → Reload User Configuration** after editing `config.json` or a theme file. Theme, font size, ligatures, padding, scrollback, shortcuts, language and transparency update live. Font family and line height update in new tabs; restart to apply them to open tabs. Window defaults affect new windows.

If JSON is invalid, OMXTerm identifies the file and field. A failed manual reload keeps the previous valid configuration active. At startup, an invalid configuration falls back to built-in defaults without overwriting your files. A rejected theme falls back to the bundled theme.

For detailed behavior and edge cases, see the [configuration development notes](dev/configuration-development.md).
