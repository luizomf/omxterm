# OMXTerm product contract

This document describes OMXTerm's behavior, architecture, and known limitations.
The [user guides](README.md) explain setup and everyday use.

- [Product and scope](#product)
- [Windows and sessions](#window-and-session-behavior)
- [Terminal behavior](#terminal-behavior)
- [Clipboard](#clipboard)
- [Configuration and local state](#configuration-and-local-state)
- [Architecture boundaries](#architecture-boundaries)
- [Release contract](#release-contract)
- [Acceptance boundary](#acceptance-boundary)

## Product

OMXTerm is an open-source personal desktop terminal. It opens a normal local
shell in a native window with a hideable title area and gives the Terminal
Surface all remaining content space. SSH brokering, AI assistance, persistent
session management, and IDE features are outside the product scope.

The Supported Platforms are macOS arm64, Linux arm64, Windows arm64, and Windows x64 (ADR 0034). Linux
rendering defaults to X11 and requires XWayland when the desktop session is
Wayland; native Wayland rendering is not currently claimed. An explicit Electron
`--ozone-platform` or `--ozone-platform-hint` switch supplied before a Launch
Request's `-e`, or a defined `ELECTRON_OZONE_PLATFORM_HINT` environment
variable, takes precedence over the Linux default for diagnosis. The environment
variable counts as an override even when its value is empty. Linux deliberately
uses `--no-sandbox` as an unconditional launch policy for ordinary-user runtime,
direct AppImage, extraction, desktop entry and X11 relaunch. The development
launcher (`npm run dev`) supplies it before Electron bootstrap, not only after
application main starts. This is a fixed launch policy, not a fallback or
configurable mode. OMXTerm leaves host security policy unchanged and installs no
privileged sandbox helper. Sandboxed Linux support is outside the current
maintenance scope (ADR 0024). Linux x64, Intel macOS, and other operating systems are
unsupported.

## Product scope

OMXTerm:

- opens the Default Shell in the user's home directory: on macOS and Linux the
  operating-system-configured shell as an interactive login shell; on Windows,
  which has no login-shell concept, a configured `windowsShell` executable when
  present, otherwise Windows PowerShell — falling back to the ComSpec command
  processor — started interactively without a login flag; or, when startup
  includes `-e <program> [arguments...]`, runs that executable and literal
  argument vector directly in the first Terminal Tab without an implicit shell;
- provides a terminal targeting ordinary shells, SSH started by the user, tmux,
  TUIs, REPLs, alternate-screen applications, Unicode, and bracketed paste, with
  the protocol limitations documented below; it renders emoji-presentation and
  ZWJ grapheme clusters as single two-column cells that do not overlap
  neighboring cells;
- uses one independent shell session per Terminal Tab, with one or more tabs per
  native Terminal Window;
- provides native new-window, new-tab, close, copy, paste, select-all,
  scrollback search, explicit text export, zoom, fullscreen, always-on-top,
  bounded local-image preview, and quit actions without an in-window toolbar;
- renders the bundled [`omtheme`](omtheme.json) palette by default, allows one
  explicitly configured external Terminal Theme, keeps SGR bold text on its
  requested ANSI `0–7` color without remapping it to bright `8–15` (applications
  may request bright colors explicitly), and uses bundled regular and bold
  FiraCode Nerd Font Mono as the default, followed by bundled regular and bold
  DejaVu Sans Mono, JetBrainsMono Nerd Font Mono, and representative
  operating-system emoji/CJK/symbol faces for missing-glyph coverage;
- uses the black-and-blue OMXTerm application icon in development and on the
  packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- reads strict, versioned JSON configuration and writes bounded local JSONL
  operational logs;
- packages ready-to-run artifacts from an accepted version: ARM64 DMG for macOS,
  ARM64 AppImage for Linux, and ARM64/x64 NSIS for Windows. Linux releases additionally provide
  an optional versioned per-user AppImage desktop installer and its checksum;
  running the AppImage directly remains supported.

AI assistance, splits, saved or reconnectable sessions, shell integration,
profiles, a theme picker or catalog, automatic configuration reload, automatic
updates, and remote terminal features are outside the current product contract.

Restty 0.3.0 and its pinned Ghostty core provide the sole Terminal Surface in
ordinary development and every packaged application. OMXTerm has no renderer
selector or fallback Surface. A shell starts only after rendering initialization
succeeds ([ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md)).

## Window and session behavior

- Launching OMXTerm creates a Terminal Window with one Terminal Tab. New Window
  and New Tab default to `Cmd+N` and `Cmd+T` on macOS, and `Ctrl+Shift+N` and
  `Ctrl+Shift+T` on Linux and Windows. Each tab owns its own independent Live
  Terminal Session.
- A startup Launch Request uses `-e <program> [arguments...]`. The value after
  the first `-e` is required as the executable, and every remaining value —
  including another `-e` or an option-looking value — is literal argv. OMXTerm
  passes the executable and argv directly to the PTY without constructing a
  command string, rewriting arguments, or inserting a shell. A user may
  explicitly choose a shell and pass literal arguments such as `-lc`. The
  request is consumed only by the first Terminal Tab of the first Terminal
  Window in that application process; all later tabs and windows use the Default
  Shell. A trailing `-e` with no program is an actionable startup failure and
  never falls back to the Default Shell.
- An explicit command starts in the user's home directory, inherits the normal
  process environment, and receives the Terminal Capability Identity. It is a
  Busy Session for its complete live lifetime. Its clean exit, unexpected
  signal, spawn failure, requested close, tab and window closure, and
  last-window quit use the existing Live Terminal Session lifecycle.
- After its Terminal Surface mounts, an active Terminal Window gives terminal
  input DOM focus. When the user returns from another application or OMXTerm
  window, only the active Terminal Window restores that focus. Focus restoration
  does not activate, raise, or show OMXTerm by itself.
- Every Terminal Window can be repositioned through its visible title area, or
  its small hover-revealed handle when that area is hidden. Native dragging is
  confined to these areas; the rest of the Terminal Surface remains interactive.
- A window with a single tab shows no tab strip. Each window owns independent
  in-memory title-bar and tab-bar visibility choices, initialized from
  `window.showTitleBar` and `window.showTabBar`, both defaulting to true. The
  OMXTerm-drawn tab strip is visible only when its flag is enabled and there are
  two or more tabs; it occupies its own full-width row above the Terminal
  Surface and Snippets Sidebar row. On macOS it sits below the app-controlled 30
  px native title inset when the title area is visible and the window is not
  fullscreen. On Linux and Windows it sits below the visible app-drawn 34 px
  title row. A hidden title area or fullscreen leaves no title row or duplicate
  inset. Clicking a tab selects it; the selected tab's grid refits and receives
  terminal focus. Dragging a tab horizontally within that strip reorders the
  existing tabs in that window. The reordered positions immediately drive
  visible order, next/previous cycling, and literal positional selection while
  the selected tab and every Live Terminal Session and Terminal Surface remain
  unchanged. Tab order is ephemeral and is neither shared between windows nor
  persisted or restored.
- Close Tab defaults to `Cmd+W` on macOS and `Ctrl+Shift+W` on Linux and
  Windows, and terminates only the selected tab's session. A pending
  confirmation retains its original tab: approval never retargets a later
  selection, and does nothing if that tab has already ended. Repeated requests
  during that confirmation share the same decision, even if the selected session
  becomes idle. Closing a window's last tab closes that window. During the first
  tab's initialization, however, the renderer has not yet subscribed to tab
  commands: an early Close Tab, New Tab or tab-navigation command can be lost
  rather than queued. Clipboard, zoom, tab-bar and snippets actions also
  subscribe only after that readiness; earlier notifications are not buffered.
  Close Window and Quit use separate main-owned paths and can still cancel
  initialization. Close Window defaults to `Cmd+Shift+W` on macOS and
  `Ctrl+Shift+Q` on Linux and Windows and closes all of the selected window's
  tabs. Closing the last window quits OMXTerm.
- Quit defaults to `Cmd+Q` on macOS and `Ctrl+Alt+Shift+Q` on Linux and Windows.
  It requests one confirmation for all open windows when confirmation is enabled
  and at least one Live Terminal Session is Busy.
- An accepted Quit, including automatic last-window quit, stops new session
  starts and waits for every owned native PTY to report exit before completing
  normal application quit. This includes sessions whose tabs or windows already
  closed. Window/controller disposal and a native kill request are not
  completion signals. Repeated quit requests share one shutdown; pending or
  denied Busy Session confirmation does not start it. Completion is owned by
  main independently of disposed renderer/controller callbacks (ADR 0028). After
  actual exit, the window controller delivers immutable end context and releases
  the session object. Pending failure acknowledgements retain only their
  separate ownership metadata; retired identities cannot route input, resize,
  title, bell or ACKs.
- `confirmClose` defaults to `true` and guards tab close, window close, and
  quit. Each action can produce at most one confirmation, so closing a window
  with several tabs asks once for the whole window. OMXTerm asks only when the
  action affects a Busy Session, defined as a Live Terminal Session whose PTY
  foreground process differs from the idle Default Shell. Closing only idle
  sessions proceeds immediately. OMXTerm reads the foreground process name
  solely for this in-memory decision and never logs, displays, or transmits it.
  An unreadable name counts as Busy, including unavailable Linux native
  foreground lookups; the spawned shell is not a substitute for that result.
  ConPTY on Windows exposes a static console title in place of the foreground
  process name, so every live Windows session counts as Busy and asks while
  confirmation is enabled.
- Closing or ordinarily exiting an unselected tab preserves the selected tab,
  its Terminal Surface and Live Terminal Session, even when its position
  changes. Subsequent keyboard, Paste and Snippet input stays with that selected
  session. Removing the selected tab chooses its right neighbor, or the left
  neighbor when it was last; removing the only tab retains the last-tab window
  lifecycle.
- After the Default Shell starts successfully, an ordinary shell exit closes its
  tab — and its window when that was the last tab — without confirmation or a
  failure dialog, regardless of its numeric exit code. A tab whose fonts or
  rendering are still initializing remains a window owner even before its PTY
  starts: another session's ordinary exit cannot close that window. The pending
  tab may finish and start one session, or be cancelled without starting one.
  Cancelling the final pending tab closes the window; final pre-start rendering
  failure retains a native failure dialog until acknowledgement. Last-tab
  closure is committed by the renderer's tab owner, not inferred from a zero
  native-PTY count. Queued New Tab commands cannot revive an emptied owner;
  explicit window closure and Quit still cancel pending initialization.
- Native executable-start failure is distinct from a successfully executed
  program returning nonzero. Unix reports exec failure through a private native
  status channel, never by interpreting an exit code or Terminal Payload (ADR
  0032). This applies to explicit commands and the Default Shell, with no
  fallback shell. Safe Operational Events classify it as `spawn-failure`.
- A spawn failure or unexpected signal remains visible in a native error dialog
  and local log until acknowledged; the useless tab then closes. Each pending
  failure acknowledgement retains its window even if a sibling exits ordinarily
  or another failure is acknowledged first. Acknowledgement removes only its
  failed tab; automatic window closure waits for both an empty renderer tab
  owner and every pending failure acknowledgement. Explicit authorized window
  closure and Quit remain separate, and late dialog results cannot act on
  disposed owners. Native shutdown completion is recorded independently of
  renderer notification.
- Each window starts at configured font size. Window Font Zoom defaults to
  `Cmd++`, `Cmd+-`, and `Cmd+0` on macOS and `Ctrl++`, `Ctrl+-`, and `Ctrl+0` on
  Linux and Windows; it affects only that window, applies to every tab in it,
  and is not persisted.
- Native resize failure is contained by the owning Live Terminal Session. The
  pinned Unix closed-descriptor race is quiet teardown metadata at debug level;
  other failures record a fixed `native-failure` category at error level,
  without native error text. The failed request is discarded; later valid
  resizes may retry. Neither failure closes a tab, terminates siblings, or
  replaces the actual native exit notification used for session completion.
- The Terminal Surface and Live Terminal Session grid refit in both directions
  after Terminal Window width or height changes, after Window Font Zoom, and
  after tab selection. With sufficient content space, the grid fits inside the
  visible content area with its bottom row visible. Hiding a Terminal Tab
  preserves its last real grid; a hidden layout box or hidden font change does
  not resize the Surface or PTY using concealed geometry. Hidden Terminal
  Surfaces, including mounts completing while hidden, perform no frame clears,
  draws or render uploads. They continue synchronous ordered output ingestion,
  Adapter ACKs, protocol replies, parsed events and Scrollback Buffer retention.
  Selection refits and redraws current content and cursor before the first
  visible presentation, without a background render-budget delay or replacing
  the Surface, core or Live Terminal Session.
- Native windows have minimum dimensions of 320 px wide by 200 px high. At
  startup and after a valid reload, main grows those bounds using configured
  font metrics, line height, padding, a scrollbar allowance, and title space.
  The calculation reserves two columns and one row but does not include the
  Snippets Sidebar or tab-strip space, creation-time fonts retained by older
  Surfaces, or ephemeral Window Font Zoom. It therefore does not guarantee a
  visible grid at the native minimum in every layout. In particular, the
  nonshrinking 280 px sidebar can leave less space than accepted horizontal
  padding alone. Widen the window or hide the sidebar to recover terminal space.
- On macOS, visible Window Chrome preserves the blended `hiddenInset`
  appearance, with native traffic-light controls on the left and a 30 px
  title/drag inset above configured top padding. The Terminal Theme background
  continues behind the controls; no separately colored title strip is added.
  Hiding removes the controls and that inset without recreating the native
  window.
- Linux and Windows use a frameless native window with a hideable, app-drawn 34
  px title/drag row. The sanitized selected Terminal Title, with the existing
  fallback, appears at the left; minimize, maximize/restore, and close controls
  appear at the right. Colors follow the active Terminal Theme. Controls invoke
  native actions in main; Close uses the existing guarded Close Window
  lifecycle. Native resize, maximize/restore, and operating-system edge/corner
  snapping remain window-manager behavior rather than app-drawn substitutes.
- `View -> Toggle Title Bar` defaults to `Cmd+Shift+D` on macOS and
  `Ctrl+Shift+D` on Linux and Windows, remappable as `toggleTitleBar`. It
  changes only the selected window's title-bar choice, without rewriting
  configuration or recreating its window, renderer, Terminal Surfaces, or Live
  Terminal Sessions. A layout change refits the selected existing Surface and
  PTY and restores terminal focus; hidden Surfaces retain valid geometry. Local
  Image Preview choosing/loading/showing suppresses the toggle without changing
  state or focus.
- When the title area is hidden outside fullscreen, hovering anywhere in the top
  150 logical px of content reveals three dots at the top center. Only their 90
  by 14 logical-pixel rectangle is a native drag target. Reveal/hide changes no
  layout or PTY size; the remaining hover region does not intercept selection,
  tab interaction, or terminal mouse input. Local Image Preview suppresses this
  handle while active. No cursor positions or terminal contents become logs.
- Native fullscreen suppresses app-controlled title chrome and the hover handle
  without changing the window's chosen visibility. Leaving fullscreen restores
  that choice. Configured padding and macOS system safe area remain unchanged;
  transient system chrome may overlay content without hover-driven padding or
  PTY resizing. Entry and exit refit the selected existing Surface and PTY,
  while other windows and hidden Surfaces remain unchanged.
- In Linux and Windows Terminal Windows, pressing and releasing Alt alone opens
  the current native application menu as a popup. It retains the installed
  menu's hierarchy, actions and effective shortcuts, including after
  configuration reload. Its top-left anchor is 8 logical px from the content's
  left edge and 8 px below the visible 34 px title row (`x=8, y=42`), or
  `x=8, y=8` with the title hidden or in fullscreen. The native OS menu owns
  styling, keyboard navigation and dismissal; no DOM menu or native menu bar is
  added to the frameless window. Opening or dismissing it preserves the selected
  tab, window, Surface and PTY. Alt combinations, AltGr, repeats, intervening
  input and focus loss do not open it. Local Image Preview suppresses opening
  without stealing focus. This is fixed Window Chrome behavior, not a
  configurable shortcut; macOS's native menu and Option input are unchanged. The
  selected Terminal Theme fills app-controlled content, including title chrome
  and configured padding, not the native popup.
- `Window -> Always on Top` toggles only the selected window at the ordinary
  native floating level. New windows use the configured default.
- The application menu's `About OMXTerm` entry opens one compact in-window
  dialog on every Supported Platform. It shows the application icon, name,
  running version and copyright, and links to the project, contributors,
  issue tracker and MIT license. Developer lists live in the repository's
  `CONTRIBUTORS.md`, not in the dialog; legal notices remain in the distribution.
  Main supplies runtime metadata and opens only fixed named destinations after
  validating the owning renderer's main frame. Opening About makes no network
  request. Existing Linux/Windows native metadata setup and macOS bundle metadata
  remain intact; the displayed icon is the same canonical asset bundled locally
  for both development and packaged rendering.
- About can be opened using native menu keyboard navigation. Close or Escape
  dismisses it and focuses the live selected Terminal Tab. A closing Escape or
  Enter-on-Close gesture remains owned by About through held repeats and release,
  including Kitty event reporting; the next fresh terminal press is not consumed.
  Window blur and owner disposal clear outstanding gesture ownership. Space keeps
  the button's native release-time activation. Repeated opening,
  including during metadata loading, focuses the same dialog. Returning from
  the browser does not steal its focus. Owner disposal removes it without
  restoring terminal focus; late metadata and link errors cannot reopen it.
  About and Local Image Preview do not stack: opening either while the other
  is choosing/loading/showing is ignored. While About is active, terminal
  clipboard, file-drop, zoom, snippet, tab/title-bar and tab-navigation/new-tab
  actions are suppressed; output, configuration updates and approved tab/session/
  window closure or Quit remain active. About does not add a configurable
  shortcut, settings service or persistent state.
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
  overlay, releases its renderer Blob source synchronously, and returns focus to
  the live selected Terminal Tab. Picker cancellation returns terminal focus
  without an error. The picker and visible local-image sources share the bounded
  read and overlay contract below. While choosing, loading, or displaying a
  preview, terminal clipboard actions, file drops, font zoom, tab bar toggles,
  snippet toggles, title-bar toggles and snippet injection are ignored; page
  activation does not steal preview focus. The hover drag handle is suppressed.
  Dismissal restores ordinary routing. Already accepted terminal input is not
  rolled back, and confirmed tab/session/window closure remains active.
- Dropping one or more native file-manager files or folders anywhere in a
  Terminal Window without an active Local Image Preview inserts their absolute
  paths into only the selected Terminal Tab. The paths retain platform order,
  are separated by one space, and are delivered through Protected Paste without
  sending Enter. Drag navigation is prevented over the whole renderer document.
  Internal tab dragging only reorders tabs and never inserts a path; any other
  drop with no native files has no terminal side effect.
- `View -> Reload User Configuration` defaults to `Cmd+Shift+,` on macOS and
  `Ctrl+Shift+,` on Linux and Windows. It manually rereads and validates the
  complete configuration. Successful application updates font-size baseline,
  padding, scrollback, ligatures, Option Key Mode, theme, transparency and blur
  in place, plus close confirmation, logging, menu and keybind delivery. It
  updates Always-on-Top, title-bar and tab-bar defaults for new windows and, on
  Windows, shell selection for new Default Shell sessions. Existing windows keep
  their visibility choices, Always-on-Top state and Window Font Zoom delta;
  Actual Size returns to the latest baseline. Font family and line height remain
  creation-time settings. Reload is not transactional across consumers; failure
  and pending-font limitations are described under
  [configuration and local state](#configuration-and-local-state).
- `View -> Toggle Tab Bar` (default `Cmd+Shift+B` on macOS and `Ctrl+Shift+B` on
  Linux and Windows, remappable as `toggleTabBar`) changes only the selected
  window's tab bar enabled flag, even with one tab; without a selected window it
  does nothing. Disabling removes the entire strip row, refits the selected
  existing Surface and PTY, and restores terminal focus. Hidden Surfaces retain
  their valid geometry and continue ingesting output. Toggling preserves tab
  identities, order, selection, titles and sessions; keyboard and native Window
  menu navigation remain available while hidden. Title/BEL updates, tab
  creation, selection and closure never reveal a disabled strip. Enabling
  reveals the same live tabs when at least two remain. The flag survives
  configuration reload but is never persisted or shared: new windows and
  application restarts use `window.showTabBar`, whose default is enabled. Local
  Image Preview choosing/loading/showing suppresses the action without changing
  the flag or focus. Title-bar visibility and fullscreen remain independent.
- `View -> Toggle Snippets` (default `Cmd+Shift+S` on macOS and `Ctrl+Shift+S`
  on Linux and Windows, remappable through `keybinds`) shows or hides the
  selected window's Snippets Sidebar beside its Terminal Surface. The sidebar
  lists the snippets from `snippets.yaml`, filters them by name and description
  as the user types, and a click injects the snippet into the selected tab's
  Live Terminal Session and returns focus to the terminal. Opening the sidebar
  rereads the file; there is no file watching. The sidebar does not suspend
  terminal input, but its fixed width can crowd out the visible grid in a narrow
  window.
- BEL is silent. A bell prepends a marker to the ringing session's title —
  visible on its tab and, while that tab is selected, in the window title — and
  an unfocused window requests native platform attention once until the user
  focuses or interacts with it: an informational Dock bounce on macOS, or
  per-window attention on Linux and Windows. Focus, terminal interaction, or
  window disposal cancels the outstanding native request. Native desktop policy
  determines how attention is presented; BEL remains silent.

Closing a tab or window ends its sessions. Persistent and reconnectable sessions
remain the responsibility of a session manager such as tmux.

## Terminal behavior

The Restty Terminal Surface uses the existing Terminal Tabs, session Adapter and
real PTY lifecycle for ordinary Unicode input/output, grid resize, focus,
Default Shell and explicit-command startup, shell exit, tab close and
renderer-loss cleanup. It requires the bundled Terminal Font Stack TTFs, Ghostty
core and an actual WebGL2 backend before a PTY starts. Initialization failure
releases partial resources and starts no shell. Closing an initializing Surface
is cancellation, not a rendering failure: font, runtime and session-start
continuations cannot notify a removed owner or start a session after
cancellation. An already accepted session start is closed exactly once through
its Adapter. Late callbacks are inert; pending acquisitions settle before their
partial resources and font leases are released. Genuine failures of a live owner
remain visible. WebGL context loss shows a persistent failure and disposes only
the owning Surface/session without core recreation. Main retains a fixed
actionable native failure dialog until acknowledgement, including when the
failed session was the window's last one. Restty applies the selected Terminal
Theme, configured font size, programming ligature setting, per-side padding and
Window Font Zoom through its runtime and existing host geometry. It resolves an
exact configured installed family through the Electron main process and gives
Restty only bounded bytes for that validated active family, followed by the
licensed bundled FiraCode regular/bold, DejaVu Sans Mono regular/bold and
JetBrainsMono Nerd Font Mono faces, then representative locally installed
operating-system fallback faces. When a family is explicitly configured, the
bundled bold faces are omitted: the configured family keeps precedence for
regular, bold, italic and bold-italic text. Main loads available real style
faces from that same installed family, validates their identity and style, and
selects exact faces in font collections. Exact native legacy and typographic
family names are accepted when recorded in the selected face's metadata;
matching remains case-sensitive, without fuzzy names or family substitution.
Missing styles use Restty's synthesis: bold-italic may use a same-family bold or
italic face for its available trait; regular, bold-only and italic-only text
never acquire an unrequested trait. Synthetic bold expands monochrome strokes in
both horizontal and vertical directions within the available cell space,
including over a real italic face. Additional ink stays inside the cell without
removing any pre-existing italic overhang. It does not change cell layout,
requested ANSI colors, real bold faces, color emoji, or regular and italic-only
text; exact pixel parity with native outline rasterizers is not promised.
Missing glyphs still use the regular fallback faces. Non-default variable-font
instances are not materialized; when a native style needs those axes, it remains
unavailable and synthesis applies without rejecting the usable regular family.
Style faces share native source bytes and parsed resources across compatible
tabs; faces in one collection share its backing buffer. Apple Color Emoji
collections use memory-only shaping inputs that omit the unused `sbix` bitmap
table while retaining every face and other table. Main skips that payload with
bounded positional reads before validation and IPC; native Canvas still uses the
unchanged installed font. Other fonts keep their existing input and fallback
semantics. This reduces font-byte costs, not a guaranteed total RSS or GPU
budget. Font reads use native platform facilities without shell interpolation.
Successful font responses contain bounded bytes and face metadata, not paths;
the bridge exposes no broad filesystem API, remote fallback or persistent byte
cache. A current error-path limitation can expose a native font path in an IPC
rejection when an on-demand read fails after validation. It does not grant
arbitrary filesystem access. A Restty Surface applies its configured family and
line height when it is created; a surviving Restty Surface keeps both after User
Configuration Reload, while theme, font size, programming ligatures and padding
update it in place and refit the same PTY. New Surfaces use the latest values,
so restarting applies them everywhere. Pending font acquisition has the reload
limitation described under
[configuration and local state](#configuration-and-local-state). Changing
programming ligatures preserves source text, selection and copy results,
terminal cells and cursor positions, and the existing Surface, font generation,
Live Terminal Session and PTY. Restty explicit copy/paste, selection,
context-menu actions, Protected Paste, snippets/path injection and write-only
OSC 52 follow the shared contract below. Its DOM paste source is intercepted
synchronously only to enter OMXTerm's asynchronous policy and delivery path;
ordinary key input remains direct. Semantic paste and injection requests retain
request order, recheck the current bracketed-paste mode and Surface lifetime
after asynchronous decisions, and stop future chunks if their owning Surface
closes. Bytes already sent before closure cannot be recalled, and a submitting
snippet never appends Enter after closure. Restty delivers Ghostty's parsed OSC
0/2 title and BEL events through the same existing per-session host callbacks.
It does not scan Terminal Payload or add a second parser: title sanitization,
fallback, ownership, silent bell marker, focus/interaction reset and platform
attention remain existing host policy. OSC BEL terminators and cancelled or
malformed controls produce no extra title or bell event, and title-report
queries receive no reply. Restty applies Option Key Mode live: `none` preserves
macOS native Unicode and composition input, while `left`, `right`, and `both`
turn only the configured physical Option key into terminal Alt input. Native
dead-key literals completed with Space retain the keyboard layout's text,
including on X11 paths that emit `insertText` without composition events. They
produce neither a substituted ASCII space nor a duplicate keyboard-protocol
release. Ordinary Space input and configured terminal modifiers retain their
existing encoding. Restty image rendering and scrollback follow the shared
contracts below through the pinned Ghostty core. Bar cursors remain visible
inside their addressed cell at the first column, independently of terminal
padding or font family; block/underline styles and focus/blink behavior remain
unchanged. Native rasterization can differ across Supported Platforms and GPUs;
pixel-identical glyph output is not claimed.

PTY output crosses the shared Adapter/IPC route in order. Each output message
carries a cumulative UTF-8 byte position, and only the owning renderer main
frame may acknowledge forward progress for its own Live Terminal Session. An ACK
means that the complete message was synchronously submitted to the selected
Terminal Surface; it does not mean that pixels were rendered or that a parser,
image decoder, browser, GPU, or core allocation was released. Duplicate, stale,
unknown-session, foreign-session and beyond-sent ACKs have no flow-control
effect. Main pauses the owned PTY at 65,536 pending bytes and resumes it at or
below 16,384; because a native read already in progress crosses the threshold,
the observable pending maximum is bounded by the pause threshold plus the
largest crossing native read rather than exactly 65,536 bytes. Renderer loss,
send failure, tab disposal and window disposal terminate only the affected owned
session; cleanup resumes an owned paused stream before termination so it cannot
remain an immortal paused process or send into a dead owner. On Unix, the pinned
node-pty close guard defers its socket-destroy timeout while that stream is
paused so a final readable tail is not discarded. This adaptation does not
change the separate ConPTY implementation.

Restty's pinned OutputFilter retains at most 10,000,000 UTF-16 code units of an
unfinished OSC or CSI control body. For OSC, the body is the handler payload
after a short numeric command and separator when present; otherwise it begins
after the OSC introducer. For CSI, it begins after the CSI introducer and
excludes the final byte. A control that exceeds the budget is consumed as one
rejected control until its terminator or cancellation: BEL, ST, CAN or SUB for
OSC, and a CSI final byte, CAN or SUB for CSI. It produces no partial clipboard,
title, reply, mode or other control side effect, releases retained text, and
allows following ordinary output to continue. Controls at the budget remain
accepted, including the largest valid OSC 52 write. This is not a limit on
ordinary terminal text, copy, paste, input or complete output.

The pending IPC byte count, JavaScript heap and process RSS are separate
metadata domains. Ghostty core image/scrollback storage, transient decode
allocations, browser canvas/WebGL resources and GPU memory remain separately
accounted or unmeasured. Neither flow control nor the scanner budget is a total
application-memory bound, and concurrent sessions multiply the independent
costs.

OMXTerm advertises `TERM=xterm-256color`, `COLORTERM=truecolor`,
`TERM_PROGRAM=OMXTerm`, and its installed version in `TERM_PROGRAM_VERSION`.
Restty answers DA1 as `CSI ? 1 ; 2 c` and DA2 as `CSI > 0 ; 0 ; 0 c` once per
query, and owns cursor-position and cell-size replies at its existing parsed
runtime seam rather than adding a second reply path. Cursor-position reports use
Restty's retained JavaScript cursor hint, which advances by UTF-16 code units
rather than tracking every Ghostty cursor change. Wide or combining text,
pending wrap and resize can produce inaccurate replies and misposition
applications that rely on them. It installs no custom terminfo and does not edit
or inject shell startup files. Inline-image support does not impersonate another
terminal or inject application-specific capability variables.

In a direct Live Terminal Session, the Terminal Surface renders two bounded
static-image paths through the Kitty graphics protocol. The Pi-compatible path
targets the subset emitted by Pi 0.84.4: direct transmit-and-display (`a=T`,
`f=100`, `q=2`), optional cell columns and rows, image ID and cursor movement,
4,096-character Base64 chunks joined with `m=1` and `m=0`, and image-ID (`d=I`),
all-image (`d=A`), and all-placement (`d=a`) deletion. The Chafa-compatible path
is the output emitted by Chafa 1.18.2 with `-f kitty`: one anonymous,
semicolon-less metadata prelude using direct transmission (`t=d` or the
default), `a=T`, `f=32`, positive source width and height (`s` and `v`),
positive cell columns and rows (`c` and `r`), `m=1`, and `q=2`, followed by
anonymous Base64 payload chunks using `m=1` and a final standalone `m=0` APC
with no semicolon or payload (completion on the last data-bearing chunk also
remains accepted). It accepts only uncompressed RGBA with exactly four decoded
bytes per source pixel.

`CSI 16 t` receives the terminal cell-size response after the Surface opens.
Images stay cell-anchored through direct-session scrolling, Terminal Window
resizing, Window Font Zoom, tab selection, and valid User Configuration Reload,
subject to the pinned Ghostty core's placement and scrollback retention. Width
reflow clips a blank-cell anchor to the available destination columns without
borrowing a preceding hard row's column offset. Genuine wrapped text and
viewport scrolling may change an image's visible cell coordinates. Terminal
reset, tab disposal, and leaving the alternate buffer release the applicable
image resources.

The Restty Surface uses the pinned Ghostty core as its Kitty parser, decoder,
image store and placement authority; OMXTerm does not add a second parser. A
direct transmission may contain at most 33,554,432 decoded input bytes, and
positive source dimensions may contain at most 4,194,304 pixels before PNG or
raw-RGBA decode can allocate the completed image. Chafa RGBA must have exactly
four bytes per source pixel, so it contains at most 16,777,216 bytes. Invalid
Base64, malformed or cancelled APC, invalid dimensions, decoded length mismatch,
decode failure, or an exceeded limit renders nothing, clears unfinished state,
and does not block later terminal output.

Restty retains at most one unfinished Kitty image per screen, matching the
native Ghostty pending-image model. A new metadata-bearing transmission replaces
that unfinished image, including Chafa's anonymous semicolon-less prelude;
completion, reset, alternate-buffer exit, and Surface disposal release it. Each
screen stores at most 64,000,000 bytes of completed decoded image data and uses
Ghostty's native eviction behavior. Deletion by Pi image ID, all-image deletion,
all-placement deletion and reset release their corresponding native resources.
Hidden deletion, reset, alternate-buffer exit and disposal also release
applicable cached renderer resources without requiring a visible draw. Valid
core images and placements survive hiding and render again on reveal; disposable
renderer copies may be discarded while hidden.

These controls are not a total process-memory limit. Base64 decoding and PNG
decoding have transient allocations; Restty's JavaScript/WebGL renderer may copy
visible decoded RGBA into browser and GPU resources outside core storage
accounting; concurrent tabs multiply those costs. Pi's default 2,000-by-2,000
autoresized PNG pipeline is the compatibility target; images produced with
autoresize disabled have no finite compatibility promise.

SIXEL, iTerm2 Inline Image Protocol, raw RGB (`f=24`), compressed raw pixels
(`o=z`), placement IDs, animation, remote or filesystem image sources inside
Kitty Terminal Payload, downloads, persistence, and image behavior through
`tmux`, `screen`, or another multiplexer are unsupported. The separately
activated Local Image Preview below is not an Inline Terminal Image or Kitty
filesystem source. Other Kitty and Chafa paths exposed by the pinned Ghostty
core are unclaimed. For Pi versions that do not recognize
`TERM_PROGRAM=OMXTerm`, select Kitty explicitly; OMXTerm does not configure Pi.
Image bytes remain opaque, memory-only Terminal Payload on the existing PTY
output path: they introduce no main-process, preload, IPC, Adapter, clipboard,
filesystem, logging, or application-network capability.

Scrollback is memory-only and per Live Terminal Session. `scrollback.lines`
defaults to 10,000, accepts 0 through 100,000, and rejects larger values rather
than clamping them. Restty treats a positive value as an approximate maximum of
physical history rows, excluding the active screen: Ghostty evicts only whole
historical pages, so retention may exceed the requested target by one minimum
boundary page and remains bounded. Restty also enforces its independent
10,000,000-byte core ceiling for positive history, which may retain fewer rows
than requested; OMXTerm never estimates bytes per line. Zero disables history.
Restty uses Ghostty's no-history path, immediately drops retained history,
retains none through sustained output or resize, and can retain only new output
after a later positive reload. Valid live changes keep the same Surface, core,
Live Terminal Session and PTY and preserve coherent reflow, alternate-screen,
selection and viewport state. Resize preserves pending soft-wrap insertion
positions and distinguishes retained history, active wrapping and producer hard
breaks in selection and copy. Each Surface is independent. Accepted keyboard
input and delivered paste, snippet, or path input return the viewport to the
live cursor. Output alone, protocol replies, focus, selection, and cancelled
paste do not force the viewport to the bottom. The scrollback scrollbar shows a
thumb only while scrollback extends beyond the visible screen; an empty
scrollbar track paints nothing on any platform. Desktops with a fine pointer
retain native scrolling even when touch capability is also present; touch-only
devices keep the existing touch scrolling path.

OSC 0 and OSC 2 titles are display-only and per session: the raw OSC request
must be no longer than 256 code points, then control and bidi characters are
removed and the result must be one printable line. A tab shows its session's
accepted title and falls back to the basename of the shell selected when that
session started. Startup reconciles the current main-owned title once the tab's
session identity is known, including when the initial fallback arrived before
the start response. It neither overwrites a newer accepted title nor retargets a
cancelled tab; unknown titles are not retained for future tabs. The native
window title mirrors the selected tab and falls back to `OMXTerm`. Title
contents are never logged or reported to the PTY.

Only literal visible lowercase `http:`, `https:`, and absolute authority-free
`file:///` URLs are links. Visible native path references are separate Local
Image Preview destinations. Absolute POSIX paths begin with one `/`; Windows
paths are drive-qualified with a letter, colon, and slash or backslash. `~` and
`~/...` name the local OMXTerm user's home, including inside matching quotes.
Relative references begin `./` or `../` (backslash separators also work on
Windows), or have a relative image name ending `.png`, `.jpg`, `.jpeg` or
`.webp` (case-insensitive). Recognition is not format support. While the pointer
is over a recognized destination, holding that same platform modifier
transiently underlines its complete visible span. Pointer movement and modifier
press or release update the cue without activation; output, scrolling, geometry
changes, focus loss, tab hiding, and preview or Surface lifecycle changes remove
stale cues. Recognition alone performs no file read, image decode, network
access, IPC opening request, or Terminal Payload logging. `Cmd+click` on macOS
or `Ctrl+click` on Linux and Windows explicitly activates a recognized
destination. For HTTP(S), the Electron main process parses and validates the
exact URL before asking the operating system to open it. The valid modified
primary click takes precedence over application mouse reporting and is consumed
without a duplicate PTY mouse report; other gestures retain ordinary selection
or application-mouse routing. Restty reconstructs a destination only across
core-proven, fully visible soft wraps. It preserves hard breaks and cell
coordinates for grapheme and wide-cell prefixes, and conservatively refuses a
destination that may continue beyond the visible viewport. A known mismatch
between wide-wrap spacer cells and core selection text can prevent visible URL
recognition at some Unicode wrap boundaries
([#593](https://github.com/luizomf/omxterm/issues/593)). Restty enables
Ghostty's grapheme-cluster mode by default so emoji-presentation and ZWJ
clusters occupy one two-column terminal cell for rendering and selection. For
`file:///`, main independently requires the literal lowercase scheme, no remote
or `localhost` authority, no query or fragment, and a platform-absolute local
path. Exact native paths remain a distinct typed source; visible references
requiring interpretation use a separate bounded source validated independently
in main. `%` and `#` remain literal filename characters. References begin at a
line boundary or after whitespace, as a complete non-whitespace token or a path
inside one pair of matching single/double quotes (allowing spaces). An unquoted
absolute path containing ASCII spaces is also recognized when it occupies the
complete logical line, begins at its first character, and ends in `.png`, `.jpg`
or `.jpeg` (case-insensitive), optionally with a positive location suffix. This
conservative whole-line cue excludes tabs, trailing spaces, an earlier
image-extension token followed by spaces, and a space-separated new absolute,
home (including bare `~`), dot-relative, quoted or HTTP(S)/`file:///` reference.
It does not infer boundaries inside prose or between same-line references; those
use token/quoted recognition. Only core-proven fully visible soft wraps form a
logical line, including literal spaces at a physical row end; producer hard
breaks never join. Quotes do not evaluate shell syntax or escapes. Brackets,
assignments and trailing punctuation are not trimmed. Ambiguous forms may use
the native picker instead.

A positive `:line` or `:line:column` outside closing quotes is decoration; a
suffix inside quotes is part of the literal filename. An unquoted suffix first
names the exact file and falls back to the unsuffixed target only on ENOENT,
never on permission, format or decode failure. Exact native sources, picker
selections and file URLs have no suffix interpretation. Main checks platform
locality before reads; UNC/device, drive-relative and Windows root-relative
paths are rejected. Relative activation opens a native directory picker starting
at the local user's home; only the explicit selection supplies the base.
Cancellation is inert. Every activation asks anew; no base preference or cwd is
retained. Normal `..` resolution is allowed, not a filesystem sandbox. Home and
absolute references need no base picker. Resolved paths must pass the same local
absolute validation and source-length bound. No source opens an operating-system
URL handler: after activation only, main reads the target through a non-shell
regular-file boundary. On macOS and Linux, that read rejects a symlink in the
final path component. The content must be a structurally valid, natively
decodable static PNG or JPEG of at most 64 MiB encoded, 8192 pixels per side,
and 32 million pixels (inclusive). APNG and every other animated or unsupported
format are rejected regardless of extension. The same Terminal Window permits at
most one picker or activated-source read at a time; owner closure makes late
picker, read, and decode results inert. Both picker and URL paths must be local
absolute paths before any read; Windows paths must include a drive, and
UNC/device paths are rejected even from the native picker.

The renderer receives only bounded validated name, dimensions, media type, and
bytes, creates a memory-only Blob URL under the production CSP, and
synchronously removes the image source and revokes that URL on dismissal,
replacement failure, page teardown, or owner close. It never receives an
arbitrary filesystem API or path. These input bounds are not a total
process-memory budget: native validation, IPC, browser decode and GPU resources
can add transient copies. Dismissal releases application ownership, not a
promise of immediate RSS or native/GPU reclamation. The preview fits the
complete image proportionally within the overlay's content area, including after
window resizing, without clipping or stretching it. Failed reads, PNG/JPEG
validation failures (including APNG rejection) and decode failures show a fixed
non-path load error. Unrecognized formats such as WebP have a separate fixed
non-path format message, regardless of extension or successful path recognition.
OMXTerm never reads on output or hover, infers a relative base, performs shell
expansion, consults shell/agent cwd, fetches or transfers a remote image, accepts
UNC/file authorities, treats OSC 8 metadata as a local source, logs image paths
or payload, writes/downloads image data, or persists the preview. A clicked path
always addresses the machine running OMXTerm regardless of where its text originated.

Application mouse modes own buttons, motion, and wheel reporting in normal and
alternate screens; Shift retains the selection override, and explicit copy and
valid modified-link gestures — web or local image — do not produce duplicate PTY
mouse input. OSC 8 destinations and all other schemes are ignored.

Scrollback Search opens only through **Edit → Find…** or the `find` keybind
(`Cmd+F` on macOS, `Ctrl+Shift+F` on Linux and Windows). It uses Restty's
search bar and the pinned core's search over the selected tab's retained
Scrollback Buffer and visible screen; output evicted by the scrollback limits
is not searchable. Opening the bar focuses its query field, and invoking Find
again focuses and selects the query. Keys act on the bar only while its query
field holds focus: `Enter` or the down button selects the next match below
(newer output), `Shift+Enter` or the up button the previous match above (older
output), and `Escape` or the close button closes the bar and returns focus to
the terminal. The bar owns the whole Escape gesture that closes it: its held
repeats and its release never reach the terminal, including under Kitty
keyboard event reporting. An open bar never captures keys while the terminal
holds focus;
`Enter`, `Shift+Enter` and `Escape` then remain ordinary terminal input. Window
focus returns to the query field only when it held focus before. While the
field holds focus, application Copy, Paste and Select All, from the menu, a
keybind or the context menu, act on the query instead of the terminal: Paste
inserts clipboard text at the field's selection with line breaks replaced by
spaces, and nothing reaches Protected Paste or the PTY. The bar, including its
match counter, follows the active Terminal Theme. Each tab owns its own query.
Search state, the query and its matches, stays in renderer memory and is never
persisted, logged or written to the PTY, and searching never sends it to main.
Only an explicit Copy from the focused field moves the selected query text,
through the same main-owned clipboard IPC as any other Copy. Find is ignored
while a Local Image Preview or About owns modal input.

Explicit Export is offered from the terminal context menu. With selected text
the menu shows **Export Selection…**, otherwise **Export Terminal Content…**;
the label is fixed when the menu opens, and the saved text matches it. Selection
export saves the selected text. Content export saves the selected tab's retained
Scrollback Buffer and visible screen, or only the alternate screen while it is
active, read through the prepared runtime without creating, changing or
clearing a selection. The renderer reads the text when the request arrives,
before any dialog, so switching tabs cannot substitute another tab's content.
Main validates the request, a kind plus at most 16 MiB of UTF-8 text (above what
the core retains for one screen), and owns a native save dialog that suggests
`omxterm-selection-…` or `omxterm-terminal-…` with a local timestamp in the
Documents folder and uses the platform's overwrite confirmation. Cancelling
writes nothing. The file is UTF-8 with LF line breaks: the core trims each row's
trailing padding, trailing blank rows are dropped, and the file ends with
exactly one line break. On macOS and Linux a newly created file is readable
only by its owner. Whitespace-only content shows a notice instead of a dialog,
and a failed write shows an error with the operating-system reason. Export is
never automatic or continuous, and neither the text nor the destination enters
operational logs.

## Clipboard

- Selection never copies automatically.
- `Ctrl+C` and `Ctrl+V` remain PTY input.
- `Cmd+C` and `Cmd+V` on macOS, `Ctrl+Shift+C` and `Ctrl+Shift+V` on Linux and
  Windows, and the native context menu perform explicit text copy and paste. Any
  non-empty plain text, including whitespace-only text, is pasted unchanged and
  takes priority over every file-list representation. When text is empty and the
  clipboard exposes a supported native file-manager file list, Paste inserts its
  paths in the same form as a file drop. Plain-text URLs and non-file URI-list
  entries are never inferred to be paths. Electron 43 exposes only one Explorer
  `FileNameW` path through its public Windows clipboard API, so Windows
  clipboard Paste inserts that one path; dropping several Windows files remains
  complete and ordered.
- Inserted paths are lexical platform-absolute values only: OMXTerm never reads,
  resolves, normalizes, or checks the target. A malformed, empty, over-bound, or
  mixed list inserts nothing. A list accepts at most 256 paths, each at most
  32,768 UTF-16 code units, with at most 1,048,576 code units in the decoded
  source or formatted result; a serialized native UTF-8 source above 1,048,576
  bytes is rejected before decoding.
- On macOS and Linux, each path is an independently single-quoted POSIX shell
  token, with an apostrophe represented by closing the quote, a backslash-escaped
  apostrophe, and reopening it. On Windows, each path is an independently
  single-quoted Windows PowerShell 5.1 token; U+0027 and U+2018 through U+201B
  are doubled. Tokens are separated by one ASCII space. This encoding is fixed
  by platform, not by `windowsShell`, and assumes insertion at a fresh ordinary
  argument-token boundary in the corresponding shell. Without Shell Integration,
  OMXTerm cannot promise correct syntax in another shell, a partial quote, SSH
  session, REPL, or TUI.
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

This section describes the current configuration boundary. The
[User Configuration guide](configuration.md) provides examples, field reference,
theme conversion guidance, and troubleshooting.

OMXTerm reads an optional configuration from
`$XDG_CONFIG_HOME/omxterm/config.json`, falling back to
`.config/omxterm/config.json` beneath the operating-system account's home
directory when `XDG_CONFIG_HOME` is unset or empty. This XDG-style resolution
applies on every Supported Platform, including Windows (ADR 0002). At application
startup, an existing `config.json` filesystem entry (including an invalid file,
directory, or dangling symlink) skips the entire initial kit without inspecting
snippets or themes. Otherwise, OMXTerm creates the directory, `config.json` with
common built-in defaults (including explicit `window.blur: false` and
`window.transparency: 0`) and `theme.path` set to `themes/omtheme.json`, one
non-executing literal-block example in `snippets.yaml`, and a copy of the bundled
theme at `themes/omtheme.json`. Existing sibling files are never replaced. Files are
published complete without overwriting concurrent creations; configuration is
published last. Shell, font family and shortcuts retain their implicit platform
defaults. Creation failure produces a non-blocking notice and normal
configuration loading continues. This runs at application opening, not package
installation or manual reload. The copied theme belongs to the user and does not
track subsequent bundled palette changes. A present file must contain
`"version": 1` and only supported keys:

- `confirmClose`;
- `logLevel`;
- `windowsShell`;
- `font.family`, `font.size`, `font.lineHeight`, and `font.ligatures`;
- `terminal.padding.top`, `terminal.padding.right`, `terminal.padding.bottom`,
  and `terminal.padding.left`;
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
color. Bundled DejaVu Sans Mono regular/bold and JetBrainsMono Nerd Font Mono
follow it for coverage before available operating-system emoji, CJK, and symbol
faces. `font.size` accepts only integral pixel sizes from 8 through 72
inclusive. `font.lineHeight` is an independent row-height multiplier from 1.0
through 2.0 inclusive, accepts fractional values, does not change glyph size,
and defaults to 1.0. Terminal padding uses explicit per-side integer CSS pixels
from 0 through 128 inclusive and defaults to top 0, right 8, bottom 8, and
left 8. User top padding is added below the 30 px native title inset on macOS
when that title area is visible, or below the 34 px app-drawn title row on Linux
and Windows. Hiding the title area or entering fullscreen removes only the
app-owned title space, without changing configured padding or the macOS system
safe area. `logLevel` defaults to `info`, `keyboard.optionAsAlt` to `none`, and
`window.alwaysOnTop` to `false`.

`window.showTitleBar` and `window.showTabBar` accept only booleans and default
to `true`. They choose initial visibility for newly created windows. A
successful reload updates these defaults for future windows, not existing
windows' choices; menu/keybind toggles never rewrite the document. An enabled
tab bar still needs two or more tabs to become visible.

`window.blur` accepts only a boolean and defaults to `false`.
`window.transparency` accepts only a finite number from 0 through 1, including
fractions, and defaults to 0. Wrong types, unknown keys and out-of-range values
are rejected, never clamped. Both settings apply on valid manual reload to all
current and future windows/tabs without replacing native windows, Terminal
Surfaces or Live Terminal Sessions in the successful application path. Reloads
rejected before application keep the last snapshot; application-time failures
have the partial-update limitation described below.

Zero preserves the opaque appearance. Increasing transparency reduces only the
OMXTerm background tint, painted once behind terminal content, padding, title
chrome, tabs and the Snippets Sidebar. One removes that tint completely where
native composition supports it; the Windows fallback below remains opaque.
Chrome neutral overlays also fade; foreground controls and the selected-tab
indicator remain visible. Glyphs (including their normal antialiasing and SGR
faint), cursor, selection and Inline Terminal Images are not faded with the
window. Implicit default cell backgrounds, including SGR 49, expose the shared
tint. Explicit ANSI palette and RGB backgrounds remain opaque **even when their
RGB equals the theme background**, including background-color erase and
alternate screens. Inverse text uses opaque background-color ink and the
foreground color as its opaque cell background. Consequently a TUI that
explicitly fills its screen may remain opaque; OMXTerm does not guess which
colors the application intended to make transparent. Theme colors remain strict
`#RRGGBB`.

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
blur. Private API availability and visual behavior can change with macOS. The
OS/compositor may ignore the request or retain its own material tint even at
transparency 1. Missing helpers or native API errors are quiet fallbacks, never
launch prerequisites.

Windows keeps normal nontransparent native-window construction to preserve
native resize, maximize/restore, fullscreen, corners and shadow. On Windows,
positive transparency without blur is accepted but renders the opaque Terminal
Theme; `blur: true` can reveal the requested tint through Acrylic on Windows 11
22H2 or later. Earlier/unknown versions and material-call failures keep an
opaque theme fallback, including after live theme changes. Main publishes
effective transparency zero for that window's fallback while retaining the
complete requested User Configuration unchanged. Successful calls do not prove
visually active Acrylic; OS policy may still make it opaque. Native Wayland blur
is not claimed. OMXTerm makes no global compositor, accessibility or extension
changes. Unsupported composition may leave an opaque usable terminal. Native API
success is not proof of visible blur, and cross-platform pixel parity is not
promised. There is no blur strength, material selector, extra menu, whole-window
opacity, CSS backdrop filter or screen capture.
[ADR 0029](adr/0029-compose-background-effects-with-explicit-cell-identity.md)
describes paint ownership;
[ADR 0030](adr/0030-prefer-direct-macos-background-blur.md) describes macOS blur
lifetime and private-API tradeoffs.

`windowsShell` is an optional non-empty string without NUL on every Supported
Platform. On Windows it must be an absolute Windows filesystem path whose final
target, followed through links or reparse points, is an existing regular file;
an inspection failure is invalid. The validated path is used as written for each
future Default Shell session and is passed directly to the PTY with an empty
argument vector. OMXTerm does not expand it, identify the shell, check ACL
readability or executability, preflight a spawn, add arguments, use a wrapper,
or construct a command string. On macOS and Linux the key is accepted without
filesystem access or warning but has no effect on operating-system shell
selection.

An optional `keybinds` object remaps application-chrome shortcuts for a fixed
action vocabulary: `quit`, `copy`, `paste`, `selectAll`, `find`, `newWindow`,
`closeWindow`, `newTab`, `closeTab`, `nextTab`, `previousTab`, `selectTab1`
through `selectTab9`, `zoomIn`, `zoomOut`, `actualSize`, `toggleFullScreen`,
`toggleSnippets`, `toggleTabBar`, `toggleTitleBar`, and `reloadConfig`. Each
value is either `null` or a case-insensitive Electron accelerator containing
exactly one key and at least one non-Shift modifier; bare or Shift-only
accelerators are rejected so a keybind can never swallow plain typing. Function
keys `F1` through `F24` type nothing and are the only keys accepted bare or
with Shift alone. Omitted actions keep their built-in platform defaults. `null`
removes only that action's shortcut: the menu item stays available without an
accelerator, and OMXTerm no longer consumes that key for the action. It does not
guarantee delivery to the terminal; another binding or the operating system may
still consume the key. Linux and Windows default Find to `Ctrl+Shift+F` and
Toggle Full Screen to `F11`; macOS keeps `Cmd+F` and `Ctrl+Cmd+F`. The
application menu displays the effective accelerator
and is the single shortcut registration point; there is no second shortcut
system, and terminal control sequences inside the PTY are untouched. An
effective keybind works even when the platform refuses to fire its menu
accelerator (macOS never delivers `Control+Tab` to a menu item): the main
process invokes the same action from the key event itself, and a key that
triggered a keybind this way is consumed — it never reaches the terminal as
input. Unknown action names, malformed accelerators, and duplicate accelerators
are errors under the resilient failure contract below. Duplicates are judged on
the effective native map: `CommandOrControl` resolves to `Command` on macOS and
`Control` on Linux and Windows, while `Super` and `Meta` use Electron's Command
accelerator family. `AltGr` is distinct from `Alt`/`Option` and `Control+Alt`;
plain Alt never activates an AltGr-only binding. Delivery requires the native
AltGr identity, not an inference from Alt. Intrinsic Shift and native key
identity also count: `Control+!` duplicates `Control+Shift+1`, and
`Control+Plus` duplicates `Control+Shift+Plus` and `Control+Shift+=`. A remap
that collides with another action's remaining default is the same error as two
explicit entries colliding; OMXTerm never reassigns another action's shortcut.
The diagnostic names both actions and the key in a form derived from the parsed
accelerator, never the configured text, and offers both remedies: choose
another shortcut, or set one of the actions to `null`. A `null` entry holds no
shortcut and cannot collide. The main-process matcher uses this identity when the
logical shifted character and native key position agree; it does not translate
arbitrary keyboard layouts. Separately, application fallback preserves logical
keypad delivery (for example, keypad Minus for Zoom Out) and logical `Plus`
delivery. `Plus` without explicit Shift also accepts an unshifted logical `+`.
Logical keypad fallback follows the configured character and explicit Shift,
separately from intrinsic native Shift. A specific keypad binding takes
precedence over these conveniences; ordinary `Control+=` remains terminal input
unless explicitly remapped. This fallback does not create a second native
identity or permit duplicate registrations. A valid keybind that resolves, on
the current platform, to a bare `Ctrl+<key>` shadowing a PTY control key
(`Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`, `Ctrl+U`, `Ctrl+W`, `Ctrl+A`, `Ctrl+E`)
stays active but is warned about through the resilient failure surface below,
naming the action and the shadowed control key. The binding is never rejected or
dropped; the warning only informs, since `CommandOrControl` accelerators
authored on macOS become `Control` off macOS and can shadow these keys
unintentionally. Creating new actions, system-global shortcuts, chords or
sequences, and per-platform alternate maps are unsupported.

An optional user-owned `snippets.yaml` next to `config.json` defines the
Snippets Sidebar contents. The file is one UTF-8 YAML 1.2 core document parsed
with `yaml` v2, containing exactly `version: 1` and a `snippets` array of at
most 512 entries; each entry has a non-empty `name` (the searchable label, at most 128 UTF-16 code units), a
non-empty `body` (the text to inject, at most 65,536 UTF-16 code units), an
optional `description` (at most 512 UTF-16 code units), and an optional boolean
`execute` defaulting to `false`. Apart from initial kit creation, OMXTerm never
creates, rewrites, or migrates the file; absence is the clean empty state, and
the file is reread each time the sidebar opens. The old `snippets.json` filename
is not read or migrated. Configuration and themes remain JSON. Source reads are
bounded to 1 MiB plus one overflow-detection byte; over-limit files are rejected
before UTF-8 decoding. Before recursive YAML composition/conversion, an iterative
concrete-tree check enforces at most 16 collection levels (root is level 1) and
4,096 total mapping pairs and sequence entries, including mapping keys. Duplicate
keys, aliases, custom/non-core tags, non-scalar mapping keys, non-1.2 YAML versions,
and multiple documents are rejected. Literal blocks preserve YAML chomping:
`|-` strips trailing line breaks, `|` keeps one, and `|+` keeps all.
Injection uses the same Protected Paste path as a normal paste. With bracketed paste disabled, a
multiline or control-character body requires Protected Paste approval; after
approval, the body is delivered unchanged and may execute through its embedded
line breaks or control characters. With bracketed paste enabled, paste-aware
delivery bypasses the Protected Paste confirmation and sends the body as one
bracketed paste. `execute` controls only whether OMXTerm appends Enter after
body delivery: `false` appends nothing, while `true` sends Enter after the body
and any closing bracketed-paste marker — per-snippet opt-in only. An invalid
`snippets.yaml` never blocks startup and is never silent: the sidebar shows the
actionable problem, including the resolved path and schema field location or
syntax line/column coordinates, in place of the list, and the terminal is
unaffected. Parser excerpts and arbitrary parser messages are never displayed.
The Electron main process reads and validates the file and sends only validated, typed data over the
preload bridge. Snippet contents are user payload and are never logged.

An absent `theme` uses the bundled canonical [`omtheme`](omtheme.json). A
present `theme` must contain exactly one required `path`: a non-empty string
without a NUL character. Absolute paths are used as written; relative paths are
resolved from the directory containing `config.json`. OMXTerm does not expand
`~`, environment variables, shell syntax, or URLs. Symlinks are accepted only
when their final target is a readable regular file. The Electron main process
reads and resolves the selected path through the complete User Configuration
loading boundary and sends only validated, typed palette data — plus bounded
user-file notice state — through the existing configuration boundary.
`View -> Reload User Configuration` can therefore select a changed path after
validating the complete document.

A Terminal Theme is strict JSON containing exactly `version`, `name`, and
`colors`. Version must be `1`. The name is a non-empty printable single line of
at most 64 Unicode code points. `colors` contains exactly the foreground,
background, cursor, selection foreground and background, and all 16 normal and
bright ANSI fields shown in [`omtheme`](omtheme.json). Every color is an exact,
case-insensitive hexadecimal `#RRGGBB` value. Alpha colors, partial palettes,
CSS names, functions or variables, inheritance and imports are unsupported.
Transparency and blur are User Configuration window preferences, not theme
fields; the Terminal Theme schema has no opacity or tint setting.

Unknown keys include the empty string (`""`) at every configuration, theme and
snippet object boundary, regardless of property order. They are rejected rather
than ignored alongside otherwise valid settings or entries.

Invalid JSON or UTF-8, unknown or missing keys, unsupported versions, missing
configured fonts or theme files, invalid Windows shell paths or final targets,
non-regular theme targets, invalid theme fields or colors, non-finite or
out-of-range line heights, and non-integral or out-of-range padding values are
errors. An error never stops OMXTerm from opening: an invalid `config.json`
starts the application with the built-in defaults for every setting, and an
invalid or missing selected theme file starts it with the bundled `omtheme`
while keeping the rest of the validated configuration. The fallback target is
always the built-in defaults, never a cached or previous configuration. OMXTerm
reports the exact problem — including the configured or resolved path when
relevant — through stderr and a persistent in-app error surface that states
which defaults are active and never blocks typing into the Terminal Surface, so
the file can be fixed inside OMXTerm itself. Both files stay unchanged.
`View -> Reload User Configuration` performs one complete startup-equivalent
load, serialized in request order. After successful validation it replaces the
active application snapshot and notices, changes the log level, and applies
settings to consumers sequentially. On Windows its shell selection applies to
every subsequently created Default Shell session while existing sessions retain
the shell they started with. Absence successfully selects all defaults without
creating a file. A load or validation rejection before application keeps the
last configuration and replaces the non-blocking notice with the current
actionable failure. Application-time exceptions are different: there is no
rollback of the active snapshot, log level, or already-applied consumer effects.
Such a failure can leave new or partially applied settings even though the
rejection notice says the last valid configuration was kept. That notice is not
reliable evidence of rollback. A later successful reload replaces resolved
errors and stale warnings with notices from the current validation.
Configuration delivery sends complete snapshots, but does not make every
consumer update atomic. Font and spacing changes recompute native minimum-window
bounds and refit the same Surface and PTY, subject to the layout limitations
above. `font.family` and `font.lineHeight` are the complete restart-only set for
existing Terminal Surfaces; `font.ligatures` applies live. A valid reload
applies all live-safe settings and host preferences, keeps those two
creation-time values in every existing Terminal Surface, and shows a persistent
non-blocking notice naming each deferred setting and asking the user to restart
OMXTerm. New tabs and windows use the latest fully validated family and line
height. A deferred setting clears only when its requested value is already
active in every existing Terminal Surface, including one still initializing
before its PTY starts. Main retains that Surface's creation-time family and
line-height values rather than inferring them from the configuration current at
PTY startup. This bookkeeping is distinct from native font-byte acquisition:
changing the active family invalidates outstanding old-generation reads,
including an accepted request for a still-initializing Surface. It can fail that
tab instead of letting it finish with its original family. Repeating a reload
cannot erase a notice while an older Surface survives; removing that Surface
releases its font bookkeeping. Theme, configured font-size baseline, padding and
Window Font Zoom remain live and preserve the existing Surface and PTY. Invalid,
missing, unreadable, unsupported or corrupt configured font input rejects the
whole reload. Runtime scrollback reduction, including zero, uses the selected
Surface's in-memory core behavior described above; programming-ligature changes
use the existing Restty runtime setter without reloading fonts, and Option Key
Mode changes only subsequent keyboard events. OMXTerm never migrates, repairs,
rewrites, or silently ignores User Configuration. The same surface also carries
non-fatal warnings for a valid configuration that stays fully active — currently
a keybind shadowing a PTY control key — which inform without activating any
default.

Operational logs are JSONL under `$XDG_STATE_HOME/omxterm/logs`, falling back to
`~/.local/state/omxterm/logs`. Levels are `error`, `info`, and `debug`. Only the
current and previous files are retained, each capped at 5 MiB. Manual reload
records safe requested, succeeded, and rejected outcomes with bounded duration
and a normalized failure category, never paths, validation detail, configuration
contents, or Terminal Payload. Logs may describe OMXTerm lifecycle, validation,
IPC, PTY control, resize, duration, and failures; they must never contain PTY
input/output, clipboard data, environment contents, configuration contents,
executable names, command arguments, commands, titles, secrets, or transcripts.

The application performs no network requests: no analytics, telemetry, crash
reporting, update check, or remote log delivery. Child processes retain their
normal network access.

The optional Linux AppImage desktop installer accepts only a user-supplied,
previously verified local Linux ARM64 OMXTerm AppImage and performs no download,
release discovery, package-manager operation, elevation, system-wide change, or
update. It owns exactly `~/.local/opt/omxterm/OMXTerm.AppImage`,
`~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png`, and
`~/.local/share/applications/omxterm.desktop`. Install and update replace all
three files sequentially under rollback traps, not as one filesystem-atomic
operation. Invalid input leaves the previous installation unchanged; a failure
before all three replacements finish attempts restoration. If a filesystem error
prevents restoration, the rollback path retains each unrestored original in its
reported backup location, reports incomplete recovery, and preserves the initial
operation's failure status and diagnostics. That path never deletes an original
backup that failed restoration. After the third replacement, however, the helper
disables rollback traps before removing staging and backups. Cleanup failure can
then return a failing status with the new installation already committed and
some originals removed, without structured recovery reporting. A nonzero exit
therefore does not always mean the old installation survived. Before replacing
any file, install checks all three owned filenames and refuses existing
directories or other non-regular, non-symlink entries. Existing regular files
and symlinks (including dangling links or links to directories) are replaced as
entries, without modifying symlink referents. Uninstall likewise removes symlink
entries, not their referents. Uninstall removes only those files and preserves
unrelated files and parent directories. At installation time the helper tests
actual kernel FUSE mounting and writes one fixed desktop entry that either runs
the AppImage directly or adds `--appimage-extract-and-run`; launch time performs
no mode discovery. Mount discovery uses at most 50 observations spaced by 0.1 s.
The owned mount child receives TERM with 20 bounded observations, then KILL with
20 more if needed; it is reaped only after exit is observed. A shutdown timeout
fails installation even if escalation succeeds. Failure and handled interruption
also clean up this child. If termination cannot be confirmed, installation fails
and reports the child PID and retained staging directory for recovery; arbitrary
kernel-stuck tasks are not guaranteed killable. Packaged verification separately
bounds helper provisioning to 60 s, preserves failure/interruption and
diagnostics, and retains helper recovery state rather than retrying
automatically. The installed desktop entry explicitly selects X11/XWayland,
including when the session exports a Wayland preference. Direct AppImage
launches retain the rendering override rules above. Desktop Entry encoding
preserves literal percent signs and double quotes in the installed pathname. A
fixed `sh` command forwards the executable and arguments literally; pathnames
are never shell code.

The helper accepts `install [--compatibility] <verified-local-AppImage>`,
`uninstall`, `--version`, and `--help`, without interactive questions. Only the
explicit compatibility option adds per-process `LIBGL_ALWAYS_SOFTWARE=1` and
`--ignore-gpu-blocklist`; it is not automatic VM or desktop detection and may
reduce performance or stability. A normal reinstall removes that opt-in.
AppImage extraction arguments precede Electron arguments in either mode.

During installation in an active Hyprland session, bounded optional desktop
queries may record `--force-device-scale-factor` when XWayland zero-scaling is
enabled and all reported monitors share one positive numeric scale other than
`1`. Missing tools, failed/malformed reports, absent sessions and mixed scales
leave Electron scaling unchanged. The choice is fixed in the desktop entry,
reported to the user and refreshed on reinstall; launch time does not re-detect
monitors. Neither this choice nor compatibility mode changes compositor policy,
global environment, User Configuration, terminal font zoom, title-bar
preferences or the three-file ownership/rollback contract. See
[ADR 0031](adr/0031-keep-linux-installer-choices-small-and-local.md).

## Architecture boundaries

Electron main owns native windows, PTYs, filesystem access, configuration, logs,
clipboard capabilities, external-link opening, and bounded Local Image Preview
reads. The renderer runs with context isolation and without Node integration.
Main validates IPC request senders and payloads; preload validates response and
event payloads exposed by its minimal typed bridge. The font route accepts no
path; it can return only bounded bytes for the active validated configured
family and fixed local fallback candidates. Font paths, family names, and bytes
are excluded from Operational Events, but native read-error text is not
consistently redacted from font IPC rejections, as noted above. Chromium
sandboxing remains enabled on macOS and Windows and is disabled on Linux.
Context isolation and the narrow bridge still limit renderer authority on Linux,
though they do not provide protection equivalent to the Chromium sandbox.

The framework-independent DOM Terminal Surface hides Restty setup, Ghostty
parsing, text and Kitty image rendering, input, resize, theme, fonts, clipboard,
zoom, and cleanup behind a small interface. It receives the local IPC/PTY
Adapter rather than importing Electron or `node-pty`. Restty is the sole
implementation; there is no renderer selector or registry.

The package is organized by runtime responsibility: main, preload, renderer, and
the portable Terminal Surface. Native window management and PTY creation remain
in main.

## Release contract

OMXTerm uses the MIT License and follows the [versioning policy](versioning.md).
Packages are built natively on ARM64 macOS, Linux and Windows, and on x64 Windows, using native
filesystems rather than VM shared folders. The formats are DMG, AppImage and
NSIS respectively. An explicit maintainer-approved Windows x64 release may use
x64 emulation on Windows ARM64 while native hardware is unavailable (ADR 0034);
release evidence must identify that exception and pending native qualification.
Installer safety requirements are unchanged. Linux also provides
`linux_install.sh` and `linux_install.sh.sha256`; the helper's embedded version
matches the release.

Artifacts include SHA-256 checksums but no verified publisher identity. The
macOS app has an ad-hoc integrity seal, not Developer ID signing or
notarization; Windows NSIS is unsigned. Installation guidance explains
Gatekeeper and SmartScreen without recommending disabling system-wide
protections.

The [release procedure](release.md) owns preparation, native verification,
artifact identity, tagging, uploads and download checks. An owner-requested
release covers those steps without additional per-step approval. Manual testing
is optional: macOS daily use supplies feedback, while Linux and Windows rely on
native automation and user reports. Unobserved visual or desktop boundaries are
recorded as unverified rather than implied passes.

## Acceptance boundary

Tests cover configuration, tabs and window lifecycle, PTY startup/resize/output
flow, Unicode, scrollback, Kitty images, local-image reads and overlay cleanup,
link gestures, clipboard policy, title sanitization, logging, IPC boundaries and
packaged startup. Chromium tests retain the production CSP, context isolation,
disabled Node integration and platform sandbox policy. Linux package
verification checks AppRun bytes and available installed launch modes against
the fixed no-sandbox policy. It installs the exact helper but removes the
fixture home rather than invoking that helper's `uninstall`; separate helper
tests exercise uninstall behavior.

Windows exact-installer verification requires an explicitly authorized
disposable VM and literal CLI opt-in. `/D=` changes the destination without
isolating old-version removal, registration, shortcuts or processes.
Verification refuses unsafe or unknown installation state. Ownership-checked
cleanup preserves user data and is part of full verification; unpacked-only
diagnostics are partial.

Release verification separates behavioral tests, native builds, exact-artifact
checks and publication. Each artifact needs verification against its own
identity and checksum: native by default, or the explicitly approved Windows x64
emulation exception in ADR 0034 with its limits recorded. Recorded results are
reusable only with known equivalent relevant inputs. Version-only changes need new packages and package/version
checks, not wholesale behavioral reruns; changed product, dependency or build
inputs invalidate affected results. Build-to-tag differences retain the full
build SHA and digest and require a verified non-artifact explanation. Applicable
failures need diagnosis-supported disposition, not an inferred pass from a later
rerun. The [release procedure](release.md) records checks, limitations and reuse
rationale; this specification is not an execution record.

The [ADRs](adr/) explain architectural choices.
