# User configuration

OMXTerm works without configuration files. Add them only when you want to
change a default, create Snippets, or use an external Terminal Theme.

User Configuration is strict, versioned JSON. OMXTerm reads it at startup and
when you choose `View -> Reload User Configuration`; it never creates,
rewrites, repairs, or migrates the file. The normative behavior remains in the
[current product contract](spec.md#configuration-and-local-state).

## Quick start: use the bundled defaults

Start with the smallest valid `config.json`:

```json
{
  "version": 1
}
```

This file works on every Supported Platform. It uses the bundled JetBrainsMono
Nerd Font Mono, the bundled `omtheme` Terminal Theme, and every other built-in
default. It does not require an installed font or another file.

### Create the configuration directory

On macOS or Linux, create the directory selected by `XDG_CONFIG_HOME`, or the
default directory when that variable is unset or empty:

```sh
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/omxterm"
```

Save the JSON above as
`${XDG_CONFIG_HOME:-$HOME/.config}/omxterm/config.json`.

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

### Keep every edit strict

Each User Configuration example in this section is a complete valid JSON
document. Copy one, save it as `config.json`, and reload. When combining
examples, keep exactly one root object and one `"version": 1` property.

JSON comments, trailing commas, unknown or misspelled keys, duplicate
accelerators, unsupported versions, and values outside the documented ranges
are errors. OMXTerm does not guess what an invalid value meant or partially
apply a document.

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

Next, add line height while keeping the previous change:

```json
{
  "version": 1,
  "font": {
    "size": 18,
    "lineHeight": 1.1
  }
}
```

Then add per-side padding:

```json
{
  "version": 1,
  "font": {
    "size": 18,
    "lineHeight": 1.1
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
`font.family` to keep using the bundled font.

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

| Preference                | Accepted value                          | Default                              |
| ------------------------- | --------------------------------------- | ------------------------------------ |
| `version`                 | exactly `1`                             | required                             |
| `confirmClose`            | boolean                                 | `true`                               |
| `logLevel`                | `error`, `info`, or `debug`             | `info`                               |
| `windowsShell`            | non-empty string without NUL            | Windows PowerShell, then ComSpec     |
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

`scrollback.lines` is memory-only and independent for every Live Terminal
Session. Zero disables retention and drops existing history on a valid reload.
For xterm, positive values use its line setting. In the opt-in Restty candidate,
positive values are approximate physical history-row targets: Ghostty evicts
whole pages, so one minimum boundary page may exceed the target. Restty also
keeps an independent 10,000,000-byte ceiling, which can retain fewer rows than
the requested target; the value is never converted into an estimated byte
count. Changing Restty from positive to zero and back keeps the same Surface,
core, session and PTY; output produced while zero is active cannot be scrolled
back to, while later output can be retained after a positive value returns.

`keyboard.optionAsAlt` applies only on macOS. `none` preserves the active
keyboard layout's native Unicode input; `left`, `right`, and `both` select which
Option keys produce terminal Alt sequences.

On macOS, configured top padding begins below the fixed 30 px native title and
drag inset. On Linux and Windows, it begins directly below native Window Chrome.
`font.lineHeight` changes row height independently of glyph size. In the
opt-in development Restty candidate, `font.family` and `font.lineHeight` are
applied when a Surface is created, but an existing Surface keeps both until
OMXTerm restarts; xterm continues to apply both live. Restty obtains the exact
installed regular face through the main process, then uses bundled JetBrainsMono
and available local operating-system fallback faces. A missing, unreadable,
oversized, unsupported or corrupt configured face is an actionable error, never
a similarly named substitute. The native Always on Top menu changes one current
window; `window.alwaysOnTop` sets the default for new windows.

### Choose the Windows Default Shell

On Windows, `windowsShell` selects the executable for future Default Shell
sessions. Use an absolute Windows filesystem path:

```json
{
  "version": 1,
  "windowsShell": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

The final target must be an existing regular file. Links and reparse points are
accepted when their final target is a regular file; an inspection failure is an
error. OMXTerm uses the validated path exactly as written, starts it directly
with an empty argument vector, and does not expand `~`, environment variables,
URLs, or shell syntax. It does not add profiles or arguments, identify or
preflight the shell, or separately check ACL readability or executability.

On macOS and Linux, a non-empty NUL-free `windowsShell` string is accepted
without reading or interpreting the path, produces no warning, and has no
effect. The operating-system-configured shell remains selected, so one
`config.json` containing a Windows path can be shared across Supported
Platforms. Empty and NUL-containing values are invalid everywhere.

A valid reload applies the selection to every Default Shell session created
after the reload commits, including new tabs in existing windows and tabs in
new windows. Existing sessions keep running unchanged. A rejected reload keeps
the complete previous configuration and shell selection; an invalid startup
selection uses all built-in defaults. Startup `-e` still controls only the first
tab, and later Default Shell sessions use the current `windowsShell` selection.
Each session without an accepted process title displays the basename of the
shell selected when that session started.

`wsl.exe` inherits OMXTerm's Windows home as its Initial Working Directory. WSL
commonly exposes that directory as `/mnt/c/Users/<user>` rather than starting in
the Linux distribution's home. OMXTerm does not translate the working directory
for WSL.

### Keybinds

`keybinds` remaps application-menu shortcuts. The keys are a fixed action
vocabulary; values are [Electron accelerator](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts#accelerators)
strings. Omitted actions keep their defaults:

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

For example, this changes only New Window:

```json
{
  "version": 1,
  "keybinds": {
    "newWindow": "CommandOrControl+G"
  }
}
```

Accelerators are case-insensitive and require at least one non-Shift modifier
(`Command`, `Control`, `CommandOrControl`, `Alt`/`Option`, or `Super`) and
exactly one key. A bare key or Shift-only accelerator is rejected so it cannot
swallow plain terminal typing.

Two actions cannot share one effective accelerator. A remap also cannot collide
with another action's remaining default. `CommandOrControl` resolves to
`Command` on macOS and `Control` on Linux and Windows when collisions are
checked; `Super` and `Meta` use Electron's Command accelerator family.

A matched application keybind is consumed and does not reach the PTY. On Linux
and Windows, a macOS-authored `CommandOrControl` binding can therefore shadow a
bare terminal control key such as `Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`,
`Ctrl+U`, `Ctrl+W`, `Ctrl+A`, or `Ctrl+E`. OMXTerm keeps a valid binding active
but warns which action and control key conflict. Add `Shift` or choose another
key when the control key should continue to reach the shell.

## Snippets

OMXTerm optionally reads `snippets.json` next to `config.json`. It is a separate
strict JSON file that OMXTerm never creates, edits, rewrites, or migrates. A
missing file means the Snippets Sidebar is empty.

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

Every snippet body uses the same Protected Paste path as ordinary paste;
`execute` does not bypass or replace it. The exact sequence is:

1. OMXTerm delivers the body through Protected Paste.
2. `"execute": false` (the default) appends nothing.
3. `"execute": true` appends Enter only after body delivery. With bracketed
   paste, Enter follows the closing bracketed-paste marker.

A paste-aware receiver enables bracketed paste, so OMXTerm sends the body as one
bracketed paste without a confirmation. When bracketed paste is unavailable, a
body containing line breaks or control characters requires Protected Paste
approval. After approval, OMXTerm sends that body unchanged; embedded line
breaks or controls may execute input even when `execute` is `false`. Therefore,
`execute: false` means only “do not append Enter,” not “this body can never
execute.” Keep reusable bodies single-line and inspect unfamiliar content.

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

This helper is not an application feature, import format, network service, or
configuration-schema capability. Conversion changes syntax only; review the
source, authorship, license, and redistribution rights of third-party themes.
OMXTerm's normal strict validation remains authoritative.

## Reloading User Configuration

`View -> Reload User Configuration` rereads and validates the complete
`config.json` through the startup boundary. It can select a changed
`theme.path`; Snippets are instead reread whenever their sidebar opens. There
is no automatic reload or file watching.

A valid reload atomically applies font family, configured font-size baseline,
line height, padding, scrollback, Option Key Mode, Terminal Theme, close
confirmation, logging, keybinds, and the Always-on-Top default. On Windows it
also selects `windowsShell` for subsequently created Default Shell sessions.
Existing
Terminal Surfaces and Live Terminal Sessions remain in place and refit as
needed. The opt-in Restty candidate updates theme, font size, padding and scrollback
live, but an existing Restty Surface retains its initial font family and line height.
A persistent notice names either deferred setting and asks you to restart
OMXTerm to apply it everywhere. New Restty Surfaces use the latest fully
validated values; a deferred setting clears only when its requested value is
already active in every existing Surface. Existing windows keep their current Always-on-Top state and Window Font Zoom delta;
Actual Size returns to the latest configured baseline.

A rejected reload applies nothing and preserves the complete last valid
in-memory configuration. Removing `config.json` and reloading is a valid way to
select all built-in defaults without creating another file.

## Local files, diagnostics, and privacy

Treat `config.json`, `snippets.json`, and external Terminal Theme files as local
user files. OMXTerm reads them from the paths described above and never creates,
rewrites, repairs, migrates, or uploads them. They are ordinary files protected
by your operating-system account and filesystem permissions. Avoid putting
credentials, private hostnames, or sensitive commands in Snippets, and inspect
files before sharing them or screenshots of them.

Actionable validation errors are deliberately local and specific.
Configuration and theme failures appear on the persistent in-app error surface
and stderr with the relevant configured or resolved path. A Snippet failure
instead appears in the Snippets Sidebar with the resolved file path and field.
Those paths can reveal account or directory names, so redact them before
publishing a screenshot or copied diagnostic.

Operational Events are separate bounded JSONL logs under
`$XDG_STATE_HOME/omxterm/logs`, falling back to
`~/.local/state/omxterm/logs`. On Windows, the fallback is
`%USERPROFILE%\.local\state\omxterm\logs`. The current file is
`omxterm.jsonl`; rotation keeps only `omxterm.previous.jsonl`, and each is
capped at 5 MiB. `logLevel` changes verbosity, not the privacy boundary.

No log level records Terminal Payload, PTY input or output, clipboard data,
environment or configuration contents, font families, font paths, font bytes,
Snippet bodies, executable names,
command arguments, commands, Terminal Titles, secrets, or transcripts. User
Configuration Reload events contain only safe outcomes, bounded duration, and a
normalized failure category—not paths, validation details, or file contents.
Terminal Payload remains opaque transport between the Terminal Surface and the
processes running in a Live Terminal Session; OMXTerm does not turn it into
application history or diagnostics.

OMXTerm itself makes no network requests for analytics, telemetry, crash
reporting, updates, or remote log delivery. Shells and other child processes in
a Live Terminal Session are ordinary local processes: they retain the network
and filesystem access allowed by your operating system and user account.
Running a command from a Snippet can therefore read files or contact a network
just as typing that command can. Child-process activity is not OMXTerm
telemetry, and OMXTerm does not sandbox or reinterpret it.
