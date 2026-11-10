# User configuration

> [!TIP]
> Choose **Settings…** in the OMXTerm application menu for preferences and keyboard shortcuts without editing JSON. For custom colors, edit a [theme file](#terminal-themes).

OMXTerm works out of the box with its bundled font, theme, and default shortcuts. On your first launch, it creates editable configuration and theme files. Targets with built-in Snippets also create the example catalog below; Linux ARM64/x64 and macOS/Windows ARM64 source with optional Snippets leave it user-owned and absent until you create it:

```text
omxterm/
├── config.json
├── snippets.yaml
└── themes/
    └── omtheme.json
```

On every supported OS, a nonempty `XDG_CONFIG_HOME` selects its `omxterm`
subdirectory. Otherwise, OMXTerm uses `.config/omxterm` under the OS account
home, independently of overridden home environment variables. In ordinary setups,
where the environment home matches the account home, you can find the files in:

- **macOS and Linux:** `~/.config/omxterm` (or `$XDG_CONFIG_HOME/omxterm`)
- **Windows:** `%USERPROFILE%\.config\omxterm` (or `%XDG_CONFIG_HOME%\omxterm`)

If XDG is unset or empty and your home environment is overridden, use the actual
account configuration path instead. See the [optional Snippets 0.1.0 limitation](snippets-migration.md#existing-catalogs-and-shortcuts)
when locating its catalog.

**In the app:** [Settings](#settings) validates, saves, and applies control changes for you. **Config File** also lets you edit `config.json` with an explicit **Save**.

**In a text editor: edit, save, reload.** After editing configuration or theme files, choose **View → Reload User Configuration** (`Cmd+Shift+,` on macOS, `Ctrl+Shift+,` on Linux/Windows). Snippets reload automatically whenever you open the Snippets sidebar (`Cmd+Shift+S` / `Ctrl+Shift+S`).

- [Change settings in the app](#settings)
- [Make your first display change](#add-one-display-change)
- [Find or create your configuration folder](#create-the-configuration-directory)
- [Legacy palette editing and drafts in OMXTerm Studio](#edit-visually-with-omxterm-studio)
- [Background transparency and blur](#background-transparency-and-blur)
- [All settings reference](#configuration-reference)
- [Choose the Windows default shell](#choose-the-windows-default-shell)
- [Custom keyboard shortcuts](#keybinds)
- [Snippets](#snippets) and [Themes](#terminal-themes)
- [Reloading behavior and validation](#reloading-user-configuration)

## Settings

Stable **0.25.0** includes font controls, local theme cards and inline theme
authoring, transparency and desktop blur in **Appearance**, plus preferences in
**General**, **Terminal**, and **Window**. Use **Shortcuts** to record, reset or
unbind application shortcuts. Stable 0.24.0 had the font controls/theme-file path
but not these newer appearance controls. The later #818 paired palette-preview
presentation remains development-source only, as noted below.

Settings opens as one graphical tab per window, beside your terminals, with no
shell or terminal session. Choosing **Settings…** again selects that same tab
without rereading the file or resetting your work. Switch freely using the tab
strip or normal tab-navigation shortcuts, including when the strip is hidden.
Your selected category, drafts, caret, scroll and pending save results survive
switching. **Close Tab** or Settings' **Close** discards that editor lifetime;
reopening reads a fresh snapshot. Closing does not implicitly save raw JSON and
adds no unsaved-change prompt. Escape does not close the Settings tab.

Settings uses the full content area with independent category/content scrolling.
Small windows use compact navigation; opening it does not resize your window or
change its native minimum. Terminal-only pane, Find, zoom, snippet and file-drop
actions do nothing there. Copy/Paste/Select All edit the focused Settings field,
never a hidden terminal. Selecting Settings suspends the shared Auxiliary Panel;
returning to a terminal restores its retained selected tool without reopening a
closed tool. About and menu-opened image previews can appear
over Settings, making it inert and restoring its focused control on dismissal.
The [Command Palette](usage.md#command-palette) can also open above Settings;
its dismissal preserves the retained editor and restores a surviving focused control.

Choose **Settings…** in the OMXTerm application menu. **General → Language** selects **English (United States)** (`en-US`) or **Português (Brasil)** (`pt-BR`), always listed by their own names; it defaults to en-US and is never inferred from the system. A successful save/reload updates the menu and all open windows immediately, including Settings and snippet preview labels. Open editors keep their drafts, selected page, focus, selection/caret, scroll and pending saves; an open preview keeps its captured pane/Surface and disabled state if that terminal ended. Pane menus, close dialogs and existing Surface/separator accessible labels also update; panes completing initialization replay the latest labels. JSON, paths, snippet contents and diagnostic detail remain literal.

Control changes are submitted right away for validation, saving to `config.json` and application. Rapid theme choices or transparency adjustments replace earlier consecutive choices for the same control that are still waiting to start, so stale selections do not all replay; an already-running save finishes normally. The status line tells you what happened (examples below use English):

- **Saved.** The change is active.
- **Saved. New tabs use it.** or **It applies to new windows.** Open tabs and windows keep their current value.
- **Saved… restart OMXTerm to apply it to open tabs.** Font family and line height apply to new tabs immediately and to open tabs after a restart.
- **Saved to config.json, but it could not be applied: …** The file was written, but reload failed; some settings may already be active. Fix the reported problem and reload again.
- **Not saved: …** The value was rejected (for example, a font that isn't installed); your file is unchanged.
- **Saving…** One or more graphical changes are still pending. An earlier result does not mark a later change completed.
- **A newer choice replaced this selection before it was saved.** A later choice superseded this queued theme or transparency request, possibly from another window. This is not a saved confirmation for the replaced choice.

Clearing a text or number field removes that entry from `config.json`, so the default applies again. Settings changes only the field you edited and keeps the rest of your file, including edits you make in another editor while it's open. It rewrites the file with two-space indentation. If it detects an external edit or a changed link destination during validation or write preparation, it refuses the change and asks you to reload instead of overwriting it.

Settings can save through `config.json` symlinks, relative links, link chains and linked directories. It replaces the existing regular target file atomically and keeps the links. If a link is dangling or cyclic, or the target is not a regular file, fix it and reload the file before saving. For permission errors, check the file and its target directory; the directory must allow creating and replacing files. An absent ordinary `config.json` can still be created with mode `0600` where supported; inherited filesystem ACLs still apply. If cleanup fails, Settings warns that a temporary file may remain in the target directory. The final conflict checks include permission changes and reduce races with other editors but cannot lock them out: a change immediately after a check can still interfere with a save.

Atomic replacement keeps the target's basic permission bits where supported, but it creates a new file entry. Other hard links keep the old contents; ownership, ACLs, extended attributes and other metadata may not be preserved. Back up important metadata or use an editor that preserves it if that matters for your setup.

The **Config File** page shows `config.json` with an explicit **Save**, using the same application and deferred-setting feedback as graphical changes. If the file changes on disk while you edit there, your draft is kept and saving it is refused until you choose **Reload File**. Save and Reload File are disabled while a raw request is pending; you can keep typing, and newer text is kept but is not included in the earlier Save. Reload File replaces your draft only if you have not typed again during its read. Snippets are still edited in their file.

The **Shortcuts** page lists every remappable application action with the shortcut it uses now and how it is set. Operating-system shortcuts, ordinary text editing inside a field, and intentionally fixed context-specific gestures are not global commands and do not appear there. Escape still hides the auxiliary panel, and Left/Right/Home/End still move its focused separator; those keys cannot be rebound on this page.

- **Default:** follows OMXTerm's built-in shortcut (no entry in `config.json`). **Default** removes your entry again. Command Palette defaults to `Cmd+Shift+P` on macOS and `Ctrl+Shift+P` on Linux and Windows.
- **Custom:** **Record**, then press the new combination; it is saved as that action's `keybinds` entry. Plain Escape cancels; modified Escape can be recorded. An unsupported combination (including a letter without Ctrl, Alt, Cmd or AltGr, or a layout identity the accelerator cannot represent) asks you to try again; F1–F24 can stand alone. On macOS, Option without other modifiers can record observable top-row digits and some letters using the current keyboard layout. This is limited to ordinary letter/digit key positions and single ASCII layout letters, not every character on every layout. Dead keys, input methods, other characters or unavailable native support may not be recordable; try Option with an arrow or function key, or another modifier. Some dead-key sequences do not reach the recorder and may leave it waiting until you try another key or cancel. The `keyboard.optionAsAlt` setting affects terminal input, not application shortcuts. The recorder consumes observable shortcut candidates and their held repeats and releases; keys reported as composing are left to the normal input path.
- **Unbound:** **Unbind** saves `null`, so the action stays in the menu without a key.

**Cancel**, leaving the Shortcuts page or Settings tab, opening Command Palette or a modal preview/About, losing recording-button/window focus, or closing Settings ends recording without saving. While recording, tab-navigation shortcuts are candidate bindings: cancel first, or select another tab with the pointer/menu. Recording also cancels automatically after 30 seconds, and the status changes so it no longer asks you to press a key. A delayed result from an old recording cannot change a replacement recording.

A shortcut that collides with another action is rejected with the same message as in `config.json`, and your file stays unchanged. On macOS, Option-only top-row and keypad shortcuts for the same digit (for example `Alt+9` and `Alt+num9`) count as collisions. A previously accepted file containing both now fails validation: remap one action or set it to `null`, then reload. OMXTerm does not rewrite it. App shortcuts take their key before terminal programs see it, so binding a key a program uses (like `Ctrl+C`) keeps it from reaching that program.

### Terminal context menu

In **Settings → Terminal**, the labelled **Terminal context menu** checkbox
controls OMXTerm's popup over terminal content and padding. It is enabled by
default. To disable it in `config.json`, set:

```json
{
  "version": 1,
  "terminal": {
    "contextMenuEnabled": false
  }
}
```

Only booleans are accepted. Omission or `true` retains existing behavior,
including when an application uses mouse reporting. `false` suppresses the popup
for all modifiers and mouse modes, including keyboard-originated context-menu
events; there is no Shift exception or automatic mode detection. Application
mouse input (for example, tmux bindings), clipboard actions and OSC 52 are not
disabled. The clicked pane still receives focus, including on its padding.
Scrollback Search's query field and unrelated Settings, Snippets and chrome
menus keep working. Existing **Edit** actions and configured keybindings remain
available, but pointer access and discoverability are reduced; this is not an
accessibility guarantee. A valid reload updates existing, hidden and mounting
panes without restarting their sessions. Rejected reloads retain the last valid
settings.

## Add one display change

Change **Font size** in **Settings → Appearance** to resize your terminal text.
To do the same in a text editor, update `font.size` in `config.json` (for example,
from `16` to `18`), save, and reload (`Cmd+Shift+,` / `Ctrl+Shift+,`):

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
- **Linux missing-glyph coverage:** after bundled fonts, OMXTerm tries installed `Noto Color Emoji`, `Noto Sans CJK SC`, `DejaVu Sans Mono`, and `Source Han Sans CN`, in that order. Each needs an exact regular-family match and must fit the fallback-byte budget. Source Han can provide CJK glyphs when Noto CJK is absent; coverage depends on the available fonts, not an automatic installation or a guarantee of every CJK character. You do not need to change `font.family` to use these fallbacks.
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

OMXTerm creates this folder on first launch. If you deleted it or want to find
it from your terminal, these examples use `XDG_CONFIG_HOME` when nonempty and
otherwise assume the shell's home (`$HOME` on both systems) matches the OS account
home. If XDG is unset or empty and the shell's home is overridden, use the actual
account configuration path instead. Use the same XDG setting OMXTerm receives at
launch.

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

<a id="edit-visually-with-omxterm-studio"></a>

## Legacy OMXTerm Studio

[OMXTerm Studio](https://luizomf.github.io/omxterm-studio/) remains available as a
browser-only palette workshop and for existing drafts. Its
[compatibility baseline](https://github.com/luizomf/omxterm-studio/blob/9fbe2871a01bf1446770280b8c99291efcd697fb/docs/contract-provenance.md)
is **0.17.1-dev.0**, not current OMXTerm. Use native Settings for current
preferences and shortcuts: Studio rejects newer fields such as `language` and
`window.auxiliaryPanelSide`, has an older shortcut vocabulary/defaults, and rejects
themes containing optional `appearance` roles.

For browser-only editing of a basic palette:

1. Start from Studio's `omtheme` or `omtheme-darkice` preset, or **Import theme**
   with a legacy-compatible version-1 file containing only `version`, `name`, and
   `colors`. Keep your original files; do not strip supported fields just to make
   a current document importable.
2. Edit colors and name in **Theme**, then download **Theme JSON** to a new file
   such as `themes/my-theme.json` in your
   [configuration directory](#create-the-configuration-directory). If adapting an
   existing theme, preserve its optional `appearance` values in your text editor.
3. Select the file in OMXTerm using the [theme instructions](#terminal-themes).
   Keep your current `config.json` rather than replacing it with Studio's config
   or paired export.

To keep existing Studio work, apply pending configuration/shortcut edits, finish
valid theme edits, and download the documents before clearing browser site storage.
**Remember this draft** stores validated, applied documents in that browser
profile, not unfinished text. Legacy config/shortcut downloads can be kept as
backups and consulted when transferring individual preferences to Settings.

## Background transparency and blur

In **stable 0.25.0**, use the Appearance controls below, **Settings → Config File**
(then **Save**) or a text editor (then reload) to set `window.transparency` above
`0` (up to `1`) and enable `window.blur`. Stable 0.24.0 supports the JSON route,
not the Appearance controls. These settings let your desktop show through the
terminal background and request native desktop blur:

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

**Since stable 0.25.0** (introduced in 0.25.0-dev.16, #805), **Settings → Appearance**
provides a **Background transparency** slider (0–100%, 1% steps) and **Blur desktop
background** checkbox below themes. Arrow keys adjust the focused slider;
Home/End select its endpoints. Each saved change updates the actual windows
through the normal reload path, with no separate Apply step; the usual status
line reports save/application errors. Desktop blur is distinct from the softening
behind About/Command Palette; support depends on the platform/compositor.

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

| Preference                    | Accepted value                          | Default                          |
| ----------------------------- | --------------------------------------- | -------------------------------- |
| `version`                     | `1`                                     | required                         |
| `language`                    | `"en-US"` or `"pt-BR"`                  | `"en-US"`                        |
| `confirmClose`                | boolean                                 | `true`                           |
| `logLevel`                    | `"error"`, `"info"`, or `"debug"`       | `"info"`                         |
| `windowsShell`                | non-empty absolute executable path      | Windows PowerShell, then ComSpec |
| `font.family`                 | exact installed system font-family name | bundled FiraCode Nerd Font Mono  |
| `font.size`                   | integer `8` – `72` (CSS px)             | `16`                             |
| `font.lineHeight`             | number `1.0` – `2.0`                    | `1.0`                            |
| `font.ligatures`              | boolean                                 | `true`                           |
| `terminal.contextMenuEnabled` | boolean                                 | `true`                           |
| `terminal.padding.top`        | integer `0` – `128` (CSS px)            | `0`                              |
| `terminal.padding.right`      | integer `0` – `128` (CSS px)            | `8`                              |
| `terminal.padding.bottom`     | integer `0` – `128` (CSS px)            | `8`                              |
| `terminal.padding.left`       | integer `0` – `128` (CSS px)            | `8`                              |
| `scrollback.lines`            | integer `0` – `100000`                  | `10000`                          |
| `keyboard.optionAsAlt`        | `"none"`, `"left"`, `"right"`, `"both"` | `"none"`                         |
| `window.alwaysOnTop`          | boolean                                 | `false`                          |
| `window.blur`                 | boolean                                 | `false`                          |
| `window.transparency`         | number `0` – `1`                        | `0`                              |
| `window.showTitleBar`         | boolean                                 | `true`                           |
| `window.auxiliaryPanelSide`   | `"left"` or `"right"`                   | `"right"`                        |
| `window.showTabBar`           | boolean                                 | `true`                           |
| `theme.path`                  | relative or absolute file path          | bundled `omtheme`                |
| `keybinds.<action>`           | Electron accelerator string or `null`   | built-in shortcut per action     |

### Notes on specific settings

- **`language`:** chooses the language of OMXTerm's menus, dialogs, window controls, Settings, snippets panel and preview, image preview, About and search controls. OMXTerm never picks it from your system language. Only the exact tags `"en-US"` and `"pt-BR"` are accepted; any other value is a configuration error. At startup, invalid configuration uses the built-in defaults; a rejected manual reload keeps the last-valid configuration, including its language. Reloading the configuration switches the language in open windows without closing tabs. Some text stays in English: the validation detail inside a reload notice, technical cause detail inside a translated Terminal Surface failure notice, failures that happen before the configuration loads, logs, snippet file diagnostics, and text owned by the operating system. Terminal output is never translated.
- **`scrollback.lines`:** kept in memory per tab (up to a 10 MB per-screen core ceiling). Setting `0` clears and disables scrollback history.
- **`keyboard.optionAsAlt` (macOS only):** `"none"` keeps standard macOS Option character input (like accented letters or symbols); `"left"`, `"right"`, or `"both"` sends terminal `Alt` sequences instead. It does not change application shortcut recording or matching.
- **`window.auxiliaryPanelSide`:** choose **Settings → Window → Auxiliary panel side** to place the shared Snippets/Files/SSH panel on the left or right. The saved choice applies live to all windows without reopening tools or losing drafts/focus. Width and visibility remain window-local and memory-only. Omitting the setting restores right.
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

Use **Settings → Shortcuts** to record, reset, or unbind application shortcuts
with conflict checking. To edit JSON instead, customize `keybinds` using
[Electron accelerator](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators)
syntax:

| Action                      | macOS default                  | Linux/Windows default |
| --------------------------- | ------------------------------ | --------------------- |
| `commandPalette`            | `CommandOrControl+Shift+P`     | `Control+Shift+P`     |
| `quit`                      | `CommandOrControl+Q`           | `Control+Alt+Shift+Q` |
| `copy`                      | `CommandOrControl+C`           | `Control+Shift+C`     |
| `paste`                     | `CommandOrControl+V`           | `Control+Shift+V`     |
| `selectAll`                 | `CommandOrControl+A`           | `Control+Shift+A`     |
| `find`                      | `CommandOrControl+F`           | `Control+Shift+F`     |
| `newWindow`                 | `CommandOrControl+N`           | `Control+Shift+N`     |
| `newTab`                    | `CommandOrControl+T`           | `Control+Shift+T`     |
| `closeTab`                  | `CommandOrControl+W`           | `Control+Shift+W`     |
| `closeWindow`               | `CommandOrControl+Shift+W`     | `Control+Shift+Q`     |
| `nextTab`                   | `Control+Tab`                  | `Control+PageDown`    |
| `previousTab`               | `Control+Shift+Tab`            | `Control+PageUp`      |
| `selectTab1` … `selectTab9` | `CommandOrControl+1` … `9`     | `Alt+1` … `9`         |
| `splitRight`                | `CommandOrControl+D`           | `Control+Shift+O`     |
| `splitDown`                 | `CommandOrControl+Shift+E`     | `Control+Shift+E`     |
| `closePane`                 | `CommandOrControl+Alt+W`       | `Control+Shift+K`     |
| `focusNextPane`             | `CommandOrControl+]`           | `Control+Shift+]`     |
| `focusPreviousPane`         | `CommandOrControl+[`           | `Control+Shift+[`     |
| `focusPaneLeft`             | `CommandOrControl+Alt+Left`    | `Alt+Shift+Left`      |
| `focusPaneRight`            | `CommandOrControl+Alt+Right`   | `Alt+Shift+Right`     |
| `focusPaneUp`               | `CommandOrControl+Alt+Up`      | `Alt+Shift+Up`        |
| `focusPaneDown`             | `CommandOrControl+Alt+Down`    | `Alt+Shift+Down`      |
| `equalizePanes`             | `Command+Control+=`            | `Control+Shift+0`     |
| `zoomIn`                    | `CommandOrControl+Plus`        | `Control+Plus`        |
| `zoomOut`                   | `CommandOrControl+-`           | `Control+-`           |
| `actualSize`                | `CommandOrControl+0`           | `Control+0`           |
| `toggleFullScreen`          | `Control+Command+F`            | `F11`                 |
| `toggleSnippets`            | `CommandOrControl+Shift+S`     | `Control+Shift+S`     |
| `toggleFiles`               | `null`                         | `null`                |
| `toggleSshConnect`          | `null`                         | `null`                |
| `toggleAuxiliaryPanel`      | `null`                         | `null`                |
| `moveAuxiliaryPanel`        | `CommandOrControl+Shift+Alt+P` | `Control+Shift+Alt+P` |
| `toggleTabBar`              | `CommandOrControl+Shift+B`     | `Control+Shift+B`     |
| `toggleTitleBar`            | `CommandOrControl+Shift+D`     | `Control+Shift+D`     |
| `reloadConfig`              | `CommandOrControl+Shift+,`     | `Control+Shift+,`     |

**Command Palette** is available from **View → Command Palette…** even when
unbound. Its default is **Cmd+Shift+P** on macOS and **Ctrl+Shift+P** on Linux/Windows.
Change it in **Settings → Shortcuts**, or set `keybinds.commandPalette` to an
unused accelerator or `null`. Omitting it or choosing **Default** uses the platform
default; explicit remaps and `null` are preserved. If another custom action already
uses that combination (including equivalent aliases), standard collision validation
rejects the configuration with an actionable error. Remap either action or set
one to `null`; OMXTerm does not silently reassign keys or rewrite your file.
After changing bindings or language, reopen an already-open palette to refresh
its labels and shortcut display.

**View → Move Auxiliary Panel to Other Side** uses
`keybinds.moveAuxiliaryPanel` (Cmd+Shift+Option+P on macOS and
Ctrl+Shift+Alt+P on Linux/Windows). Change or unbind it in **Settings →
Shortcuts**. One physical press moves the panel once. It changes the focused
window for that window's lifetime, including while Settings or a hosted tab is
selected, without revealing a suspended panel or rewriting
`window.auxiliaryPanelSide`. A modal still blocks it. Changing the saved
preference takes effect and clears the window's temporary side choice.

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

`toggleFiles` and `toggleSshConnect` are optional bindings for the existing Files
and SSH Connect entry points, unbound by default. Configure them in Settings →
Shortcuts even before installing the tools. Missing, disabled or unsupported tools
do not consume their configured key; your binding remains saved and still counts
for conflict validation. Available tools show the binding on their existing menu
and palette entries. Holding either key invokes once: a selected-visible tool
closes, a hidden/nonselected tool is revealed, and a closed tool opens fresh.
Use `toggleAuxiliaryPanel` instead to hide/reveal without closing tools.
In current source, when no tools are open, that action opens installed+enabled
Snippets lazily (built-in on Windows x64). Unavailability produces one discreet
four-second notice per application process, not installation, enablement or a
Settings jump. Later deliberate installation can make another attempt succeed.
This does not reassign Cmd/Ctrl+Shift+S: `toggleSnippets` and
`toggleAuxiliaryPanel` remain separate actions with unchanged defaults, custom
bindings and explicit `null` choices.

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

Published **OMXTerm 0.25.0** and current source use optional Snippets on Linux
ARM64/x64, macOS ARM64 and Windows ARM64. Windows x64 and the unchanged0.23.0
host retain built-in Snippets. Use the official catalog or a verified local
archive; the local route also works offline after download. See the
[migration guide](snippets-migration.md) for matching downloads, installation,
existing catalogs and exact qualification limits.

Windows ARM64 still has [public-install Snippets failures and testing gaps](snippets-migration.md#stable-0250-release-disposition).
Read those limits before upgrading if you rely on built-in Snippets.

Since 0.25.0, new packaged profiles try once to install the
[removable default](default-snippets.md), enabled but inactive until opened.
Existing profiles, YAML and disabled/removed choices stay intact. This uses the
unchanged bundled 0.1.0 archive and creates no user YAML. Removing it does not
trigger a reinstall. Developer startup and Windows x64 are excluded.

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

- The example uses POSIX `printf`; choose literal commands appropriate for your configured shell, including Windows PowerShell. Snippets do not translate commands.
- Literal blocks preserve shell quotes and line breaks without JSON escaping. `|-` strips trailing line breaks, `|` keeps one, and `|+` keeps all trailing line breaks. Indent body lines beneath `body:`.
- `execute: false` (the default) appends no Enter; `execute: true` appends Enter after the body. Embedded line breaks or control characters may themselves execute commands even with `false`. Multiline/control-character bodies use the existing Protected Paste confirmation when bracketed paste is disabled.
- Up to 512 snippets are supported: `name` is 1–128 characters, `body` is 1–65,536, and optional `description` is at most 512 (UTF-16 code units). `execute` must be a boolean. Unknown fields are rejected.
- The file must be one UTF-8 YAML 1.2 core document, at most 1 MiB. Collection nesting is limited to 16 levels (root collection is level 1), with at most 4,096 total mapping pairs and sequence entries. Duplicate keys, aliases, custom/non-core tags, and multiple documents are rejected. Quote scalar values that must be text, such as `"true"` or `"123"`.
- Opening reveals search/loading immediately and rereads the catalog. Hide and reveal to reload edits while retaining query and scroll in window memory; Close and reopen creates a fresh view. Old rows cannot run during loading, and empty/error results replace them. Invalid files show a path and safe diagnostic instead of the list; syntax errors include line/column coordinates, not command excerpts.
- The [resizable panel](usage.md#resize-or-close-snippets) keeps its preferred width only for that window's lifetime. There are no persistent width/visibility settings. `keybinds.toggleAuxiliaryPanel` configures independent hide/reveal (unbound by default). Close disposes the selected tool; Hide/Escape retains it. Both return terminal focus unless a newer selection or modal owns it. Selecting Settings deactivates/hides it without losing its query/scroll/width; About, snippet preview and Local Image Preview keep it visible but inert.
- Existing `snippets.json` files are not read, rewritten, or migrated. Move your entries into `snippets.yaml` yourself; JSON-formatted content is also valid YAML, subject to the same limits.

## Terminal themes

On first launch, OMXTerm copies its default theme to `themes/omtheme.json` and
links it in `config.json`. In **stable 0.25.0**, use local theme cards or enter a
path in **Settings → Appearance → Theme file (advanced)**; clearing it uses the
bundled default. Paths can be relative to the configuration directory or absolute.

Stable 0.25.0 also provides the [inline theme editor](#author-a-theme).
Stable 0.24.0 selects themes by path but does not edit their names or colors.
You can still edit a theme JSON file as shown below. The
[legacy Studio workflow](#edit-visually-with-omxterm-studio) remains an option for
browser-only basic palette drafts, not current theme/config round trips.

<a id="local-theme-picker-development-source"></a>

### Local theme picker

**Since stable 0.25.0** (introduced in 0.25.0-dev.1), **Settings → Appearance**
offers local themes by name and palette preview. Place version-1
JSON theme files directly in `themes/` beside the logical `config.json`, then
choose **Refresh themes**. Both the directory and individual files may be
symlinks. Names and paths are shown together, so themes with the same name remain
distinct. The separate **Bundled omtheme** choice removes `theme.path` and uses
the built-in default; it is distinct from the editable `themes/omtheme.json` copy.

Choosing a card saves and applies it through the normal Settings path. A pending choice is marked **Saving…**; after it settles, a selected card identifies the saved configuration. If the status says it could not be applied, follow that message and reload after fixing the problem. Missing or empty folders, unreadable or invalid files and a limited list are reported. Discovery examines at most 2,048 directory entries and 128 JSON candidates, reads at most 256 KiB per theme and 4 MiB of configuration, and does not watch for changes. A configured custom path or another alias may not appear as a selected card; the **Theme file (advanced)** input remains available for relative or absolute paths. Discovery does not edit theme files.

<a id="author-a-theme-development-source"></a>

### Author a theme

This editor is included in **stable 0.25.0**.
In **Settings → Appearance**, choose **New theme**, **Import theme JSON…**, or
**Edit theme** beneath a card. Editing a card does not select it. One inline
editor is open at a time; **Cancel** finishes that editor before you start another.

- Edit **Theme name**, then choose a **Color role** and use its labelled native
  color picker or `#RRGGBB` field. All 21 required colors are available. Invalid
  partial text stays with its role when you switch roles or categories; fix it
  before saving or exporting. The specimen shows the last valid colors.
- The **Palette preview** shows illustrative text, selection, cursor and all
  normal/bright ANSI colors. Stable 0.25.0 includes the original specimen.
  **Development source only (#818):** each normal color stays paired with its
  Bright variant below, even when the grid wraps. Beside each readable name, `Aa`
  shows that color as text on the draft background; the square shows it as a
  solid fill. Samples retain real draft contrast while names use interface colors.
  Neither preview runs a shell or changes your actual terminal, surrounding
  Settings colors, transparency or desktop blur.
- **Save** updates an opened local theme using its original revision. It follows
  intentional file/directory links to the regular target and preserves the links.
  A detected external edit or retargeting refuses the save and keeps your draft;
  **Discard draft and reload source** rereads explicitly, or **Save copy** keeps
  your edits in a different file. There is no automatic rebase or retry.
- **Save copy** creates a complete new JSON file directly in `themes/` beside the
  logical configuration location. Choose a portable filename such as
  `my-theme.json`; this is separate from the display name. It never replaces an
  existing entry, including a broken link. Subsequent **Save** updates this copy.
  New/bundled/imported themes first use **Save copy**. Importing does not authorize
  overwriting the imported file; custom paths outside the cards can be imported
  for editing as a copy.
- Saving a theme does **not** apply it. **Use saved theme**, available after saving
  all edits, saves its path through the ordinary Settings authority and reloads
  the complete current configuration. See the Settings status for success or
  saved-but-not-applied feedback. A failed activation leaves the theme file saved.
  Normal card selection also remains available. Use reads the file as it exists
  then, not a guarantee that another editor has left the saved bytes unchanged.
- **Export JSON…** exports the complete valid draft, not `config.json` or a ZIP.
  **Choose a new filename:** existing files are never replaced, even if the
  operating-system dialog offers replacement. Export does not select a theme,
  mark the local draft saved, or retarget subsequent Save. Cancelling the native
  chooser changes nothing.

All supported optional `appearance` values survive import/edit/save/copy/export,
including omitted members, explicit `null`, hex values and an empty object, even
though they have no controls yet. Unsupported fields and partial palettes are
rejected, never silently stripped. Reads are limited to 256 KiB of UTF-8 JSON.
Saves preserve values but reformat JSON with two-space indentation and a newline.

Switching Settings categories or application tabs retains the draft, selected
role and pending result. Closing Settings discards unsaved edits without a new
prompt. **Cancel** discards only the editor, not previously saved/exported files
or writes already requested. You may keep typing during a save/export; the result
identifies newer edits that were not included. Closed editors ignore late results.

Theme writes use the same guarded replacement and permission/metadata limits as
[Settings configuration writes](#settings), not a cross-process lock or atomic
compare-and-swap. New files are published complete without overwrite, using
filesystem hard-link support; unsupported filesystems fail without a clobbering
fallback. A cleanup warning after publication means the theme was saved/exported
but a temporary file may remain. If a request result cannot be confirmed, refresh
or reopen before deciding to write again. No automatic retry or rollback occurs.

### Edit theme files

You can edit `themes/omtheme.json` directly or create a new theme file such as
`themes/my-theme.json`:

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

Point `config.json` to your theme file (relative to the logical configuration directory or as an absolute path) and reload. Linking `config.json` elsewhere does not move the base for relative theme paths; theme files and the `themes` directory can themselves be symlinks to readable files:

```json
{
  "version": 1,
  "theme": {
    "path": "./themes/my-theme.json"
  }
}
```

### Pane and panel appearance

Optionally add `appearance` next to `colors` in your version-1 theme file:

```json
"appearance": {
  "paneDivider": "#505068",
  "auxiliaryPanelDivider": null,
  "activePaneHighlight": "#80d4ff"
}
```

Each field is independent and optional. An empty `appearance: {}` is valid.

| Field                   | Omitted                                                          | Six-digit `#RRGGBB`                        | `null`                                        |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `paneDivider`           | Neutral line, brighter on hover/drag                             | Exact color at rest, hover and drag        | Hides decorative pane divider paint           |
| `auxiliaryPanelDivider` | Same neutral defaults                                            | Exact color at rest, hover and drag        | Hides decorative Snippets panel divider paint |
| `activePaneHighlight`   | Theme cyan, or foreground when it improves insufficient contrast | Exact color, without contrast substitution | Hides the active split pane's top line        |

Reload User Configuration to repaint existing windows. Omission restores defaults
rather than retaining an earlier override. These choices change no resize target,
layout space, keyboard controls or terminal behavior. The panel never gains an
active-pane highlight. The active pane's marker remains an inset 1 px top overlay,
not a rectangular ring.

**Keyboard focus is separate from decorative paint:** a keyboard-focused resize
separator always paints its 1 px line in the theme foreground, even with `null`
or while dragging. Losing focus restores the chosen decorative state. Arbitrary
palettes and transparency do not guarantee contrast or accessibility.

Only the three documented keys and hex/null values are accepted; `appearance`
itself must be an object, not `null`. The 21 required palette colors remain
non-nullable. This optional extension keeps theme version 1, but older OMXTerm
builds that predate it reject `appearance`; remove that object to use the same
palette in those builds. These pane/panel roles have no controls in Settings;
there are no width preferences.

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

| Scope                 | Settings updated                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| Existing and new tabs | Theme, font size, ligatures, padding, scrollback, Option keys, terminal context-menu eligibility |
| All windows and tabs  | Background transparency, blur and shared Auxiliary Panel side                                    |
| App behavior          | Close confirmation, log level, keyboard shortcuts, language                                      |
| New tabs (or restart) | Font family, line height, Windows shell                                                          |
| New windows           | Always-on-Top, title-bar, and tab-bar initial defaults                                           |

The footer names pending font-family/line-height changes while any surviving
pane still uses an older value, including a pane still initializing. It clears
each resolved field when those panes close (also across windows), without
requiring another reload or restart. It does not expire while a restart is
actually needed. Font/configuration errors remain visible until a successful
reload resolves them; closing an old pane does not dismiss an unrelated error.

A native font read already started for an initializing tab can finish with its
creation-time family after reload; new tabs use the latest family. Requests must
still match the current family when received. A queued read superseded before
starting can fail initialization; reload does not enable historical-family lookup.

If validation finds an error in your JSON, OMXTerm shows a banner naming the file and field to fix:

- **On manual reload:** your previous valid configuration stays active until you fix the error and reload again.
- **At app startup:** an invalid `config.json` falls back to built-in defaults (or the bundled `omtheme` if only the theme file is invalid) without overwriting your files.
