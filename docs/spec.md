# OMXTerm product contract

This document is the maintained normative contract for current observable
OMXTerm product behavior.

## Product

OMXTerm is an open-source personal desktop terminal. It opens a normal local
shell in a native window with a hideable title area and gives the Terminal
Surface all remaining content space. Its contract centers on that local terminal
experience. SSH brokering, AI assistance, persistent session management, and IDE
features are outside the product scope.

The initial Supported Platforms are macOS arm64, Linux arm64, and Windows
arm64. Linux rendering defaults to X11 and requires XWayland when the desktop
session is Wayland; native Wayland rendering is not currently claimed. An
explicit Electron `--ozone-platform` switch overrides the Linux default for
diagnosis. Linux deliberately uses `--no-sandbox` as an unconditional launch
policy for ordinary-user runtime, direct AppImage, extraction, desktop entry
and X11 relaunch. This is a fixed launch policy, not a fallback or configurable mode. OMXTerm
leaves host security policy unchanged and installs no privileged sandbox helper.
Sandboxed Linux support is outside the current maintenance scope (ADR 0024).
x64, Intel macOS, and other operating systems remain possible future work rather
than current support commitments.

## Product scope

OMXTerm must:

- open the Default Shell in the user's home directory: on macOS and Linux the
  operating-system-configured shell as an interactive login shell; on Windows,
  which has no login-shell concept, a configured `windowsShell` executable when
  present, otherwise Windows PowerShell — falling back to the ComSpec command
  processor — started interactively without a login flag; or,
  when startup includes `-e <program> [arguments...]`, run that executable and
  literal argument vector directly in the first Terminal Tab without an
  implicit shell;
- remain compatible with ordinary shells, SSH started by the user, tmux, TUIs,
  REPLs, alternate-screen applications, Unicode, and bracketed paste, rendering
  emoji-presentation and ZWJ grapheme clusters as single two-column cells that
  do not overlap neighboring cells;
- use one independent shell session per Terminal Tab, with one or more tabs
  per native Terminal Window;
- provide native new-window, new-tab, close, copy, paste, select-all, zoom,
  fullscreen, always-on-top, bounded local-image preview, and quit actions
  without an in-window toolbar;
- render the bundled [`omtheme`](omtheme.json) palette by default, allow one
  explicitly configured external Terminal Theme, keep SGR bold text on its
  requested ANSI `0–7` color without remapping it to bright `8–15` (applications
  may request bright colors explicitly), and use bundled regular and bold
  FiraCode Nerd Font Mono as the default, followed by bundled regular and bold
  DejaVu Sans Mono, the retained JetBrainsMono Nerd Font Mono, and representative
  operating-system emoji/CJK/symbol faces for missing-glyph coverage;
- use the accepted black-and-blue OMXTerm application icon in development and
  on the packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- read strict, versioned JSON configuration and write bounded local JSONL
  operational logs;
- package ready-to-run arm64 artifacts from an accepted version: DMG for
  macOS, AppImage for Linux, and NSIS for Windows. Linux releases additionally
  provide an optional versioned per-user AppImage desktop installer and its
  checksum; running the AppImage directly remains supported.

AI assistance, splits, saved or reconnectable sessions, shell integration,
profiles, a theme picker or catalog, automatic configuration reload, automatic
updates, and remote terminal features are outside the current product contract.

Restty 0.3.0 and its pinned Ghostty core provide the sole Terminal Surface in
ordinary development and every packaged application. OMXTerm has no renderer
selector or fallback Surface. A shell starts only after rendering initialization
succeeds (ADR 0025).

## Window and session behavior

- Launching OMXTerm creates a Terminal Window with one Terminal Tab. New Window
  and New Tab default to `Cmd+N` and `Cmd+T` on macOS, and `Ctrl+Shift+N` and
  `Ctrl+Shift+T` on Linux and Windows. Each tab owns its own independent Live Terminal
  Session.
- A startup Launch Request uses `-e <program> [arguments...]`. The value after
  the first `-e` is required as the executable, and every remaining value —
  including another `-e` or an option-looking value — is literal argv. OMXTerm
  passes the executable and argv directly to the PTY without constructing a
  command string, rewriting arguments, or inserting a shell. A user may
  explicitly choose a shell and pass literal arguments such as `-lc`. The
  request is consumed only by the first Terminal Tab of the first Terminal
  Window in that application process; all later tabs and windows use the
  Default Shell. A terminal `-e` is an actionable startup failure and never
  falls back to the Default Shell.
- An explicit command starts in the user's home directory, inherits the normal
  process environment, and receives the Terminal Capability Identity. It is a
  Busy Session for its complete live lifetime. Its clean exit, unexpected
  signal, spawn failure, requested close, tab and window closure, and
  last-window quit use the existing Live Terminal Session lifecycle.
- After its Terminal Surface mounts, an active Terminal Window gives terminal
  input DOM focus. When the user returns from another application or OMXTerm
  window, only the active Terminal Window restores that focus. Focus restoration
  does not activate, raise, or show OMXTerm by itself.
- Every Terminal Window can be repositioned through its visible title area,
  or its small hover-revealed handle when that area is hidden. Native dragging
  is confined to these areas; the rest of the Terminal Surface remains interactive.
- A window with a single tab shows no tab strip. Each window owns independent
  in-memory title-bar and tab-bar visibility choices, initialized from
  `window.showTitleBar` and `window.showTabBar`, both defaulting to true.
  The OMXTerm-drawn tab strip is visible only when its flag is enabled
  and there are two or more tabs; it occupies its own full-width row above the
  Terminal Surface and Snippets Sidebar row.
  On macOS it sits below the app-controlled 30 px native title inset when the
  title area is visible and the window is not fullscreen. On Linux and Windows
  it sits below the visible app-drawn 34 px title row. A hidden title area or
  fullscreen leaves no title row or duplicate inset. Clicking a tab selects it; the selected tab's
  grid refits and receives terminal focus. Dragging a tab horizontally within
  that strip reorders the existing tabs in that window. The reordered positions
  immediately drive visible order, next/previous cycling, and literal positional
  selection while the selected tab and every Live Terminal Session and Terminal
  Surface remain unchanged. Tab order is ephemeral and is neither shared between
  windows nor persisted or restored.
- Close Tab defaults to `Cmd+W` on macOS and `Ctrl+Shift+W` on Linux and Windows, and
  terminates only the selected tab's session. Closing a window's last tab closes
  that window. Close Window defaults to `Cmd+Shift+W` on macOS and
  `Ctrl+Shift+Q` on Linux and Windows and closes all of the selected window's tabs. Closing
  the last window quits OMXTerm.
- Quit defaults to `Cmd+Q` on macOS and `Ctrl+Alt+Shift+Q` on Linux and
  Windows. It requests
  one confirmation for all open windows when confirmation is enabled and at
  least one Live Terminal Session is Busy.
- An accepted Quit, including automatic last-window quit, stops new session
  starts and waits for every owned native PTY to report exit before completing
  normal application quit. This includes sessions whose tabs or windows already
  closed. Window/controller disposal and a native kill request are not completion
  signals. Repeated quit requests share one shutdown; pending or denied Busy
  Session confirmation does not start it. Completion is owned by main independently
  of disposed renderer/controller callbacks (ADR 0028).
- `confirmClose` defaults to `true` and guards tab close, window close, and
  quit. Each action can produce at most one confirmation, so closing a window
  with several tabs asks once for the whole window. OMXTerm asks only when the
  action affects a Busy Session, defined as a Live Terminal Session whose PTY
  foreground process differs from the idle Default Shell. Closing only idle
  sessions proceeds immediately. OMXTerm reads the foreground process name
  solely for this in-memory decision and never logs, displays, or transmits it.
  An unreadable name counts as Busy. ConPTY on Windows exposes a static console
  title in place of the foreground process name, so every live Windows session
  counts as Busy and asks while confirmation is enabled.
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
  after tab selection. The grid remains inside the visible content area with
  its bottom row visible. Hiding a Terminal Tab preserves its last real grid;
  a hidden layout box or hidden font change must not resize the Surface or PTY
  using concealed geometry. Hidden Terminal Surfaces, including mounts completing
  while hidden, perform no frame clears, draws or render uploads. They continue
  synchronous ordered output ingestion, Adapter ACKs, protocol replies, parsed
  events and Scrollback Buffer retention. Selection refits and redraws current
  content and cursor before the first visible presentation, without a background
  render-budget delay or replacing the Surface, core or Live Terminal Session.
- Native windows have minimum dimensions of 320 px wide by 200 px high. At
  startup and after a valid reload, either minimum grows when the configured font
  or padding requires more room for a visible terminal grid.
- On macOS, visible Window Chrome preserves the blended `hiddenInset`
  appearance, with native traffic-light controls on the left and a 30 px
  title/drag inset above configured top padding. The Terminal Theme background
  continues behind the controls; no separately colored title strip is added.
  Hiding removes the controls and that inset without recreating the native window.
- Linux and Windows use a frameless native window with a hideable, app-drawn
  34 px title/drag row. The sanitized selected Terminal Title, with the existing
  fallback, appears at the left; minimize, maximize/restore, and close controls
  appear at the right. Colors follow the active Terminal Theme. Controls invoke
  native actions in main; Close uses the existing guarded Close Window lifecycle.
  Native resize, maximize/restore, and operating-system edge/corner snapping remain
  window-manager behavior rather than app-drawn substitutes.
- `View -> Toggle Title Bar` defaults to `Cmd+Shift+D` on macOS and
  `Ctrl+Shift+D` on Linux and Windows, remappable as `toggleTitleBar`. It changes
  only the selected window's title-bar choice, without rewriting configuration
  or recreating its window, renderer, Terminal Surfaces, or Live Terminal Sessions.
  A layout change refits the selected existing Surface and PTY and restores
  terminal focus; hidden Surfaces retain valid geometry. Local Image Preview
  choosing/loading/showing suppresses the toggle without changing state or focus.
- When the title area is hidden outside fullscreen, hovering anywhere in the top
  150 logical px of content reveals three dots at the top center. Only their
  90 by 14 logical-pixel rectangle is a native drag target. Reveal/hide changes
  no layout or PTY size; the remaining hover region does not intercept selection,
  tab interaction, or terminal mouse input. Local Image Preview suppresses this
  handle while active. No cursor positions or terminal contents become logs.
- Native fullscreen suppresses app-controlled title chrome and the hover handle
  without changing the window's chosen visibility. Leaving fullscreen restores
  that choice. Configured padding and macOS system safe area remain unchanged;
  transient system chrome may overlay content without hover-driven padding or
  PTY resizing. Entry and exit refit the selected existing Surface and PTY, while
  other windows and hidden Surfaces remain unchanged.
- In Linux and Windows Terminal Windows, pressing and releasing Alt alone opens
  the current native application menu as a popup. It retains the installed menu's
  hierarchy, actions and effective shortcuts, including after configuration reload.
  Its top-left anchor is 8 logical px from the content's left edge and 8 px below
  the visible 34 px title row (`x=8, y=42`), or `x=8, y=8` with the title hidden
  or in fullscreen. The native OS menu owns styling, keyboard navigation and
  dismissal; no DOM menu or native menu bar is added to the frameless window.
  Opening or dismissing it preserves the selected tab, window, Surface and PTY.
  Alt combinations, AltGr, repeats, intervening input and focus loss do not open
  it. Local Image Preview suppresses opening without stealing focus. This is
  fixed Window Chrome behavior, not a configurable shortcut; macOS's native menu
  and Option input are unchanged. The selected Terminal Theme fills app-controlled
  content, including title chrome and configured padding, not the native popup.
- `Window -> Always on Top` toggles only the selected window at the ordinary
  native floating level. New windows use the configured default.
- On Linux and Windows, the existing native About action shows `OMXTerm`, the
  running application version, project copyright, and the OMXTerm application
  icon. Packaged applications use their packaged icon resource; development
  uses the development asset. Native dialog layout and window captions remain
  platform-owned; macOS retains its bundle-provided About metadata.
- `View -> Toggle Developer Tools` is a menu-only diagnostic action for the
  selected Terminal Window in development and packaged applications. It opens or
  closes Electron's local Developer Tools without enabling remote debugging;
  Developer Tools never open automatically. The tools can expose private
  Terminal Payload and runtime state, so diagnostic output, screenshots, traces,
  and profiles require review and redaction before sharing.
- `File -> Open Local Image…` is a menu-only action for the selected Terminal
  Window. It opens a native picker and previews one validated local static PNG
  or JPEG in a temporary overlay without writing the file or changing User
  Configuration. Escape, the close button, or the backdrop dismisses the
  overlay, releases its renderer Blob source synchronously, and returns focus
  to the live selected Terminal Tab. Picker cancellation returns terminal focus
  without an error. The picker and visible local-image sources share the bounded
  read and overlay contract below. While choosing, loading, or displaying a
  preview, terminal clipboard actions, file drops, font zoom, tab bar toggles,
  snippet toggles, title-bar toggles and snippet injection are ignored; page activation does not steal preview
  focus. The hover drag handle is suppressed. Dismissal restores ordinary routing. Already accepted terminal input
  is not rolled back, and confirmed tab/session/window closure remains active.
- Dropping one or more native file-manager files or folders anywhere in a
  Terminal Window without an active Local Image Preview inserts their absolute paths into only the selected Terminal
  Tab. The paths retain platform order, are separated by one space, and are
  delivered through Protected Paste without sending Enter. Drag navigation is
  prevented over the whole renderer document. Internal tab dragging only
  reorders tabs and never inserts a path; any other drop with no native files
  has no terminal side effect.
- `View -> Reload User Configuration` is always available and defaults to
  `Cmd+Shift+,` on macOS and `Ctrl+Shift+,` on Linux and Windows. It manually
  rereads and validates the complete User Configuration through the startup
  boundary. A valid reload atomically updates configured font-size baseline,
  per-side padding, scrollback, programming ligatures, Option Key Mode, and
  Terminal Theme across every current and future Terminal Window, Terminal Tab,
  and Terminal Surface without disturbing a Live Terminal Session. Font family
  and line height use the restart-only exception defined below. Window Chrome
  and the Snippets Sidebar follow the theme. Background transparency and native
  blur apply live to all current and future windows. It also
  updates close confirmation, logging, the menu, effective keybind delivery,
  and the Always-on-Top, title-bar and tab-bar defaults for future windows. On Windows, it also changes
  the shell selected for every subsequently created Default Shell session,
  including new tabs in existing windows, without restarting existing sessions.
  Existing windows keep their
  ephemeral Always-on-Top state, title-bar and tab-bar choices, and independent Window Font Zoom delta over the
  new baseline; Actual Size returns that window to the latest baseline.
  Reconfigured Surfaces refit in place and resize their existing PTYs.
- `View -> Toggle Tab Bar` (default `Cmd+Shift+B` on macOS and `Ctrl+Shift+B`
  on Linux and Windows, remappable as `toggleTabBar`) changes only the selected
  window's tab bar enabled flag, even with one tab; without a selected window
  it does nothing. Disabling removes the entire strip row, refits the selected
  existing Surface and PTY, and restores terminal focus. Hidden Surfaces retain
  their valid geometry and continue ingesting output. Toggling preserves tab
  identities, order, selection, titles and sessions; keyboard and native Window
  menu navigation remain available while hidden. Title/BEL updates, tab creation,
  selection and closure never reveal a disabled strip. Enabling reveals the same
  live tabs when at least two remain. The flag survives configuration reload but
  is never persisted or shared: new windows and application restarts use
  `window.showTabBar`, whose default is enabled.
  Local Image Preview choosing/loading/showing suppresses the action without
  changing the flag or focus. Title-bar visibility and fullscreen remain independent.
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
  and an unfocused window requests native platform attention once until the
  user focuses or interacts with it: an informational Dock bounce on macOS,
  or per-window attention on Linux and Windows. Focus, terminal interaction,
  or window disposal cancels the outstanding native request. Native desktop
  policy determines how attention is presented; BEL remains silent.

Closing a tab or window ends its sessions. Persistent and reconnectable sessions
remain the responsibility of a session manager such as tmux.

## Terminal behavior

The Restty Terminal Surface uses the existing Terminal Tabs, session Adapter
and real PTY lifecycle for ordinary Unicode input/output, grid resize,
focus, Default Shell and explicit-command startup, shell exit, tab close and
renderer-loss cleanup. It requires the bundled Terminal Font Stack TTFs,
Ghostty core and an actual WebGL2 backend before a PTY starts. Initialization
failure releases partial resources and starts no shell. WebGL context loss shows
a persistent failure and disposes only the owning Surface/session without core
recreation. Main retains a fixed actionable native failure dialog until
acknowledgement, including when the failed session was the window's last one. Restty applies the selected Terminal Theme, configured font size, programming
ligature setting, per-side padding and Window Font Zoom through its runtime and
existing host geometry. It resolves an exact configured installed family through the Electron main
process and gives Restty only bounded bytes for that validated active family,
followed by the licensed bundled FiraCode regular/bold, DejaVu Sans Mono
regular/bold and retained JetBrainsMono Nerd Font Mono faces, then
representative locally installed operating-system fallback faces. When a family
is explicitly configured, the bundled bold faces are omitted: the configured
family keeps precedence for regular, bold, italic and bold-italic text. Main
loads available real style faces from that same installed family, validates
their identity and style, and selects exact faces in font collections. Exact
native legacy and typographic family names are accepted when recorded in the
selected face's metadata; matching remains case-sensitive, without fuzzy names
or family substitution. Missing
styles use Restty's synthesis: bold-italic may use a same-family bold or italic
face for its available trait; regular, bold-only and italic-only text never
acquire an unrequested trait. Synthetic bold expands monochrome strokes in
both horizontal and vertical directions within the available cell space,
including over a real italic face. Additional ink stays inside the cell without
removing any pre-existing italic overhang. It does not change cell layout, requested
ANSI colors, real bold faces, color emoji, or regular and italic-only text;
exact pixel parity with native outline rasterizers is not promised. Missing
glyphs still use the regular fallback faces. Non-default variable-font instances are not materialized; when a native
style needs those axes, it remains unavailable and synthesis applies without
rejecting the usable regular family. Style faces share native source bytes and parsed resources across
compatible tabs; faces in one collection share its backing buffer. Apple Color Emoji
collections use memory-only shaping inputs that omit the unused `sbix` bitmap
table while retaining every face and other table. Main skips that payload with
bounded positional reads before validation and IPC; native Canvas still uses the
unchanged installed font. Other fonts keep their existing input and fallback
semantics. This reduces font-byte costs, not a guaranteed total RSS or GPU budget.
Font reads use
native platform facilities without shell interpolation; no font path, broad filesystem API,
remote fallback or persistent byte cache crosses the bridge. A Restty Surface applies its configured family and line height when it is
created; an existing Restty Surface keeps both after User Configuration Reload
until OMXTerm is restarted, while theme, font size, programming ligatures and
padding update it in place and refit the same PTY. Changing programming
ligatures preserves source text, selection and copy results, terminal cells and
cursor positions, and the existing Surface, font generation, Live Terminal
Session and PTY. Restty explicit copy/paste, selection, context-menu actions, Protected Paste,
snippets/path injection and write-only OSC 52 follow the shared contract below.
Its DOM paste source is intercepted synchronously only to enter OMXTerm's
asynchronous policy and delivery path; ordinary key input remains direct.
Semantic paste and injection requests retain request order, recheck the current
bracketed-paste mode and Surface lifetime after asynchronous decisions, and stop
future chunks if their owning Surface closes. Bytes already sent before closure
cannot be recalled, and a submitting snippet never appends Enter after closure.
Restty delivers Ghostty's parsed OSC 0/2 title and BEL events through the same
existing per-session host callbacks. It does not scan Terminal Payload or
add a second parser: title sanitization, fallback, ownership, silent bell marker,
focus/interaction reset and platform attention remain existing host policy.
OSC BEL terminators and cancelled or malformed controls produce no extra title
or bell event, and title-report queries receive no reply. Restty applies Option
Key Mode live: `none` preserves macOS native Unicode and composition input,
while `left`, `right`, and `both` turn only the configured physical Option key
into terminal Alt input. Native dead-key literals completed with Space retain
the keyboard layout's text, including on X11 paths that emit `insertText`
without composition events. They produce neither a substituted ASCII space nor
a duplicate keyboard-protocol release. Ordinary Space input and configured
terminal modifiers retain their existing encoding.
Restty image rendering and scrollback follow the
shared contracts below through the pinned Ghostty core. Native rasterization can
differ across Supported Platforms and GPUs; pixel-identical glyph output is not
claimed.

PTY output crosses the shared Adapter/IPC route in order. Each output message
carries a cumulative UTF-8 byte position, and only the owning renderer main
frame may acknowledge forward progress for its own Live Terminal Session. An
ACK means that the complete message was synchronously submitted to the selected
Terminal Surface; it does not mean that pixels were rendered or that a parser,
image decoder, browser, GPU, or core allocation was released. Duplicate, stale,
unknown-session, foreign-session and beyond-sent ACKs have no flow-control
effect. Main pauses the owned PTY at 65,536 pending bytes and resumes it at or
below 16,384; because a native read already in progress crosses the threshold,
the observable pending maximum is bounded by the pause threshold plus the
largest crossing native read rather than exactly 65,536 bytes. Renderer loss,
send failure, tab disposal and window disposal terminate only the affected
owned session; cleanup resumes an owned paused stream before termination so it
cannot remain an immortal paused process or send into a dead owner. On Unix,
the pinned node-pty close guard defers its socket-destroy timeout while that
stream is paused so a final readable tail is not discarded. This adaptation
does not change the separate ConPTY implementation.

Restty's pinned OutputFilter retains at most 10,000,000 UTF-16 code units of an
unfinished OSC or CSI control body. For OSC, the body is the handler payload
after a short numeric command and separator when present; otherwise it begins
after the OSC introducer. For CSI, it begins after the CSI introducer and
excludes the final byte. A control that exceeds the budget is consumed as one
rejected control until its terminator or cancellation: BEL, ST, CAN or SUB for
OSC, and a CSI final byte, CAN or SUB for CSI. It produces no partial clipboard,
title, reply, mode or other control side effect, releases retained text, and
allows following ordinary output to continue. Controls at the budget remain
accepted, including the established largest valid OSC 52 write. This is not a
limit on ordinary terminal text, copy, paste, input or complete output.

The pending IPC byte count, JavaScript heap and process RSS are separate
metadata domains. Ghostty core image/scrollback storage, transient decode
allocations, browser canvas/WebGL resources and GPU memory remain separately
accounted or unmeasured. Neither flow control nor the scanner budget is a total
application-memory bound, and concurrent sessions multiply the independent
costs.

OMXTerm advertises `TERM=xterm-256color`, `COLORTERM=truecolor`,
`TERM_PROGRAM=OMXTerm`, and its installed version in `TERM_PROGRAM_VERSION`.
Restty answers DA1 as `CSI ? 1 ; 2 c` and DA2 as `CSI > 0 ; 0 ; 0 c` once per
query, and owns cursor-position and cell-size replies once at its existing
parsed runtime seam; split input and alternate-screen transitions do not add a
second reply path.
It installs no custom terminfo and does not edit or inject shell startup files.
Inline-image support does not impersonate another terminal or inject
application-specific capability variables.

In a direct Live Terminal Session, the Terminal Surface renders two bounded
static-image paths through the Kitty graphics protocol. The Pi-compatible path
is the subset emitted by Pi 0.84.4 at commit
`b79e4cc834970cca69daebffab7df1da7d1e52c4`: direct transmit-and-display
(`a=T`, `f=100`, `q=2`), optional cell columns and rows, image ID and cursor
movement, 4,096-character Base64 chunks joined with `m=1` and `m=0`, and
image-ID (`d=I`), all-image (`d=A`), and all-placement (`d=a`) deletion. The
Chafa-compatible path is the output emitted by Chafa 1.18.2 with `-f kitty`: one
anonymous, semicolon-less metadata prelude using direct transmission (`t=d` or
the default), `a=T`, `f=32`, positive source width and height (`s` and `v`),
positive cell columns and rows (`c` and `r`), `m=1`, and `q=2`, followed by
anonymous Base64 payload chunks using `m=1` and a final standalone `m=0`
APC with no semicolon or payload (completion on the last data-bearing chunk
also remains accepted). It accepts only
uncompressed RGBA with exactly four decoded bytes per source pixel.

`CSI 16 t` receives the terminal cell-size response after the Surface opens.
Images stay cell-anchored through direct-session scrolling, Terminal Window
resizing, Window Font Zoom, tab selection, and valid User Configuration Reload,
subject to the pinned Ghostty core's placement and scrollback retention. Terminal reset, tab disposal, and leaving the alternate buffer
release the applicable image resources.

The Restty Surface uses the pinned Ghostty core as its Kitty parser,
decoder, image store and placement authority; OMXTerm does not add a second
parser. A direct transmission may contain at most 33,554,432 decoded input
bytes, and positive source dimensions may contain at most 4,194,304 pixels
before PNG or raw-RGBA decode can allocate the completed image. Chafa RGBA must
have exactly four bytes per source pixel, so it contains at most 16,777,216
bytes. Invalid Base64, malformed or cancelled APC, invalid dimensions, decoded
length mismatch, decode failure, or an exceeded limit renders nothing, clears
unfinished state, and does not block later terminal output.

Restty retains at most one unfinished Kitty image per screen, matching the
native Ghostty pending-image model. A new metadata-bearing transmission replaces
that unfinished image, including Chafa's anonymous semicolon-less prelude;
completion, reset, alternate-buffer exit, and Surface disposal release it.
Each screen stores at most 64,000,000 bytes of completed decoded image data and
uses Ghostty's native eviction behavior. Deletion by Pi image ID, all-image
deletion, all-placement deletion and reset release their corresponding native
resources. Hidden deletion, reset, alternate-buffer exit and disposal also
release applicable cached renderer resources without requiring a visible draw.
Valid core images and placements survive hiding and render again on reveal;
disposable renderer copies may be discarded while hidden.

These controls are not a total process-memory limit. Base64 decoding and PNG
decoding have transient allocations; Restty's JavaScript/WebGL renderer may
copy visible decoded RGBA into browser and GPU resources outside core storage
accounting; concurrent tabs multiply those costs. Pi's default 2,000-by-2,000
autoresized PNG pipeline is the compatibility target; images produced with
autoresize disabled have no finite compatibility promise.

SIXEL, iTerm2 Inline Image Protocol, raw RGB (`f=24`), compressed raw pixels
(`o=z`), placement IDs, animation, remote or filesystem image sources inside
Kitty Terminal Payload, downloads, persistence, and image behavior through
`tmux`, `screen`, or another multiplexer are unsupported. The separately
activated Local Image Preview below is not an Inline Terminal Image or Kitty
filesystem source. Other Kitty and Chafa paths exposed by the pinned
Ghostty core are unclaimed. Until Pi recognizes `TERM_PROGRAM=OMXTerm`, a user
must explicitly select Kitty in Pi; OMXTerm does not configure Pi. Image bytes
remain opaque, memory-only Terminal Payload on the existing PTY output path:
they introduce no main-process, preload, IPC, Adapter, clipboard, filesystem,
logging, or application-network capability.

Scrollback is memory-only and per Live Terminal Session. `scrollback.lines`
defaults to 10,000, accepts 0 through 100,000, and rejects larger values
rather than clamping them. Restty treats a positive value as an approximate
maximum of
physical history rows, excluding the active screen: Ghostty evicts only whole
historical pages, so retention may exceed the requested target by one minimum
boundary page and remains bounded. Restty also enforces its independent
10,000,000-byte core ceiling for positive history, which may retain fewer rows
than requested; OMXTerm never estimates bytes per line. Zero disables history. Restty uses Ghostty's no-history path, immediately drops
retained history, retains none through sustained output or resize, and can
retain only new output after a later positive reload. Valid live changes keep
the same Surface, core, Live Terminal Session and PTY and preserve coherent
reflow, alternate-screen, selection and viewport state. Each Surface remains
independent. Accepted keyboard input and delivered paste, snippet, or path input return the
viewport to the live cursor. Output alone, protocol replies, focus, selection,
and cancelled paste do not force the viewport to the bottom.
The scrollback scrollbar shows a thumb only while scrollback
extends beyond the visible screen; an empty scrollbar track paints nothing on
any platform. Desktops with a fine pointer retain native scrolling even when
touch capability is also present; touch-only devices keep the existing touch
scrolling path.

OSC 0 and OSC 2 titles are display-only and per session: the raw OSC request must be no longer than 256 code points, then
control and bidi characters are
removed and the result must be one printable line. A tab shows its session's
accepted title and falls back to the basename of the shell selected when that
session started; the native window
title mirrors the selected tab and falls back to `OMXTerm`. Title contents are
never logged or reported to the PTY.

Only literal visible lowercase `http:`, `https:`, and absolute authority-free
`file:///` URLs are links. Literal visible native absolute paths are separate
Local Image Preview destinations: POSIX paths begin with one `/`, and Windows
paths are drive-qualified with a letter, colon, and slash or backslash.
While the pointer is over a recognized destination, holding that same platform
modifier transiently underlines its complete visible span. Pointer movement and
modifier press or release update the cue without activation; output, scrolling,
geometry changes, focus loss, tab hiding, and preview or Surface lifecycle
changes remove stale cues. Recognition alone performs no file read, image
decode, network access, IPC opening request, or Terminal Payload logging.
`Cmd+click` on macOS or `Ctrl+click` on Linux and Windows explicitly activates a
recognized destination. For HTTP(S), the Electron main process parses and
validates the exact URL before asking the operating system to open it. The valid modified primary
click takes precedence over application mouse reporting and is consumed without
a duplicate PTY mouse report; other gestures retain ordinary selection or
application-mouse routing. Restty reconstructs a destination only
across core-proven, fully visible soft wraps. It preserves hard breaks and cell
coordinates for grapheme and wide-cell prefixes, and conservatively refuses a
destination that may continue beyond the visible viewport. Restty enables
Ghostty's grapheme-cluster mode by default so emoji-presentation and ZWJ
clusters occupy one two-column terminal cell for rendering and selection.
For `file:///`, main independently requires the literal lowercase scheme, no
remote or `localhost` authority, no query or fragment, and a platform-absolute
local path. A native path is sent as a distinct typed source and independently
must be absolute for the current platform; `%` and `#` remain literal filename
characters instead of URL escapes or fragments. Native path recognition uses
the exact non-whitespace token beginning at a line boundary or after whitespace.
It does not trim or decode quotes, brackets, assignment prefixes, trailing
punctuation, or any other token content, so paths containing whitespace and
syntactically wrapped paths are not recognized. It opens no operating-system URL
handler: after activation only, it reads the selected target through a non-shell
regular-file boundary. The content must be a structurally valid, natively decodable static PNG or JPEG of at most
16 MiB encoded, 8192 pixels per side, and 16 million pixels. APNG and every
other animated or unsupported format are rejected regardless of extension. The
same Terminal Window permits at most one picker or activated-source read at a time; owner
closure makes late picker, read, and decode results inert. Both picker and URL
paths must be local absolute paths before any read; Windows paths must include
a drive, and UNC/device paths are rejected even from the native picker.

The renderer receives only bounded validated name, dimensions, media type, and
bytes, creates a memory-only Blob URL under the production CSP, and synchronously
removes the image source and revokes that URL on dismissal, replacement failure,
page teardown, or owner close. It never receives an arbitrary filesystem API or
path. The preview fits the complete image proportionally within the overlay's
content area, including after window resizing, without clipping or stretching it.
Failed reads and decode failures show only a fixed non-path error. OMXTerm
never reads on output or hover, infers a relative path, expands `~`, consults
shell cwd, fetches or transfers a remote image, accepts UNC/file authorities,
treats OSC 8 metadata as a local source, logs image paths or payload,
writes/downloads image data, or persists the preview. A clicked path always
addresses the machine running OMXTerm regardless of where its text originated.

Application mouse modes own buttons, motion, and wheel reporting in normal and
alternate screens; Shift retains the selection override, and explicit copy and
valid modified-link gestures — web or local image — do not produce duplicate
PTY mouse input. OSC 8 destinations and all other schemes are ignored.

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
- Paste is never truncated, interpreted, summarized, or logged. Semantic paste,
  snippet and path-insertion operations preserve request order without delaying
  ordinary keyboard input. Current bracketed mode and ownership are checked
  after asynchronous clipboard reads or confirmation. Mid-delivery disposal
  stops later chunks and a snippet's optional Enter, without rollback or replay.
- OSC 52 may write the clipboard only for target `c` with non-empty canonical
  padded Base64 that decodes as UTF-8. The 10,000,000 UTF-16-code-unit handler
  payload bound counts `c;` and Base64 but excludes the OSC introducer, command
  and terminator. Thus a canonical 9,999,998-unit request is accepted completely
  and the next canonical 10,000,002-unit request is consumed without action.
  Clipboard read, clear, invalid target, malformed, non-canonical, cancelled and
  over-bound requests are consumed without clipboard action or PTY reply.
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
`%USERPROFILE%\.config\omxterm\config.json` (ADR 0002). At application startup, an existing `config.json` filesystem entry (including
an invalid file, directory, or dangling symlink) skips the entire initial kit
without inspecting snippets or themes. Otherwise, OMXTerm creates the directory,
`config.json` with common built-in defaults (including explicit
`window.blur: false` and `window.transparency: 0`) and `theme.path` set to
`themes/omtheme.json`, one non-executing example in `snippets.json`, and a copy
of the bundled theme at `themes/omtheme.json`. Existing sibling files are never
replaced. Files are published complete without overwriting concurrent creations;
configuration is published last. Shell, font family and shortcuts retain their
implicit platform defaults. Creation failure produces a non-blocking notice and
normal configuration loading continues. This runs at application opening, not
package installation or manual reload. The copied theme belongs to the user and
does not track subsequent bundled palette changes. A present file must contain `"version": 1` and only supported keys:

- `confirmClose`;
- `logLevel`;
- `windowsShell`;
- `font.family`, `font.size`, `font.lineHeight`, and `font.ligatures`;
- `terminal.padding.top`, `terminal.padding.right`,
  `terminal.padding.bottom`, and `terminal.padding.left`;
- `scrollback.lines`;
- `keyboard.optionAsAlt`: `none`, `left`, `right`, or `both`;
- `window.alwaysOnTop`, `window.showTitleBar`, `window.showTabBar`,
  `window.blur`, and `window.transparency`;
- `theme.path`;
- `keybinds.<action>` for the fixed application-shortcut vocabulary below.

The bundled FiraCode Nerd Font Mono regular face at 16 px is the default.
Programming ligatures default to enabled; `font.ligatures` accepts only a
boolean and can disable them without changing the font or underlying terminal
text. Its real bold face renders SGR bold without changing the requested ANSI
color.
Bundled DejaVu Sans Mono regular/bold and JetBrainsMono Nerd Font Mono follow it
for coverage before available operating-system emoji, CJK, and symbol faces.
`font.size` accepts only integral pixel sizes from 8 through 72 inclusive. `font.lineHeight` is an independent
row-height multiplier from 1.0 through 2.0 inclusive, accepts fractional
values, does not change glyph size, and defaults to 1.0. Terminal padding uses
explicit per-side integer CSS pixels from 0 through 128 inclusive and defaults
to top 0, right 8, bottom 8, and left 8. User top padding is added below the
30 px native title inset on macOS when that title area is visible, or below the
34 px app-drawn title row on Linux and Windows. Hiding the title area or entering
fullscreen removes only the app-owned title space, without changing configured
padding or the macOS system safe area. `logLevel` defaults to `info`,
`keyboard.optionAsAlt` to `none`, and `window.alwaysOnTop` to `false`.

`window.showTitleBar` and `window.showTabBar` accept only booleans and default to
`true`. They choose initial visibility for newly created windows. A successful
reload updates these defaults for future windows, not existing windows' choices;
menu/keybind toggles never rewrite the document. An enabled tab bar still needs
two or more tabs to become visible.

`window.blur` accepts only a boolean and defaults to `false`.
`window.transparency` accepts only a finite number from 0 through 1, including
fractions, and defaults to 0. Wrong types, unknown keys and out-of-range values
are rejected, never clamped. Both settings apply on valid manual reload to all
current and future windows/tabs without replacing native windows, Terminal
Surfaces or Live Terminal Sessions; rejected reloads keep the entire last
snapshot.

Zero preserves the opaque appearance. Increasing transparency reduces only the
OMXTerm background tint, painted once behind terminal content, padding, title
chrome, tabs and the Snippets Sidebar. One removes that tint completely where
native composition supports it; the Windows fallback below remains opaque.
Chrome neutral overlays also fade; foreground controls and the selected-tab indicator
remain visible. Glyphs (including their normal antialiasing and SGR faint),
cursor, selection and Inline Terminal Images are not faded with the window.
Implicit default cell backgrounds, including SGR 49, expose the shared tint.
Explicit ANSI palette and RGB backgrounds remain opaque **even when their RGB
equals the theme background**, including background-color erase and alternate
screens. Inverse text uses opaque background-color ink and the foreground color
as its opaque cell background. Consequently a TUI that explicitly fills its
screen may remain opaque; OMXTerm does not guess which colors the application
intended to make transparent. Theme colors remain strict `#RRGGBB`.

With positive transparency, `blur: true` requests direct native macOS background
blur (fixed radius 20), Windows Acrylic, or the per-owned-X11-window KDE
blur-region hint on Linux when `xprop` is available. On macOS, a small main-only
Node-API addon dynamically resolves private CGS symbols and sets the owned
NSWindow background to white alpha 0.001; the renderer's configured tint is
unchanged. Missing modules/symbols or failed application use `hud` vibrancy.
Before switching or disabling, main resets the private radius and native
background. If cleanup cannot be confirmed, it avoids stacking HUD onto an
uncertain private effect; a later manual reload, explicit show or restore may
retry. There is no background retry. Effects apply after native show, without
recreating a window, Surface or PTY.

Blur is boolean and best effort; with zero transparency there is no visible
blur. Private API availability and visual behavior can change with macOS.
The OS/compositor may ignore the request or retain its own material tint even
at transparency 1. Missing helpers or native API errors are quiet fallbacks,
never launch prerequisites.

Windows keeps normal nontransparent native-window construction to preserve native
resize, maximize/restore, fullscreen, corners and shadow. On Windows, positive
transparency without blur is accepted but renders the opaque Terminal Theme;
`blur: true` can reveal the requested tint through Acrylic on Windows 11 22H2
or later. Earlier/unknown versions and material-call failures keep an opaque
theme fallback, including after live theme changes. Main publishes effective
transparency zero for that window's fallback while retaining the complete
requested User Configuration unchanged. Successful calls do not prove visually
active Acrylic; OS policy may still make it opaque. Native
Wayland blur is not claimed. OMXTerm makes no global compositor, accessibility
or extension changes. Unsupported composition may leave an opaque usable
terminal. Native API success is not proof of visible blur, and cross-platform
pixel parity is not promised. There is no blur strength, material selector,
extra menu, whole-window opacity, CSS backdrop filter or screen capture.
[ADR 0029](adr/0029-compose-background-effects-with-explicit-cell-identity.md)
records paint ownership and native lifetime constraints;
[ADR 0030](adr/0030-prefer-direct-macos-background-blur.md) reopens its macOS
material-only choice and records the private-API maintenance tradeoff.

`windowsShell` is an optional non-empty string without NUL on every Supported
Platform. On Windows it must be an absolute Windows filesystem path whose final
target, followed through links or reparse points, is an existing regular file;
an inspection failure is invalid. The validated path is used as written for
each future Default Shell session and is passed directly to the PTY with an
empty argument vector. OMXTerm does not expand it, identify the shell, check
ACL readability or executability, preflight a spawn, add arguments, use a
wrapper, or construct a command string. On macOS and Linux the key is accepted
without filesystem access or warning but has no effect on operating-system
shell selection.

An optional `keybinds` object remaps application-chrome shortcuts for a fixed
action vocabulary: `quit`, `copy`, `paste`, `selectAll`, `newWindow`,
`closeWindow`, `newTab`, `closeTab`, `nextTab`, `previousTab`, `selectTab1`
through `selectTab9`, `zoomIn`, `zoomOut`, `actualSize`, `toggleFullScreen`,
`toggleSnippets`, `toggleTabBar`, `toggleTitleBar`, and `reloadConfig`. Each
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

An optional user-owned `snippets.json` next to `config.json` defines the
Snippets Sidebar contents. The file is strict JSON containing exactly
`"version": 1` and a `snippets` array of at most 512 entries; each entry has a
non-empty `name` (the searchable label, at most 128 UTF-16 code units), a
non-empty `body` (the text to inject, at most 65,536 UTF-16 code units), an
optional `description` (at most 512 UTF-16 code units), and an optional boolean
`execute` defaulting to `false`. Apart from initial kit creation, OMXTerm never creates, rewrites, or migrates
the file; absence is the clean empty state, and the file is reread each time
the sidebar opens. Injection uses the same Protected Paste path as a normal
paste. With bracketed paste disabled, a multiline or control-character body
requires Protected Paste approval; after approval, the body is delivered
unchanged and may execute through its embedded line breaks or control
characters. With bracketed paste enabled, paste-aware delivery bypasses the
Protected Paste confirmation and sends the body as one bracketed paste.
`execute` controls only whether OMXTerm appends Enter after body delivery:
`false` appends nothing, while `true` sends Enter after the body and any closing
bracketed-paste marker — per-snippet opt-in only. An invalid `snippets.json`
never blocks startup and is never silent: the sidebar shows
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
when their final target is a readable regular file. The Electron main process reads and resolves the selected path through the
complete User Configuration loading boundary and sends only validated, typed
palette data — plus bounded user-file notice state — through the existing
configuration boundary. `View -> Reload User Configuration` can therefore
select a changed path after validating the complete document.

A Terminal Theme is strict JSON containing exactly `version`, `name`, and
`colors`. Version must be `1`. The name is a non-empty printable single line of
at most 64 Unicode code points. `colors` contains exactly the foreground,
background, cursor, selection foreground and background, and all 16 normal and
bright ANSI fields shown in [`omtheme`](omtheme.json). Every color is an exact,
case-insensitive hexadecimal `#RRGGBB` value. Alpha colors, partial palettes,
CSS names, functions or variables, inheritance and imports are unsupported.
Transparency and blur are User Configuration window preferences, not theme
fields; the Terminal Theme schema has no opacity or tint setting.

Invalid JSON or UTF-8, unknown or missing keys, unsupported versions, missing
configured fonts or theme files, invalid Windows shell paths or final targets,
non-regular theme targets, invalid theme
fields or colors, non-finite or out-of-range line heights, and non-integral or
out-of-range padding values are errors. An error never stops OMXTerm from
opening: an invalid `config.json` starts the application with the built-in
defaults for every setting, and an invalid or missing selected theme file
starts it with the bundled `omtheme` while keeping the rest of the validated
configuration. The fallback target is always the built-in defaults, never a
cached or previous configuration. OMXTerm reports the exact problem — including
the configured or resolved path when relevant — through stderr and a persistent
in-app error surface that states which defaults are active and never blocks
typing into the Terminal Surface, so the file can be fixed inside OMXTerm
itself. Both files stay unchanged. `View -> Reload User Configuration` performs
one complete startup-equivalent load. A valid reload atomically replaces the
active application configuration and current notices; on Windows its shell
selection applies to every subsequently created Default Shell session while
existing sessions retain the shell they started with. Absence successfully
selects all defaults without creating a file. A rejected reload changes no
active setting, keeps the complete last valid in-memory configuration, and
replaces the non-blocking notice with the current actionable failure. A later
valid reload replaces resolved startup or reload errors and stale warnings with
notices from the current validation. The complete committed renderer snapshot
reaches existing and newly created Terminal Surfaces. Font and spacing changes
recompute the existing native minimum-window bounds, refit the grid with its
bottom row visible, and resize the same PTY through its existing adapter.
`font.family` and `font.lineHeight` are the complete restart-only set for
existing Terminal Surfaces; `font.ligatures` applies live. A valid reload applies
all live-safe settings and host preferences, keeps those two creation-time
values in every existing Terminal Surface, and shows a persistent non-blocking
notice naming each deferred setting and asking the user to restart OMXTerm. New
tabs and windows use the latest fully validated family and line height. A
deferred setting clears only when its requested value is already active in
every existing Terminal Surface. Theme, configured font-size baseline,
padding and Window Font Zoom remain live and preserve the existing Surface and
PTY. Invalid, missing, unreadable, unsupported or corrupt configured font input
rejects the whole reload. Runtime scrollback reduction, including zero, uses
the selected Surface's in-memory core behavior described above; programming-
ligature changes use the existing Restty runtime setter without reloading
fonts, and Option Key Mode changes only subsequent keyboard events. OMXTerm never
migrates, repairs, rewrites, or silently ignores User Configuration. The same surface
also carries non-fatal warnings for a valid configuration that stays fully
active — currently a keybind shadowing a PTY control key — which inform without
activating any default.

Operational logs are JSONL under `$XDG_STATE_HOME/omxterm/logs`, falling back to
`~/.local/state/omxterm/logs`. Levels are `error`, `info`, and `debug`. Only the
current and previous files are retained, each capped at 5 MiB. Manual reload
records safe requested, succeeded, and rejected outcomes with bounded duration
and a normalized failure category, never paths, validation detail, configuration
contents, or Terminal Payload. Logs may describe
OMXTerm lifecycle, validation, IPC, PTY control, resize, duration, and failures;
they must never contain PTY input/output, clipboard data, environment contents,
configuration contents, executable names, command arguments, commands, titles,
secrets, or transcripts.

The application performs no network requests: no analytics, telemetry, crash
reporting, update check, or remote log delivery. Child processes retain their
normal network access.

The optional Linux AppImage desktop installer accepts only a user-supplied,
previously verified local Linux ARM64 OMXTerm AppImage and performs no download,
release discovery, package-manager operation, elevation, system-wide change, or
update. It owns exactly
`~/.local/opt/omxterm/OMXTerm.AppImage`,
`~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png`, and
`~/.local/share/applications/omxterm.desktop`. Install and update replace all
three files transactionally; invalid input or failure preserves the complete
previous installation. Uninstall removes only those files and preserves
unrelated files and parent directories. At installation time the helper tests
actual kernel FUSE mounting and writes one fixed desktop entry that either runs
the AppImage directly or adds `--appimage-extract-and-run`; launch time performs
no mode discovery. The installed desktop entry explicitly selects X11/XWayland,
including when the session exports a Wayland preference. Direct AppImage launches
retain the rendering override rules above.

The helper accepts `install [--compatibility] <verified-local-AppImage>`,
`uninstall`, `--version`, and `--help`, without interactive questions. Only the
explicit compatibility option adds per-process `LIBGL_ALWAYS_SOFTWARE=1` and
`--ignore-gpu-blocklist`; it is not automatic VM or desktop detection and may
reduce performance or stability. A normal reinstall removes that opt-in.
AppImage extraction arguments precede Electron arguments in either mode.

During installation in an active Hyprland session, bounded optional desktop
queries may record `--force-device-scale-factor` when XWayland zero-scaling is
enabled and all reported monitors share one positive numeric scale other than `1`.
Missing tools, failed/malformed reports, absent sessions and mixed scales leave
Electron scaling unchanged. The choice is fixed in the desktop entry, reported
to the user and refreshed on reinstall; launch time does not re-detect monitors.
Neither this choice nor compatibility mode changes compositor policy, global
environment, User Configuration, terminal font zoom, title-bar preferences or
the three-file ownership/rollback contract. See
[ADR 0031](adr/0031-keep-linux-installer-choices-small-and-local.md).

## Architecture boundaries

Electron main owns native windows, PTYs, filesystem access, configuration,
logs, clipboard capabilities, external-link opening, and bounded Local Image
Preview reads. The renderer runs with context isolation and without Node
integration. A minimal typed preload bridge validates every IPC message and its
sender. The font route accepts no path; it can return only bounded bytes for the
active validated configured family and fixed local fallback candidates. Font
paths, family names, and bytes are excluded from Operational Events. Chromium
sandboxing remains enabled on macOS and Windows and is disabled on Linux. Context
isolation and the narrow bridge still limit renderer authority on Linux, though
they do not provide protection equivalent to the Chromium sandbox.

The framework-independent DOM Terminal Surface is the portable deep Module. Its
small Interface hides Restty setup, Ghostty parsing, text and Kitty image
rendering, input, resize, theme, fonts, clipboard, zoom, and cleanup. Restty is
the sole implementation, with no renderer registry or user-facing selector. The
Surface receives a session Adapter instead of importing Electron or `node-pty`.
OMXTerm supplies the local IPC/PTY Adapter; another host could independently
supply WebSocket transport.

Electron, window management, and PTY creation are not generalized into a fake
cross-platform framework. The code remains one package organized by actual
runtime responsibility: main, preload, renderer, and the portable Terminal
Surface.

## Release contract

The project uses the MIT License and follows the documented
[Semantic Versioning policy](versioning.md). An accepted initial-development
version may be tagged `v0.y.z`. Release candidates are built locally and
natively on each Supported Platform: macOS on the designated Apple Silicon Mac,
and Linux arm64 and Windows arm64 in native Parallels VM
clones using the VM's native filesystem, never shared folders. The initial
application-package formats are DMG, AppImage, and NSIS respectively. A Linux
release also includes the optional `linux_install.sh` AppImage desktop-installer
shell asset and `linux_install.sh.sha256`; its embedded `--version` agrees with
the release. This is not another application package format. Published releases
through 0.17.0 retain their original version-bearing helper filenames.

Windows exact-installer verification is an installation side-effect boundary:
`/D=` changes the destination but does not isolate old-version removal,
registration, shortcuts, or processes. Verification refuses installation by
default and on unknown inspection or conflicting live processes. Deliberate
replacement requires an explicitly authorized disposable VM and a literal CLI
opt-in, never an environment sentinel. Cleanup is ownership-checked, preserves
User Configuration and other user data, and must succeed for full verification.
Non-installing unpacked diagnostics remain explicitly partial; exact NSIS
installation, payload, installed startup, and cleanup verification remain
mandatory for every Windows Release Artifact.

Each exact artifact requires its own recorded native automated verification.
Manual testing is optional and never a release gate. The maintainer exercises
macOS through ordinary daily use rather than a prescribed release matrix and
does not manually validate Linux or Windows. An owner request to prepare and
publish a release covers environment preparation, verification, tagging and
uploads without additional per-step or exact-artifact approval. Published
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
cleanup, PTY resize and bounded input flow, Unicode, direct-session Kitty image
rendering, deletion, resource limits and cleanup under the production renderer
CSP, bounded local-image reads and overlay cleanup, local and web link gesture
precedence, bracketed and protected paste, title sanitization, URL validation, OSC 52
restrictions, log redaction/rotation, renderer IPC boundaries, and packaged
startup. Every exact
release candidate receives native automated package, architecture, content,
version, startup, PTY, and applicable contract verification on its target.
Linux package verification rejects unexpected AppRun bytes before startup and
exercises the explicit no-sandbox policy through every available installed
launch mode. Launcher regressions preserve literal command arguments and prove
that host namespace-probe results do not change the policy. Chromium image tests
use the same platform policy while retaining context isolation, disabled Node
integration and the production CSP.

Release evidence is risk-based. Each release records the boundaries changed
since the previous version and maps each to existing automation. A material
platform-specific boundary that automation cannot observe is recorded honestly
as unverified; missing human coverage does not block publication.
The maintainer continuously dogfoods macOS and reports problems found during
normal use, without replaying a release checklist. Linux and Windows rely on
native automation and later contributor or user reports rather than
maintainer-run manual testing.

Exact-artifact identity, checksum reconciliation and native automated
verification remain mandatory. Publishing within an owner-requested release
requires no further approval round and does not imply that every artifact or
automation-resistant boundary received manual exercise.

The ADRs in `docs/adr/` own the reasoning behind the durable choices; this file
owns the current observable product contract.
