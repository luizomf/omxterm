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
  usable OSC 7 directory inheritance described below): on macOS and Linux the
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
  scrollback search, zoom, fullscreen, always-on-top, bounded local-image
  preview, and quit actions without an in-window toolbar;
- renders the bundled [`omtheme`](omtheme.json) palette by default, allows one
  explicitly configured external Terminal Theme, keeps SGR bold text on its
  requested ANSI `0–7` color without remapping it to bright `8–15` (applications
  may request bright colors explicitly), and uses bundled regular and bold
  FiraCode Nerd Font Mono as the default, followed by bundled regular and bold
  DejaVu Sans Mono, JetBrainsMono Nerd Font Mono, and representative
  operating-system emoji/CJK/symbol faces for missing-glyph coverage;
- uses the black-and-blue OMXTerm application icon in development and on the
  packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- reads strict, versioned JSON configuration, including an explicit en-US or
  pt-BR Interface Language, and writes bounded local JSONL operational logs;
- packages ready-to-run artifacts from an accepted version: ARM64 DMG for macOS,
  ARM64/x64 AppImage for Linux, and ARM64/x64 NSIS for Windows. Linux releases additionally provide
  an optional versioned per-user AppImage desktop installer and its checksum;
  running the AppImage directly remains supported.

AI assistance, broadcast input, saved or reconnectable sessions, shell integration,
profiles, a theme picker or catalog, automatic configuration reload, automatic
updates, and remote terminal features are outside the current product contract.

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
  both kinds' selection, reordering and literal/next/previous navigation. The
  existing strip flag and two-tab threshold include Settings; opening it never
  reveals a disabled strip. Switching preserves its DOM, category, drafts,
  revisions, scroll and pending save results; it cancels shortcut recording and
  invalidates pending clipboard interaction. Close disposes that editor without
  implicit raw Save or a new unsaved-change prompt. Reopen reads through the
  existing serialized service. Escape does not close the ordinary tab; the
  explicit Close action uses ordinary tab removal and retains its closing Enter
  gesture through repeats/release. Settings survives last-terminal exit,
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
  terminal-directed action and supplies the tab and window title. In a split tab,
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
  and never logs or persists the directory. An empty or local host name emitted
  by a remote shell is indistinguishable from a local report; program output can
  also emit it. Either can only select an existing local directory, never execute
  shell text. Ordinary exit removes only that pane
  and gives its space and focus to the nearest sibling; an unexpected signal
  keeps the pane until its failure dialog is acknowledged; the last pane closes
  its tab. Close Pane confirms only a Busy focused pane, Close Tab counts every
  pane of the tab, and Close Window and Quit count every pane. Right-clicking a
  pane focuses it before the native context menu opens, so its Copy, Paste and
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
  unchanged. Tab order is ephemeral and is neither shared between windows nor
  persisted or restored.
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
- Native executable-start failure is distinct from a successfully executed
  program returning nonzero. Unix reports exec failure through a private native
  status channel, never by interpreting an exit code or Terminal Payload (ADR
  0032). This applies to explicit commands and the Default Shell, with no
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
  running version and copyright, and links to the project, contributors,
  issue tracker and MIT license. Developer lists live in the repository's
  `CONTRIBUTORS.md`, not in the dialog; legal notices remain in the distribution.
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
  on Linux and Windows, remappable through `keybinds`) shows or hides the
  selected window's Snippets view in one right-side, nonmodal Auxiliary Panel
  below full-width title/tab chrome. Snippets is the only production view; no
  tool switcher or plugin API is exposed. Views are created lazily. The host
  owns exclusive visibility, header/Close, resize, focus and lifecycle; the view
  owns its query, scroll and catalog. Activation reveals loading/search and
  focuses search immediately, rereading `snippets.yaml` each time without file
  watching. Old rows cannot act during loading. Results replace the catalog,
  including empty/error results, without refocusing. Late results from a hidden,
  superseded or disposed activation are inert. Query and scroll survive hiding
  in memory; scroll clamps after shorter results. Deactivation stops active-only
  work and disposal releases all created views and listeners once.
- Toggle the visible/loading Snippets view, Close, or Escape originating inside
  the panel hides/deactivates it and focuses the live selected terminal. A
  closing Escape or Enter-on-Close gesture owns its repeats and release, including
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
- Panel preferred border-box width starts at 280 CSS px per window. Bounds are
  220–560 px, with a separate 6 px left separator and 180 px terminal layout
  allowance. Actual content-row width determines the effective maximum:
  `min(560, contentWidth - 186)`. Automatic clamping preserves preferred width.
  Below 406 px, hide/deactivate without automatic reopening when space returns;
  a too-narrow open reports “Widen the window to open Snippets”. Primary-pointer
  dragging captures the pointer, grows the right panel when moving left and
  coalesces painting per animation frame. Up, cancel, lost capture, hide, switch,
  overlay activity and disposal end dragging at the last valid width. The
  separator paints a 1 px line with the same default hover/drag and independent
  keyboard-focus states as pane dividers, while keeping its 6 px target/allocation.
  Its decorative color/null choice is separate from pane dividers; the panel
  never gains an active-pane highlight. The
  focusable vertical separator exposes current/min/max pixels and readable value
  text. Left/Right grow/shrink by 10 px; Home/End choose current limits. Resize
  keys are consumed only on the separator. Width preference survives hiding,
  view switching, reload/theme and chrome changes in that window's memory only;
  new windows/restarts reset width and visibility. No configuration or filesystem
  state is added. Layout changes retain Surface/core/Adapter/session identities,
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

## Terminal behavior

The Restty Terminal Surface uses the existing Terminal Tabs, session Adapter and
real PTY lifecycle for ordinary Unicode input/output, grid resize, focus,
Default Shell and explicit-command startup, shell exit, tab close and
renderer-loss cleanup. It requires the bundled Terminal Font Stack TTFs, Ghostty
core and an actual WebGL2 backend before a PTY starts. On Linux, main permits
Chromium's SwiftShader WebGL fallback when available, without forcing software
rendering or changing the GPU blocklist or driver selection
([ADR 0037](adr/0037-allow-the-linux-software-webgl-fallback.md)). This permission
does not guarantee backend availability or successful initialization.
Initialization failure releases partial resources and starts no shell. Closing
an initializing Surface is cancellation, not a rendering failure: font, runtime and session-start
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
Restty only bounded bytes for that family validated at admission, followed by the
licensed bundled FiraCode regular/bold, DejaVu Sans Mono regular/bold and
JetBrainsMono Nerd Font Mono faces, then representative locally installed
operating-system fallback faces. On Linux, those native candidates are, in order,
`Noto Color Emoji`, `Noto Sans CJK SC`, `DejaVu Sans Mono`, and
`Source Han Sans CN`. Each is optional, requires an exact installed regular
family match, and shares the existing bounded fallback-byte budget; no fonts are
automatically installed. When a family is explicitly configured, the
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
so restarting applies them everywhere. Started font reads survive reload for
existing consumers, subject to the admission and queued-read limits under
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
query. Ghostty answers cursor-position queries (`CSI 6 n`) using its parser
cursor at the query's position in the output stream, including wide/combining
text and pending-wrap resize; origin-mode reports are relative to scrolling
margins. The existing parsed runtime seam synchronously submits each filtered
prefix including CPR and drains its core reply before later filter-owned
DA1/DA2/cell-size replies. No render frame or JavaScript cursor hint is used to
answer CPR. Cell-size reports keep the Surface metrics provider. This is not a
guarantee of every xterm extension. OMXTerm installs no custom terminfo and does
not edit or inject shell startup files. Inline-image support does not impersonate another
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
removed and the result must be one printable line. A tab shows its focused pane's
accepted title and falls back to the basename of the shell selected when that
session started. Startup reconciles the current main-owned title once the pane's
session identity is known, including when the initial fallback arrived before
the start response. It neither overwrites a newer accepted title nor retargets a
cancelled pane; unknown titles are not retained for future panes. The native
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
destination that may continue beyond the visible viewport. Link-only selection
proofs exclude a terminal wide-wrap spacer from the queried endpoint, avoiding
selection's expansion into the next row's grapheme without changing copy or
selection semantics. Spacers contribute no text and retain the existing hover
span and hit target with the preceding link cluster on the same physical row.
Exact row equality, hard-break proofs and conservative clipping remain required,
including across core pages. Restty enables
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
search bar and the pinned core's search over the focused pane's retained
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
match counter, follows the active Terminal Theme. Each Surface owns its own query.
Search state, the query and its matches, stays in renderer memory and is never
persisted, logged or written to the PTY, and searching never sends it to main.
Only an explicit Copy from the focused field moves the selected query text,
through the same main-owned clipboard IPC as any other Copy. Find is ignored
while a Local Image Preview or About owns modal input.

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

- `language`: `en-US` or `pt-BR`;
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

`language` selects the Interface Language from the exact tags `en-US` and
`pt-BR`, defaults to `en-US`, and is never inferred from the operating-system
locale ([ADR 0035](adr/0035-select-the-interface-language-explicitly.md)). It
covers native menus (including View → Pane), singular Close Pane and plural
Close Tab dialogs, pane Surface/separator accessible names, Window Chrome, the Auxiliary
Panel and Snippets Sidebar/preview, Settings, Local Image Preview, About, and
the Scrollback Search controls. Main resolves it from the active configuration whenever it
builds a menu or opens a dialog; renderers relabel existing elements in place,
so a User Configuration Reload changes it without recreating tabs, Surfaces or
sessions, including when a Surface is still mounting. The document's accessibility
language, application-owned accessible names and resize value text follow the same
choice. Visible generic Snippets errors, narrow-window notices and renderer
Surface failure notices relabel without rereading data or resetting their lifetime.
A Surface reports failure identity and separate technical cause detail to its host;
the host retains and translates the notice until window teardown, even after
initial mount rejection. The validator's diagnostic detail inside a reload notice,
technical cause detail inside a translated Surface failure notice, failures
reported before configuration loads, Operational Events, `snippets.yaml`
diagnostics, and operating-system, Electron or Restty text that OMXTerm does not
set remain English. Terminal Payload is never translated.

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
`toggleSnippets`, `toggleTabBar`, `toggleTitleBar`, `reloadConfig`, `splitRight`,
`splitDown`, `closePane`, `focusNextPane`, `focusPreviousPane`, `focusPaneLeft`,
`focusPaneRight`, `focusPaneUp`, `focusPaneDown`, and `equalizePanes`. Each
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
bracketed paste. For default row activation, `execute` controls only whether
OMXTerm appends Enter after body delivery: `false` appends nothing, while `true`
sends Enter after the body and any closing bracketed-paste marker. In the
read-only preview, the final Insert/Run choice overrides this default in either
direction, as described under
[window and session behavior](#window-and-session-behavior). An invalid
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
loading boundary and sends only validated, typed theme data — plus bounded
user-file notice state — through the existing configuration boundary.
`View -> Reload User Configuration` can therefore select a changed path after
validating the complete document.

A Terminal Theme is strict JSON containing required `version`, `name`, and
`colors`, plus an optional `appearance` object. Version must be `1`. The name is
a non-empty printable single line of at most 64 Unicode code points. `colors` contains exactly the foreground,
background, cursor, selection foreground and background, and all 16 normal and
bright ANSI fields shown in [`omtheme`](omtheme.json). Every color is an exact,
case-insensitive hexadecimal `#RRGGBB` value. Alpha colors, partial palettes,
CSS names, functions or variables, inheritance and imports are unsupported.
Transparency and blur are User Configuration window preferences, not theme
fields; the Terminal Theme schema has no opacity or tint setting.

The optional version-1 `appearance` object accepts only `paneDivider`,
`auxiliaryPanelDivider` and `activePaneHighlight`, each independently optional
and either exact `#RRGGBB` or null. Empty objects are valid; null/arrays for the
object, unknown keys and other scalar values are rejected. Omitted fields remain
omitted in validated snapshots and restore application defaults on reload.
Null hides only that role's decorative paint; layout, hit targets, ARIA semantics,
keyboard controls and foreground keyboard-visible focus paint remain unchanged.
Explicit divider colors stay exact at rest, hover and drag; defaults retain the
18% foreground/background mix at rest and 45% on hover/drag. Foreground focus
paint takes precedence over both, including during drag. Appearance-only reloads
repaint window chrome without reconfiguring or refitting the Terminal Surface.
Palette validation remains complete and non-nullable. Older builds reject this
optional extension rather than silently ignoring it; no migration is performed.
Configurable widths and a visual appearance editor are outside this slice.

The latest successfully applied Terminal Theme is the reset baseline for its 16
ANSI colors. OSC 104 restores that baseline (all entries or only the requested
indices); an indexed reset leaves other OSC 4 overrides untouched. Live theme
application replaces overrides within those 16 entries, while preserving
unsupplied extended-color overrides. Full OSC 104 also resets extended colors
to their ordinary defaults. RIS and DECSTR do not act as palette resets.

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
a native font read already started while its family was current may complete
across a family reload, including change-away-and-back, for its surviving
creation-time consumers. Controller disposal still rejects late completion;
cancelling one consumer does not cancel its live siblings. Requests must match
the current family when received; a queued generation superseded before its
load starts is rejected without another read. This does not authorize arbitrary
historical-family lookup. Loads remain serialized and bounded, and genuine
read/validation failures still reject. Repeating a reload
cannot erase a notice while an older Surface survives; removing that Surface
releases its font bookkeeping. Theme, Interface Language, configured font-size
baseline, padding and Window Font Zoom remain live and preserve the existing Surface and PTY. Invalid,
missing, unreadable, unsupported or corrupt configured font input rejects the
whole reload. Runtime scrollback reduction, including zero, uses the selected
Surface's in-memory core behavior described above; programming-ligature changes
use the existing Restty runtime setter without reloading fonts, and Option Key
Mode changes only subsequent keyboard events. OMXTerm never migrates, repairs,
rewrites, or silently ignores User Configuration on its own; only an explicit
change in Settings writes it (see below). The same surface also carries
non-fatal warnings for a valid configuration that stays fully active — currently
a keybind shadowing a PTY control key — which inform without activating any
default.

**Settings** (application menu, **Settings…**) is a retained graphical editor of the same
`config.json`. It covers `language`, `confirmClose`, `logLevel`, `windowsShell` (Windows),
`font.family`, `font.size`, `font.lineHeight`, `font.ligatures`,
`terminal.padding`, `scrollback.lines`, `keyboard.optionAsAlt` (macOS), the
new-window defaults `window.showTitleBar`, `window.showTabBar` and
`window.alwaysOnTop`, and `theme.path`; transparency and blur stay file-only in
this editor. Its **Shortcuts** page shows each action of the current keybind
vocabulary with its effective shortcut and whether it inherits the default,
has a custom binding or is explicitly unbound: Default removes the action's
`keybinds` entry (and an emptied group), Unbind writes `null` and a recorded
key writes its accelerator, through the same validated save; collisions report
the loader's actionable message. Recording is main-owned: while a window
captures, its `before-input-event` reports the next press, with the native
identity delivery matches (including AltGr and bare F1–F24), instead of
running a keybind, a menu shortcut or reaching the terminal, and consumes that
key's held repeats and release, including overlapping invalid/modifier gestures.
A fresh press after a lost release remains new input. Only unmodified Escape
cancels; modified Escape, including native AltGr, can be recorded. A key that
cannot round-trip through the supported accelerator identity reports invalid and
keeps capture open; arbitrary layout translation is not added, and the existing
logical Plus/keypad exceptions remain. Capture ends after one accepted key, on
cancel, button/window blur, category/tab departure, overlay activation, editor disposal or at a real
30-second timeout that notifies the current view without waiting for another
key. Ending a recording retains its consumed gestures until release or a fresh
press; window blur, renderer loss/reload and window disposal clear that ownership.
Each bounded capture request, stop and notification carries the same recording
identity: retired notifications cannot save or cancel a replacement recording,
and a retired stop cannot release its keyboard. Cancellation replaces the
recording instructions; Record/Cancel, Unbind and Default have localized,
action-specific accessible names that follow their current operation. No second
shortcut registry is added; menu display and delivery follow the reloaded configuration. Changing a control saves at once without a separate
confirmation; a cleared text or number field removes the entry so its default
applies. The **Config File** page shows the document with an explicit **Save**
and **Reload File**. Writes follow ADR 0003: full startup validation before an
atomic replacement, a field-scoped change that keeps every other entry, a raw
save refused when the file changed since its draft was loaded, and a dirty draft
never replaced by other changes or late Save/Reload File responses. A final
revision/presence comparison after write preparation rejects detected external
changes without retry; it is not a cross-process atomic compare-and-swap.
Settings preserves configuration symlinks, including dangling links, by refusing
writes and directing the user to manual editing and reload. Pending graphical
responses retain newer or unrelated field drafts, and saving feedback remains
pending until queued changes settle. Graphical requests go directly to main's
serialized service, so a reopened view reads after already-requested writes
rather than overtaking undispatched work in a removed view. Raw operations are
single-flight while typing remains usable; newer edits retain the saved bytes'
revision as their base and are explicitly reported as not saved. Snapshot text uses the same
UTF-8 decoding as the loader (omitting a leading BOM), while revisions identify
the exact persisted bytes; snapshot parsing happens before writing. Closed
views ignore late results.
The status line distinguishes saved and applied, saved but not applied (even
when reload throws after persistence), new-window/session-only settings, and
settings that need a restart for open tabs. Both save routes include returned
notices and deferred lifetimes of changed effective values, not no-op spelling
changes. While Settings is selected, pane commands, terminal Find, snippet
capture/delivery, terminal file-drop insertion and font zoom are no-ops; window
and Application Tab actions remain usable. Configuration updates still reach
retained hidden terminals. Application Copy, Paste and Select All edit its
focused field; unsupported controls consume/no-op, never falling through to a
terminal. Retained terminal-popup targets cannot become Settings field edits.
Clipboard reads recheck interaction generation as well as focus/value/selection;
tab deactivation, modal activation, focus loss and disposal invalidate them even
after returning to the same unchanged field. Hidden save results may settle
without focusing. Selecting Settings deactivates/hides Snippets while retaining
its existing query/scroll/width memory. It does not automatically reopen, and
Toggle Snippets is a no-op on Settings. Settings has
no default shortcut. Its General-page language selector uses exact en-US/pt-BR
values and the same validated save/reload route as other live controls. Its
options keep the self-names **English (United States)** and **Português (Brasil)**
regardless of the current interface language. All Settings text, options,
placeholders, accessibility labels and visible statuses relabel in place,
preserving draft bytes/revisions, focused control, caret,
selection, scroll, selected page and pending operations. Relabeling performs no
read/save or value adoption/synchronization. Bounded app-owned Settings/reload
message identities cross IPC separately from literal validator/warning detail,
so late and already-visible results use the current language without matching
English sentences. The existing main user-file banner keeps its rendered-text
contract. Diagnostics shown in Settings never enter operational logs.

Settings occupies an opaque full-area surface with the existing six categories
and independently scrolling content, not a modal perimeter/backdrop. Its 640×480
renderer viewport target is comfortable desktop coverage, not a new native
minimum. Below it, compact wrapping navigation and scrolling retain small-window
access. Native bounds/minima are unchanged by opening Settings. The workspace
caps at 1440 px, ordinary forms at 720 px and dense pages at 1120 px. Panel-width
container queries stack form labels below 560 px and wrap shortcut actions below
760 px. Outer layout uses viewport media queries at 639/900/1200 px, with only
the content panel acting as a size-query container. Shortcuts retain visible
Record/Cancel, Unbind, Default and textual state;
config JSON overflow stays within its editor. Shared palette-aware tokens keep
decoration subdued, inputs identifiable and keyboard focus foreground-colored,
independent of optionally transparent pane paint. Native control color-scheme
follows palette luminance. These are not universal accessibility guarantees for
arbitrary custom palettes. See the [UI style guide](ui-style-guide.md).

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
previously checksum-verified local Linux ARM64/x64 OMXTerm AppImage matching the
host architecture (checked before execution) and performs no download,
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
Installer safety requirements for full verification are unchanged. Linux also provides
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
