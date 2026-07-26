# OMXTerm product contract

This document is the maintained normative contract for current observable
OMXTerm product behavior.

## Product

OMXTerm is Otávio's personal, open-source desktop terminal. It opens a normal
local shell in a standard native window with a small title bar and gives the
Terminal Surface all remaining content space. It is not a Ghostty competitor
claim, an SSH bastion, an AI product, a session manager, or an IDE.

The initial Supported Platforms are macOS arm64, Linux arm64, and Windows
arm64. Linux rendering defaults to X11 and requires XWayland when the desktop
session is Wayland; native Wayland rendering is not currently claimed. An
explicit Electron `--ozone-platform` switch overrides the Linux default for
diagnosis. x64, Intel macOS, and other operating systems are deferred rather
than current support commitments.

## Product scope

OMXTerm must:

- open the Default Shell in the user's home directory: on macOS and Linux the
  operating-system-configured shell as an interactive login shell; on Windows,
  which has no login-shell concept, Windows PowerShell — falling back to the
  ComSpec command processor — started interactively without a login flag;
- remain compatible with ordinary shells, SSH started by the user, tmux, TUIs,
  REPLs, alternate-screen applications, Unicode, and bracketed paste, rendering
  emoji-presentation and ZWJ grapheme clusters as single two-column cells that
  do not overlap neighboring cells;
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
- package ready-to-run arm64 artifacts from an accepted version: DMG for
  macOS, AppImage for Linux, and NSIS for Windows.

AI assistance, splits, saved or reconnectable sessions, shell integration,
profiles, a theme picker or catalog, live configuration reload, automatic
updates, and remote terminal features are outside the current product contract.

## Window and session behavior

- Launching OMXTerm creates a Terminal Window with one Terminal Tab. New Window
  and New Tab default to `Cmd+N` and `Cmd+T` on macOS, and `Ctrl+Shift+N` and
  `Ctrl+Shift+T` on Linux and Windows. Each tab owns its own independent Live Terminal
  Session.
- After its Terminal Surface mounts, an active Terminal Window gives terminal
  input DOM focus. Returning from another application or another OMXTerm window
  restores that focus only in the active Terminal Window without activating,
  raising, or showing OMXTerm by itself.
- Every Terminal Window can be repositioned through its visible native title
  area while the Terminal Surface remains fully interactive.
- A window with a single tab shows no tab strip and renders exactly like the
  pre-tab contract. With two or more tabs, an OMXTerm-drawn tab strip occupies
  its own full-width row above the Terminal Surface and Snippets Sidebar row.
  On macOS it sits below the app-controlled 30 px native title inset; on Linux
  and Windows it starts immediately below the operating system's native title
  and menu, without another inset. Clicking a tab selects it; the selected tab's grid
  refits and receives terminal focus.
- Close Tab defaults to `Cmd+W` on macOS and `Ctrl+Shift+W` on Linux and Windows, and
  terminates only the selected tab's session. Closing a window's last tab closes
  that window. Close Window defaults to `Cmd+Shift+W` on macOS and
  `Ctrl+Shift+Q` on Linux and Windows and closes all of the selected window's tabs. Closing
  the last window quits OMXTerm.
- Quit defaults to `Cmd+Q` on macOS and `Ctrl+Alt+Shift+Q` on Linux and
  Windows. It requests
  one confirmation for all open windows when confirmation is enabled and at
  least one Live Terminal Session is Busy.
- `confirmClose` defaults to `true` and guards closing a tab, closing a
  window, and quitting with one confirmation per action — closing a window
  with several tabs asks once, not per tab. A close action asks only when an
  affected Live Terminal Session is Busy: its PTY foreground process is not
  the idle Default Shell. Closing only idle sessions proceeds without
  confirmation. OMXTerm reads the foreground process name solely for this
  in-memory decision and never logs, displays, or transmits it; when the name
  cannot be read, the session counts as Busy. On Windows, ConPTY exposes only
  a static console title instead of the foreground process name, so every
  live session counts as Busy and closing it always asks while confirmation
  is enabled.
- After the Default Shell starts successfully, an ordinary shell exit closes
  its tab — and its window when that was the last tab — without confirmation
  or a failure dialog, regardless of its numeric exit code.
- A spawn failure or unexpected signal remains visible in a native error dialog
  and local log until acknowledged; the useless tab then closes.
- Each window starts at configured font size. Window Font Zoom defaults to
  `Cmd++`, `Cmd+-`, and `Cmd+0` on macOS and `Ctrl++`, `Ctrl+-`, and `Ctrl+0`
  on Linux and Windows; it affects only that window, applies to every tab in
  it, and is not persisted.
- The Terminal Surface and Live Terminal Session grid refit in both directions
  after Terminal Window width or height changes, after Window Font Zoom, and
  after tab selection. The xterm grid remains inside the visible content area
  with its bottom row visible.
- Native minimum window bounds keep the existing 320 px width and 200 px height
  as floors and grow at startup when configured font or padding needs more room
  for a visible terminal grid.
- On macOS, the Terminal Surface keeps a fixed 30 px native title/drag inset
  above the configurable top padding. Linux and Windows use their
  operating-system title and menu outside the app-controlled content and add
  no duplicate inset. The
  selected Terminal Theme background fills the complete app-controlled
  Terminal Window content, including any title inset and all configured
  padding.
- `Window -> Always on Top` toggles only the selected window at the ordinary
  native floating level. New windows use the configured default.
- Dropping one or more native file-manager files or folders anywhere in a
  Terminal Window inserts their absolute paths into only the selected Terminal
  Tab. The paths retain platform order, are separated by one space, and are
  delivered through Protected Paste without sending Enter. Drag navigation is
  prevented over the whole renderer document; a drop with no native files has
  no terminal side effect.
- `View -> Toggle Snippets` (default `Cmd+Shift+S` on macOS and
  `Ctrl+Shift+S` on Linux and Windows, remappable through `keybinds`) shows or hides the
  selected window's Snippets Sidebar beside its
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
rather than clamping them. The scrollback scrollbar shows a thumb only while
scrollback extends beyond the visible screen; an empty scrollbar track paints
nothing on any platform.

OSC 0 and OSC 2 titles are display-only and per session: the raw OSC request
must be no longer than 256 code points, then control and bidi characters are
removed and the result must be one printable line. A tab shows its session's
accepted title and falls back to the Default Shell's name; the native window
title mirrors the selected tab and falls back to `OMXTerm`. Title contents are
never logged or reported to the PTY.

Only literal visible `http:` and `https:` URLs are links. `Cmd+click` on macOS
or `Ctrl+click` on Linux and Windows asks the Electron main process to parse
and validate the exact URL before opening it. OSC 8 destinations and all other schemes are
ignored.

## Clipboard

- Selection never copies automatically.
- `Ctrl+C` and `Ctrl+V` remain PTY input.
- `Cmd+C` and `Cmd+V` on macOS, `Ctrl+Shift+C` and `Ctrl+Shift+V` on Linux
  and Windows, and the native context menu perform explicit text copy and paste. Any
  non-empty plain text, including whitespace-only text, is pasted
  unchanged and takes priority over every file-list representation. When text
  is empty and the clipboard exposes a supported native file-manager file list,
  Paste inserts its paths in the same form as a file drop. Plain-text URLs and
  non-file URI-list entries are never inferred to be paths. Electron 43 exposes
  only one Explorer `FileNameW` path through its public Windows clipboard API,
  so Windows clipboard Paste inserts that one path; dropping several Windows
  files remains complete and ordered. A future supported Electron file-list API
  may remove this clipboard-only limitation without changing insertion syntax.
- Inserted paths are lexical platform-absolute values only: OMXTerm never reads,
  resolves, normalizes, or checks the target. A malformed, empty, over-bound, or
  mixed list inserts nothing. A list accepts at most 256 paths, each at most
  32,768 UTF-16 code units, with at most 1,048,576 code units in the decoded
  source or formatted result; a serialized native UTF-8 source above 1,048,576
  bytes is rejected before decoding.
- On macOS and Linux, each path is an independently single-quoted POSIX shell
  token, with an apostrophe represented by closing the quote, a quoted
  apostrophe, and reopening it. On Windows, each path is an independently
  single-quoted Windows PowerShell 5.1 token; U+0027 and U+2018 through U+201B
  are doubled. Tokens are separated by one ASCII space. This encoding assumes
  insertion starts at a fresh ordinary argument-token boundary in the initial
  Default Shell. Without Shell Integration, OMXTerm cannot promise correct
  syntax inside a partial quote, nested shell, SSH session, REPL, or TUI.
- Multiline or control-character paste asks for confirmation only when the
  receiving process has not enabled bracketed paste.
- Paste is never truncated, interpreted, summarized, or logged.
- OSC 52 may write the clipboard within the terminal dependency's safety bound;
  clipboard read, clear, and malformed requests are refused.
- Image clipboard behavior belongs to the child CLI. OMXTerm forwards its key
  input but never moves image bytes through the PTY.
- These shortcuts are the built-in keybind defaults. A `keybinds` remap can move
  copy or paste onto other keys or bind an application action onto a bare
  `Ctrl+<key>` these defaults keep as PTY input; because `CommandOrControl`
  resolves to `Control` off macOS, importing another platform's map can do this
  unintentionally. The keybinds contract honors such a remap and warns when it
  shadows a PTY control key on the current platform.

## Configuration and local state

This section is the normative configuration contract. The
[User Configuration guide](configuration.md) provides non-normative examples,
field reference, theme conversion guidance, and troubleshooting.

OMXTerm reads an optional configuration from
`$XDG_CONFIG_HOME/omxterm/config.json`, falling back to
`~/.config/omxterm/config.json`. The same XDG-style resolution applies on
every Supported Platform, including Windows, where the fallback is
`%USERPROFILE%\.config\omxterm\config.json` (ADR 0002). Absence uses defaults
and does not create a file. A present file must contain `"version": 1` and only supported keys:

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
non-configurable 30 px native title inset on macOS; on Linux and Windows it
begins directly below the native window chrome. `logLevel` defaults to `info`,
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
the effective native map: `CommandOrControl` resolves to `Command` on macOS and
`Control` on Linux and Windows, while `Super` and `Meta` use Electron's Command
accelerator family. A remap that collides with another action's remaining default is the
same error as two explicit entries colliding.
A valid keybind that resolves, on the current platform, to a bare `Ctrl+<key>`
shadowing a PTY control key (`Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`, `Ctrl+U`,
`Ctrl+W`, `Ctrl+A`, `Ctrl+E`) stays active but is warned about through the
resilient failure surface below, naming the action and the shadowed control
key. The binding is never rejected or dropped; the warning only informs, since
`CommandOrControl` accelerators authored on macOS become `Control` off macOS and
can shadow these keys unintentionally.
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
repairs, rewrites, or silently ignores user configuration. The same surface
also carries non-fatal warnings for a valid configuration that stays fully
active — currently a keybind shadowing a PTY control key — which inform without
activating any default.

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
version may be tagged `v0.y.z`. Release candidates are built locally and
natively on each Supported Platform: macOS on Otávio's current Apple Silicon
Mac, and Linux arm64 and Windows arm64 in native Parallels VM clones using the
VM's native filesystem, never shared folders. The initial formats are DMG,
AppImage, and NSIS respectively.

Each exact artifact requires its own recorded native automated verification,
plus targeted native human evidence only for a changed boundary that automation
cannot reliably observe, and owner acceptance. Publication remains manual
and requires separate owner authorization after acceptance; published
artifacts include SHA-256 checksums. Initial artifacts intentionally carry no
verified publisher identity. The macOS application receives a complete ad-hoc
code seal for bundle integrity but no
Apple Developer ID signature or notarization. Developer ID signing, Apple
notarization, certificates, x64, Intel macOS, additional formats, paid CI, and a
multi-platform CI matrix remain deferred. macOS release notes must explain the
Gatekeeper warning, link to Apple's current `Open Anyway` instructions, and
never recommend
disabling system-wide security. Windows release notes must equally explain the
Microsoft Defender SmartScreen unknown-publisher warning for the unsigned NSIS
installer and never recommend disabling SmartScreen or other system-wide
protections. Provenance claims do not state that the
software was independently audited or approved by a platform vendor.

## Acceptance boundary

Automated tests cover configuration validation, tab and window lifecycle and
cleanup, PTY resize and bounded input flow, Unicode, bracketed and protected
paste, title sanitization, URL validation, OSC 52 restrictions, log
redaction/rotation, renderer IPC boundaries, and packaged startup. Every exact
release candidate receives native automated package, architecture, content,
version, startup, PTY, and applicable contract verification on its target.

Release evidence is risk-based. Each release records the boundaries changed
since the previous version and maps each to existing automation or, only when
automation cannot reliably observe it, one targeted native human check.
Unchanged boundaries are not manually replayed. The owner continuously dogfoods
macOS, while routine Linux and Windows acceptance relies on native automation;
qualified community evidence may cover a changed platform-specific visual,
desktop-integration, security-UI, or other automation-resistant boundary. A
release remains blocked when such a changed boundary has neither automation nor
targeted evidence.

Exact-artifact identity, checksum reconciliation, owner acceptance, and
separate publication authorization remain mandatory. Evidence for a targeted
boundary may carry across a rebuild only when automated comparison proves the
relevant packaged payload and metadata are identical.

The ADRs in `docs/adr/` own the reasoning behind the durable choices; this file
owns the current observable product contract.
