# OMXTerm v0 specification

## Product

OMXTerm is Otávio's personal, open-source desktop terminal. It opens a normal
local shell in a standard macOS window with the small native title bar and gives
the Terminal Surface all remaining content space. It is not a Ghostty competitor
claim, an SSH bastion, an AI product, a session manager, or an IDE.

The first supported target is the current Apple Silicon (`arm64`) Mac. Other
platforms and Intel Macs are future possibilities, not current promises.

## First release

The first useful release must:

- open the operating-system-configured shell as an interactive login shell in
  the user's home directory;
- remain compatible with ordinary shells, SSH started by the user, tmux, TUIs,
  REPLs, alternate-screen applications, Unicode, and bracketed paste;
- use one independent shell session per Terminal Tab, with one or more tabs
  per native Terminal Window;
- provide native new-window, new-tab, close, copy, paste, select-all, zoom,
  fullscreen, always-on-top, and quit actions without an in-window toolbar;
- render the bundled [`omtheme`](omtheme.json) palette by default, allow one
  explicitly configured external Terminal Theme, and use JetBrainsMono Nerd
  Font Mono bundled under its OFL license as the default and missing-glyph
  fallback;
- use the accepted black-and-blue OMXTerm application icon in development and
  on the packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- read strict, versioned JSON configuration and write bounded local JSONL
  operational logs;
- package a ready-to-run arm64 `.dmg` from an accepted version.

AI assistance, splits, saved or reconnectable sessions, shell integration,
profiles, a theme picker or catalog, live configuration reload, automatic
updates, and remote terminal features are outside this release.

## Window and session behavior

- Launching OMXTerm creates a Terminal Window with one Terminal Tab. `Cmd+N`
  creates another window; `Cmd+T` creates another tab in the selected window.
  Each tab owns its own independent Live Terminal Session.
- After its Terminal Surface mounts, an active Terminal Window gives terminal
  input DOM focus. Returning from another application or another OMXTerm window
  restores that focus only in the active Terminal Window without activating,
  raising, or showing OMXTerm by itself.
- Every Terminal Window can be repositioned through its visible native title
  area while the Terminal Surface remains fully interactive.
- A window with a single tab shows no tab strip and renders exactly like the
  pre-tab contract. With two or more tabs, an OMXTerm-drawn tab strip occupies
  its own full-width row below the fixed 30 px title inset, above the Terminal
  Surface and Snippets Sidebar row. Clicking a tab selects it; the selected
  tab's grid refits and receives terminal focus.
- `Cmd+W` closes only the selected tab, terminating only its session. Closing
  a window's last tab closes that window; `Cmd+Shift+W` closes the selected
  window with all of its tabs. Closing the last window quits OMXTerm.
- `Cmd+Q` requests one confirmation for all open windows when confirmation is
  enabled and at least one Live Terminal Session is Busy.
- `confirmClose` defaults to `true` and guards closing a tab, closing a
  window, and quitting with one confirmation per action — closing a window
  with several tabs asks once, not per tab. A close action asks only when an
  affected Live Terminal Session is Busy: its PTY foreground process is not
  the idle Default Shell. Closing only idle sessions proceeds without
  confirmation. OMXTerm reads the foreground process name solely for this
  in-memory decision and never logs, displays, or transmits it; when the name
  cannot be read, the session counts as Busy.
- After the Default Shell starts successfully, an ordinary shell exit closes
  its tab — and its window when that was the last tab — without confirmation
  or a failure dialog, regardless of its numeric exit code.
- A spawn failure or unexpected signal remains visible in a native error dialog
  and local log until acknowledged; the useless tab then closes.
- Each window starts at configured font size. `Cmd++`, `Cmd+-`, and `Cmd+0`
  affect only that window, apply to every tab in it, and are not persisted.
- The Terminal Surface and Live Terminal Session grid refit in both directions
  after Terminal Window width or height changes, after Window Font Zoom, and
  after tab selection. The xterm grid remains inside the visible content area
  with its bottom row visible.
- Native minimum window bounds keep the existing 320 px width and 200 px height
  as floors and grow at startup when configured font or padding needs more room
  for a visible terminal grid.
- The Terminal Surface keeps a fixed 30 px native title/drag inset above the
  configurable top padding. The selected Terminal Theme background fills the
  complete app-controlled Terminal Window content, including the title inset
  and all configured padding.
- `Window -> Always on Top` toggles only the selected window at the ordinary
  native floating level. New windows use the configured default.
- `View -> Toggle Snippets` (default `Cmd+Shift+S`, remappable through
  `keybinds`) shows or hides the selected window's Snippets Sidebar beside its
  Terminal Surface. The sidebar lists the snippets from `snippets.json`,
  filters them by name and description as the user types, and a click injects
  the snippet into the selected tab's Live Terminal Session and returns focus to
  the terminal. Opening the sidebar rereads the file; there is no file
  watching, and the sidebar never blocks terminal use.
- BEL is silent. A bell prepends a marker to the ringing session's title —
  visible on its tab and, while that tab is selected, in the window title —
  and an unfocused window requests Dock attention once until the user focuses
  or interacts with it.

OMXTerm does not preserve a session after its tab or window closes. tmux
remains the user's session manager.

## Terminal behavior

OMXTerm advertises `TERM=xterm-256color`, `COLORTERM=truecolor`,
`TERM_PROGRAM=OMXTerm`, and its installed version in `TERM_PROGRAM_VERSION`.
It installs no custom terminfo and does not edit or inject shell startup files.

Scrollback is memory-only and per Live Terminal Session. `scrollback.lines`
defaults to 10,000, accepts 0 through 100,000, and rejects larger values
rather than clamping them.

OSC 0 and OSC 2 titles are display-only and per session: control and bidi
characters are removed, and the result must be one printable line no longer
than 256 characters. A tab shows its session's accepted title and falls back
to the Default Shell's name; the native window title mirrors the selected tab
and falls back to `OMXTerm`. Title contents are never logged or reported to
the PTY.

Only literal visible `http:` and `https:` URLs are links. `Cmd+click` asks the
Electron main process to parse and validate the exact URL before opening it.
OSC 8 destinations and all other schemes are ignored.

## Clipboard

- Selection never copies automatically.
- `Ctrl+C` and `Ctrl+V` remain PTY input.
- `Cmd+C`, `Cmd+V`, and the native context menu perform explicit text copy and
  paste.
- Multiline or control-character paste asks for confirmation only when the
  receiving process has not enabled bracketed paste.
- Paste is never truncated, interpreted, summarized, or logged.
- OSC 52 may write the clipboard within the terminal dependency's safety bound;
  clipboard read, clear, and malformed requests are refused.
- Image clipboard behavior belongs to the child CLI. OMXTerm forwards its key
  input but never moves image bytes through the PTY.

## Configuration and local state

This section is the normative configuration contract. The
[User Configuration guide](configuration.md) provides non-normative examples,
field reference, theme conversion guidance, and troubleshooting.

OMXTerm reads an optional configuration from
`$XDG_CONFIG_HOME/omxterm/config.json`, falling back to
`~/.config/omxterm/config.json`. Absence uses defaults and does not create a
file. A present file must contain `"version": 1` and only supported keys:

- `confirmClose`;
- `logLevel`;
- `font.family`, `font.size`, and `font.lineHeight`;
- `terminal.padding.top`, `terminal.padding.right`,
  `terminal.padding.bottom`, and `terminal.padding.left`;
- `scrollback.lines`;
- `keyboard.optionAsAlt`: `none`, `left`, `right`, or `both`;
- `window.alwaysOnTop`;
- `theme.path`;
- `keybinds.<action>` for the fixed application-shortcut vocabulary below.

The bundled JetBrainsMono Nerd Font Mono at 16 px is the default, matching the
existing OMXTerm Web terminal baseline. `font.size` accepts only integral pixel
sizes from 8 through 72 inclusive. `font.lineHeight` is an independent
row-height multiplier from 1.0 through 2.0 inclusive, accepts fractional
values, does not change glyph size, and defaults to 1.0. Terminal padding uses
explicit per-side integer CSS pixels from 0 through 128 inclusive and defaults
to top 0, right 8, bottom 8, and left 8. User top padding is added to the fixed,
non-configurable 30 px native title inset. `logLevel` defaults to `info`,
`keyboard.optionAsAlt` to `none`, and `window.alwaysOnTop` to `false`.

An optional `keybinds` object remaps application-chrome shortcuts for a fixed
action vocabulary: `quit`, `copy`, `paste`, `selectAll`, `newWindow`,
`closeWindow`, `newTab`, `closeTab`, `nextTab`, `previousTab`, `selectTab1`
through `selectTab9`, `zoomIn`, `zoomOut`, `actualSize`, `toggleFullScreen`,
and `toggleSnippets`. Each
value is a case-insensitive Electron accelerator containing at least one
non-Shift modifier and exactly one key; bare or Shift-only accelerators are
rejected so a keybind can never swallow plain typing. Unmapped actions keep
their built-in defaults. The application menu displays the effective
accelerator and is the single shortcut registration point; there is no second
shortcut system, and terminal control sequences inside the PTY are untouched.
An effective keybind works even when the platform refuses to fire its menu
accelerator (macOS never delivers `Control+Tab` to a menu item): the main
process invokes the same action from the key event itself, and a key that
triggered a keybind this way is consumed — it never reaches the terminal as
input.
Unknown action names, malformed accelerators, and duplicate accelerators are
errors under the resilient failure contract below. Duplicates are judged on
the effective map with macOS semantics (`CommandOrControl`, `Super`, and
`Meta` count as `Command`): a remap that collides with another action's
remaining default is the same error as two explicit entries colliding.
Creating new actions, system-global shortcuts, chords or sequences, and
per-platform alternate maps are unsupported.

An optional read-only `snippets.json` next to `config.json` defines the
Snippets Sidebar contents. The file is strict JSON containing exactly
`"version": 1` and a `snippets` array of at most 512 entries; each entry has a
non-empty `name` (the searchable label, at most 128 characters), a non-empty
`body` (the text to inject, at most 65,536 characters), an optional
`description` (at most 512 characters), and an optional boolean `execute`
defaulting to `false`. OMXTerm never creates, rewrites, or migrates the file;
absence is the clean empty state, and the file is reread each time the sidebar
opens. Injection uses the same protected-paste path as a normal paste:
bracketed-paste protections apply, a multi-line body behaves like one
multi-line paste, and nothing runs until the user presses Enter. With
`execute` true, OMXTerm additionally submits the snippet by sending Enter
after the bracketed paste closes — per-snippet opt-in only. An invalid
`snippets.json` never blocks startup and is never silent: the sidebar shows
the exact actionable problem, including the resolved path and field location,
in place of the list, and the terminal is unaffected. The Electron main
process reads and validates the file and sends only validated, typed data
over the preload bridge. Snippet contents are user payload and are never
logged.

An absent `theme` uses the bundled canonical [`omtheme`](omtheme.json). A
present `theme` must contain exactly one required `path`: a non-empty string
without a NUL character. Absolute paths are used as written; relative paths are
resolved from the directory containing `config.json`. OMXTerm does not expand
`~`, environment variables, shell syntax, or URLs. Symlinks are accepted only
when their final target is a readable regular file. The Electron main process
reads and resolves the theme once during startup and sends only the validated,
typed palette — plus any user-file error notice — through the existing
configuration boundary.

A Terminal Theme is strict JSON containing exactly `version`, `name`, and
`colors`. Version must be `1`. The name is a non-empty printable single line of
at most 64 Unicode code points. `colors` contains exactly the foreground,
background, cursor, selection foreground and background, and all 16 normal and
bright ANSI fields shown in [`omtheme`](omtheme.json). Every color is an exact,
case-insensitive hexadecimal `#RRGGBB` value. Alpha colors, partial palettes,
CSS names, functions or variables, inheritance, imports, transparency, blur,
opacity, and tint are unsupported.

Invalid JSON or UTF-8, unknown or missing keys, unsupported versions, missing
configured fonts or theme files, non-regular theme targets, invalid theme
fields or colors, non-finite or out-of-range line heights, and non-integral or
out-of-range padding values are errors. An error never stops OMXTerm from
opening: an invalid `config.json` starts the application with the built-in
defaults for every setting, and an invalid or missing selected theme file
starts it with the bundled `omtheme` while keeping the rest of the validated
configuration. The fallback target is always the built-in defaults, never a
cached or previous configuration. OMXTerm reports the exact problem — including
the configured or resolved path when relevant — through stderr and a persistent
in-app error surface that states which defaults are active, stays visible until
the application is restarted, and never blocks typing into the Terminal
Surface, so the file can be fixed inside OMXTerm itself. Both files stay
unchanged, and edits take effect after restart. OMXTerm never migrates,
repairs, rewrites, or silently ignores user configuration.

Operational logs are JSONL under `$XDG_STATE_HOME/omxterm/logs`, falling back to
`~/.local/state/omxterm/logs`. Levels are `error`, `info`, and `debug`. Only the
current and previous files are retained, each capped at 5 MiB. Logs may describe
OMXTerm lifecycle, validation, IPC, PTY control, resize, duration, and failures;
they must never contain PTY input/output, clipboard data, environment contents,
configuration contents, commands, titles, secrets, or transcripts.

The application performs no network requests: no analytics, telemetry, crash
reporting, update check, or remote log delivery. Child processes retain their
normal network access.

## Architecture boundaries

Electron main owns native windows, PTYs, filesystem access, configuration,
logs, clipboard capabilities, and external-link opening. The renderer is
sandboxed with context isolation and no Node integration. A minimal typed
preload bridge validates every IPC message and sender.

The framework-independent DOM+xterm Terminal Surface is the portable deep
Module. Its small Interface hides xterm setup, addons, rendering, input, resize,
theme, fonts, clipboard, zoom, and cleanup. It receives a session Adapter rather
than importing Electron or `node-pty`; OMXTerm provides the local IPC/PTY
Adapter, while another host could independently provide WebSocket transport.

Electron, window management, and PTY creation are not generalized into a fake
cross-platform framework. The code remains one package organized by actual
runtime responsibility: main, preload, renderer, and the portable Terminal
Surface.

## Release contract

The project uses the MIT License and follows the documented
[Semantic Versioning policy](versioning.md). An accepted initial-development
version may be tagged `v0.y.z`. Otávio builds and tests the exact arm64 `.dmg`
locally, then attaches it and a SHA-256 checksum to the canonical GitHub
Release.

The artifact is intentionally unsigned and not notarized. Release notes must
explain the macOS Gatekeeper warning, link to Apple's current `Open Anyway`
instructions, and never recommend disabling system-wide security. The claim is
limited to provenance: this is the open-source build Otávio published and uses,
not software independently audited or approved by Apple.

## Acceptance boundary

Automated tests cover configuration validation, tab and window lifecycle and
cleanup, PTY resize and bounded input flow, Unicode, bracketed and protected
paste, title sanitization, URL validation, OSC 52 restrictions, log
redaction/rotation,
renderer IPC boundaries, and packaged startup. A manual release check exercises
the exact `.dmg` on the supported Mac, including first launch, shell exit,
multiple windows and tabs, tmux/TUI use, clipboard, zoom, always-on-top,
application-icon presentation at small and large display sizes, and Gatekeeper
documentation.

The ADRs in `docs/adr/` own the reasoning behind the durable choices; this file
owns the observable first-release contract.
