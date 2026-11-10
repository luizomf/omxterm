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

The Supported Platforms are macOS arm64, Linux arm64/x64, and Windows arm64/x64.
Linux and Windows x64 packages have build-only qualification (ADR 0036): native
CI builds and enumerated headless checks, not verified desktop or installer behavior. Linux
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
maintenance scope (ADR 0024). Intel macOS and other operating systems are unsupported.

When Linux display startup needs an X11 relaunch, it selects the persistent
`APPIMAGE` only when both `APPIMAGE` and `APPDIR` are nonempty absolute paths
and `APPDIR/omxterm` matches `process.execPath`, the packaged AppRun layout.
Otherwise it relaunches `process.execPath`; inherited AppImage variables from
another application do not select the replacement executable. The X11 switch
is inserted before a Launch Request's `-e`, preserving its literal argv. This
selection does not remove variables from the inherited environment (ADR 0020).

## Product scope

OMXTerm:

- opens the Default Shell in the user's home directory (except a split pane's
  usable OSC 7 directory inheritance or explicit Saved Layout opening described below): on macOS and Linux the
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
- uses one independent shell session per Terminal Pane, with one or more panes
  per Terminal Tab and one or more Application Tabs per native Terminal Window,
  including an optional graphical Settings tab;
- provides native new-window, new-tab, close, copy, paste, select-all,
  scrollback search, explicit text export, zoom, fullscreen, always-on-top,
  bounded local-image preview, and quit actions without an in-window toolbar;
- renders the bundled [`omtheme`](omtheme.json) palette by default, allows one
  explicitly configured external Terminal Theme, keeps SGR bold text on its
  requested ANSI `0–7` color without remapping it to bright `8–15` (applications
  may request bright colors explicitly), and uses bundled regular and bold
  FiraCode Nerd Font Mono as the default, followed by bundled regular and bold
  DejaVu Sans Mono, JetBrainsMono Nerd Font Mono, representative
  operating-system emoji/CJK/symbol faces, and bundled Noto Sans Symbols 2 for
  missing-glyph coverage;
- uses the black-and-blue OMXTerm application icon in development and on the
  packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- reads strict, versioned JSON configuration, including an explicit en-US or
  pt-BR Interface Language, and writes bounded local JSONL operational logs;
- packages ready-to-run artifacts from an accepted version: ARM64 DMG for macOS,
  ARM64/x64 AppImage for Linux, and ARM64/x64 NSIS for Windows. Linux releases additionally provide
  an optional versioned per-user AppImage desktop installer and its checksum;
  running the AppImage directly remains supported.

AI assistance, unrestricted broadcast input, saved or reconnectable running sessions, shell integration,
profiles, a remote theme marketplace, automatic configuration reload, automatic
updates, and remote terminal features beyond the optional
[Linux/macOS ARM64 SSH Connect preview](ssh-connect-development.md) are outside the current product
contract. SSH Connect is separately installed: its incomplete read-only alias
index and distinct quick-connect page request a typed, main-owned literal
system-ssh launch, without brokering authentication or adding reconnect. The optional
[Saved Layout preview](saved-layout-development.md) explicitly saves one window's terminal
layout and local-directory provenance, opening fresh Default Shells in a new
window without changing current work. It never saves/restores running sessions,
commands or output; no startup restore or autosave is added. The optional
[Mirror Typing preview](mirror-typing-development.md) is a narrow same-tab keyboard-byte
exception, not unrestricted broadcast or multi-pane paste.

Restty 0.3.0 and its pinned Ghostty core provide the sole Terminal Surface in
ordinary development and every packaged application. OMXTerm has no renderer
selector or fallback Surface. A shell starts only after rendering initialization
succeeds ([ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md)).

## Window and session behavior

- Launching OMXTerm creates a Terminal Window with one Terminal Tab. New Window
  and New Tab default to `Cmd+N` and `Cmd+T` on macOS, and `Ctrl+Shift+N` and
  `Ctrl+Shift+T` on Linux and Windows. Each Terminal Tab starts with one Terminal Pane,
  and each pane owns its own independent Live Terminal Session.
- Settings is one lazy graphical Application Tab per native window, appended
  on first open and reused without reread, reorder or state reset. It has no
  Terminal Pane, Surface, Adapter, shell or PTY. One ordered collection owns
  all kinds' selection, reordering and literal/next/previous navigation, including
  general hosted Application Tabs. Separately installed Files and SSH Connect
  open in the companion Auxiliary Panel instead and do not enter tab ordering. The
  existing strip flag and two-tab threshold include Settings; opening it never
  reveals a disabled strip. Switching preserves its DOM, category, drafts,
  revisions, scroll and pending save results; it cancels shortcut recording and
  invalidates pending clipboard interaction. Close disposes that editor without
  implicit raw Save or a new unsaved-change prompt. Reopen reads through the
  existing serialized service. Escape does not close the ordinary tab; the
  explicit Close action is in the page header and uses ordinary tab removal,
  retaining its closing Enter
  gesture through repeats/release. The internal shared application-page shell
  provides bounded content/navigation scrolling, explicit control variants and
  consistent error/warning/result notices. Raw and graphical results retain their
  severity; Settings follows valid configuration links and reports broken links,
  unsuitable targets and conflicts. Settings keeps its retained layout and uses the window's theme tint
  rather than adding an opaque page background; controls and focus remain visible. Settings survives last-terminal exit,
  cancellation or first-mount failure without inventing a shell or reporting
  false renderer emptiness. First-mount readiness still reports the actual
  terminal outcome. Final Application Tab removal commits the existing empty
  owner/failure-acknowledgement path; Settings adds no Busy Session/native drain.
  Main accepts only a fixed validated graphical selection identity, not an
  arbitrary renderer title. Settings supplies a localized native title;
  background OSC/BEL still update terminal tabs without stealing that title or
  marking an unseen terminal bell visited.
- `View -> Pane` splits the selected tab's focused pane right or down
  (`splitRight`, `splitDown`), moves pane focus (`focusNextPane`,
  `focusPreviousPane`, `focusPaneLeft`, `focusPaneRight`, `focusPaneUp`,
  `focusPaneDown`), resets the shares of the focused pane's split
  (`equalizePanes`) and closes the focused pane (`closePane`); every shortcut
  is remappable and nullable. A split needs room for two usable grids of at least
  20 columns by 5 rows, using the source Surface's current cell geometry as the
  new pane's admission reference. The prospective layout accounts for each
  existing Surface's own metrics, padding/other non-grid space and every divider,
  including same-direction sibling allocation. Unknown geometry refuses a split,
  and a tab holds at most 16 panes; otherwise it starts nothing. Splitting in the same
  direction adds a sibling; pane containers move without recreating Surfaces or
  sessions. Dividers drag with the pointer and move with arrow keys as
  `role="separator"` controls, limited by the same minimum; a later resize or
  zoom that cannot fit every minimum keeps every session and the layout; an
  impossible divider move retains the existing proportions. Dividers paint a
  1 px line within the existing 4 px resize target/allocation; hover and drag
  share a neutral highlight by default, independently overridable through theme
  appearance. Keyboard-visible focus always paints the line in theme foreground
  rather than outlining the target, including during drag and with decorative
  paint disabled.
  Exactly one pane per tab is focused: it receives keyboard input and every
  terminal-directed action and supplies the tab and window title. Explicit
  [Mirror Typing](#mirror-typing) additionally routes genuine keyboard bytes to
  its inspected fixed members; other input remains single-target. In a split tab,
  its only focus marker is a 1 px top line inset horizontally by that Surface's
  left/right padding, with no side/bottom ring or dimming of other panes. It is
  a non-intercepting overlay above terminal canvas contents, including opaque
  first-row backgrounds at zero top padding, locally stacked below app overlays.
  By default the marker uses the theme's cyan; if its contrast against the
  configured opaque background is below 3:1, the theme foreground replaces it only
  when that improves contrast. An explicit `appearance.activePaneHighlight` hex
  color is used exactly, without that substitution; null hides the marker. This
  is not a universal accessibility guarantee: a custom palette can leave both colors below 3:1, transparency/blur changes the visible
  background, and the marker remains only 1 px high. Clicking a pane focuses it, and
  switching tabs restores each tab's focused pane. A new pane starts the Default
  Shell in its source pane's last OSC 7-reported local directory when the shell
  emitted one and it still exists, otherwise in the home directory; main reads
  the report from PTY output, rejects non-local host names and UNC/device paths,
  and never logs the directory. Persistence occurs only through explicit optional
  Saved Layout saving. An empty or local host name emitted
  by a remote shell is indistinguishable from a local report; program output can
  also emit it. Either can only select an existing local directory, never execute
  shell text. Known SSH Connect sessions are excluded from local OSC7 tracking
  regardless of hostname; their splits/new tabs use the Default Shell at home.
  This exclusion does not detect ssh typed manually inside a normal shell.
  Ordinary exit removes only that pane
  and gives its space and focus to the nearest sibling; an unexpected signal
  keeps the pane until its failure dialog is acknowledged; the last pane closes
  its tab. Close Pane confirms only a Busy focused pane, Close Tab counts every
  pane of the tab, and Close Window and Quit count every pane. Right-clicking a
  pane focuses it, including its padding, even with the terminal context menu
  disabled. With `terminal.contextMenuEnabled` omitted or true, the native menu
  opens and its Copy, Paste and
  Select All act on that pane; in a split tab the menu also offers Close Pane,
  showing the current `closePane` keybind and following the same confirmation.
  Each terminal popup captures its source window, pane and live Surface, not
  a later selection. Pane exit, pane/tab removal, changed pane/tab selection,
  a newer popup or owner disposal makes its retained actions inert; activation
  in another selected window is ignored. An accepted Busy close decision keeps
  the original pane even if selection changes while its dialog is pending.
  A single pane and the Snippets field do not offer Close Pane. Hidden tabs hide
  their pane Surfaces and keep their layout.
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
  input DOM focus unless the user moved focus to panel or overlay controls while
  initialization was pending. Surface construction does not implicitly focus a
  window-owned pane. Deliberate tab creation/selection retains its focus contract
  when no competing control took focus during mounting. Returning from another
  application or OMXTerm window preserves focused panel/overlay controls;
  otherwise only the active Terminal Window restores selected Surface focus
  (including its focused search field). Focus restoration does not activate,
  raise, or show OMXTerm by itself.
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
  unchanged. Ordinary tab order is ephemeral and not shared between windows;
  explicit Saved Layout saving can capture terminal order for a fresh window.
- Close Tab defaults to `Cmd+W` on macOS and `Ctrl+Shift+W` on Linux and
  Windows, and terminates every session in the selected tab. A pending
  confirmation retains its original tab: approval never retargets a later
  selection, and does nothing if that tab has already ended. Repeated requests
  during that confirmation share the same decision, even if its sessions
  become idle. Selection reports the tab's session set even when the focused
  pane is still mounting or retained after native exit. A pending or dead focused
  pane never borrows another tab's Busy decision; Close Pane considers only its
  captured focused pane. Closing a window's last tab closes that window. The
  renderer subscribes to tab commands, clipboard, Find, zoom, tab-bar and snippets
  actions during host setup, without waiting for the first Surface to mount.
  Close Tab cancels a pending first tab through the normal empty-window lifecycle;
  queued New Tab cannot revive that owner. Host-owned zoom and tab-bar state and
  the Snippets panel are available during mounting. Actions requiring an unavailable
  Surface (such as terminal clipboard or Find) do nothing and are not replayed
  after mount; no command buffer is added. Existing modal guards still apply.
  Host readiness remains first-mount settlement, not command registration.
  Close Window and Quit use separate main-owned paths and also cancel
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
- `confirmClose` defaults to `true` and guards pane close, tab close, window close, and
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
  pane — and its tab/window only when it was their last pane/tab — without
  confirmation or a failure dialog, regardless of its numeric exit code. A pane
  whose fonts or rendering are still initializing retains its tab and window
  even before its PTY starts: another session's ordinary exit cannot close that
  window. The pending pane may finish and start one session, or be cancelled
  without starting one. Cancelling the final pending pane of the final tab
  closes the window; final pre-start rendering
  failure retains a native failure dialog until acknowledgement. Last-tab
  closure is committed by the renderer's tab owner, not inferred from a zero
  native-PTY count. Queued New Tab commands cannot revive an emptied owner;
  explicit window closure and Quit still cancel pending initialization.
- SSH Connect's core-transferred terminals are independent of extension lifetime.
  Exit0 closes normally; an ordinary nonzero exit retains readable/copyable/searchable
  output and an explicit exit-code notice/Close. The ended Surface keeps rendering
  and fonts for local refit/zoom until removal, but no native input, resize or
  protocol replies, including exit replay before start resolves. Native records
  still retire on actual exit, and ended content is not Busy. Startup/signal
  acknowledgement and authorized removal retain precedence. See
  [the capability/admission contract](ssh-connect-development.md#capability-and-admission).
- Native executable-start failure is distinct from a successfully executed
  program returning nonzero. Unix reports exec failure through a private native
  status channel. Windows' pinned dependency explicitly marks its asynchronous
  agent connection/worker failure through the same boolean forwarding, while
  missing-file rejection remains synchronous. Neither platform infers startup
  failure from an exit code, error text or Terminal Payload (ADR 0032). This applies to explicit commands and the Default Shell, with no
  fallback shell. Safe Operational Events classify it as `spawn-failure`.
- A spawn failure or unexpected signal remains visible in a native error dialog
  and local log until acknowledged; the failed pane then closes. Each pending
  failure acknowledgement retains its window even if a sibling exits ordinarily
  or another failure is acknowledged first. Acknowledgement removes only its
  failed pane, closing its tab only when no panes remain; automatic window
  closure waits for both an empty renderer tab
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
- An unchanged Terminal Surface stops requesting display frames. It draws at
  blink phases only while something on screen blinks (a blinking cursor, or SGR
  5 text while cursor blink is on), so a steady, hidden or unfocused cursor over
  plain text draws nothing. It rechecks state that changes without a render
  request (such as a reveal without refit) at most every 250 ms. Output, input,
  resize, focus, theme and configuration changes present on the next display
  frame.
- Native windows have minimum dimensions of 320 px wide by 200 px high. At
  startup and after a valid reload, main grows those bounds using configured
  font metrics, line height, padding, a scrollbar allowance, and title space.
  The calculation reserves two columns and one row but does not include the
  auxiliary panel or tab-strip space, creation-time fonts retained by older
  Surfaces, or ephemeral Window Font Zoom. It therefore does not guarantee a
  visible grid at the native minimum in every layout. The panel's 180 px terminal
  layout allowance is not a column-count or extreme-padding guarantee. Widen the
  window, reduce padding, or hide the panel to recover terminal space.
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
  PTY and preserves focused auxiliary-panel controls, otherwise restoring terminal
  focus; hidden Surfaces retain valid geometry. Local
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
  running version and MIT license, and links to the project, contributors,
  issue tracker and MIT license. Developer lists live in the repository's
  `CONTRIBUTORS.md`, not in the dialog; no individual copyright is spotlighted
  in the presentation, and legal notices remain in the distribution. About and
  Command Palette share theme-derived surfaces, subtle decorative hairlines,
  controls and typography. Their background tint follows effective window
  transparency without fading text or keyboard focus; no opaque scrim overrides
  the preference. Overlay tint can composite over application content; it does
  not establish native desktop blur, which remains main-owned and best effort.
  While About or Command Palette is modal, a shared fixed 12 px CSS filter
  softens existing non-dialog
  body-child application underlays, including terminal/Settings content and
  chrome outside the dialog bounds. This modal focus treatment automatically
  covers inserted underlays and ends on dismissal or disposal. It leaves
  body/html, the body tint, modal foreground and transparent backdrops
  unfiltered, does not change tint alpha, and is independent of the separate
  `window.blur` native desktop preference.
  Main supplies runtime metadata and opens only fixed named destinations after
  validating the owning renderer's main frame. Opening About makes no network
  request. Existing Linux/Windows native metadata setup and macOS bundle metadata
  remain intact; the displayed icon is the same canonical asset bundled locally
  for both development and packaged rendering.
- About can be opened using native menu keyboard navigation. Close or Escape
  dismisses it and focuses the live selected Application Tab. A closing Escape or
  Enter-on-Close gesture remains owned by About through held repeats and release,
  including Kitty event reporting; the next fresh terminal press is not consumed.
  Window blur and owner disposal clear outstanding gesture ownership. Space keeps
  the button's native release-time activation. Repeated opening,
  including during metadata loading, focuses the same dialog. Returning from
  the browser does not steal its focus. Owner disposal removes it without
  restoring terminal focus; late metadata and link errors cannot reopen it.
  About, Local Image Preview and a Snippets preview do not stack:
  opening one while another is choosing/loading/showing is ignored. Settings is
  nonmodal application content; About and menu-triggered image preview may open
  above it. Modal activation makes Settings inert, cancels recording and
  invalidates clipboard interaction. Dismissal restores selected-content focus,
  including a surviving Settings field; already submitted writes may settle. While a
  modal owns input, terminal clipboard, file-drop, zoom, snippet, tab/title-bar,
  tab-navigation/new-tab and pane split/focus/equalize actions are suppressed;
  output, configuration updates and approved pane/tab/session/
  window closure or Quit remain active. About does not add a configurable
  shortcut, settings service or persistent state.
- `View -> Command Palette…` opens a temporary searchable dialog for core
  application actions. `commandPalette` is remappable through Settings on every
  Supported Platform and defaults to `CommandOrControl+Shift+P` on macOS and
  `Control+Shift+P` on Linux/Windows. Explicit remaps and `null` remain effective;
  an existing custom binding on that combination produces the standard actionable
  collision error, not an automatic rewrite or silent reassignment.
  The palette shows localized labels and effective shortcuts from the internal
  Action Catalog used by the native menu and main key matcher. It uses
  case-insensitive substring matching in en-US or pt-BR, not fuzzy matching,
  aliases, ranking or command history. Up/Down selects a result; Enter or a
  pointer click invokes it after dismissal. Escape or the backdrop cancels.
  Enter/Escape repeats and release stay owned by the closing dialog; keyboard
  invocation waits for the owned Enter release, and blur or a lost release
  cancels that pending invocation.
  Copy, Paste, Select All, Find, positional tab selection and Command Palette
  itself are excluded from results. Find is deliberately omitted because
  targeting the formerly focused Surface after palette input has not been
  established. Existing Edit actions and shortcuts remain available outside the
  palette; while its query owns input, clipboard actions edit that query rather
  than the terminal. Native role-only Minimize is not a catalog result.
  The palette captures the selected Application Tab and focused pane before
  reading its catalog snapshot. Changed selection (including away and back),
  removed/ended targets or owner disposal prevent dispatch to a replacement.
  Main validates the selected trusted main frame and a one-shot catalog token;
  window blur, renderer loss/reload, selection/session lifecycle changes and
  catalog replacement invalidate pending authorization. Renderer-bound dispatch
  rechecks the captured target before entering existing action handlers.
  Existing Busy Session confirmation and action guards remain authoritative.
  Settings remains retained nonmodal application content beneath the palette:
  its controls become inert and shortcut recording cancels, without discarding
  drafts or pending saves. Dismissal restores a surviving interactive prior
  control when the captured target is still current. The palette does not stack
  with About, image preview or snippet preview. It adds no persistent toolbar,
  configuration migration, public action registration or Extension SDK.
  Labels and bindings are a per-opening snapshot; after changing language or
  bindings, dismiss and reopen the palette to obtain the current catalog.
- `View -> Toggle Developer Tools` is a menu/palette diagnostic action for the
  selected Terminal Window in development and packaged applications. It opens or
  closes Electron's local Developer Tools without enabling remote debugging;
  Developer Tools never open automatically. The tools can expose private
  Terminal Payload and runtime state, so diagnostic output, screenshots, traces,
  and profiles require review and redaction before sharing.
- `File -> Open Local Image…` is a menu/palette action for the selected Terminal
  Window. It opens a native picker and previews one validated local static PNG
  or JPEG in a temporary overlay without writing the file or changing User
  Configuration. Escape, the close button, or the backdrop dismisses the
  overlay, releases its renderer Blob source synchronously, and returns focus to
  the live selected Application Tab. Picker cancellation returns selected-content focus
  without an error. The picker and visible local-image sources share the bounded
  read and overlay contract below. While choosing, loading, or displaying a
  preview, terminal clipboard actions, file drops, font zoom, tab bar toggles,
  snippet toggles, title-bar toggles, snippet injection, tab navigation/new-tab
  and pane split/focus/equalize actions are ignored; page
  activation does not steal preview focus. The hover drag handle is suppressed.
  Dismissal restores ordinary routing. Already accepted terminal input is not
  rolled back, and confirmed tab/session/window closure remains active.
- Dropping one or more native file-manager files or folders anywhere in a
  Terminal Window without an active Local Image Preview inserts their absolute
  paths into only the focused Terminal Pane of the selected tab. The paths retain platform order,
  are separated by one space, and are delivered through Protected Paste without
  sending Enter. Drag navigation is prevented over the whole renderer document.
  Internal tab dragging only reorders tabs and never inserts a path. Apart from
  the authenticated Files source route below, drops without native files have
  no terminal side effect. Files entry/candidate MIME payloads, including mixtures
  with native files or tab drags, never fall through to native-file insertion.
- `View -> Reload User Configuration` defaults to `Cmd+Shift+,` on macOS and
  `Ctrl+Shift+,` on Linux and Windows. It manually rereads and validates the
  complete configuration. Successful application updates font-size baseline,
  padding, terminal context-menu eligibility, scrollback, ligatures, Option Key Mode, theme, transparency, blur and shared Auxiliary Panel side
  in place, plus close confirmation, logging, menu and keybind delivery. It
  updates Always-on-Top, title-bar and tab-bar defaults for new windows and, on
  Windows, shell selection for new Default Shell sessions. Existing windows keep
  their visibility choices, Always-on-Top state and Window Font Zoom delta;
  Actual Size returns to the latest baseline. Font family and line height remain
  creation-time settings. Reload is not transactional across consumers; failure
  and font-acquisition limits are described under
  [configuration and local state](#configuration-and-local-state).
- `View -> Toggle Tab Bar` (default `Cmd+Shift+B` on macOS and `Ctrl+Shift+B` on
  Linux and Windows, remappable as `toggleTabBar`) changes only the selected
  window's tab bar enabled flag, even with one tab; without a selected window it
  does nothing. Disabling removes the entire strip row, refits the selected
  existing Surface and PTY, and preserves focused auxiliary-panel controls,
  otherwise restoring terminal focus. Hidden Surfaces retain
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
  on Linux and Windows, remappable through `keybinds`) opens, reveals or closes the
  selected window's Snippets view in one nonmodal Auxiliary Panel (right by default)
  below full-width title/tab chrome. Published stable `0.25.0` and current source
  support optional Snippets on Linux ARM64/x64, macOS ARM64 and Windows ARM64.
  The bundled default remains `0.1.0`; the official catalog offers `0.1.1` for
  deliberate installation or update, not automatically.
  Windows x64 and unchanged `0.23.0` hosts retain the built-in view. Existing users
  choose installation through the official catalog or a verified local/offline
  archive. Windows ARM64's graphical suite did not run and public-install Snippets
  failures remain unresolved, accepted [for 0.25.0 only](snippets-migration.md#stable-0250-release-disposition).
  The [migration guide](snippets-migration.md) keeps historical preview/0.24.0 results.
  Since 0.25.0, a [removable default](default-snippets.md) is enabled but dormant
  only for positively new packaged profiles, not existing-user enrollment. Existing YAML, bindings and
  disabled/removed choices remain preserved. The existing
  command remains the sole menu/palette entry, including remapped/null bindings.
  Without an enabled installation, it opens Extensions management with an
  optional-tool explanation and the actual installation/runtime status, without
  installing, enabling or executing code. Settings and modal owners remain no-op
  targets. Runtime failure never restores a competing built-in implementation. Installed Files and SSH Connect share this
  panel after explicit activation through their existing actions. With one open
  tool the header shows its name; with multiple tools the labeled, wrapping
  switcher occupies that same header and identifies the selected tool without a
  second host title. One view is visible at a time. The host retains its panel
  accessible name and does not inspect or strip extension content. The Files and
  SSH Connect source pages leave visible tool identity to the host, retaining
  named child regions and meaningful content sections. Installed older archives
  retain their own headings even with a newer host; source changes do not update
  immutable packages. Each tool's ordinary entry point closes it when selected
  and visible; otherwise it opens or reveals that tool. Switcher buttons select
  without closing.
  Header Close closes only the selected tool and hides the panel; other open
  tools remain retained. Built-in Snippets disposes its view but keeps its lazy
  factory available. Native tool close retires its view through the existing
  acknowledged host lifecycle, not extension disable or backend retirement.
  Reopening after retirement creates fresh view state and invocation context.
  Repeated closes coalesce; pending close does not queue an automatic reopen.
  Header Hide and Escape instead preserve all opened tools and their state.
  `View -> Toggle Auxiliary Panel` (`keybinds.toggleAuxiliaryPanel`, default
  `null`) independently hides or reveals the container. Reveal restores the
  remembered open tool or the first remaining open tool. In an eligible terminal
  selection with no opened tools, it instead lazily opens/reveals installed and
  enabled Snippets (the built-in view on Windows x64). It never installs, enables,
  fetches a catalog, opens Settings or shows a native error modal. If unavailable,
  one localized, noninteractive panel status says “No tools are open. Open an
  extension to use the panel.” for about four seconds, without moving focus.
  Further failed attempts do not repeat or extend it. This budget belongs to one
  main application-process lifetime across its windows, not a terminal session;
  later manual installation/enablement can still make a future attempt succeed.
  Tab/pane selection, another tool, modal ownership, native window blur, close
  and disposal revoke pending empty-panel intent; delayed native publication
  cannot reveal or focus that stale view. Main rechecks the pending intent after
  awaited manager work before returning its open result; cancelled or superseded
  intent does not receive a successful result at that boundary. Native window blur revokes main intent
  and notifies core even when publication is already in transit. Core DOM blur
  from creating/focusing an owned child is not native window focus loss and
  must not cancel its legitimate initial publication. Blocked/suspended targets and pending
  tool retirement do not trigger fallback. Close still disposes state, while
  Hide/Escape retains it. Existing action identities, defaults and custom/null
  bindings remain unchanged. This is access fallback, not default installation.
  Hiding does not retain active semantic-input authority.

  `View -> Move Auxiliary Panel to Other Side` (`keybinds.moveAuxiliaryPanel`,
  default `CommandOrControl+Shift+Alt+P` on macOS and
  `Control+Shift+Alt+P` on Linux/Windows) changes only the focused window's
  side. The command is accepted from a terminal, Settings, or a nonmodal hosted
  tab and does not reveal a suspended panel. A modal or other presentation
  owner still suppresses it. One physical press moves the panel once; that
  press owns its repeats and release across core and child focus, including a
  modified Escape binding that would otherwise dismiss a focused companion.
  Plain Escape dismissal and companion-tool shortcuts keep their existing
  ownership. The override lasts for that window and is cleared when the
  configured `window.auxiliaryPanelSide` changes; it never writes configuration.

  Window composition creates the shared panel independently of Snippets wiring;
  Built-in Snippets contributes its lazy view definition; installed Snippets
  uses the native companion presenter. Core owns semantic preview in either
  mode. Views are created lazily.
  The host owns exclusive visibility, header/Close, resize, focus and lifecycle; the view
  owns its query, scroll and catalog. Activation reveals loading/search and
  focuses search immediately, rereading `snippets.yaml` each time without file
  watching. Old rows cannot act during loading. Results replace the catalog,
  including empty/error results, without refocusing. Late results from a hidden,
  superseded or disposed activation are inert. Query and scroll survive hiding
  in memory; scroll clamps after shorter results. Deactivation stops active-only
  work and disposal releases all created views and listeners once. Native extension
  views retain their page state while hidden. Closing discards view drafts and
  revokes view requests, but accepted filesystem work may still finish with an
  unknown outcome; close is not rollback, and reopening never replays it.
  Backend scratch state may survive view close. Core-owned SSH launches and
  accepted Surface-owned paste remain independent of view lifetime.
  Terminal-tab changes preserve the selected companion view. Settings and general
  hosted tabs suspend the panel and restore its selected view on terminal return.
  Panel tools are window-owned, independently of the opening terminal's lifetime;
  backend/window loss and disable/update/uninstall still retire their views.
  In current source, Files initially opens Home and an explicit host focus intent
  focuses its loaded-entry filter, unless an open operation editor needs focus.
  Restore intent preserves an eligible focused control. The filter projects only
  already-loaded rows in expanded folders, retains matching ancestors and visible
  loading/error/truncation rows, and never searches collapsed folders or issues
  filesystem requests. Dotfile visibility applies first. Filtering away a selection
  clears it; Tab reaches the tree, including when empty. If rows arrive while the
  empty tree has focus, Up/Down enters the rows explicitly. Focusing a row selects
  it; F2 and the context menu explicitly select a previously unselected fallback
  row before acting. Unsubmitted address drafts survive listing updates. Row
  actions leave composing and other modified gestures untouched (apart from
  Shift+F10). Cancel returns to the initiating row/control where available,
  otherwise Actions; a late
  permanent-delete confirmation does not steal focus after the user moves away.
  These changes are included in published Files0.7; immutable Files0.6 remains
  unchanged. Both ARM64 catalogs now select Files0.8.
  Its explicit reported-directory action captures the selected live pane's latest
  local OSC7 report at action time. Main asks the core renderer to confirm the captured session and selection
  revision, rejecting reordered or changed selection rather than retargeting.
  No report, a known SSH Connect pane or an incomplete recognized OSC7, remote
  or invalid report produces an explanation without changing the browsing location.
  Only the visible Files panel in its focused window can make this request; main
  chooses the window and pane, never a caller-supplied target. It is not continuous
  following and does not retarget an already-started request or filesystem
  operation. Other extension invocation contexts stay captured at invocation.
  OSC7 is not authenticated or current-process inspection: an arbitrary program
  can report it, ordinary shell-launched SSH may be indistinguishable and reports
  may be stale. The explicit action opens the fixed path locally without a modal;
  current Files source labels it as the last reported path and exposes those
  limitations in an inline hint, tooltip and accessible description. Compatible installed Files
  archives use the host behavior without modified package bytes, but retain their
  earlier label and lack the new inline hint and tooltip. The renamed action,
  hint, tooltip and dynamically localized host-coded notices are included in the
  published Linux ARM64 Files0.7 preview, not Files0.6.
  The narrow [development bridges](extension-installation-foundation.md#archive-contract)
  admit unchanged Files0.6 on recognized 0.24.1-dev.N, 0.25.0-dev.N,
  0.26.0-dev.N and 0.26.1-dev.N hosts; admission alone does not qualify native behavior or packages.
  Current Files source also offers **Insert path into terminal** in Actions and
  on a focused row with Shift+Enter. It captures one visible selected file,
  folder or link, requests insertion immediately and never sends an added Enter.
  At request invocation, the app-owned child preload privately stamps its latest
  observed core-selection revision and visible-admission generation. Main checks
  both at receipt and commit; core independently refuses a changed selection
  before capturing the Surface. Missing or stale observations fail closed rather
  than retargeting. This does not imply a global ordering across processes. The
  original Surface owns accepted Protected Paste, including confirmation and
  remaining chunks. After successful Surface delivery, focus returns to that
  target only if it is still the current live selection and the request remains
  active; a later selection is never focused as a substitute. Missing, closed,
  busy, invalid and incomplete or unknown outcomes are explained without
  automatic replay. Completion means every chunk was accepted by the captured
  live local session and passed to node-pty without a synchronous error; it does
  not establish OS or shell consumption. A control character or newline in the
  path can still act on a receiving program, even though no Enter is appended.
  A path containing a bracketed-paste terminator is refused rather than rewritten.
  Explicit focus returns to terminal input rather than a retained search query;
  a newer companion selection or pending overlay prevents focus theft.
  Files0.8.0 packages this behavior with `terminal.insertPath.v1`, minimum host
  `>=0.26.0` and API `0.1.x`; installed Files0.6/0.7 bytes are unchanged.
  SSH Connect creates a new Terminal Tab, preserving previous sessions and the
  visible panel. Its foreground handoff acknowledges native focus returning to
  core while the panel remains visible; a background result does not steal focus.
  One window-native presentation owner orders panel and tab geometry, focus,
  acknowledged hiding before DOM overlays, and stale continuation rejection.

- Close (including a selected-visible tool toggle) disposes the selected tool;
  Hide or Escape originating inside the panel only hides/deactivates it.
  Both return focus to the live selected terminal after native acknowledgement,
  unless a newer selection or modal owns focus. Neither closes terminal sessions.
  In the native hosted-view Escape fallback, only a fresh non-composing Escape
  starts dismissal. A composing Escape and an unowned repeat stay with the
  focused control. An already-owned dismissal still consumes its repeats and
  release during composition. This does not establish that a particular OS or
  IME emits a composing Escape. Current Files source likewise leaves a composing
  Escape, and an unowned Escape repeat, with an operation editor or menu, so
  the unsubmitted draft stays. This handling is included in the
  [published Linux ARM64 Files0.7 preview](files-development-preview.md#files07-linux-public-link-checkpoint),
  not immutable Files0.6. Source inclusion and the bounded Linux checkpoint do
  not establish physical-keyboard or native IME delivery, or broad macOS/Windows/x64
  Files0.7 qualification.
  In the built-in panel, only a fresh non-composing Escape starts dismissal;
  composing Escape and unowned repeats remain with the focused control. An
  already-owned dismissal retains its repeats and release even during composition.
  This DOM event policy does not establish native OS/IME event delivery.
  An Escape or Enter-on-Close/Hide gesture owns its repeats and release, including
  Kitty event reporting. Escape in the terminal remains terminal input. Switching
  internal views deactivates the old view and focuses the new one directly, with
  no intermediate terminal focus. There is no backdrop, focus trap or global
  Escape interception. Returning to the page preserves focused panel controls;
  deliberate terminal/tab actions still focus the terminal. Each row shows its
  default action before activation: **Insert** (`execute` false or omitted) or
  **Run · adds Enter** (`execute: true`). Clicking a current row captures the
  focused pane's live Surface at that moment, injects its exact body with that intent
  through the existing Protected Paste path and returns focus immediately. A
  separate **Preview** control opens a temporary read-only dialog that shows the
  stored body exactly, without trimming or normalization, and captures the
  focused pane's live Surface before anything else happens; with no live Surface it
  does not open. Its final **Insert — no added Enter** or **Run — adds Enter**
  choice is authoritative regardless of `execute`, is accepted once, closes the
  preview and returns focus to the terminal. Cancel or Escape sends nothing and
  restores the Preview control when it is still connected, enabled and
  interactive in the visible view, otherwise panel search, otherwise the live
  selected terminal; it never reopens a hidden panel. If the captured Surface
  ends or fails while the preview is open, its actions are disabled even when
  its pane remains visible for failure acknowledgement. Removal, tab closure
  and host disposal also end that target exactly once, before forwarding exit
  or fatal failure. Nothing is sent to a sibling or replacement pane, and that
  unavailable Surface cannot be captured for a new preview.
  Language switching relabels current row/preview controls and the unavailable
  notice without replacing their DOM, changing focus, rereading YAML, recapturing
  the target, mutating user text or re-enabling a dead target's actions.
  Insert only omits the added Enter: embedded line breaks or control characters
  can still execute, and Protected Paste may still ask for
  confirmation after acceptance. The preview, About and Local Image
  Preview never stack; while any is choosing/loading/showing, terminal-directed
  actions, tab navigation/new tabs and pane split/focus/equalize are suppressed.
  Pane dividers and passive mount/rebuild focus consult that same modal owner;
  approved captured closure and failure acknowledgement remain deliverable. Enter activation
  of a row retains that gesture's held repeats and release, so they cannot append
  terminal Enter independently of the snippet's `execute` choice. A fresh
  terminal key remains ordinary input. Hiding does not
  cancel already accepted Surface-owned delivery; closing that Surface stops
  remaining chunks/Enter without rollback.
- **Settings → Window → Auxiliary panel side** persists
  `window.auxiliaryPanelSide` (`left` or `right`, default `right`) in User
  Configuration and applies live to all windows. The same side hosts built-in
  Snippets and every companion tool; no per-tool placement or additional panel
  is created. A side change ends active resizing and preserves preferred width,
  visibility, selection, drafts, focus and view/Surface/session identities. It
  does not activate, hide, reopen or reload a tool. Native position-only changes
  explicitly refresh the existing coalesced presentation path without focus
  intent; overlay, selection and retirement guards remain authoritative.
- Panel preferred border-box width starts at 280 CSS px per window. Bounds are
  220–560 px, with a separate 6 px terminal-facing separator and 180 px terminal layout
  allowance. Actual content-row width determines the effective maximum:
  `min(560, contentWidth - 186)`. Automatic clamping preserves preferred width.
  Below 406 px, hide/deactivate without automatic reopening when space returns;
  a too-narrow open reports “Widen the window to open Snippets”. Primary-pointer
  dragging captures the pointer, grows the right panel when moving left or the
  left panel when moving right, and coalesces painting per animation frame. Up, cancel, lost capture, hide, switch,
  overlay activity and disposal end dragging at the last valid width. The
  separator paints a 1 px line with the same default hover/drag and independent
  keyboard-focus states as pane dividers, while keeping its 6 px target/allocation.
  Its decorative color/null choice is separate from pane dividers; the panel
  never gains an active-pane highlight. The
  focusable vertical separator exposes current/min/max pixels and readable value
  text. Left/Right move the separator physically by 10 px (Left grows a right
  panel, Right grows a left panel); Home/End choose current limits. Resize
  keys are consumed only on the separator. Width preference survives hiding,
  view switching, reload/theme and chrome changes in that window's memory only;
  new windows/restarts reset width and visibility. Only the side preference is
  persisted; tool state and width remain memory-only. Layout changes retain Surface/core/Adapter/session identities,
  refit the selected grid and preserve hidden-tab geometry/output.
- Native Copy/Paste/Select All (menu and default/remapped shortcuts) edit the
  focused panel text field, never the PTY. Paste inserts at its selection with
  line breaks replaced by spaces; async completion rechecks focus and active,
  unblocked lifetime. Unsupported panel controls or unavailable clipboard edits
  suppress terminal delivery; focus the search field or use its ordinary native
  text editing instead. Terminal-focused actions retain existing routing. About
  and Local Image Preview choosing/loading/showing keep panel layout/state but
  make controls/separator inert, cancel drag and ignore competing actions rather
  than queue them. Valid visible reads may settle without taking focus. Each
  overlay keeps its existing dismissal, tab/closure and file-drop policies.
  The fixed header/Close and independently scrolling results contain long content
  and retain light/dark theme, background-opacity and hidden-chrome composition.
- BEL is silent. A bell prepends a marker to the ringing session's title —
  visible on its tab and, while that tab is selected, in the window title — and
  an unfocused window requests native platform attention once until the user
  focuses or interacts with it: an informational Dock bounce on macOS, or
  per-window attention on Linux and Windows. Focus, terminal interaction, or
  window disposal cancels the outstanding native request. Native desktop policy
  determines how attention is presented; BEL remains silent.

Closing a tab or window ends its sessions. Persistent and reconnectable sessions
remain the responsibility of a session manager such as tmux.

## Saved Layout

The separately installed Linux ARM64 [Saved Layout extension](saved-layout-development.md)
offers Save/Replace/Open/Forget, with Refresh for cross-instance conflicts or
unknown outcomes. It captures only the original window's terminal tabs, weighted
flat pane trees, focus/selection and reported-local/launch-local/home provenance.
Graphical tabs are excluded and counted. Bounds are 16 tabs, 16 panes/tab, 32
panes total and 256 KiB, rejecting whole requests rather than truncating.

Opening transfers a fully validated plan to one new core window with no dummy
shell. Every pane starts through normal Surface initialization, explicitly using
Default Shell and never consuming a pending `-e`. Original work is untouched;
partial failures retain healthy panes. Core owns tokens, status, cancellation
and actual native shutdown independently of extension retirement. Keyboard Open
waits for Enter release; delayed presentation respects newer focus intent.

Explicit saving uses an extension-scoped native-lease/CAS state adapter outside
configuration and immutable packages. Opaque revisions and Forget tombstones
prevent stale destructive writes. Data survives disable/update/uninstall. Forget
removes the active snapshot, not possible interrupted-write temp copies; the
guide supplies deliberate local cleanup instructions, not an erasure guarantee.
Malformed/unreadable state is not repaired. A possibly committed write followed
by transport loss requires Refresh, never automatic retry. No terminal payload,
command, environment, title, process or SSH target is stored.

Directory provenance is not current-process inspection or authenticated OSC7.
Invalid/remote/overlong reports revoke launch fallback. Known SSH, explicit
commands, ended and pending panes use home slots. Asynchronous directory checks
fall back to home on missing/unavailable paths without creating folders or
retrying a failed PTY launch. OS-mounted folders and ordinary shell startup may
access networks. See [ADR0042](adr/0042-save-layouts-without-restoring-sessions.md).

## Mirror Typing

The separately installed Linux ARM64 [Mirror Typing extension](mirror-typing-development.md)
requires host 0.24.0-dev.2 and API 0.1.x. These are implementation contracts, not
claims of native qualification or catalog/release publication.

- An explicit action captures one terminal tab and its live mounted focused pane
  before setup opens. An ineligible original focus refuses even with live siblings.
  Inspect a fixed subset of 2–16 live panes, always including that original focus.
  Start consumes fresh setup authority and returns only to that exact tab/source
  after acknowledged native setup hide and focus/lifetime revalidation.
- Core mirrors final genuine keyboard bytes in source mode, exactly once per
  member. Any selected member may become source; additions never join. Mouse,
  pointer-origin prompt reports, focus/program/parser replies and graphical fields
  remain local. Extension code receives no keyboard payloads.
- Paste, snippet Insert/Run and drops synchronously Stop before ordinary captured
  original-target delivery, including empty/unsupported terminal paste and before
  clipboard reads or Protected Paste confirmation. Cancelled paste stays stopped;
  delayed local approval cannot fan out or reactivate mirroring.
- A persistent core content row and source/member marks expose Stop even with
  hidden chrome, independent of extension responsiveness. Preparing is input-inert
  and cancellable; Start/Stop key releases cannot leak into terminal input.
- Unselected-pane/tab selection, modal entry, member loss, view/backend loss,
  local disable/update/uninstall, renderer/window teardown and hide/minimize revoke
  the whole group. Active-window blur blocks input but retains the group; pending
  Start cancels on blur. Healthy resize/reorder/theme/language/chrome changes do not
  silently restart or end it.
- One settled-replacement setup per extension/window prevents accumulating obsolete
  views. Returning to setup stops the group; another Start needs fresh authority.
  Main/native and renderer generation fences reject stale starts and input. Backend
  lifetime loss revokes views before settlement; cleanup is not input authority.
  Membership, tokens and leases are memory-only, excluded from Saved Layout,
  startup, configuration and extension state.

Use matching terminal programs/modes: source-mode bytes are not semantic
per-recipient keys or synchronized shell state. Stop cannot undo input or synthesize
key releases. Native writes are best-effort sequential, not atomic, with no replay
or rollback. There is no instantaneous cross-instance revocation guarantee.
[ADR0043](adr/0043-revoke-visible-mirror-typing-routes.md) explains ownership and
tradeoffs; the guide covers installation, recovery and separate archive builds.

## Terminal behavior

The Restty Terminal Surface (Ghostty WASM core) works with Terminal Tabs, the
session Adapter and the real PTY lifecycle
([ADR 0008](adr/0008-make-the-terminal-surface-the-portable-module.md),
[ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md)). It covers Unicode
input and output, grid resize, focus, Default Shell and explicit-command
startup, shell exit, tab close and renderer-loss cleanup.

### Surface startup and failure

- A PTY starts only after the bundled Terminal Font Stack TTFs, the Ghostty core
  and a working WebGL2 backend are ready.
- On Linux, main permits Chromium's SwiftShader WebGL fallback when available.
  It does not force software rendering or change the GPU blocklist or driver
  selection. It does not guarantee backend availability or successful
  initialization
  ([ADR 0037](adr/0037-allow-the-linux-software-webgl-fallback.md)).
- Initialization failure releases partial resources and starts no shell.
- Closing an initializing Surface is cancellation, not a failure. Late font,
  runtime and session-start callbacks are inert and start no session; an
  already accepted session start is closed exactly once through its Adapter.
  Pending acquisitions settle before their partial resources and font leases
  are released. Genuine failures of a live owner stay visible.
- WebGL context loss shows a persistent failure and disposes only the owning
  Surface and session, without recreating the core.
- Main keeps a fixed, actionable native failure dialog until it is
  acknowledged, including when the failed session was the window's last one.
- Native rasterization can differ across Supported Platforms and GPUs;
  pixel-identical glyph output is not claimed.

### Terminal fonts and rendering

- Restty applies the Terminal Theme, font size, programming ligatures, per-side
  padding and Window Font Zoom.
- Font faces are tried in this order:
  1. An exact configured installed family. Main resolves it and gives Restty
     only bounded bytes validated at admission.
  2. The bundled FiraCode regular/bold, DejaVu Sans Mono regular/bold and
     JetBrainsMono Nerd Font Mono faces.
  3. Locally installed operating-system fallback faces. On Linux these are, in
     order, `Noto Color Emoji`, `Noto Sans CJK SC`,
     `DejaVu Sans Mono` and `Source Han Sans CN`. Each is optional, needs an
     exact installed regular family match and shares the bounded fallback-byte
     budget. No fonts are installed automatically.
  4. The bundled Noto Sans Symbols 2 regular face, last and outside that budget,
     so symbols such as U+23F5 render everywhere while operating-system color
     emoji keep precedence for the code points they share.
- A configured family drops the bundled bold faces and has precedence for
  regular, bold, italic and bold-italic text. Main loads its real style faces
  from the same installed family, validates identity and style, and selects
  exact faces in collections. Exact legacy and typographic family names from
  the face metadata are accepted; matching is case-sensitive, with no fuzzy
  names or substitution.
- Missing styles use Restty's synthesis. Bold-italic may use a same-family bold
  or italic face; regular, bold-only and italic-only text never gain an
  unrequested trait. Non-default variable-font instances are not materialized,
  so a style that needs them is synthesized and the regular family still works.
- Synthetic bold thickens monochrome strokes in both directions, also over a
  real italic face. Extra ink stays inside the cell and keeps any italic
  overhang. It does not change cell layout, ANSI colors, real bold faces, color
  emoji, or regular and italic-only text. Pixel parity with native rasterizers
  is not promised.
- Missing glyphs use the regular fallback faces.
- Compatible tabs share native font bytes and parsed faces; faces in one
  collection share its buffer. Apple Color Emoji reaches Restty as memory-only
  shaping input without the unused `sbix` bitmap table, keeping every face and
  other table; main skips that payload with bounded reads before validation and
  IPC. Native Canvas still uses the installed font, and other fonts are not
  affected.
- Font reads use native platform facilities without shell interpolation.
  Responses carry bounded bytes and face metadata, not paths. There is no broad
  filesystem API, remote fallback or persistent byte cache. Known limitation: a
  failed on-demand read after validation can put a native font path in the IPC
  rejection. It does not grant arbitrary filesystem access.
- A Surface applies its font family and line height when it is created. After
  User Configuration Reload, existing Surfaces keep theirs and new Surfaces use
  the latest values, so a restart applies them everywhere. Theme, font size,
  programming ligatures and padding update live and refit the same PTY.
- Started font reads survive reload for existing consumers, subject to the
  admission and queued-read limits under
  [configuration and local state](#configuration-and-local-state).
- Toggling programming ligatures keeps text, selection, copy results, cells,
  cursor positions and the same Surface, font generation, Live Terminal Session
  and PTY.
- Ghostty's grapheme-cluster mode is on by default, so emoji-presentation and
  ZWJ clusters take one two-column cell for rendering and selection.
- Bar cursors stay visible inside their cell at the first column, regardless of
  padding or font family. Block and underline cursors and focus/blink behavior
  are not affected.

### Keyboard input and terminal events

- Copy, paste, selection, context-menu actions, Protected Paste, snippet and
  path injection, and write-only OSC 52 follow [Clipboard](#clipboard). The DOM
  paste event is intercepted synchronously only to enter that asynchronous path;
  ordinary key input goes to the PTY directly.
- Option Key Mode applies live. `none` keeps macOS native Unicode and
  composition input; `left`, `right` and `both` turn only that physical Option
  key into terminal Alt.
- A native dead key completed with Space sends the layout's text, also on X11
  paths that emit `insertText` without composition events. It sends no
  substituted ASCII space and no duplicate keyboard-protocol release. Ordinary
  Space and configured terminal modifiers keep their encoding.
- Unmodified legacy arrows follow Ghostty's live DECCKM mode (including
  save/restore and reset): CSI A/B/C/D in normal mode, SS3 A/B/C/D in
  application mode. The mode comes from parser state, not a render frame or a
  separate JavaScript tracker. Modified arrows, negotiated Kitty keyboard events
  and non-arrow keys keep their own encoding.
- Restty passes Ghostty's parsed OSC 0/2 title and BEL events to the
  per-session host; it does not scan Terminal Payload with a second parser.
  Title sanitization, fallback, ownership, the silent bell marker,
  focus/interaction reset and platform attention are host policy. OSC BEL
  terminators and cancelled or malformed controls produce no extra title or bell
  event. Title-report queries get no reply.

### Terminal titles

Titles are display-only
([ADR 0010](adr/0010-keep-terminal-titles-display-only.md)).

- OSC 0 and OSC 2 titles are per session. The raw request must be at most 256
  code points; control and bidi characters are then removed and the result must
  be one printable line.
- A tab shows its focused pane's accepted title and falls back to the basename
  of the shell selected when that session started.
- Startup reconciles the current main-owned title once the pane's session
  identity is known, including when the initial fallback arrived before the
  start response. It never overwrites a newer accepted title or retargets a
  cancelled pane. Unknown titles are not kept for future panes.
- The native window title mirrors the selected tab and falls back to `OMXTerm`.
- Title contents are never logged or reported to the PTY.

### PTY output flow control

- PTY output crosses the Adapter/IPC route in order, each message carrying a
  cumulative UTF-8 byte position.
- Only the owning renderer main frame may acknowledge progress for its own Live
  Terminal Session. An ACK means the whole message was synchronously submitted
  to the Terminal Surface, not that pixels were drawn or memory released.
  Duplicate, stale, unknown-session, foreign-session and beyond-sent ACKs are
  ignored.
- Main pauses the PTY at 65,536 pending bytes and resumes it at or below 16,384.
  A native read in progress can overshoot the pause threshold by up to its own
  size.
- Renderer loss, send failure, tab disposal and window disposal terminate only
  the affected session, resuming a paused stream first so it cannot stay a
  paused process or send into a dead owner.
- On Unix, the pinned node-pty close guard waits while the stream is paused, so
  a final readable tail is not discarded. ConPTY is not affected.

### Unfinished control budget

- Restty's pinned OutputFilter retains at most 10,000,000 UTF-16 code units of
  an unfinished control body. For OSC, the body is the handler payload after a
  short numeric command and separator when present, otherwise everything after
  the introducer. For CSI, it is everything after the introducer, excluding the
  final byte.
- An over-budget control is consumed as one rejected control until its end (BEL,
  ST, CAN or SUB for OSC; a final byte, CAN or SUB for CSI). It has no partial
  clipboard, title, reply, mode or other effect, releases retained text, and
  later output continues normally.
- Controls exactly at the budget are accepted, including the largest valid OSC
  52 write. Ordinary text, copy, paste, input and complete output are not
  limited.

### Terminal memory accounting

The pending IPC byte count, JavaScript heap and process RSS are separate
measures. Core image and scrollback storage, decode buffers, browser
canvas/WebGL resources and GPU memory are counted separately or not at all.
Flow control, the control budget and the image limits below are not a total
memory bound, and concurrent sessions multiply the costs.

### Terminal identity and replies

OMXTerm uses standard xterm capabilities and does not inject shell integration
([ADR 0012](adr/0012-use-standard-xterm-terminal-capabilities.md),
[ADR 0013](adr/0013-do-not-inject-shell-integration.md)).

- The environment sets `TERM=xterm-256color`, `COLORTERM=truecolor`,
  `TERM_PROGRAM=OMXTerm` and the installed version in `TERM_PROGRAM_VERSION`.
- Restty answers DA1 as `CSI ? 1 ; 2 c` and DA2 as `CSI > 0 ; 0 ; 0 c`, once
  per query.
- Ghostty answers cursor-position queries (`CSI 6 n`) from its parser cursor at
  the query's place in the output stream, including wide/combining text and
  pending-wrap resize, without a render frame or JavaScript cursor hint.
  Origin-mode reports are relative to the scrolling margins. Replies keep stream
  order with later DA1, DA2 and cell-size replies.
- `CSI 16 t` gets the cell size from the Surface metrics once the Surface opens.
- Not every xterm extension is guaranteed. OMXTerm installs no custom terminfo,
  does not touch shell startup files. Inline-image support does not
  impersonate another terminal or inject application-specific capability
  variables.

### Inline Terminal Images

A direct Live Terminal Session renders two bounded static-image paths through
the Kitty graphics protocol
([ADR 0022](adr/0022-render-bounded-kitty-images-in-direct-sessions.md)). The
pinned Ghostty core is the Kitty parser, decoder, image store and placement
authority; OMXTerm adds no second parser.

**Supported paths**

- Pi-compatible, the subset emitted by Pi 0.84.4: direct transmit-and-display
  (`a=T`, `f=100`, `q=2`), optional cell columns and rows, image ID and cursor
  movement, 4,096-character Base64 chunks joined with `m=1` and `m=0`, and
  image-ID (`d=I`), all-image (`d=A`) and all-placement (`d=a`) deletion. Pi's
  default 2,000-by-2,000 autoresized PNG pipeline is the compatibility target;
  images produced with autoresize disabled have no finite compatibility
  promise.
- Chafa-compatible, the output of Chafa 1.18.2 with `-f kitty`: one anonymous,
  semicolon-less metadata prelude using direct transmission (`t=d` or the
  default), `a=T`, `f=32`, positive source width and height (`s` and `v`),
  positive cell columns and rows (`c` and `r`), `m=1` and `q=2`; then anonymous
  Base64 payload chunks with `m=1` and a final standalone `m=0` APC with no
  semicolon or payload. Completion on the last data-bearing chunk is also
  accepted. Only uncompressed RGBA with exactly four decoded bytes per source
  pixel is accepted.
- For Pi versions that do not recognize `TERM_PROGRAM=OMXTerm`, select Kitty
  explicitly; OMXTerm does not configure Pi.

**Placement**

- Images stay cell-anchored through direct-session scrolling, Terminal Window
  resizing, Window Font Zoom, tab selection and valid User Configuration
  Reload, subject to the core's placement and scrollback retention.
- Width reflow clips a blank-cell anchor to the available destination columns
  without borrowing a preceding hard row's column offset. Genuine wrapped text
  and viewport scrolling may change an image's visible cell coordinates.
- Terminal reset, tab disposal and leaving the alternate buffer release the
  applicable image resources.

**Limits and cleanup**

- A direct transmission holds at most 33,554,432 decoded bytes, and source
  dimensions at most 4,194,304 pixels, checked before decode allocates the
  image (so Chafa RGBA is at most 16,777,216 bytes).
- Invalid Base64, malformed or cancelled APC, invalid dimensions, length
  mismatch, decode failure or an exceeded limit renders nothing, clears
  unfinished state and does not block later output.
- Each screen keeps at most one unfinished image; a new metadata-bearing
  transmission (including Chafa's prelude) replaces it. Completion, reset,
  alternate-buffer exit and Surface disposal release it.
- Each screen stores at most 64,000,000 bytes of completed decoded image data,
  with Ghostty's native eviction.
- Pi image-ID, all-image and all-placement deletion and reset release their
  native resources. Deletion, reset, alternate-buffer exit and disposal also
  release cached renderer resources while hidden.
- Core images and placements survive hiding and render again on reveal;
  renderer copies may be dropped while hidden.
- Decoding has transient allocations, and the renderer may copy visible RGBA
  into browser and GPU resources outside core storage accounting.

**Unsupported**

- SIXEL, the iTerm2 Inline Image Protocol, raw RGB (`f=24`), compressed raw
  pixels (`o=z`), placement IDs, animation, remote or filesystem image sources
  inside Kitty Terminal Payload, downloads, persistence, and images through
  `tmux`, `screen` or another multiplexer. Other Kitty and Chafa paths the core
  exposes are unclaimed.
- Local Image Preview is not an Inline Terminal Image or a Kitty source.
- Image bytes stay opaque, memory-only Terminal Payload on the PTY output path.
  They add no main-process, preload, IPC, Adapter, clipboard, filesystem,
  logging or network capability.

### Scrollback history

- Scrollback is memory-only and per Live Terminal Session. `scrollback.lines`
  defaults to 10,000, accepts 0 through 100,000 and rejects larger values
  instead of clamping them.
- A positive value approximates the maximum physical history rows, excluding
  the active screen. Ghostty evicts whole pages, so retention may exceed it by
  one boundary page. A separate 10,000,000-byte core ceiling may keep fewer
  rows; OMXTerm never estimates bytes per line.
- Zero disables history: retained history is dropped at once and none builds
  up through output or resize. A later positive reload keeps only new output.
- Valid live changes keep the same Surface, core, Live Terminal Session and
  PTY, and keep reflow, alternate-screen, selection and viewport state
  coherent. Each Surface is independent.
- Resize keeps pending soft-wrap positions, and selection and copy distinguish
  retained history, active wrapping and producer hard breaks.
- Accepted keyboard input and delivered paste, snippet or path input return the
  viewport to the live cursor. Output, protocol replies, focus, selection and
  cancelled paste do not.
- The scrollbar shows a thumb only while there is scrollback beyond the screen;
  an empty track paints nothing.
- Desktops with a fine pointer keep native scrolling even with touch; touch-only
  devices use touch scrolling.

### Links and local paths

External links are validated in main
([ADR 0011](adr/0011-validate-external-links-at-the-main-process.md)); local
paths open a Local Image Preview
([ADR 0026](adr/0026-preview-explicitly-activated-local-images.md)).

**What is recognized**

- Only literal visible lowercase `http:`, `https:` and absolute authority-free
  `file:///` URLs are links. OSC 8 destinations and all other schemes are
  ignored.
- Visible native path references are separate Local Image Preview
  destinations:
  - absolute POSIX paths begin with one `/`;
  - Windows paths are drive-qualified with a letter, colon, and slash or
    backslash;
  - `~` and `~/...` name the local OMXTerm user's home, including inside
    matching quotes;
  - relative references begin `./` or `../` (backslash separators also work on
    Windows), or are a relative image name ending `.png`, `.jpg`, `.jpeg` or
    `.webp` (case-insensitive).
- Recognition is not format support.
- References begin at a line boundary or after whitespace, as a complete
  non-whitespace token or a path inside one pair of matching single or double
  quotes (spaces allowed). Quotes do not evaluate shell syntax or escapes.
  Brackets, assignments and trailing punctuation are not trimmed. `%` and `#`
  are literal filename characters.
- An unquoted absolute path containing ASCII spaces is recognized only when it
  fills the complete logical line, starts at its first character and ends in
  `.png`, `.jpg` or `.jpeg` (case-insensitive), optionally with a positive
  location suffix. This excludes tabs, trailing spaces, an earlier
  image-extension token followed by spaces, and a space-separated new absolute,
  home (including bare `~`), dot-relative, quoted or HTTP(S)/`file:///`
  reference. Boundaries inside prose or between same-line references are not
  inferred; those use token or quoted recognition. Ambiguous forms may use the
  native picker instead.
- A destination may span only core-proven, fully visible soft wraps (including
  literal spaces at a row end); producer hard breaks never join. Cell
  coordinates stay correct after grapheme and wide-cell prefixes. Exact row
  equality, hard-break proofs and conservative clipping hold across core pages.
  A destination that may continue beyond the viewport is refused.
- Wide-wrap spacer cells add no text and share the hover span and hit target of
  the preceding link cluster on the same row. Link detection does not change
  copy or selection.

**Hover and activation**

- Holding the platform modifier over a recognized destination underlines its
  whole visible span. Pointer and modifier changes update the cue without
  activating it. Output, scrolling, geometry changes, focus loss, tab hiding
  and preview or Surface lifecycle changes clear it.
- Recognition alone performs no file read, image decode, network access, IPC
  open request or Terminal Payload logging.
- `Cmd+click` on macOS or `Ctrl+click` on Linux and Windows activates a
  recognized destination. The valid modified primary click takes precedence
  over application mouse reporting and sends no duplicate PTY mouse report;
  other gestures keep ordinary selection or application-mouse routing.
- For HTTP(S), main parses and validates the exact URL before asking the
  operating system to open it.
- For `file:///`, main requires the literal lowercase scheme, no remote or
  `localhost` authority, no query or fragment, and a platform-absolute local
  path.
- Exact native paths are a distinct typed source. References that need
  interpretation use a separate bounded source that main validates
  independently.

**Path resolution**

- A positive `:line` or `:line:column` outside closing quotes is decoration; a
  suffix inside quotes is part of the filename. An unquoted suffix first names
  the exact file and falls back to the unsuffixed target only on ENOENT, never
  on permission, format or decode failure. Exact native sources, picker
  selections and file URLs have no suffix interpretation.
- Main checks platform locality before reads. UNC/device, drive-relative and
  Windows root-relative paths are rejected. Windows paths must include a drive,
  and UNC/device paths are rejected even from the native picker.
- Relative activation opens a native directory picker at the local user's home;
  only the explicit selection supplies the base. Cancellation is inert. Every
  activation asks again; no base preference or cwd is kept. Normal `..`
  resolution applies; this is not a filesystem sandbox.
- Home and absolute references need no base picker. Resolved paths must pass
  the same local absolute validation and source-length bound.
- A clicked path always addresses the machine running OMXTerm, wherever its text
  came from.

### Local Image Preview

- No source opens an operating-system URL handler. Only after activation, main
  reads the target through a non-shell regular-file boundary. On macOS and
  Linux, that read rejects a symlink in the final path component.
- The content must be a structurally valid, natively decodable static PNG or
  JPEG of at most 64 MiB encoded, 8192 pixels per side and 32 million pixels
  (inclusive). APNG and every other animated or unsupported format are rejected
  regardless of extension.
- A Terminal Window allows at most one picker or activated-source read at a
  time. Owner closure makes late picker, read and decode results inert.
- The renderer receives only the bounded, validated name, dimensions, media type
  and bytes, never a filesystem API or path. It creates a memory-only Blob URL
  under the production CSP. Dismissal, replacement failure, page teardown or
  owner close synchronously removes the image source and revokes the URL.
- The input bounds are not a total memory budget: validation, IPC, browser
  decode and GPU resources can add transient copies. Dismissal releases
  application ownership, not necessarily RSS or GPU memory right away.
- The preview fits the whole image proportionally in the overlay, also after
  window resizing, without clipping or stretching.
- Failed reads, PNG/JPEG validation failures (including APNG) and decode
  failures show a fixed load error without the path. Unrecognized formats such
  as WebP show a separate fixed format message, regardless of extension or
  successful path recognition.
- OMXTerm never infers a relative base, performs shell expansion, consults the
  shell or agent cwd, fetches or transfers a remote image, treats OSC 8
  metadata as a local source, logs image paths or payload, writes or downloads
  image data, or persists the preview.

### Mouse and context menu

- Application mouse modes own button, motion and wheel reporting in normal and
  alternate screens. Shift keeps the selection override. Explicit copy and
  valid modified-link gestures (web or local image) produce no duplicate PTY
  mouse input.
- `terminal.contextMenuEnabled` accepts only a boolean and defaults to true.
  Omission or true preserves eligibility for the native menu, even when Restty
  has cancelled the canvas context event for application mouse reporting.
- False suppresses the popup over terminal content and padding for every
  modifier, mouse mode and origin, keyboard included. The DOM default is still
  cancelled; mouse input, clipboard actions and OSC 52 are not affected. There
  is no Shift exception or mouse-mode policy for reaching the menu.
- The Scrollback Search field, Snippets, Settings and Window Chrome keep their
  menus. Edit actions and keybindings stay available, but turning the popup off
  reduces pointer access and discoverability; this is not an accessibility
  guarantee.
- Reloads apply to existing, hidden and mounting panes without replacing a
  Surface, core or Live Terminal Session.

### Scrollback Search

- Opens only through **Edit → Find…** or the `find` keybind (`Cmd+F` on macOS,
  `Ctrl+Shift+F` on Linux and Windows). Opening focuses the query field; Find
  again focuses and selects the query.
- Restty's search bar searches the focused pane's retained Scrollback Buffer and
  visible screen. Evicted output is not searchable.
- Keys act on the bar only while its query field has focus:
  - `Enter` or the down button selects the next match below (newer output);
  - `Shift+Enter` or the up button selects the previous match above (older
    output);
  - `Escape` or the close button closes the bar and returns focus to the
    terminal. The bar owns the whole closing Escape gesture: its held repeats
    and its release never reach the terminal, including under Kitty keyboard
    event reporting.
- While the terminal has focus, `Enter`, `Shift+Enter` and `Escape` are
  ordinary terminal input even with the bar open. Window focus returns to the
  query field only if it had focus before.
- While the field has focus, application Copy, Paste and Select All (from the
  menu, a keybind or the context menu) act on the query instead of the terminal.
  Paste inserts clipboard text at the field's selection with line breaks
  replaced by spaces; nothing reaches Protected Paste or the PTY.
- The bar, including its match counter, follows the active Terminal Theme.
- Each Surface has its own query. The query and its matches stay in renderer
  memory: never persisted, logged, written to the PTY or sent to main. Only an
  explicit Copy from the field moves query text, through the normal clipboard
  IPC.
- Find is ignored while a Local Image Preview or About owns modal input.

### Terminal export

- The terminal context menu offers **Export Selection…** when selected text
  exists, otherwise **Export Terminal Content…**. The label and kind are
  captured when the menu opens. A field menu offers editing only. Turning the
  context menu off also removes the export offer.
- Content export reads the source pane's retained Scrollback Buffer and screen,
  or only the alternate screen when it is active, without modifying the
  selection.
- The one-shot popup belongs to its exact pane and Surface. Pane or tab changes,
  pane end or removal, a field or newer popup, and owner disposal invalidate it.
  A matching blocked or wrong-kind callback consumes its own claim without
  reading; a stale callback cannot consume a newer one. A valid callback
  snapshots the text once, before the dialog opens, so later focus changes do
  not change it.
- The limit is 16 MiB of UTF-8 (inclusive), measured in bytes and checked
  independently at preload and main. Retained terminal content can exceed it.
  Over-limit text is neither truncated nor sent; main says nothing was saved and
  suggests a smaller selection.
- Main owns the native save chooser, the suggested timestamped text filename and
  overwrite confirmation. Cancellation writes nothing. Whitespace-only text
  shows a notice instead of a chooser.
- Files use UTF-8 with LF line breaks. Row padding and trailing blank rows are
  trimmed, with exactly one final line break. New files are owner-only on macOS
  and Linux.
- Setup (including a failed text read), chooser and write failures show a
  fixed, actionable notice without private details. Notices are not retried. A
  failed selection read still opens the menu with content export.
- Owner loss before the chooser resolves means no write and no orphan notice; a
  write already started may finish.
- Export is user-requested, never automatic. Payload and destination stay out of
  operational logs.

## Clipboard

Clipboard access is explicit and one-way
([ADR 0009](adr/0009-keep-clipboard-access-explicit-and-one-way.md)); file paths
are inserted as lexical shell-quoted text
([ADR 0021](adr/0021-insert-lexical-shell-quoted-paths-through-protected-paste.md)).

### Copy and paste

- Selection never copies automatically.
- `Ctrl+C` and `Ctrl+V` stay PTY input.
- `Cmd+C` and `Cmd+V` on macOS, `Ctrl+Shift+C` and `Ctrl+Shift+V` on Linux and
  Windows, and the native context menu perform explicit text copy and paste.
- These are the built-in keybind defaults. A `keybinds` remap can move copy or
  paste, or bind an action onto a bare `Ctrl+<key>` that is otherwise PTY input.
  `CommandOrControl` resolves to `Control` off macOS, so importing another
  platform's map can do this by accident. Such a remap is honored, with a
  warning when it shadows a PTY control key on the current platform.
- Terminal Paste stops active [Mirror Typing](#mirror-typing) synchronously
  before payload filtering, clipboard reads or confirmation, even for empty or
  unsupported payloads. Ordinary Protected Paste to the original target follows;
  it never fans out.
- Any non-empty plain text, including whitespace-only text, is pasted unchanged
  and takes priority over every file-list representation.
- Multiline or control-character paste asks for confirmation only when the
  receiving process has not enabled bracketed paste.
- Paste is never truncated, interpreted, summarized or logged.
- Image clipboard behavior belongs to the child CLI. OMXTerm forwards its key
  input but never moves image bytes through the PTY.

### File-list paste

- When text is empty and the clipboard exposes a supported native file-manager
  file list, Paste inserts its paths in the same form as a file drop. Plain-text
  URLs and non-file URI-list entries are never treated as paths.
- On Windows, clipboard Paste inserts the single Explorer `FileNameW` path that
  Electron exposes. Dropping several Windows files stays complete and ordered.
- Inserted paths are lexical platform-absolute values: OMXTerm never reads,
  resolves, normalizes or checks the target.
- A malformed, empty, over-bound or mixed list inserts nothing. A list accepts
  at most 256 paths, each at most 32,768 UTF-16 code units, with at most
  1,048,576 code units in the decoded source or formatted result. A serialized
  native UTF-8 source above 1,048,576 bytes is rejected before decoding.
- On macOS and Linux, each path is an independently single-quoted POSIX shell
  token; an apostrophe is written as closing the quote, a backslash-escaped
  apostrophe, and reopening it.
- On Windows, each path is an independently single-quoted Windows PowerShell 5.1
  token; U+0027 and U+2018 through U+201B are doubled.
- Tokens are separated by one ASCII space. The encoding is fixed by platform,
  not by `windowsShell`, and assumes insertion at a fresh ordinary
  argument-token boundary in that shell. Without Shell Integration, correct
  syntax in another shell, a partial quote, an SSH session, a REPL or a TUI is
  not promised.

### Paste delivery

- Semantic paste, snippet and path-insertion operations keep request order
  without delaying ordinary keyboard input.
- The current bracketed-paste mode and Surface ownership are checked again after
  asynchronous clipboard reads or confirmation.
- If the owning Surface closes mid-delivery, later chunks stop and a
  submitting snippet never appends Enter. Bytes already sent cannot be recalled;
  there is no rollback or replay.
- For the Files path capability, each chunk awaits a main-session receipt. An
  unresolved or lost receipt stops that path and fences later queued semantic
  input until a definitive late receipt, if any; keyboard input stays direct. A
  bracketed path stopped before its last chunk still sends the closing paste
  marker, so the shell never stays inside the paste.

### OSC 52

- OSC 52 may write the clipboard only for target `c` with non-empty, canonical,
  padded Base64 that decodes as UTF-8.
- The handler payload (`c;` plus the Base64, without the OSC introducer,
  command or terminator) may be at most 10,000,000 UTF-16 code units; see
  [Unfinished control budget](#unfinished-control-budget). A canonical request
  within the bound is accepted whole; a larger one is consumed without action.
- Clipboard read, clear, invalid-target, malformed, non-canonical, cancelled and
  over-bound requests are consumed with no clipboard action and no PTY reply.

## Configuration and local state

The [User Configuration guide](configuration.md) has examples, the field
reference and troubleshooting. [ADR 0002](adr/0002-xdg-for-user-configuration.md)
and [ADR 0003](adr/0003-strict-non-mutating-user-configuration.md) explain the
location and the strict, non-mutating model.

### Configuration location and first-run kit

- The file is `$XDG_CONFIG_HOME/omxterm/config.json`, or
  `.config/omxterm/config.json` under the account's home directory when
  `XDG_CONFIG_HOME` is unset or empty, on every Supported Platform.
- At startup, any existing `config.json` entry (even an invalid file, a
  directory or a dangling symlink) skips the whole initial kit without looking
  at snippets or themes.
- Otherwise OMXTerm creates the directory, a `config.json` with common built-in
  defaults (including explicit `window.blur: false`, `window.transparency: 0`
  and `theme.path: "themes/omtheme.json"`) and a copy of the bundled theme at
  `themes/omtheme.json`. Windows x64, which keeps built-in Snippets, also gets a
  non-executing literal-block example `snippets.yaml`; the extension targets
  (Linux ARM64/x64, macOS ARM64, Windows ARM64) leave it absent and the optional
  package provides an example. Shell, font family and shortcuts keep their
  implicit platform defaults.
- Existing sibling files are never replaced. Files are published complete,
  without overwriting concurrent creations, configuration last. A failure shows
  a non-blocking notice and loading continues.
- The kit runs only when the application opens, never at package installation
  or manual reload. The copied theme belongs to the user and does not follow
  later bundled palette changes.

### Default Snippets provisioning

Packaged builds for the extension targets try once to install the bundled,
pinned Snippets `0.1.0` archive, enabled but dormant. Windows x64 keeps built-in
Snippets. [One-time default Snippets](default-snippets.md) has the full policy.

- Only a fresh profile enrolls: early main capture must prove the default
  userData, configuration and state roots absent. Existing roots, links or
  errors, overrides, developer startup, changed identity and unsupported
  targets never enroll.
- At readiness main rechecks that identity and exclusively consumes the
  permanent `<userData>/provisioning/default-snippets` witness before any kit,
  log or store write. Any present, partial or unknown witness suppresses future
  attempts; a failed or uncertain attempt never retries.
- Installation uses ordinary generation-0 admission before the initial
  snapshot, so installed, disabled, tombstoned and concurrent choices win. It
  starts no backend or view and does no network, YAML, shortcut or restore
  work. Failures continue startup with a bounded warning or the
  unavailable-runtime handling.

### Configuration schema

A present file must contain `"version": 1` and only these keys:

- `language` (`en-US` or `pt-BR`), `confirmClose`, `logLevel` (default
  `info`), `windowsShell`;
- `font.family`, `font.size`, `font.lineHeight`, `font.ligatures`;
- `terminal.contextMenuEnabled` and
  `terminal.padding.{top,right,bottom,left}`;
- `scrollback.lines`;
- `keyboard.optionAsAlt`: `none` (default), `left`, `right` or `both`;
- `window.alwaysOnTop` (default `false`), `window.showTitleBar`,
  `window.showTabBar`, `window.blur`, `window.transparency`,
  `window.auxiliaryPanelSide`;
- `theme.path`;
- `keybinds.<action>` for the vocabulary under [Keybinds](#keybinds).

### Fonts and padding

- Default font: bundled FiraCode Nerd Font Mono regular, 16 px. Its real bold
  face renders SGR bold without changing the ANSI color. Coverage falls back to
  bundled DejaVu Sans Mono and JetBrainsMono Nerd Font Mono, then system emoji,
  CJK and symbol faces, then bundled Noto Sans Symbols 2.
- `font.ligatures`: boolean, default `true`; disabling changes neither the font
  nor the terminal text.
- `font.size`: integer pixels, 8–72 inclusive.
- `font.lineHeight`: row-height multiplier, 1.0–2.0 inclusive, fractions
  allowed, default 1.0; glyph size is unchanged.
- Padding: per-side integer CSS pixels, 0–128 inclusive; defaults top 0, right
  8, bottom 8, left 8. Top padding sits below the visible 30 px native title
  inset on macOS, or the 34 px app-drawn title row on Linux and Windows. Hiding
  the title area or going fullscreen removes only that app-owned space, never
  configured padding or the macOS safe area.

### Interface Language

See [ADR 0035](adr/0035-select-the-interface-language-explicitly.md).

- `language` is exactly `en-US` or `pt-BR`, default `en-US`, never inferred
  from the system locale.
- It covers native menus (including View → Pane), the Close Pane and Close Tab
  dialogs, pane Surface and separator accessible names, Window Chrome, the
  Auxiliary Panel, the Snippets Sidebar and preview, Settings, Local Image
  Preview, About and Scrollback Search, plus the document's accessibility
  language and resize value text.
- Main reads it from the active configuration whenever it builds a menu or opens
  a dialog. Renderers relabel in place, so a reload changes language without
  recreating tabs, Surfaces or sessions, even mid-mount. Visible Snippets
  errors, narrow-window notices and Surface failure notices relabel without
  rereading data or resetting their lifetime; a host keeps and translates a
  Surface failure notice until window teardown, even after an initial mount
  rejection.
- Stays English: validator detail in reload notices, technical cause detail in
  Surface failure notices, failures before configuration loads, Operational
  Events, `snippets.yaml` diagnostics, and system, Electron or Restty text
  OMXTerm does not set. Terminal Payload is never translated.

### Window defaults

- `window.showTitleBar` and `window.showTabBar`: booleans, default `true`. They
  set the initial visibility of new windows; a reload changes only future
  windows, and menu or keybind toggles never rewrite the file. The tab bar still
  needs two or more tabs to show.
- `window.auxiliaryPanelSide`: `left` or `right`, default `right`; other values,
  including `null`, are rejected. A reload applies it to existing and future
  windows without changing panel visibility, tool state or focus. Panel width
  and visibility are memory-only.

### Transparency and blur

[ADR 0029](adr/0029-compose-background-effects-with-explicit-cell-identity.md)
covers paint ownership and
[ADR 0030](adr/0030-prefer-direct-macos-background-blur.md) the macOS blur
adapter, its HUD fallback and cleanup.

- `window.blur`: boolean, default `false`. `window.transparency`: finite number
  0–1, default 0. Wrong types, unknown keys and out-of-range values are
  rejected, never clamped.
- A valid reload applies both to all current and future windows and tabs
  without replacing native windows, Surfaces or sessions. A reload rejected
  before application keeps the last snapshot; application-time failures follow
  the [partial-update limit](#validation-errors-and-reload).
- Zero is opaque; one removes the tint where native composition supports it.
  Transparency reduces only the background tint, painted once behind terminal
  content, padding, title chrome, tabs and the Snippets Sidebar. Chrome neutral
  overlays fade too; foreground controls, the selected-tab indicator, glyphs
  (including antialiasing and SGR faint), cursor, selection and Inline Terminal
  Images do not.
- Implicit default cell backgrounds (including SGR 49) show the tint. Explicit
  ANSI and RGB backgrounds stay opaque **even when they equal the theme
  background**, including background-color erase and alternate screens; inverse
  text is opaque too. A TUI that paints its own background may stay opaque.
  Theme colors stay strict `#RRGGBB` with no opacity field.
- With positive transparency, `blur: true` requests native macOS background blur
  (radius 20), Windows Acrylic, or the KDE blur-region hint on each owned X11
  window when `xprop` is available. Effects apply after native show without
  recreating a window, Surface or PTY. There is no background retry; a later
  reload, show or restore may retry.
- Blur is best effort. The OS or compositor may ignore it or keep its own tint;
  missing helpers and native errors are quiet fallbacks, never launch
  prerequisites; API success does not prove visible blur.
- Windows windows stay non-transparent natively to keep resize, maximize,
  fullscreen, corners and shadow. Transparency without blur renders opaque.
  `blur: true` can show the tint through Acrylic on Windows 11 22H2 or later;
  earlier or unknown versions and failed material calls stay opaque (including
  after theme changes), and main publishes effective transparency zero for that
  window while keeping the configuration unchanged.
- Not provided: Wayland blur, compositor or accessibility changes, pixel parity
  across platforms, blur strength or material selection, whole-window opacity,
  CSS backdrop filters or screen capture.

### Windows default shell

- `windowsShell` is an optional non-empty string without NUL on every platform.
  macOS and Linux accept it without filesystem access and ignore it.
- On Windows it must be an absolute path whose final target (through links and
  reparse points) is an existing regular file; inspection failure is invalid.
- The path is used as written for each new Default Shell session, passed to the
  PTY with an empty argument vector. No expansion, shell detection, ACL or
  executability check, spawn preflight, extra arguments, wrapper or command
  string. Existing sessions keep the shell they started with.

### Keybinds

[ADR 0018](adr/0018-deliver-menu-refused-accelerators-in-main.md) covers native
identity and main-process delivery.

Vocabulary:

- `keybinds` remaps this fixed action set: `quit`, `copy`, `paste`,
  `selectAll`, `find`, `newWindow`, `closeWindow`, `newTab`, `closeTab`,
  `nextTab`, `previousTab`, `selectTab1`–`selectTab9`, `zoomIn`, `zoomOut`,
  `actualSize`, `toggleFullScreen`, `toggleSnippets`, `toggleFiles`,
  `toggleSshConnect`, `toggleAuxiliaryPanel`, `toggleTabBar`,
  `moveAuxiliaryPanel`, `toggleTitleBar`, `reloadConfig`, `splitRight`,
  `splitDown`, `closePane`, `focusNextPane`, `focusPreviousPane`,
  `focusPaneLeft`, `focusPaneRight`, `focusPaneUp`, `focusPaneDown`,
  `equalizePanes`, `commandPalette`. New actions, global shortcuts, chords and
  per-platform maps are unsupported.
- A value is `null` or a case-insensitive Electron accelerator with exactly one
  key and at least one non-Shift modifier. Only `F1`–`F24` may be bare or
  Shift-only.
- Omitted actions keep platform defaults. Linux and Windows use `Ctrl+Shift+F`
  for Find and `F11` for full screen; macOS uses `Cmd+F` and `Ctrl+Cmd+F`.
  Command Palette is `CommandOrControl+Shift+P` on macOS and `Control+Shift+P`
  elsewhere.
- `null` removes only that shortcut: the menu item stays, and OMXTerm stops
  consuming the key (the OS or another binding may still take it). A `null`
  entry holds no shortcut and cannot collide.
- One Action Catalog feeds the native menu, the Command Palette and the main key
  matcher; the menu shows the effective accelerator. PTY control sequences are
  untouched.

Files and SSH Connect slots:

- `toggleFiles` and `toggleSshConnect` default to `null` everywhere. They reuse
  the installed tool's action and guards and its single File-menu and palette
  entry. Other extension contributions get no configurable shortcuts.
- A missing, disabled or unsupported tool keeps its configuration but has no
  entry or active shortcut, so its key is not consumed. Collision checks ignore
  installation state, and nothing is activated, installed or enabled to check
  availability. Later activation failures use the existing unavailable
  handling.
- They toggle like other tools (close visible, reveal hidden, or open fresh).
  One press invokes once; its repeats and release stay owned across focus
  transfer and never reach the terminal. Recording takes priority.
  `moveAuxiliaryPanel` is also once-per-press; other actions keep their repeat
  behavior.

Validation:

- Unknown actions, malformed accelerators and duplicates are errors under the
  [resilient failure contract](#validation-errors-and-reload). A previously
  valid file that now collides is rejected the same way, never rewritten.
- Duplicates are judged on the effective native map: `CommandOrControl` is
  `Command` on macOS and `Control` elsewhere; `Super` and `Meta` are the Command
  family; `AltGr` is distinct from `Alt` and `Control+Alt`; intrinsic Shift
  counts (`Control+!` = `Control+Shift+1`; `Control+Plus` =
  `Control+Shift+Plus` = `Control+Shift+=`); on macOS, Option-only top-row and
  keypad bindings for the same digit (`Alt+9`, `Alt+num9`) collide.
- Colliding with another action's remaining default is the same error;
  OMXTerm never reassigns a shortcut. The diagnostic names both actions and the
  parsed key, and suggests another shortcut or `null`.
- A binding that resolves on the current platform to a bare `Ctrl+<key>`
  shadowing a PTY control key (`Ctrl+C`, `Ctrl+D`, `Ctrl+Z`, `Ctrl+\`,
  `Ctrl+U`, `Ctrl+W`, `Ctrl+A`, `Ctrl+E`) stays active with a warning naming the
  action and key.

Delivery:

- When the platform refuses a menu accelerator (macOS never delivers
  `Control+Tab` to a menu item), main runs the action from the key event and
  consumes the key. There is no second shortcut system.
- Plain Alt never triggers an AltGr-only binding; delivery needs the native
  AltGr identity. The matcher requires the
  logical character and native key position to agree and does not translate
  arbitrary layouts.
- On macOS, a main-only native provider may map a fresh, unambiguous
  Option-only `KeyA`–`KeyZ`/`Digit0`–`Digit9` keydown to its current-layout
  identity for recording and delivery. Anything unverifiable (repeats, IMEs,
  dead keys, mismatches) falls back to the normal matcher. Nothing is cached or
  sent to the renderer.
- `keyboard.optionAsAlt` affects terminal input only.
- Logical keypad (for example keypad Minus for Zoom Out) and logical `Plus`
  delivery still work; `Plus` without explicit Shift also accepts an unshifted
  `+`. Logical keypad fallback follows the configured character and explicit
  Shift, separately from intrinsic native Shift. A specific keypad binding
  wins. Plain `Control+=` stays terminal input unless remapped. These
  conveniences add no second identity and allow no duplicate registration.

### Snippets file

- Optional, user-owned `snippets.yaml` next to `config.json`. OMXTerm never
  creates (outside the kit), rewrites or migrates it; absence is the empty
  state. It is reread each time the sidebar opens. `snippets.json` is not read.
- Published Snippets `0.1.1` resolves it with the account-home fallback; the
  installed or bundled-default `0.1.0` can resolve a different file when XDG
  is unset or empty and the environment home is overridden. The bundled default
  stays `0.1.0`. Updating is deliberate. See the
  [Snippets migration guide](snippets-migration.md).
- One UTF-8 YAML 1.2 core document (parsed with `yaml` v2): exactly
  `version: 1` and a `snippets` array of at most 512 entries. Each entry has
  `name` (non-empty, ≤128 UTF-16 code units), `body` (non-empty, ≤65,536),
  optional `description` (≤512) and optional boolean `execute` (default
  `false`).
- Limits: 1 MiB read, rejected before decoding; at most 16 collection levels
  (the root is level 1) and 4,096 total mapping pairs and sequence entries
  (mapping keys included), checked iteratively before recursive composition.
  Duplicate keys, aliases, custom or non-core tags, non-scalar keys, non-1.2
  versions and multiple documents are rejected. Literal block chomping (`|-`,
  `|`, `|+`) is preserved.
- Injection uses Protected Paste. Without bracketed paste, multiline or
  control-character bodies need approval and are then delivered unchanged. With
  bracketed paste, the body goes as one bracketed paste without confirmation,
  but a body containing the closing marker (`ESC [ 201 ~`) is refused whole
  before any bytes or Enter, using the localized clipboard failure notice and
  leaving the Surface usable. This rule is shared by clipboard, DOM paste,
  snippets and path injection and never rewrites literal content.
- `execute: true` sends Enter after the body (and any closing marker); `false`
  sends nothing more. The preview's Insert/Run choice overrides it (see
  [Window and session behavior](#window-and-session-behavior)).
- An invalid file never blocks startup and is never silent: the sidebar shows
  the resolved path and the field location or line/column in place of the
  list, never parser excerpts or arbitrary parser messages. The terminal is
  unaffected.
- Built-in Snippets: main validates and sends typed data over the preload
  bridge. Extension targets: the installed backend reuses the same parser and
  root logic and returns activation-scoped snapshots in bounded pages; install,
  disable and uninstall never touch the file. Core keeps semantic-input and
  preview authority in both modes
  ([ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md)).
- Snippet contents are never logged.

### Terminal Themes

Selection:

- Absent `theme` uses the bundled [`omtheme`](omtheme.json). A present `theme`
  holds exactly one required `path`: non-empty, no NUL.
- Absolute paths are used as written; relative ones resolve from the logical
  directory of `config.json`, even if it is a symlink. No `~`, variable, shell
  or URL expansion. Symlinks must end at a readable regular file.
- Main loads the theme as part of the complete configuration load and sends
  only validated data, so a manual reload can switch paths.

Format:

- Strict JSON with `version` (`1`), `name` (non-empty printable single line,
  ≤64 code points), `colors` and optional `appearance`.
- `colors` has exactly the foreground, background, cursor, selection foreground
  and background, and the 16 normal and bright ANSI fields of
  [`omtheme`](omtheme.json), each a case-insensitive `#RRGGBB`. No alpha,
  partial palettes, CSS names or functions, inheritance or imports.
- `appearance` accepts only `paneDivider`, `auxiliaryPanelDivider` and
  `activePaneHighlight`, each optional and `#RRGGBB` or `null`. An empty object
  is valid; a `null` or array object, unknown keys and other scalars are
  rejected. Omitted fields stay omitted in validated snapshots and restore
  application defaults on reload (dividers mix foreground into background at
  18% at rest, 45% on hover and drag). Explicit divider colors stay exact at
  rest, on hover and while dragging. `null` hides only that decorative paint,
  never layout, hit targets, ARIA, keyboard controls or keyboard focus paint;
  foreground focus paint wins over divider colors, including during drag.
  Appearance-only reloads repaint chrome without refitting the Surface. The
  color palette itself stays complete and non-nullable. Older builds reject the
  object; no migration happens.
- OSC 104 resets the 16 ANSI colors to the latest applied theme (all or the
  requested indices); indexed resets leave other OSC 4 overrides alone. Live
  theme changes replace those 16 overrides but keep extended-color overrides; a
  full OSC 104 also resets extended colors. RIS and DECSTR do not reset the
  palette.

Settings → Appearance picker:

- Lists direct `themes/*.json` entries beside the logical configuration path
  (linked directories and files included) by name and path, plus the built-in
  default, so duplicate names stay distinct. Main validates candidates and
  exposes bounded palette previews and diagnostics through the Settings bridge.
  The configured entry is matched by equivalent relative or absolute logical
  path; a path to some other alias is not assumed to identify one of several
  entries. Missing, empty, unreadable, invalid or truncated discovery is
  reported, never treated as the default. Discovery never modifies themes or
  changes relative-path semantics.
- Refresh is explicit; there is no watcher. A scan reads at most 2,048
  directory entries, 128 JSON candidates, 256 KiB per theme and 4 MiB of
  configuration, and reports truncation.
- Selecting saves `theme.path` through the normal validation and reload path;
  the default removes it. A custom path field stays available.
- Unstarted graphical requests for the same `theme.path` or
  `window.transparency` field coalesce to the latest choice. In-flight work is
  never cancelled. Reads, raw saves, shortcut changes and other field changes
  are ordering barriers that coalescing never crosses. Superseded requests
  settle as superseded (not saved) with the winning request's snapshot; the
  winner keeps the normal save/error/application feedback. Closing Settings
  keeps the final queued choice. A pending choice shows as saving; afterwards
  cards show the saved configuration, which is not proof it applied.

Theme editor (inline, retained):

- New starts from the bundled palette; Edit rereads a card's full file without
  selecting it; Import copies a file picked through a window-owned native
  chooser and is never an overwrite target. Every authoring read (including
  guarded-write comparisons) is capped at 256 KiB, needs a readable regular
  target and is validated; unknown fields or versions and partial palettes are
  rejected, not repaired. The editor never rebuilds a theme from the picker's
  eight-color summary.
- The name, a 21-role selector, a native color well and a hex field edit the
  in-memory draft. Invalid input stays tied to its role across selection and
  category or tab changes. Save, copy and export stay disabled until every
  visible or retained input is valid; the specimen uses the last valid colors.
- The DOM preview shows foreground/background text, cursor, both selection
  colors and the eight normal/bright ANSI pairs (normal above bright, kept
  together as the grid reflows), each with a readable name, an `Aa` sample on
  the draft background and a solid swatch, plus a translated hint. Only sample
  paint reflects draft contrast. It is not a live Surface, PTY or
  desktop-effects simulation and never paints the document root or live
  configuration.
- An omitted or empty `appearance`, hex and `null` values, and untouched color
  spellings survive every operation, even without dedicated controls.
- Save guard-replaces the resolved target by revision, keeping links. Save copy
  writes a new direct `themes/*.json` (two-space JSON, trailing newline,
  portable OS-safe leaf name, no path or shell expansion) and never replaces an
  existing file; a successful copy becomes the base for later Saves.
- Export publishes the captured valid draft through a window-owned native save
  chooser without replacing anything; the UI explains the choose-a-new-name rule
  first, even if the platform dialog offers replacement. Export returns no
  writable base, changes no configuration and does not mark edits as saved.
- Copy and export fail rather than clobber when no-replace linking is
  unavailable. Publication followed by a cleanup failure still counts as saved
  or exported, with a warning.
- Detected revision, target or permission changes keep the draft and offer
  reload or copy, never automatic overwrite, rebase or retry. Linked parents,
  private temporary files, mode preservation, identity-checked cleanup and
  last-check races follow ADR 0003; no cross-process atomic compare-and-swap is
  promised.
- Saving a theme file never writes configuration. Use saved theme needs a clean
  saved draft and submits its logical path as an ordinary field change (even
  when already configured), validating the current configuration and file
  bytes, not a draft snapshot. File-save and configuration status stay
  separate; failure or partial application never rolls back the theme file.
- One operation at a time per editor; typing continues during Save or export,
  keeping the submitted bytes' base revision. Responses never overwrite newer
  input or focus retired or hidden editors. Category and tab changes keep the
  editor.
- Cancel or closing Settings drops unsaved edits without undoing completed
  operations or cancelling accepted writes; there is no close prompt. Chooser
  cancel is a no-op; disposed or destroyed owners cannot accept late choices.
  Unknown transport outcomes require refresh or reopen before another write.
- Theme operations share the Settings ordering barriers, but a chooser waiting
  on the user does not hold the queue. Relabeling keeps inputs, revisions and
  caret.

### Validation, errors and reload

Strictness:

- Unknown keys, including `""`, are rejected at every configuration, theme and
  snippet object, never ignored.
- Errors include invalid JSON or UTF-8, unknown or missing keys, unsupported
  versions, missing fonts or theme files, invalid Windows shell targets,
  non-regular theme targets, invalid theme fields or colors, and out-of-range
  or non-integral numeric values.
- OMXTerm never migrates, repairs, rewrites or silently ignores configuration;
  only an explicit [Settings](#settings-editor) change writes it.

Startup:

- Errors never stop OMXTerm from opening. An invalid `config.json` uses
  built-in defaults for everything; an invalid or missing theme uses `omtheme`
  and keeps the rest. Fallback is always built-in defaults, never a cached
  configuration. Files stay unchanged.
- The exact problem (with the path when relevant) goes to stderr and a
  persistent, non-blocking in-app notice that says which defaults are active.
  The same surface carries warnings for valid configurations, such as control
  key shadowing. Notices never expire on a timer: time alone never resolves a
  font error or applies creation-time settings.

Manual reload (`View -> Reload User Configuration`):

- Runs one full startup-equivalent load, serialized in request order. Success
  replaces the snapshot and notices, sets the log level and applies settings to
  consumers in sequence. Absence selects defaults without creating a file.
- A rejection before application keeps the last configuration and shows the new
  failure. An exception during application does not roll back what was already
  applied (snapshot, log level, consumer effects); the notice saying the last
  configuration was kept is then not proof of rollback. Snapshots are delivered
  whole, but consumer updates are not atomic.
- A later successful reload replaces resolved errors and stale warnings with
  notices from the current validation.

Live and restart-only settings:

- Theme, language, font size baseline, padding and Window Font Zoom apply live
  and keep the Surface and PTY. Font and spacing changes recompute native
  minimum-window bounds and refit the same Surface and PTY, within the layout
  limits in [Window and session behavior](#window-and-session-behavior).
- `font.ligatures` applies through the Restty runtime setter without reloading
  fonts. Option Key Mode changes only later keyboard events. Reducing
  scrollback (including to zero) uses the selected Surface's in-memory behavior
  from [Terminal behavior](#terminal-behavior).
- Invalid, missing, unreadable, unsupported or corrupt configured font input
  rejects the whole reload.
- `font.family` and `font.lineHeight` are restart-only for existing Surfaces.
  New tabs and windows use the new values; a persistent notice names each
  deferred setting until every surviving Surface (including one still
  starting before its PTY) already uses the requested value; repeating a reload
  cannot clear it while an older Surface survives. Main keeps each Surface's
  creation-time family and line height rather than inferring them from the
  configuration at PTY startup. Registration, removal and window disposal
  reconcile the notice without another reload; with no owners, no restart is
  needed. Clearing resolved restart information keeps current errors and
  warnings.
- Native font-byte loading is separate: a read started while its family was
  current may finish for its surviving creation-time consumers across a reload
  (including change-away-and-back). Controller disposal rejects late results,
  and cancelling one consumer does not cancel its siblings. A request must
  match the current family when received; a queued one superseded before it
  starts is rejected without a read. There is no arbitrary historical-family
  lookup. Loads stay serialized and bounded, and real failures still reject.

### Settings editor

**Settings…** in the application menu is a retained editor of the same
`config.json`. It has no default shortcut.

Controls:

- Covers `language`, `confirmClose`, `logLevel`, `windowsShell` (Windows), the
  font fields, `terminal.padding`, `terminal.contextMenuEnabled`,
  `scrollback.lines`, `keyboard.optionAsAlt` (macOS), the new-window defaults
  (`showTitleBar`, `showTabBar`, `alwaysOnTop`), `auxiliaryPanelSide`,
  `theme.path`, `transparency` and `blur`.
- A change saves immediately; clearing a field removes the entry. The language
  selector shows **English (United States)** and **Português (Brasil)** in any
  interface language.
- Appearance has a labelled native transparency slider (0–100%, 1% steps,
  percentage readout) and a desktop-blur checkbox. Pointer and keyboard input
  save while adjusting, updating the real windows rather than a preview;
  release adds no extra request and no view timer delays the final choice. A
  compact hint explains the endpoints and desktop/Windows requirements. Native
  blur stays distinct from the modal underlay blur.

Shortcuts page:

- Shows each action's effective shortcut and whether it is default, custom or
  unbound. Default removes the entry (and an emptied group), Unbind writes
  `null`, and recording writes an accelerator, all through the normal save.
- Recording is owned by main: the next candidate key is captured with the same
  identity delivery uses (including AltGr and bare F1–F24) instead of running a
  keybind or menu shortcut or reaching the terminal. Its held repeats and
  release are consumed, including overlapping invalid or modifier gestures; a
  fresh press after a lost release is new input.
- A new event reported as composing is not claimed by capture or the key
  matcher; already-owned repeats and releases stay consumed. Unmatched events
  keep normal native-menu routing.
- Only unmodified Escape cancels; modified Escape (including AltGr) can be
  recorded. Keys that cannot round-trip report invalid and keep capturing; the
  logical Plus/keypad exceptions still apply.
- On macOS the prompt and invalid feedback explain the Option-only letter and
  digit support and its dead-key and input-method limits, suggest Option with
  an arrow or function key, and separate terminal Option Key Mode from
  shortcuts. A dead-key sequence that never reaches main leaves the prompt up
  until another key, cancel or timeout.
- Capture ends after one key, on cancel, button or window blur, leaving the
  category or tab, an overlay, disposal or a real 30-second timeout that
  notifies the view. Its consumed gestures stay owned until release or a fresh
  press; window blur, renderer loss or reload and window disposal clear that.
- Each capture request, stop and notification carries a recording identity: a
  retired notification cannot save or cancel a newer recording, and a retired
  stop cannot release its keyboard.
- Record/Cancel, Unbind and Default have localized, action-specific accessible
  names that follow the current operation.

Config File page and writes:

- Shows the raw document with explicit **Save** and **Reload File**.
- Every write validates fully and replaces the file atomically. Field changes
  keep all other entries. A raw save is refused when the file changed since the
  draft loaded, and a dirty draft is never overwritten.
- A final destination, bytes, presence and permission comparison before
  replacing rejects detected external edits or retargeting, without retry; the
  race after it remains (no cross-process compare-and-swap).
- Settings follows symlinks (relative, chained, linked parents) and replaces the
  resolved regular file, keeping the links. Dangling or cyclic links and
  non-regular targets are refused with guidance. An absent file may be
  created.
- Basic permission bits are kept where supported; hard links and other
  metadata are not. The destination directory must be writable. New files and
  temporary files start with mode `0600` where supported; inherited ACLs still
  apply. Cleanup failures report a possible leftover temporary file.
- Snapshot text uses the loader's UTF-8 decoding (dropping a leading BOM).
  Revisions identify the resolved destination and exact persisted bytes.
- Requests go straight to main's serialized queue, so a reopened view never
  overtakes earlier writes. Pending responses keep newer or unrelated drafts,
  and saving feedback waits for queued changes. Raw operations are
  single-flight while typing continues; newer edits keep the saved revision as
  their base and are reported as not saved. Closed views ignore late results.
- The status line distinguishes saved and applied, saved but not applied (even
  when reload throws after persisting), new-window or session-only, and
  restart-needed settings. Both save routes include returned notices and the
  deferred lifetimes of changed effective values, not no-op spelling
  changes.

While Settings is selected:

- Pane commands, Find, snippets, file-drop insertion, font zoom and Toggle
  Snippets are no-ops; window and tab actions still work, and configuration
  updates reach hidden terminals.
- Copy, Paste and Select All act on the focused field; unsupported controls
  consume them as no-ops, never falling through to a terminal. Retained
  terminal-popup targets cannot become field edits. Clipboard reads recheck the
  interaction generation as well as focus, value and selection; tab
  deactivation, modals, focus loss and disposal invalidate them. Hidden save
  results may settle without taking focus.
- The Auxiliary Panel is suspended, keeping its selected view and query, scroll
  and width memory, and restored when a terminal is selected again; Snippets
  still rereads on activation.
- Language changes relabel everything in place without losing draft bytes,
  revisions, focus, caret, selection, scroll, page or pending work, and without
  any read or save. App-owned message identities cross IPC separately from
  literal validator detail, so late results also use the current language. The
  main user-file banner keeps its rendered-text contract. Settings diagnostics
  never enter operational logs.

Layout follows the [UI style guide](ui-style-guide.md#settings-layout): a
full-area, theme-aware page with six core categories plus Extensions, sized for
640×480 without changing native window minimums, scrolling instead of
clipping. Core notices use theme green, red and yellow for success, error and
warning (informational ones stay neutral) and repaint on theme changes;
installed extension notices keep their own styling. Native control
color-scheme follows palette luminance. None of this guarantees accessibility
for arbitrary custom palettes.

### Operational logs

See [ADR 0004](adr/0004-log-the-operational-envelope-not-terminal-payload.md).

- JSONL under `$XDG_STATE_HOME/omxterm/logs`, falling back to
  `~/.local/state/omxterm/logs`. Levels: `error`, `info`, `debug`. Only the
  current and previous files are kept, 5 MiB each.
- Manual reload logs requested, succeeded and rejected outcomes with duration
  and a failure category only.
- Logs may describe lifecycle, validation, IPC, PTY control, resize, duration
  and failures. They never contain PTY input or output, clipboard data,
  environment, configuration contents, paths in reload records, executable
  names, arguments, commands, titles, secrets, transcripts, URLs or archive
  contents.
- Explicit copy, local search and export are not logging. Search stays in
  memory; export writes only the requested text to the chosen file. Neither
  authorizes automatic recording or diagnostic capture.

### Network access

- No analytics, telemetry, crash reporting, update checks or remote logging.
- Remote requests happen only for deliberate official-catalog browsing and
  HTTPS extension archive installation, on the extension targets. Child
  processes keep their normal network access.
- Main selects the macOS ARM64 catalog for `darwin-arm64` and the general one
  for every other target, without merge or fallback. It fetches only on Browse
  or Refresh. Cards show the selected offer's platforms and distinguish target
  from host/API incompatibility. A failed refresh keeps a visibly stale
  snapshot; a cold failure is unavailable, not empty. Local management works
  offline. See [extension distribution](extension-distribution.md).
- Installs require exact archive size, SHA-256 and manifest identity, version
  and engines, then the one-shot trust flow. Manual archives check host/API,
  not catalog targets. Host compatibility is semver plus the narrow
  development-host bridges in the
  [archive contract](extension-installation-foundation.md#archive-contract).
  Update, Reinstall and downgrade never activate code automatically. Official
  means project-maintained, not sandboxed or signed.
- Main registers an early spellcheck policy for owned sessions: every core and
  hosted session disables the unused spellchecker, and Linux and Windows also
  clear the selected dictionary list. No dictionary is acquired or prewarmed,
  no alternate download URL or network blackhole is used, and there is no
  spelling UI. Text input and catalog operations keep their normal routes.
- The Extension View Host loads only its own epoch-local `omx-extension` origin,
  serving bounded bytes from a pinned immutable version. This enables no
  catalog fetching, downloads, external web content or public SDK. Remote
  origins, navigation, connect and browser-worker routes are refused
  ([ADR 0039](adr/0039-own-packaged-web-content-by-epoch.md)).

### Hosted extension content

Hosted content is optional Application Tab or companion-panel content; Settings
and terminal panes are unaffected.

- Main picks Files and SSH panel presentation from package metadata, without
  implying trust or extra capability. Identities and presentations are
  owner-bound; native views hide before host overlays show, and only a current
  owner is restored.
- Field input and clipboard stay in the child. Closing or crashing a hosted
  epoch retires its views, never core PTYs; requests racing retirement are
  refused by owner and identity checks.
- A rejected identity-bearing presentation blocks native views and overlays
  until every implicated identity has retired and a current native hide is
  acknowledged; retired content is never readmitted. Unrelated retirement,
  refused hides, close failures and epoch-cleanup failures do not clear it.
- `terminal.semanticInput.v1` sends explicit text, not keys, from the visible
  child into the currently selected Surface. Hiding or losing selection revokes
  it, even if the child is shown again; same-view geometry updates do not.
  Main captures the selection revision before admission and core refuses a
  changed selection. Insert, Run and preview reuse Protected Paste, modal
  exclusion and the built-in Snippets preview owner; native Enter repeats and
  release stay owned across focus handoff. Retirement cancels pending requests
  but not accepted input or sessions.
- `terminal.insertPath.v1` inserts one bounded absolute path, quoted by the
  shared platform policy, under the same admission and Protected Paste rules
  ([ADR 0021](adr/0021-insert-lexical-shell-quoted-paths-through-protected-paste.md)).
  Main checks its private selection and visible-admission stamps at entry and
  commit, and core checks selection independently, so a hide/reveal before
  commit cannot revive a request. Completion is reported separately from
  acceptance and means every chunk reached node-pty without a synchronous
  error, not that the shell read it; interrupted delivery may be partial and
  should be inspected before retrying.
- Neither capability lets a caller pick a terminal or reach the raw PTY. Older
  hosts reject unknown capabilities.
- On the extension targets the Snippets command opens the installed optional
  package or Extensions guidance; Windows x64 keeps the built-in view. Native
  child activity is separate from temporary visibility, and committed language
  and search/restore focus intent survive overlays.
- Packaged content can subscribe to read-only appearance (theme background,
  foreground and effective tint opacity). Initial and latest snapshots replay
  to bounded subscribers, including hidden views; epoch retirement stops
  updates. The child backing is transparent, so package CSS may show the
  window tint without fading foreground controls; opaque packages keep their
  paint. No configuration paths or blur control cross this bridge. SSH Connect
  also follows Interface Language updates, including in hidden views, without
  losing targets, drafts, focus or pending work and without rediscovery or
  reconnecting.
- Current Files source hides dot-prefixed entries and their expanded
  descendants (relative to the browsing root) by default; a typed dot-prefixed
  root still opens. Published Files archives keep their original behavior.
  - A localized, keyboard-accessible checked Actions menu item toggles them.
    The choice survives navigation and panel hide/reveal for that view, resets
    on Close or a new view and is never persisted.
  - Only the name rule applies: macOS `UF_HIDDEN` and Linux `.hidden` lists are
    ignored.
  - Filtering never changes files, discards expanded subtrees, interrupts
    listing or changes an editor's target. A filtered-out selection is cleared
    and focus falls back to a visible ancestor or row. Bounds, truncation and
    errors apply before filtering; a hint flags concealed entries without
    calling the folder empty.
  - In a focused browsing page or menu with a root, `Ctrl+H` (Linux) or
    `Cmd+Shift+.` (macOS, physical `Period` with logical `.` or `>`) toggles
    too. It ignores editable targets, IME composition, repeats and active
    editors, confirmations or mutations. Host and remapped shortcuts win.
- Installed extensions are immutable; a host update never changes them.

### Linux AppImage desktop installer

User guide: [Linux desktop installer](linux-installer.md). Rationale:
[ADR 0031](adr/0031-keep-linux-installer-choices-small-and-local.md).

- Accepts only a user-supplied, already checksum-verified local OMXTerm
  AppImage matching the host architecture (Linux ARM64 or x64), checked before
  execution. It never downloads, discovers releases, uses a package manager,
  elevates, changes the system or updates on its own.
- Commands: `install [--compatibility] <verified-local-AppImage>`, `uninstall`,
  `--version`, `--help`; no prompts.
- Owns exactly `~/.local/opt/omxterm/OMXTerm.AppImage`,
  `~/.local/share/icons/hicolor/1024x1024/apps/omxterm.png` and
  `~/.local/share/applications/omxterm.desktop`. Directories or other
  non-regular, non-symlink entries at those names are refused; files and
  symlinks (even dangling or pointing at directories) are replaced as entries
  without touching link targets. Uninstall removes only those entries and
  keeps unrelated files and parent directories.
- Install and update replace the three files in sequence under rollback traps,
  not atomically. Invalid input leaves the previous install untouched. Failure
  before the third replacement attempts restoration; an original it cannot
  restore stays at a reported backup path and is never deleted, and the first
  failure's status and diagnostics are kept.
- After the third replacement, rollback is disabled before staging and backups
  are removed. A cleanup failure can then exit nonzero with the new install in
  place and some originals gone, so a nonzero exit does not always mean the
  old install survived.
- At install time the helper tests real FUSE mounting and writes a fixed
  desktop entry that runs the AppImage directly or with
  `--appimage-extract-and-run`; launch does no detection. Mount discovery uses
  at most 50 observations 0.1 s apart. The mount child gets TERM with 20
  observations, then KILL with 20 more, and is reaped only after its exit is
  seen. A shutdown timeout fails the install even if KILL works; failure and
  handled interruption also clean the child up. If termination cannot be
  confirmed, install fails and reports the PID and staging directory.
- The desktop entry forces X11/XWayland even when the session prefers Wayland;
  direct AppImage launches follow the rendering rules in [Product](#product).
  Desktop Entry encoding keeps literal `%` and `"` in the path, and a fixed
  `sh` command passes the executable and arguments literally. AppImage
  extraction arguments come before Electron arguments.
- Only `--compatibility` adds per-process `LIBGL_ALWAYS_SOFTWARE=1` and
  `--ignore-gpu-blocklist`; it is never automatic and may cost performance or
  stability. A normal reinstall removes it.
- In an active Hyprland session with XWayland zero-scaling and all monitors on
  one positive scale other than `1`, install may record
  `--force-device-scale-factor`. Missing tools, bad reports, no session or
  mixed scales leave scaling alone. The choice is reported, fixed in the
  desktop entry and refreshed on reinstall.
- Neither option changes compositor policy, global environment, User
  Configuration, font zoom, title-bar preferences or the three-file ownership
  and rollback contract.

## Architecture boundaries

Electron main owns native windows, PTYs, filesystem access, configuration, logs,
clipboard capabilities, external-link opening, and bounded Local Image Preview
reads. The renderer runs with context isolation and without Node integration.
Main validates IPC request senders and payloads; preload validates response and
event payloads exposed by its minimal typed bridge. The font route accepts no
path; requests must name the active validated configured family. A started read
may return that captured family's bounded bytes across reload, together with
fixed local fallback candidates. Font paths, family names, and bytes
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

### Internal installed-package foundation

The internal Installed Packages module implements local archive
validation/installation, compatibility, immutable version pins, generation-based
admission, disable/tombstones and deferred physical cleanup. Linux ARM64/x64,
macOS ARM64 and Windows ARM64 source consume it through production Settings
with captured-byte trust. The bounded [Windows ARM64 source-composition checkpoint](windows-arm64-extension-composition.md#evidence-boundary)
is separate from packaged qualification. This foundation itself owns neither extension execution nor catalog/network
acquisition or a public SDK. Main owns HTTPS acquisition separately; terminal ownership is unchanged. Its implemented interface and
limits are governed by the [foundation contract](extension-installation-foundation.md)
and [ADR 0038](adr/0038-pin-immutable-installed-packages.md).

### Internal extension backend runtime

A separately owned backend runtime consumes Installed Packages through an
app-owned bootstrap. Normal macOS ARM64, Linux ARM64/x64 and Windows ARM64/x64 builds
include its artifacts and native lease addon. Windows x64 packages carry this
preparatory runtime without enabling production extension admission or changing
built-in Snippets, default provisioning or catalog targets. Windows ARM64 source admits the
same explicit management and activation and now selects optional Snippets. Its
earlier [bounded native source composition](windows-arm64-extension-composition.md#evidence-boundary)
passed separately from an [unpacked Windows ARM64 package inspection](windows-arm64-extension-composition.md#packaged-runtime-checkpoint).
That inspection checked runtime bytes, lease-addon unpacking and packaged
Node-mode store/lease/bootstrap loading, not packaged GUI activation or an
installer. A later [packaged-GUI checkpoint](windows-arm64-extension-composition.md#packaged-gui-composition-checkpoint)
exercised a minimal local extension on that retained directory. A later separate
[exact-NSIS checkpoint](windows-arm64-extension-composition.md#exact-nsis-installer-checkpoint)
passed on a new installer built from an independent copy. The later Windows
Snippets [ordinary source checkpoint](snippets-migration.md#windows-arm64-source-transition)
passed on exact dev.33 source, with synthetic-input and capture limits. Its full
portable, exact-package and public-consumption gates remain separate. Linux x64 now admits explicit extension
installation and activation through the existing production owners; its
[composition qualification](linux-x64-extension-composition.md) remains distinct
from earlier module, hosted-view and package checks. That historical composition
checkpoint left built-in Snippets and its starter kit unchanged; the later optional
Snippets transition and catalog promotion are described below.
The separate Files move
addon remains limited to macOS and Linux ARM64 and uses Linux
`renameat2(RENAME_NOREPLACE)` or macOS `renameatx_np(RENAME_EXCL)` through the
same bounded asynchronous interface, refusing unsupported filesystems and
cross-device moves without an overwrite-capable fallback. This primitive does
not establish full macOS Files support. Host source also supplies optional macOS
ARM64 trash through Foundation `NSFileManager` in the same native addon/owned
Node child, sharing its bounded asynchronous admission. Root, trailing separators
and empty/dot path components are refused rather than resolving a final symlink.
Already-aborted calls refuse before dispatch; dispatched work retains its actual
completion, with the existing request deadline and child retirement and no
cancellation/rollback guarantee. Native errors and missing results stay fixed and
path-free; no permanent-delete fallback, automatic retry, Finder automation or new
main RPC is added. Linux retains its literal gio trash command. Bounded
exact-package macOS ARM64 trash evidence covers final symlinks, recoverable
identity and local/distinct APFS volumes; the
[preview evidence](files-development-preview.md#build-and-evidence-boundary)
retains its limits. Full Files lifecycle and distribution remain separate.
macOS ARM64 production composition admits installation and explicit activation
through the same management/runtime/view owners as Linux ARM64. macOS ARM64 source
selects optional Snippets and omits its starter example from new configuration kits;
the package's duplicate Snippets action stays withheld. The [bounded source
qualification](snippets-migration.md#macos-arm64-source-transition) does not qualify
macOS Files or itself establish host publication. The separately
[published macOS ARM64 `0.24.0-dev.16` preview](snippets-migration.md#macos-arm64-published-preview)
uses optional Snippets, originally qualified with `0.1.0`; the official catalog
now offers `0.1.1`. The published Linux x64 `0.24.0-dev.30` preview also offers
the optional tool through the catalog or a local archive; its bounded public-HTTPS
checkpoint passed separately. The published Windows ARM64 dev.36 preview uses
optional Snippets after its exact-stage and separate FULL NSIS gates; its
[public boundary](snippets-migration.md#windows-arm64-published-preview-and-catalog-candidate)
still distinguishes pending installed public consumption. Published stable
`0.25.0` uses optional Snippets on Linux ARM64/x64, macOS ARM64 and Windows ARM64,
including its one-time new-profile default; Windows x64 and unchanged `0.23.0`
hosts retain built-in Snippets. Historical preview/0.24.0 receipts remain bound
to their recorded host/archive pairs. The [0.25.0 risk decision](snippets-migration.md#stable-0250-release-disposition)
accepts the remaining Windows/macOS limits for that release; terminal-input rules
in [ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md) are unchanged.
Isolated foundation/runtime builds remain available.
Explicit activation through the application manager lazily forks one
standard Node ChildProcess per active extension/application runtime using bundled
Electron Run-as-Node and Node IPC. Independent captured-version pins, fresh
parent/child admission checks and bounded epoch authority precede ESM import.
No store writer spans spawn, import or retirement. Cancellation revokes owned
infrastructure, not already admitted trusted Node effects.

Retirement allows two seconds of cooperation, then at most one owned forced kill;
actual exit and stream closure remain distinct from logical disposal or kill
acceptance. Unknown outcomes are not automatically retried. No custom supervisor,
PID reaper, sandbox or descendant-containment promise is introduced. This replaces
the proposed utility backend after observed macOS main-thread blocking, without
changing the separately owned web-content host.

The [runtime contract](extension-backend-runtime.md) and
[ADR 0040](adr/0040-run-backends-in-owned-node-children.md) govern its internal
interfaces, limits and qualification boundary. The [Files development preview](files-development-preview.md)
connects Settings local/HTTPS archive installation, shared namespaced actions, independently
pinned application views and bounded normal Quit retirement on Linux ARM64.
Startup constructs infrastructure but never activates installed code; explicit
shared action invocation does. The explicit
official catalog reuses the same installation owner/store; there is no public
SDK or extension shortcut configuration. An empty source catalog is valid but
does not constitute public distribution.
Files provides an expandable local folder tree with keyboard
navigation, discoverable Actions and item/background context menus. Its current
source includes the loaded-entry filter and focus/selection behavior described
above; the Rename / move menu item advertises F2. Its source
navigation toolbar uses quiet icon buttons with localized accessible names and
visible explanations on hover or focus; Go identifies Enter in the address field,
not a global shortcut. Explanations follow notice and language changes, hide while
their anchor is offscreen, and do not intercept other interactive targets. Their
unobstructed areas remain hoverable. Controls needing a root are disabled until
one exists. Up is disabled but remains focusable at the filesystem root, and New
folder is disabled while a mutation is pending. Refresh remains available during
listing. Existing menu and destructive confirmation labels remain explicit.
Operation editors retain captured targets. Current source permits a single
internal Files entry to be dragged onto a directory row, with valid/invalid
feedback, and offers the keyboard-accessible Move to folder action. External
payloads do not become internal moves. Both paths require confirmation of the
captured source and destination; source and destination identities are rechecked
before the existing no-replace move. Same-directory, self/descendant and final
symlink destinations are refused; symlink sources move as links. Conflicts never
overwrite, cross-volume moves never fall back to copy/delete, and unknown outcomes
are not retried. These checks are not a hostile filesystem race sandbox. The
separate Files-to-terminal drag remains outside this workflow.

A source-only Files terminal transport retains one opaque gesture per owner
window for at most ten seconds, including claim and pending handoff. Actual child
main-frame registration captures the literal bounded absolute path/kind against
its installed view/epoch/window; no path enters DataTransfer. With an available
protected handoff consumer, the row adds a distinct terminal-candidate MIME and
uses copyMove; internal directory targets still use move and require the same
confirmation. Without that consumer registration is unavailable and the row
remains move-only. Current source composes the protected consumer for Files
with its declared `terminal.insertPath.v1` capability. Only the selected tab's
focused live pane's visible terminal area offers a localized bounded “Drop to
insert path (not run)” candidate and copy cursor; other panes, chrome, tabs,
panels, search controls, Settings, overlays and blocked presentations are inert.
Candidate MIME/area feedback is not authorization. Drop synchronously captures
the exact pane/Surface, DOM focus and selection revision and claims the exact
terminal ticket plus matching internal token before any asynchronous work. Canceled
or internal-move dragend revokes unclaimed rows but cannot erase a claimed drop.
A completed native copy retains only its original bounded ticket for the core
claim, which can reach main after child dragend; cross-WebContents messages are
not globally ordered. This neither extends the deadline nor grants input by itself.
Hide, retirement, window loss,
blur/minimize, installation revocation and timeout revoke either phase without
hide/reveal revival. Mixed/native/tab, forged, expired or replayed claims are
refused; an eligible drop whose claim fails (another window's Files, or after
the deadline) shows a localized "Path not inserted" notice in that terminal
area. Every claimed drop is handed off so main settles it. Control-bearing
or invalid paths still register and are refused without rewriting only when
dropped on a terminal, never at drag start; ordinary spaces and quotes survive.
The shared main path formatter and protected handoff retain the captured
owner/revision. A private ticket binds the returning semantic request to the
original renderer Surface, consumed once, never recaptured.
Stale selection/Surface/DOM focus and blocked presentation refuse admission.
The Surface stops Mirror Typing before ordinary single-target Protected Paste
with no added Enter. Visible Files receives localized accepted, refused,
incomplete or unknown notices. A claimed timeout revokes input authority and sends
one unknown notice only to its original still-live, visible source; hidden,
retired or replaced sources remain silent, and late settlement sends no second
notice. Successful still-current completion focuses only
the captured pane's input through the native presentation owner; newer tool,
field, pane or overlay intent suppresses that focus. Unknown results are never
retried. Accepted Surface-owned work is independent of source retirement;
Surface termination stops remaining chunks. Acceptance is not evidence of
shell/program consumption. No string/URI parsing, filesystem lookup or second
PTY/paste route is added. Native product qualification remains separate.
See the [transport seam](files-development-preview.md#terminal-drag-transport-source-increment).

The page follows the host's explicit en-US/pt-BR
language and relabels retained controls, accessible names, menus, confirmations and
notices without rereading listings, replaying operations or resetting focus/caret,
drafts, selection or deletion tokens. Names, paths and technical error codes remain
literal. Successful filesystem mutations refresh the
current root and surviving expanded folders automatically without navigating
back to a previous root; failures and unknown outcomes never trigger mutation
retry. Manual refresh handles external changes without watchers or polling.
Links are not implicitly expanded, and existing bounded listings, no-clobber
moves and one-shot permanent-delete confirmation remain unchanged. See the
[Files interaction contract](files-development-preview.md#concrete-consumer).

Files archive version/compatibility is maintained separately from the host.
Published Files0.7.0 uses `>=0.25.0-dev.10` / API `0.1.x`, the neutral ARM64
preview name and existing host services for filtering/keyboard and confirmed
directory moves, without terminal insertion/drop. Published Files0.8.0 adds
selected-path insertion and Files-to-terminal drop with `terminal.insertPath.v1`,
minimum host `>=0.26.0` and API `0.1.x`, the first published host with the
consumer. Production archive admission and the catalog refuse lower hosts; the
explicit 0.26.1 development bridge admits this range, and unrelated development
families and incompatible APIs remain refused.
Published Files0.6/0.7 bytes remain unchanged. Preparation is
not exact shipping-pair qualification or publication. Prior Linux native UI used
production modules with inert session/backend/package dependencies, not a real
PTY or shipping pair. Its observed Surface receipt timeout does not qualify the
ten-second transport deadline, which is covered headlessly. The
[preparation rationale](files-development-preview.md#concrete-consumer)
retains these separate evidence boundaries. Published
Files0.6.0 and Files0.5.0 retain minimum host `>=0.24.0-dev.21` and corrected
raw-path forwarding for macOS trash. The published Files0.5.0 archive's
[controlled exact-DMG consumer checkpoint](files-development-preview.md#files-050-macos-controlled-qualification)
passed real operations/recoverable trash, retained companion state, management
and active-backend normal Quit. The separate immutable dev.21/Files0.5 releases
and actual public Settings-link checkpoint are delivered; see
[link-first evidence](files-development-preview.md#macos-link-first-distribution).
That published dev.21 host still uses the legacy catalog URL. Published dev.26
passed a separate Files0.5 [public-catalog checkpoint](files-development-preview.md#macos-catalog-distribution)
with three Official consents, retained PTY and normal joined Quit. The source
catalog binds Files0.7 for macOS ARM64 while Linux retains Files0.6.
A [macOS Files0.7 local checkpoint](files-development-preview.md#files07-macos-stable-local-checkpoint)
and a separate [public-catalog checkpoint](files-development-preview.md#files07-macos-public-catalog-checkpoint)
passed with published stable0.25.0 and the unchanged archive. macOS0.24.0 and other hosts below the Files0.7 floor may install
Files0.6 locally/by link or upgrade. The earlier [macOS public-catalog checkpoint](files-development-preview.md#files-060-macos-public-catalog-checkpoint)
passed with a retained locally built 0.24.0 DMG, not a downloaded-public stable host.
The earlier Linux Files0.4
[distribution checkpoint](files-development-preview.md#files-040-distribution-and-controlled-qualification)
remains evidence for its own dev.11 pair, not for Files0.6. Linux dev.11–dev.20
lost a compatible Files catalog offer after promotion but retain the historical
Files0.4 local/link route. Files0.1 does not admit stable0.24.0. Compatibility
alone does not qualify every host.
Archives and build receipts are excluded from application packages. Build receipts
bind final archive bytes to source/tool metadata without claiming qualification.
macOS ARM64 and Linux ARM64/x64 package inspection exercises packaged
store/lease/bootstrap resolution, not backend activation or the user-facing Files
lifecycle. Native extension addons must be explicitly unpacked; macOS also
requires the complete ad-hoc application seal. Only the ARM64 targets include and
exercise the Files no-clobber move/conflict primitive. The macOS
probe also checks the trash export/root refusal without executing a trash mutation; see
[preview preparation](release.md#building-an-extension-archive).
Trusted children retain ordinary Node capabilities. Production/native/visual and
main-death qualification remain explicit obligations, not consequences of wiring.

## Release contract

OMXTerm uses the MIT License and follows the [versioning policy](versioning.md).
Packages are built natively on ARM64 macOS, Linux and Windows, and on x64 Linux/Windows, using native
filesystems rather than VM shared folders. The formats are DMG, AppImage and
NSIS respectively. An explicit maintainer-approved Windows x64 release may use
x64 emulation on Windows ARM64 while native hardware is unavailable (ADR 0034);
release evidence must identify that exception and pending native qualification.
For the owner-approved native x64 CI lanes, downloadable packages have build-only
qualification. Desktop, GPU, installer and ordinary-user OS integration remain
unverified and are not release gates. Inspection-only never launches the GUI,
executes NSIS or installs the Linux helper; it checks package contents and loads
the exact packaged addon in Electron Run-as-Node mode. Linux additionally checks
real PTY output/exit/resize and exec-failure versus successful exit 1. Windows
unpacked inspection does not verify NSIS contents. Exact binary checksums and
provenance accompany 7-day Actions artifacts; publication remains manual.
Installer safety requirements for full verification are unchanged. Each Linux target also provides
`linux_install.sh` and `linux_install.sh.sha256`; the helper's embedded version
matches the application version, and same-cut Linux helper pairs have identical bytes.

Stable targets ship independently under immutable OS/architecture-prefixed tags,
with one reviewed frozen cut per application version. Actual build SHAs and proven
non-artifact differences are retained. Corrections to product, dependency or build
inputs after shipment require a new application version; unchanged later targets
need no artificial bump or rebuild of shipped targets. The [README download index](../README.md#platforms-and-downloads)
links each target's available version, exact assets, checksums and notes. GitHub's
global Latest remains the legacy complete 0.25.0 bundle, not that index; no later
roll-up release or moved tag is used.

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
disabled Node integration and platform sandbox policy. macOS native verification's
temporary HOME/XDG/profile paths do not isolate per-bundle OS preferences (see
[side effects on your desktop](development.md#side-effects-on-your-desktop)). Linux package
verification checks AppRun bytes and available installed launch modes against
the fixed no-sandbox policy. It installs the exact helper but removes the
fixture home rather than invoking that helper's `uninstall`; separate helper
tests exercise uninstall behavior.

Windows exact-installer verification requires an explicitly authorized
disposable VM and literal CLI opt-in. `/D=` changes the destination without
isolating old-version removal, registration, shortcuts or processes.
Verification refuses unsafe or unknown installation state. Only its newly created
transaction directory is bound to a native long path with matching object identity
before NSIS arguments are constructed; both path spellings retain the original
reparse/process/cache inspections ([ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)).
This does not normalize foreign registration or command ownership.
Ownership-checked cleanup preserves user data and is part of full verification; unpacked-only
diagnostics are partial.

Release verification separates behavioral tests, native builds, exact-artifact
checks and publication. Each artifact needs verification against its own
identity and checksum: native by default, the explicitly approved Windows x64
emulation exception in ADR 0034, or the owner-approved build-only x64 lanes in
ADR 0036, with limits recorded. Build-only checks never claim full verification. Recorded results are
reusable only with known equivalent relevant inputs. Version-only changes need new packages and package/version
checks, not wholesale behavioral reruns; changed product, dependency or build
inputs invalidate affected results. Build-to-tag differences retain the full
build SHA and digest and require a verified non-artifact explanation. Applicable
failures need diagnosis-supported disposition, not an inferred pass from a later
rerun. The [release procedure](release.md) records checks, limitations and reuse
rationale; this specification is not an execution record.

The [ADRs](adr/) explain architectural choices.
