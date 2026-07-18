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
- use one independent shell session per native Terminal Window;
- provide native new-window, close, copy, paste, select-all, zoom, fullscreen,
  always-on-top, and quit actions without an in-window toolbar;
- render the bundled [`omtheme`](omtheme.json) palette by default, allow one
  explicitly configured external Terminal Theme, and use JetBrainsMono Nerd
  Font Mono bundled under its OFL license as the default and missing-glyph
  fallback;
- use the accepted black-and-blue OMXTerm application icon in development and
  on the packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- read strict, versioned JSON configuration and write bounded local JSONL
  operational logs;
- package a ready-to-run arm64 `.dmg` from an accepted version.

AI assistance, tabs, splits, saved or reconnectable sessions, shell integration,
profiles, a theme picker or catalog, live configuration reload, automatic
updates, and remote terminal features are outside this release.

## Window and session behavior

- Launching OMXTerm creates a Terminal Window. `Cmd+N` creates another.
- After its Terminal Surface mounts, an active Terminal Window gives terminal
  input DOM focus. Returning from another application or another OMXTerm window
  restores that focus only in the active Terminal Window without activating,
  raising, or showing OMXTerm by itself.
- Every Terminal Window can be repositioned through its visible native title
  area while the Terminal Surface remains fully interactive.
- `Cmd+W` closes only the selected window. Closing its last window quits OMXTerm.
- `Cmd+Q` requests one confirmation for all open windows when confirmation is
  enabled.
- `confirmClose` defaults to `true`; OMXTerm does not inspect child processes to
  guess whether closing is safe.
- A clean shell exit closes its window without confirmation.
- A spawn failure, nonzero shell exit, or unexpected signal remains visible in
  a native error dialog and local log until acknowledged; the useless window
  then closes.
- Each window starts at configured font size. `Cmd++`, `Cmd+-`, and `Cmd+0`
  affect only that window and are not persisted.
- The Terminal Surface and Live Terminal Session grid refit in both directions
  after Terminal Window width or height changes and after Window Font Zoom. The
  xterm grid remains inside the visible content area with its bottom row visible.
- Native minimum window bounds keep the existing 320 px width and 200 px height
  as floors and grow at startup when configured font or padding needs more room
  for a visible terminal grid.
- The Terminal Surface keeps a fixed 30 px native title/drag inset above the
  configurable top padding. The selected Terminal Theme background fills the
  complete app-controlled Terminal Window content, including the title inset
  and all configured padding.
- `Window -> Always on Top` toggles only the selected window at the ordinary
  native floating level. New windows use the configured default.
- BEL is silent. An unfocused window prepends a bell marker to its title and
  requests Dock attention once until the user focuses or interacts with it.

OMXTerm does not preserve a session after its window closes. tmux remains the
user's session manager.

## Terminal behavior

OMXTerm advertises `TERM=xterm-256color`, `COLORTERM=truecolor`,
`TERM_PROGRAM=OMXTerm`, and its installed version in `TERM_PROGRAM_VERSION`.
It installs no custom terminfo and does not edit or inject shell startup files.

Scrollback is memory-only and per window. `scrollback.lines` defaults to 10,000,
accepts 0 through 100,000, and rejects larger values rather than clamping them.

OSC 0 and OSC 2 titles are display-only: control and bidi characters are
removed, the result must be one printable line no longer than 256 characters,
and invalid or empty titles become `OMXTerm`. Title contents are never logged or
reported to the PTY.

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
- `theme.path`.

The bundled JetBrainsMono Nerd Font Mono at 16 px is the default, matching the
existing OMXTerm Web terminal baseline. `font.size` accepts only integral pixel
sizes from 8 through 72 inclusive. `font.lineHeight` is an independent
row-height multiplier from 1.0 through 2.0 inclusive, accepts fractional
values, does not change glyph size, and defaults to 1.0. Terminal padding uses
explicit per-side integer CSS pixels from 0 through 128 inclusive and defaults
to top 0, right 8, bottom 8, and left 8. User top padding is added to the fixed,
non-configurable 30 px native title inset. `logLevel` defaults to `info`,
`keyboard.optionAsAlt` to `none`, and `window.alwaysOnTop` to `false`.

An absent `theme` uses the bundled canonical [`omtheme`](omtheme.json). A
present `theme` must contain exactly one required `path`: a non-empty string
without a NUL character. Absolute paths are used as written; relative paths are
resolved from the directory containing `config.json`. OMXTerm does not expand
`~`, environment variables, shell syntax, or URLs. Symlinks are accepted only
when their final target is a readable regular file. The Electron main process
reads and resolves the theme once during startup and sends only the validated,
typed palette through the existing configuration boundary.

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
out-of-range padding values are errors. OMXTerm reports the exact problem
through a native dialog and stderr, includes the configured or resolved path
when relevant, keeps both files unchanged, and requires restart after edits. It
never migrates, repairs, rewrites, silently ignores user configuration, or
falls back to `omtheme` after an external theme was explicitly selected.

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

The project uses the MIT License. An accepted version may be tagged `v0.x.y`.
Otávio builds and tests the exact arm64 `.dmg` locally, then attaches it and a
SHA-256 checksum to the canonical GitHub Release.

The artifact is intentionally unsigned and not notarized. Release notes must
explain the macOS Gatekeeper warning, link to Apple's current `Open Anyway`
instructions, and never recommend disabling system-wide security. The claim is
limited to provenance: this is the open-source build Otávio published and uses,
not software independently audited or approved by Apple.

## Acceptance boundary

Automated tests cover configuration validation, lifecycle and cleanup, PTY
resize and bounded input flow, Unicode, bracketed and protected paste, title
sanitization, URL validation, OSC 52 restrictions, log redaction/rotation,
renderer IPC boundaries, and packaged startup. A manual release check exercises
the exact `.dmg` on the supported Mac, including first launch, shell exit,
multiple windows, tmux/TUI use, clipboard, zoom, always-on-top,
application-icon presentation at small and large display sizes, and Gatekeeper
documentation.

The ADRs in `docs/adr/` own the reasoning behind the durable choices; this file
owns the observable first-release contract.
