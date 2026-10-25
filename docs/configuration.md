# User configuration

> [!TIP]
> **Prefer visual editing?** [OMXTerm Studio](#edit-visually-with-omxterm-studio) lets you import, customize, and export your settings, themes, and shortcuts in the browser.

OMXTerm works out of the box with its bundled font, theme, and default shortcuts. On your first launch, it creates three editable starter files:

```text
omxterm/
├── config.json
├── snippets.yaml
└── themes/
    └── omtheme.json
```

You can find them in:

- **macOS and Linux:** `~/.config/omxterm` (or `$XDG_CONFIG_HOME/omxterm`)
- **Windows:** `%USERPROFILE%\.config\omxterm`

**Prefer a form?** Choose **Settings…** in the OMXTerm application menu to change common settings without editing JSON. See [Settings](#settings).

**The basic workflow: edit, save, reload.** Edit your files in any text editor or [OMXTerm Studio](#edit-visually-with-omxterm-studio), then choose **View → Reload User Configuration** (`Cmd+Shift+,` on macOS, `Ctrl+Shift+,` on Linux/Windows). Snippets reload automatically whenever you open the Snippets sidebar (`Cmd+Shift+S` / `Ctrl+Shift+S`).

- [Change settings in the app](#settings)
- [Make your first display change](#add-one-display-change)
- [Find or create your configuration folder](#create-the-configuration-directory)
- [Edit visually with OMXTerm Studio](#edit-visually-with-omxterm-studio)
- [Background transparency and blur](#background-transparency-and-blur)
- [All settings reference](#configuration-reference)
- [Choose the Windows default shell](#choose-the-windows-default-shell)
- [Custom keyboard shortcuts](#keybinds)
- [Snippets](#snippets) and [Themes](#terminal-themes)
- [Reloading behavior and validation](#reloading-user-configuration)

## Settings

Choose **Settings…** in the OMXTerm application menu. **General → Language** selects **English (United States)** (`en-US`) or **Português (Brasil)** (`pt-BR`), always listed by their own names; it defaults to en-US and is never inferred from the system. A successful save/reload updates the menu and all open windows immediately, including Settings and snippet preview labels. Open editors keep their drafts, selected page, focus, selection/caret, scroll and pending saves; an open preview keeps its captured pane/Surface and disabled state if that terminal ended. Pane menus, close dialogs and existing Surface/separator accessible labels also update; panes completing initialization replay the latest labels. JSON, paths, snippet contents and diagnostic detail remain literal.

Each change you make to a control is checked and saved to `config.json` right away, then applied; the status line tells you what happened (examples below use English):

- **Saved.** The change is active.
- **Saved. New tabs use it.** or **It applies to new windows.** Open tabs and windows keep their current value.
- **Saved… restart OMXTerm to apply it to open tabs.** Font family and line height apply to new tabs immediately and to open tabs after a restart.
- **Saved to config.json, but it could not be applied: …** The file was written, but reload failed; some settings may already be active. Fix the reported problem and reload again.
- **Not saved: …** The value was rejected (for example, a font that isn't installed); your file is unchanged.
- **Saving…** One or more graphical changes are still pending. An earlier result does not mark a later change completed.

Clearing a text or number field removes that entry from `config.json`, so the default applies again. Settings changes only the field you edited and keeps the rest of your file, including edits you make in another editor while it's open. It rewrites the file with two-space indentation. If it detects an external edit during validation or write preparation, it refuses the change and asks you to reload instead of overwriting it. Settings does not write through a `config.json` symlink (including a dangling link); edit its target manually, then reload User Configuration.

The **Config File** page shows `config.json` with an explicit **Save**, using the same application and deferred-setting feedback as graphical changes. If the file changes on disk while you edit there, your draft is kept and saving it is refused until you choose **Reload File**. Save and Reload File are disabled while a raw request is pending; you can keep typing, and newer text is kept but is not included in the earlier Save. Reload File replaces your draft only if you have not typed again during its read. Shortcuts, transparency, blur and snippets are still edited in the files.

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
| `language`                | `"en-US"` or `"pt-BR"`                  | `"en-US"`                        |
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
| `keybinds.<action>`       | Electron accelerator string or `null`   | built-in shortcut per action     |

### Notes on specific settings

- **`language`:** chooses the language of OMXTerm's menus, dialogs, window controls, Settings, snippets panel and preview, image preview, About and search controls. OMXTerm never picks it from your system language. Only the exact tags `"en-US"` and `"pt-BR"` are accepted; any other value is a configuration error. At startup, invalid configuration uses the built-in defaults; a rejected manual reload keeps the last-valid configuration, including its language. Reloading the configuration switches the language in open windows without closing tabs. Some text stays in English: the validation detail inside a reload notice, technical cause detail inside a translated Terminal Surface failure notice, failures that happen before the configuration loads, logs, snippet file diagnostics, and text owned by the operating system. Terminal output is never translated.
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

| Action                      | macOS default                | Linux/Windows default |
| --------------------------- | ---------------------------- | --------------------- |
| `quit`                      | `CommandOrControl+Q`         | `Control+Alt+Shift+Q` |
| `copy`                      | `CommandOrControl+C`         | `Control+Shift+C`     |
| `paste`                     | `CommandOrControl+V`         | `Control+Shift+V`     |
| `selectAll`                 | `CommandOrControl+A`         | `Control+Shift+A`     |
| `find`                      | `CommandOrControl+F`         | `Control+Shift+F`     |
| `newWindow`                 | `CommandOrControl+N`         | `Control+Shift+N`     |
| `newTab`                    | `CommandOrControl+T`         | `Control+Shift+T`     |
| `closeTab`                  | `CommandOrControl+W`         | `Control+Shift+W`     |
| `closeWindow`               | `CommandOrControl+Shift+W`   | `Control+Shift+Q`     |
| `nextTab`                   | `Control+Tab`                | `Control+PageDown`    |
| `previousTab`               | `Control+Shift+Tab`          | `Control+PageUp`      |
| `selectTab1` … `selectTab9` | `CommandOrControl+1` … `9`   | `Alt+1` … `9`         |
| `splitRight`                | `CommandOrControl+D`         | `Control+Shift+O`     |
| `splitDown`                 | `CommandOrControl+Shift+E`   | `Control+Shift+E`     |
| `closePane`                 | `CommandOrControl+Alt+W`     | `Control+Shift+K`     |
| `focusNextPane`             | `CommandOrControl+]`         | `Control+Shift+]`     |
| `focusPreviousPane`         | `CommandOrControl+[`         | `Control+Shift+[`     |
| `focusPaneLeft`             | `CommandOrControl+Alt+Left`  | `Alt+Shift+Left`      |
| `focusPaneRight`            | `CommandOrControl+Alt+Right` | `Alt+Shift+Right`     |
| `focusPaneUp`               | `CommandOrControl+Alt+Up`    | `Alt+Shift+Up`        |
| `focusPaneDown`             | `CommandOrControl+Alt+Down`  | `Alt+Shift+Down`      |
| `equalizePanes`             | `Command+Control+=`          | `Control+Shift+0`     |
| `zoomIn`                    | `CommandOrControl+Plus`      | `Control+Plus`        |
| `zoomOut`                   | `CommandOrControl+-`         | `Control+-`           |
| `actualSize`                | `CommandOrControl+0`         | `Control+0`           |
| `toggleFullScreen`          | `Control+Command+F`          | `F11`                 |
| `toggleSnippets`            | `CommandOrControl+Shift+S`   | `Control+Shift+S`     |
| `toggleTabBar`              | `CommandOrControl+Shift+B`   | `Control+Shift+B`     |
| `toggleTitleBar`            | `CommandOrControl+Shift+D`   | `Control+Shift+D`     |
| `reloadConfig`              | `CommandOrControl+Shift+,`   | `Control+Shift+,`     |

Example overriding a single shortcut:

```json
{
  "version": 1,
  "keybinds": {
    "newWindow": "CommandOrControl+G"
  }
}
```

- Every shortcut needs one key plus at least one modifier other than Shift (such as `CommandOrControl`, `Control`, `Alt`, or `AltGr`), so a shortcut can never swallow normal typing. Function keys `F1` through `F24` are the exception: they can be used alone, like the default `F11`.
- Set an action to `null` to remove its shortcut. The action stays in the menu. OMXTerm stops using that key for the action, but another binding or your operating system may still use it. Leave an action out to keep its default.
- Use literal punctuation characters (such as `Control+Shift+,`), except for `+`, which is written as `Plus`.
- Each action needs its own shortcut. If two actions end up on the same key, including through a default, OMXTerm reports both actions and the key; pick another shortcut for one of them or set one to `null`. OMXTerm never changes another action's shortcut or your file for you. If you bind an action on Linux or Windows to a bare `Ctrl+<key>` that terminal programs use (like `Ctrl+C` or `Ctrl+D`), OMXTerm keeps the binding but shows a warning, since that key no longer reaches your shell.

For example, to use `F11` for Snippets instead of full screen:

```json
{
  "version": 1,
  "keybinds": {
    "toggleFullScreen": null,
    "toggleSnippets": "F11"
  }
}
```

> **Upgrading on Linux or Windows:** Find now uses `Ctrl+Shift+F` and full screen uses `F11`. If your `config.json` sets `"toggleFullScreen": "Control+Shift+F"`, it now conflicts with Find. Remove that entry to use `F11`, move Find (for example `"find": "Control+Alt+F"`), or keep the old combination with `"find": null`. While `F11` is bound, terminal programs that use it don't receive it; `"toggleFullScreen": null` removes that binding, although your desktop may still claim the key.

## Snippets

Snippets let you save commonly used commands or text in `snippets.yaml` (next to `config.json`) and insert them from the Snippets sidebar (`Cmd+Shift+S` / `Ctrl+Shift+S`). Configuration and theme files remain JSON.

```yaml
version: 1
snippets:
  - name: Print a message
    body: |-
      printf '%s\n' "Hello"
    execute: false
  - name: Show current directory
    body: pwd
    description: Insert a command that prints the current directory
```

- Literal blocks preserve shell quotes and line breaks without JSON escaping. `|-` strips trailing line breaks, `|` keeps one, and `|+` keeps all trailing line breaks. Indent body lines beneath `body:`.
- `execute: false` (the default) appends no Enter; `execute: true` appends Enter after the body. Embedded line breaks or control characters may themselves execute commands even with `false`. Multiline/control-character bodies use the existing Protected Paste confirmation when bracketed paste is disabled.
- Up to 512 snippets are supported: `name` is 1–128 characters, `body` is 1–65,536, and optional `description` is at most 512 (UTF-16 code units). `execute` must be a boolean. Unknown fields are rejected.
- The file must be one UTF-8 YAML 1.2 core document, at most 1 MiB. Collection nesting is limited to 16 levels (root collection is level 1), with at most 4,096 total mapping pairs and sequence entries. Duplicate keys, aliases, custom/non-core tags, and multiple documents are rejected. Quote scalar values that must be text, such as `"true"` or `"123"`.
- Opening reveals search/loading immediately and rereads the catalog. Close and reopen to reload edits; query and scroll are retained in window memory. Old rows cannot run during loading, and empty/error results replace them. Invalid files show a path and safe diagnostic instead of the list; syntax errors include line/column coordinates, not command excerpts.
- The [resizable panel](usage.md#resize-or-close-snippets) keeps its preferred width only for that window's lifetime. There are no panel configuration fields or persistent width/visibility settings. Close/Escape in the panel returns terminal focus; Settings, About, snippet preview and Local Image Preview keep it visible but inert.
- Existing `snippets.json` files are not read, rewritten, or migrated. Move your entries into `snippets.yaml` yourself; JSON-formatted content is also valid YAML, subject to the same limits.

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

## Reloading user configuration

Choose **View → Reload User Configuration** (`Cmd+Shift+,` / `Ctrl+Shift+,`) after saving edits to `config.json` or your theme file:

| Scope                 | Settings updated                                              |
| --------------------- | ------------------------------------------------------------- |
| Existing and new tabs | Theme, font size, ligatures, padding, scrollback, Option keys |
| All windows and tabs  | Background transparency and blur                              |
| App behavior          | Close confirmation, log level, keyboard shortcuts, language   |
| New tabs (or restart) | Font family, line height, Windows shell                       |
| New windows           | Always-on-Top, title-bar, and tab-bar initial defaults        |

If validation finds an error in your JSON, OMXTerm shows a banner naming the file and field to fix:

- **On manual reload:** your previous valid configuration stays active until you fix the error and reload again.
- **At app startup:** an invalid `config.json` falls back to built-in defaults (or the bundled `omtheme` if only the theme file is invalid) without overwriting your files.
