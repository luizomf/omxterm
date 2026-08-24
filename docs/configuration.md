# User configuration

OMXTerm works without a configuration file. When one is present, it is strict,
versioned JSON that OMXTerm reads at startup and when you manually choose
`View -> Reload User Configuration`. OMXTerm never creates, rewrites, or
migrates the file.

This guide explains how to use the configuration contract. The normative
behavior remains in the [current product contract](spec.md#configuration-and-local-state).

## Configuration location

OMXTerm reads:

1. `$XDG_CONFIG_HOME/omxterm/config.json` when `XDG_CONFIG_HOME` is non-empty;
2. `~/.config/omxterm/config.json` otherwise.

When `XDG_CONFIG_HOME` is unset or empty, create the default directory with:

```sh
mkdir -p ~/.config/omxterm/themes
```

When it is set, use the configured location instead:

```sh
mkdir -p "$XDG_CONFIG_HOME/omxterm/themes"
```

The same XDG-style resolution applies on Windows. With `XDG_CONFIG_HOME`
unset — the common case — the location is
`%USERPROFILE%\.config\omxterm\config.json`:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.config\omxterm\themes"
```

Choose `View -> Reload User Configuration` after editing `config.json`. The
action defaults to `Cmd+Shift+,` on macOS and `Ctrl+Shift+,` on Linux and
Windows and can be remapped as `reloadConfig`. A missing configuration file
selects all defaults. An invalid file never stops OMXTerm from opening: the
application starts with its built-in defaults, shows a persistent in-app error
describing the exact problem, and leaves the file unchanged so you can fix and
reload it inside OMXTerm.

## Otávio's configuration

This is the configuration Otávio uses. It is an example, not a second set of
defaults. `Fira Code` must be installed on the Mac, and the selected external
theme file must exist relative to `config.json`.

```json
{
  "version": 1,
  "confirmClose": true,
  "logLevel": "info",
  "font": {
    "family": "Fira Code",
    "size": 22,
    "lineHeight": 1.1
  },
  "terminal": {
    "padding": {
      "top": 4,
      "right": 4,
      "bottom": 8,
      "left": 16
    }
  },
  "scrollback": {
    "lines": 10000
  },
  "keyboard": {
    "optionAsAlt": "none"
  },
  "window": {
    "alwaysOnTop": false
  },
  "theme": {
    "path": "./themes/omtheme.json"
  }
}
```

His local directory is organized like this:

```text
~/.config/omxterm/
├── config.json
└── themes/
    ├── catppuccin-mocha.json
    ├── moonfly-default.json
    └── omtheme.json
```

Only the file referenced by `theme.path` is loaded. The other files are a local
collection and do not create profiles or a theme catalog. Otávio's third-party
themes are not distributed by this repository.

The external `omtheme.json` in this example is a local copy. Remove the entire
`theme` property to use OMXTerm's bundled canonical `omtheme` without keeping a
copy:

```json
{
  "version": 1
}
```

Alternatively, from an OMXTerm source checkout, copy the canonical theme into
the default configuration location used by the example:

```sh
cp docs/omtheme.json ~/.config/omxterm/themes/omtheme.json
```

Use `$XDG_CONFIG_HOME/omxterm/themes/omtheme.json` as the destination when that
environment variable selects the configuration root.

## Configuration reference

All preferences other than `version` are optional. Omitted preferences use
their defaults. Objects and the root reject unknown keys.

| Preference                | Accepted value                          | Default                              |
| ------------------------- | --------------------------------------- | ------------------------------------ |
| `version`                 | exactly `1`                             | required                             |
| `confirmClose`            | boolean                                 | `true`                               |
| `logLevel`                | `error`, `info`, or `debug`             | `info`                               |
| `font.family`             | exact installed system font-family name | bundled JetBrainsMono Nerd Font Mono |
| `font.size`               | integer from 8 through 72 CSS pixels    | `16`                                 |
| `font.lineHeight`         | number from 1.0 through 2.0             | `1.0`                                |
| `terminal.padding.top`    | integer from 0 through 128 CSS pixels   | `0`                                  |
| `terminal.padding.right`  | integer from 0 through 128 CSS pixels   | `8`                                  |
| `terminal.padding.bottom` | integer from 0 through 128 CSS pixels   | `8`                                  |
| `terminal.padding.left`   | integer from 0 through 128 CSS pixels   | `8`                                  |
| `scrollback.lines`        | integer from 0 through 100,000          | `10000`                              |
| `keyboard.optionAsAlt`    | `none`, `left`, `right`, or `both`      | `none`                               |
| `window.alwaysOnTop`      | boolean                                 | `false`                              |
| `theme.path`              | non-empty filesystem path without NUL   | bundled `omtheme`                    |
| `keybinds.<action>`       | accelerator with a non-Shift modifier   | built-in shortcut per action         |

`keyboard.optionAsAlt` applies only on macOS: `none` preserves the active
keyboard layout's native Unicode input, while `left`, `right`, and `both`
select which Option keys produce terminal Alt sequences.

On macOS, the configured top padding begins below the fixed 30 px native title
and drag inset. On Linux and Windows, it begins directly below the operating
system's native window chrome without another inset. `font.lineHeight` changes row height
independently of glyph size.
Window Font Zoom and the native Always on Top menu are per-window runtime
actions and never rewrite this file.

### Keybinds

`keybinds` remaps the application-menu shortcuts. The keys are a fixed action
vocabulary; the values are [Electron accelerator](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators)
strings such as `CommandOrControl+T`. Actions you omit keep their defaults:

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
| `reloadConfig`              | `CommandOrControl+Shift+,` | `Control+Shift+,`     |

The Linux and Windows defaults use the conventional shifted terminal shortcuts
so ordinary `Ctrl` shell and TUI input remains PTY input. On macOS, `Cmd+W` closes the
selected tab and `Cmd+Shift+W` closes the whole window. `selectTab1` through
`selectTab9` select literal tab positions; a position beyond the open tabs does
nothing.

For example, to open new windows with `Cmd+G` instead of `Cmd+N`:

```json
{
  "version": 1,
  "keybinds": {
    "newWindow": "CommandOrControl+G"
  }
}
```

Accelerators are case-insensitive and must contain at least one non-Shift
modifier (`Command`, `Control`, `CommandOrControl`, `Alt`/`Option`, `Super`)
and exactly one key — a bare key or `Shift`-only accelerator would steal plain
typing from the terminal, so it is rejected. Two actions can never share an
effective accelerator: remapping `newWindow` to `CommandOrControl+W` conflicts
with `closeTab`'s remaining default and is reported exactly like two
explicit entries colliding (swap both explicitly if that is what you want).
`CommandOrControl` counts as `Command` on macOS and `Control` on Linux and
Windows when duplicates are judged; `Super` and `Meta` use Electron's Command accelerator
family. The menu shows the shortcut that is actually active.
Keybinds change application shortcuts only. A matched accelerator is consumed
by its application action and does not reach the terminal; unmatched keyboard
input continues to the PTY unchanged.

Because `CommandOrControl` becomes `Control` on Linux and Windows, a map you
authored on macOS can bind an action onto a bare `Ctrl+<key>` that the terminal
normally uses — `Ctrl+C` (interrupt), `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`, `Ctrl+U`,
`Ctrl+W`, `Ctrl+A`, or `Ctrl+E`. OMXTerm keeps such a binding active but shows a
warning on the in-app error surface naming the action and the shadowed control
key, so a deliberate remap still works while an accidental one is easy to spot.
Add `Shift` (for example `CommandOrControl+Shift+C`) or pick a different key if
you want that control key to keep reaching the shell.

### Tuning padding around the terminal grid

The Terminal Surface is a grid of whole character cells, not ordinary text
that can end at any pixel. After accounting for any platform title inset and
configured padding, OMXTerm fits the largest whole number of columns and rows
that the window can contain. Cell width and height depend on the font family, font size,
line height, and renderer, so the remaining width and height rarely divide
evenly into cells.

This is why Otávio's example uses visually asymmetric padding. Its
`4 / 4 / 8 / 16` top, right, bottom, and left values were tuned around Fira
Code at 22 px with a 1.1 line height; they are not universal values that make
every font and window geometrically balanced.

Choose the font size and line height you normally use first, then adjust the
four padding sides by eye. Resizing the window or using Window Font Zoom changes
the cell measurements without changing the configured padding, so a balance
that looks right at one size may shift at another. OMXTerm currently refits the
terminal grid and keeps it usable, but it does not redistribute leftover pixels
or automatically rebalance padding. `Cmd+0` on macOS or `Ctrl+0` on Linux and
Windows returns the window to its configured font size when you want to return to the
size around which the
padding was tuned.

## Snippets

OMXTerm optionally reads `snippets.json` next to `config.json` — things you
type all the time, one search-and-click away. The file is strict, hand-authored
JSON that OMXTerm never creates, edits, or rewrites. A missing file simply
means no snippets.

```json
{
  "version": 1,
  "snippets": [
    {
      "name": "git amend",
      "body": "git commit --amend --no-edit",
      "description": "amend staged changes into the last commit"
    },
    {
      "name": "brew maintenance",
      "body": "brew update && brew upgrade",
      "execute": true
    }
  ]
}
```

The required `snippets` array accepts at most 512 entries. Each snippet has:

| Field         | Accepted value                           | Default  |
| ------------- | ---------------------------------------- | -------- |
| `name`        | non-empty string up to 128 characters    | required |
| `body`        | non-empty string up to 65,536 characters | required |
| `description` | string up to 512 characters              | none     |
| `execute`     | boolean                                  | `false`  |

`Cmd+Shift+S` on macOS or `Ctrl+Shift+S` on Linux and Windows (the
`toggleSnippets` keybind, remappable) shows or hides the Snippets Sidebar in
the selected window.
The search field filters by name and
description; clicking a snippet injects its body into that window's terminal
and returns focus to the terminal. The file is reread every time the sidebar
opens, so editing `snippets.json` and reopening the sidebar shows the new
content without restarting OMXTerm.

Injection behaves exactly like pasting the body: bracketed-paste protections
apply, a multi-line body arrives as one multi-line paste, and nothing runs
until you press Enter. A snippet with `"execute": true` also presses Enter for
you — opt in per snippet, and prefer leaving it off for anything destructive.

If `snippets.json` is invalid, OMXTerm still opens and the terminal is
unaffected; the sidebar shows the exact problem (path and field) in place of
the list. Fix the file and reopen the sidebar.

## Terminal Themes

A Terminal Theme is a complete OMXTerm palette stored as strict JSON. Start
with the [canonical `omtheme` file](omtheme.json), copy it under your
configuration directory, and change the copy.

Select it with a path relative to `config.json`:

```json
{
  "version": 1,
  "theme": {
    "path": "./themes/my-theme.json"
  }
}
```

Absolute paths are used as written. Relative paths are resolved from the
directory containing `config.json`. OMXTerm does not expand `~`, environment
variables, shell syntax, or URLs in `theme.path`. A symlink is accepted when its
final target is a readable regular file.

The theme root must contain exactly:

- `version`, with the value `1`;
- `name`, a printable non-empty single line of at most 64 Unicode code points;
- `colors`, containing the five interface colors and all 16 normal and bright
  ANSI colors shown in [`omtheme.json`](omtheme.json).

Every color is an exact hexadecimal `#RRGGBB` value. Partial palettes,
transparency, CSS colors, inheritance, and imports are unsupported.

### Reloading User Configuration

`View -> Reload User Configuration` rereads `config.json` and strictly validates
the complete document through the same boundary as startup, including a changed
`theme.path`, installed font availability, platform keybinds, and warnings.
There is no file watching or automatic reload.

A valid reload atomically updates the Terminal Theme in every current and future
window, tab, Terminal Surface, native background, Window Chrome, and Snippets
Sidebar. It also updates close confirmation, log level, the application menu,
effective keybind delivery in existing and future windows, and the
Always-on-Top default for future windows. Existing windows keep their current
Always-on-Top toggle, and Live Terminal Sessions continue without being
restarted, replaced, or closed.

Font family and size, line height, padding, scrollback, and Option Key Mode are
validated but remain at their startup values for both existing and newly
created Terminal Surfaces until OMXTerm is restarted. Runtime application of
those Terminal Surface settings is not part of this reload slice.

If a present `config.json` is unreadable or invalid, or its selected theme is
missing, unreadable, or invalid, OMXTerm keeps the complete last valid in-memory
configuration and shows the current exact validation problem in the non-blocking
error bar and on stderr. Fix it and choose the action again. A successful retry
replaces resolved startup or reload errors and stale warnings with notices from
the current validation. Removing `config.json` and reloading successfully selects
all defaults without creating a file.

### Converting a Ghostty theme

The source repository contains an optional conversion helper. It is not an
OMXTerm application feature, supported import format, network service, or part
of the configuration schema.

From an OMXTerm source checkout, convert a downloaded Ghostty theme with:

```sh
node scripts/convert-ghostty-theme.mjs \
  ~/Downloads/catppuccin-mocha \
  ~/.config/omxterm/themes/catppuccin-mocha.json
```

If the output path is omitted, the converted JSON is printed to standard
output. The input filename becomes the OMXTerm theme name. The helper requires
the Ghostty file to define background, foreground, cursor, selection, and all
16 palette colors.

Otávio created local themes by downloading Ghostty palettes from
[TerminalColors](https://terminalcolors.com/ghostty/) and passing them through
this helper. A conversion changes file syntax only: it does not establish the
theme's authorship, provenance, license, security, or suitability for
redistribution. Review a theme's source and rights before using or publishing
it. OMXTerm's own startup validation remains the authority on whether the
converted result is a valid Terminal Theme.

## Troubleshooting

When `config.json` or a selected Terminal Theme is invalid, OMXTerm still
opens. It uses its built-in defaults for whatever failed — every setting when
`config.json` is invalid, or only the bundled `omtheme` theme when the selected
theme file is invalid or missing — and shows a persistent error bar at the
bottom of the window. The error states the configuration path and, when
relevant, the resolved theme path. It never blocks typing, so you can fix the
file in the terminal it reports on. The same diagnostic also goes to stderr.
A rejected manual reload preserves the whole last valid configuration and shows
the current reload failure; a successful reload replaces resolved errors and
stale warnings with current notices. Common failures are:

- a trailing comma, comment, or other syntax that is not valid JSON;
- an unknown or misspelled key;
- a missing installed font family;
- an out-of-range number or non-integral size or padding value;
- a `theme.path` resolved somewhere other than expected;
- a missing, unreadable, non-regular, or invalid theme file;
- a partial palette or a color that is not exactly `#RRGGBB`;
- a `keybinds` entry with an unknown action name, a malformed accelerator, a
  missing non-Shift modifier, or two actions sharing one effective accelerator.

Fix the reported file and use `View -> Reload User Configuration`. Restart is
still required only for reloaded font family or size, line height, padding,
scrollback, and Option Key Mode to reach Terminal Surfaces. OMXTerm never
silently ignores invalid preferences and never edits or repairs your files.
Startup falls back only to built-in defaults, loudly; a failed runtime reload
instead preserves the complete last valid active configuration.
