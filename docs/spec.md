# OMXTerm product contract

This document describes OMXTerm's behavior, architecture, and known limitations.
It states current rules; the [ADRs](adr/README.md) explain why, and Git history
keeps past evidence. The [user guides](README.md) explain setup and everyday use.

- [Product and scope](#product)
- [Windows and sessions](#window-and-session-behavior)
- [Saved Layout](#saved-layout)
- [Mirror Typing](#mirror-typing)
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

### Supported Platforms

- macOS arm64, Linux arm64/x64, and Windows arm64/x64. Intel macOS and other
  operating systems are unsupported.
- Linux and Windows x64 packages have build-only qualification: native CI builds
  and enumerated headless checks, not verified desktop or installer behavior
  ([ADR 0036](adr/0036-distribute-build-only-x64-ci-artifacts.md)).

### Linux display and sandbox

- Rendering defaults to X11 and needs XWayland in a Wayland session. Native
  Wayland rendering is not claimed
  ([ADR 0020](adr/0020-default-linux-rendering-to-x11.md)).
- For diagnosis, an explicit Electron `--ozone-platform` or
  `--ozone-platform-hint` switch placed before a Launch Request's `-e`, or a
  defined `ELECTRON_OZONE_PLATFORM_HINT` environment variable (even an empty
  one), takes precedence over the X11 default.
- When display startup needs an X11 relaunch, it relaunches the persistent
  `APPIMAGE` only when `APPIMAGE` and `APPDIR` are both nonempty absolute paths
  and `APPDIR/omxterm` matches `process.execPath` (the packaged AppRun layout).
  Otherwise it relaunches `process.execPath`, so AppImage variables inherited
  from another application never pick the executable. The X11 switch goes before
  a Launch Request's `-e`, keeping its literal argv. An `APPIMAGE` relaunch
  receives the environment without the current AppImage runtime (as for
  terminal sessions below), so the new mount's AppRun starts clean; a
  `process.execPath` relaunch keeps the inherited environment. Either relaunch
  restores the launch values of the variables Chromium changed in the Wayland
  process (as for terminal sessions below), so the X11 process does not inherit
  `EGL_PLATFORM=wayland`.
- `--no-sandbox` is a fixed, unconditional launch policy for the ordinary-user
  runtime, direct AppImage, extraction, desktop entry, and X11 relaunch. It is
  not a fallback or a setting. `npm run dev` passes it before Electron
  bootstrap. OMXTerm leaves host security policy unchanged and installs no
  privileged sandbox helper; sandboxed Linux is outside the maintenance scope
  ([ADR 0024](adr/0024-disable-the-chromium-sandbox-on-linux.md)).

## Product scope

OMXTerm:

- opens the Default Shell in the user's home directory, except for a split
  pane's OSC 7 directory inheritance and Saved Layout opening or reopening
  (described below):
  - on macOS and Linux, the operating-system-configured shell as an interactive
    login shell;
  - on Windows, which has no login-shell concept, a configured `windowsShell`
    executable when present, otherwise Windows PowerShell, falling back to the
    ComSpec command processor, started interactively without a login flag;
  - when a launch includes `-e <program> [arguments...]`, that executable and
    literal argument vector run directly in the first Terminal Tab of its
    window, with no implicit shell;
- runs one packaged process per profile: launching OMXTerm again while it runs
  opens a new Terminal Window in the running process (see
  [Launch Requests](#launch-requests));
- targets ordinary shells, SSH started by the user, tmux, TUIs, REPLs,
  alternate-screen applications, Unicode, and bracketed paste, with the protocol
  limits under [Terminal behavior](#terminal-behavior). Emoji-presentation and
  ZWJ grapheme clusters render as single two-column cells that do not overlap
  their neighbors;
- runs one independent shell session per Terminal Pane, with one or more panes
  per Terminal Tab and one or more Application Tabs per native Terminal Window,
  including an optional graphical Settings tab;
- provides native new-window, new-tab, close, copy, paste, select-all,
  scrollback search, explicit text export, zoom, fullscreen, always-on-top,
  bounded local-image preview, and quit actions without an in-window toolbar;
- renders the bundled [`omtheme`](omtheme.json) palette by default and allows
  one explicitly configured external Terminal Theme. SGR bold text keeps its
  requested ANSI `0–7` color instead of being remapped to bright `8–15`
  (applications can request bright colors explicitly);
- uses bundled regular and bold FiraCode Nerd Font Mono by default, followed by
  bundled regular and bold DejaVu Sans Mono, JetBrainsMono Nerd Font Mono,
  representative operating-system emoji/CJK/symbol faces, and bundled Noto Sans
  Symbols 2 for missing glyphs;
- uses the black-and-blue OMXTerm application icon in development and on the
  packaged macOS Dock, Finder, application-switcher, and DMG surfaces;
- reads strict, versioned JSON configuration, including an explicit en-US or
  pt-BR Interface Language, and writes bounded local JSONL operational logs;
- packages ready-to-run artifacts: an ARM64 DMG for macOS, ARM64/x64 AppImages
  for Linux, and ARM64/x64 NSIS installers for Windows. Linux releases also
  provide an optional versioned per-user AppImage desktop installer and its
  checksum; running the AppImage directly remains supported.

Outside the current product contract: AI assistance, unrestricted broadcast
input, saved or reconnectable running sessions, shell integration, profiles, a
remote theme marketplace, automatic configuration reload, automatic updates, and
remote terminal features beyond the optional SSH Connect preview.

Optional, separately installed previews:

- [SSH Connect](ssh-connect.md) (Linux and macOS ARM64): an incomplete read-only
  alias index and a quick-connect page request a typed, main-owned literal
  system `ssh` launch. It does not broker authentication or add reconnect.
- [Saved Layout](#saved-layout) (optional extension) reopens the last windows at
  startup and saves one window's layout to open later, always with fresh
  Default Shells. It never restores running sessions, commands, or output.
- [Mirror Typing](#mirror-typing): a narrow same-tab keyboard-byte exception, not
  unrestricted broadcast or multi-pane paste.

Restty 0.3.0 and its pinned Ghostty core are the only Terminal Surface, in
development and in every package. There is no renderer selector or fallback
Surface. A shell starts only after rendering initialization succeeds
([ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md)).

## Window and session behavior

Closing a tab or window ends its sessions. Persistent and reconnectable sessions
are the job of a session manager such as tmux.

### Windows and tabs

- Launching OMXTerm creates a Terminal Window with one Terminal Tab. Each
  Terminal Tab starts with one Terminal Pane, and each pane owns its own Live
  Terminal Session.
- Default shortcuts (macOS / Linux and Windows):
  - New Window: `Cmd+N` / `Ctrl+Shift+N`.
  - New Tab: `Cmd+T` / `Ctrl+Shift+T`.
  - Close Tab: `Cmd+W` / `Ctrl+Shift+W`.
  - Close Window: `Cmd+Shift+W` / `Ctrl+Shift+Q`.
  - Quit: `Cmd+Q` / `Ctrl+Alt+Shift+Q`.
  - Window Font Zoom: `Cmd++`, `Cmd+-`, `Cmd+0` / `Ctrl++`, `Ctrl+-`, `Ctrl+0`.
- A window with a single tab shows no tab strip. Each window owns in-memory
  title-bar and tab-bar visibility choices, initialized from
  `window.showTitleBar` and `window.showTabBar` (both default to true).
- The OMXTerm-drawn tab strip appears only when its flag is on and the window has
  two or more tabs. It takes its own full-width row above the Terminal Surface and
  Snippets Sidebar row: below the 30 px native title inset on macOS (when the
  title area is visible and the window is not fullscreen), or below the visible
  34 px app-drawn title row on Linux and Windows. A hidden title area or
  fullscreen leaves no title row or duplicate inset.
- Clicking a tab selects it; the selected grid refits and gets terminal focus.
  Dragging a tab horizontally within the strip reorders that window's tabs.
  The new order immediately drives visible order, next/previous cycling, and
  positional selection. The selected tab and every Live Terminal Session and
  Terminal Surface stay unchanged. Tab order is ephemeral and per window;
  explicit Saved Layout saving can capture terminal order for a fresh window.
- Closing or ordinarily exiting an unselected tab preserves the selected tab,
  its Surface, and its session, even when its position changes; keyboard, Paste,
  and Snippet input stays with it. Removing the selected tab selects its right
  neighbor, or the left neighbor when it was last. Removing the only tab follows
  the last-tab window lifecycle.
- Each window starts at the configured font size. Window Font Zoom affects only
  that window, applies to every tab in it, and is not persisted.
- `Window -> Always on Top` toggles only the selected window at the ordinary
  native floating level. New windows use the configured default.

### Settings tab

- Settings is one lazy graphical Application Tab per window. It is appended on
  first open and then reused without reread, reorder, or state reset. It has no
  Terminal Pane, Surface, Adapter, shell, or PTY.
- One ordered collection owns selection, reordering, and positional/next/previous
  navigation for every Application Tab kind, including general hosted tabs.
  Separately installed Files and SSH Connect open in the Auxiliary Panel instead,
  and Mirror Typing setup in a Hosted Dialog; neither enters tab ordering.
- Settings counts toward the strip flag and two-tab threshold. Opening it never
  reveals a disabled strip.
- Switching away preserves its DOM, category, drafts, revisions, scroll, and
  pending save results. It cancels shortcut recording and invalidates pending
  clipboard interaction.
- Close disposes the editor without an implicit raw Save or a new unsaved-change
  prompt; reopening reads through the existing serialized service. Escape does
  not close it. The explicit Close action in the page header uses ordinary tab
  removal and owns its closing Enter gesture through repeats and release.
- The shared application-page shell provides bounded content/navigation
  scrolling, explicit control variants, and consistent error/warning/result
  notices. Raw and graphical results keep their severity. Settings follows valid
  configuration links and reports broken links, unsuitable targets, and
  conflicts.
- Settings keeps its retained layout and uses the window's theme tint instead of
  an opaque page background; controls and focus stay visible.
- Settings survives last-terminal exit, cancellation, or first-mount failure
  without inventing a shell or reporting false renderer emptiness. First-mount
  readiness still reports the real terminal outcome. Removing the final
  Application Tab commits the existing empty-owner/failure-acknowledgement path;
  Settings adds no Busy Session or native drain.
- Main accepts only a fixed, validated graphical selection identity, not an
  arbitrary renderer title. Settings supplies a localized native title.
  Background OSC/BEL still update terminal tabs without taking that title or
  marking unseen attention as seen.

### Terminal panes

- `View -> Pane` splits the selected tab's focused pane right or down
  (`splitRight`, `splitDown`), moves pane focus (`focusNextPane`,
  `focusPreviousPane`, `focusPaneLeft`, `focusPaneRight`, `focusPaneUp`,
  `focusPaneDown`), swaps the focused pane with a neighbor (`swapPaneLeft`,
  `swapPaneRight`, `swapPaneUp`, `swapPaneDown`), resets the shares of the
  focused pane's split (`equalizePanes`), and closes the focused pane
  (`closePane`). Every shortcut can be remapped or set to null; the swap
  actions have no default shortcut.
- Swap uses the same directional neighbor as focus: the nearest pane in that
  direction that overlaps the focused pane, the first in layout order on a tie.
  The two panes trade slots, so each takes the other's share and the split
  tree is unchanged. Focus stays on the moved pane; repeating the action keeps
  moving it the same way. No neighbor in that direction does nothing.
- A split needs room for two usable grids of at least 20 columns by 5 rows,
  using the source Surface's current cell geometry for the new pane. The
  prospective layout accounts for each Surface's own metrics, padding and other
  non-grid space, every divider, and same-direction sibling allocation. Unknown
  geometry refuses the split, and a tab holds at most 16 panes; a refused split
  starts nothing.
- Splitting in the same direction adds a sibling. Pane containers move without
  recreating Surfaces or sessions, including on swap.
- Dividers are `role="separator"` controls that drag with the pointer and move
  with arrow keys, limited by the same minimum. A later resize or zoom that
  cannot fit every minimum keeps every session and the layout; an impossible
  divider move keeps the existing proportions.
- Dividers paint a 1 px line inside their 4 px resize target. Hover and drag
  share a neutral highlight by default, overridable through theme appearance.
  Keyboard-visible focus always paints the line in the theme foreground (no
  outline), including during drag and with decorative paint disabled.
- Exactly one pane per tab is focused. It receives keyboard input and every
  terminal-directed action, and supplies the tab and window title. Explicit
  [Mirror Typing](#mirror-typing) also routes genuine keyboard bytes to its fixed
  members; all other input stays single-target.
- In a split tab, the only focus marker is a 1 px top line inset by the Surface's
  left/right padding, with no side/bottom ring and no dimming of other panes. It
  is a non-intercepting overlay above the terminal canvas (including opaque
  first-row backgrounds at zero top padding) and below app overlays.
- The marker uses the theme's cyan. If that contrasts below 3:1 with the
  configured opaque background, the theme foreground replaces it only when that
  improves contrast. An explicit `appearance.activePaneHighlight` hex color is
  used exactly, without substitution; null hides the marker. This is not an
  accessibility guarantee: a custom palette can leave both colors below 3:1,
  transparency/blur changes the visible background, and the marker is 1 px high.
- Clicking a pane focuses it. Switching tabs restores each tab's focused pane.
  Hidden tabs hide their pane Surfaces and keep their layout.
- A new pane starts the Default Shell in its source pane's folder when it still
  exists, otherwise in the home directory. The folder is the source pane's last
  local OSC 7 report; without a usable report, on macOS and Linux, it is the
  working directory of the pane's shell process (the PTY's direct child, not
  the foreground program), read just before the split. Windows uses only OSC 7.
  Main reads reports from PTY output, rejects non-local host names and
  UNC/device paths, and never logs the directory. It is persisted only
  through Saved Layout (an explicit save, or remembered windows while the
  extension reopens them).
- Reading the shell's cwd is read-only: it changes nothing in the shell or its
  startup ([ADR 0013](adr/0013-do-not-inject-shell-integration.md)). Linux reads
  `/proc/<pid>/cwd`; macOS runs one `lsof` for all panes being looked up at once.
  It follows the shell itself, so a program the shell started with its own cwd
  (or a manual `ssh`) doesn't change it.
- OSC 7 is not authenticated. An empty or local
  host name from a remote shell looks the same as a local report, any program
  can emit one, and reports may be stale. Either can
  only select an existing local directory, never execute shell text. Known SSH
  Connect sessions are excluded from OSC 7 tracking regardless of host name;
  their splits and new tabs use the Default Shell at home. `ssh` typed manually
  in a normal shell is not detected.
- An ordinary exit removes only that pane and gives its space and focus to the
  nearest sibling. An unexpected signal keeps the pane until its failure dialog
  is acknowledged. The last pane closes its tab.
- Right-clicking a pane (including its padding) focuses it, even with the
  terminal context menu disabled. With `terminal.contextMenuEnabled` omitted or
  true, the native menu opens; its Copy, Paste, and Select All act on that pane.
  In a split tab the menu also offers Close Pane, showing the current
  `closePane` binding and using the same confirmation. A single pane and the
  Snippets field do not offer Close Pane.
- Each terminal popup captures its source window, pane, and live Surface. Pane
  exit, pane/tab removal, changed pane/tab selection, a newer popup, or owner
  disposal makes its actions inert; activation in another selected window is
  ignored.

### Launch Requests

- A startup Launch Request uses `-e <program> [arguments...]`. The value after
  the first `-e` is the required executable; every remaining value, including
  another `-e` or an option-looking value, is literal argv.
- OMXTerm passes the executable and argv directly to the PTY without building a
  command string, rewriting arguments, or inserting a shell. Users can choose a
  shell explicitly and pass literal arguments such as `-lc`.
- Only the first Terminal Tab of the first Terminal Window in that process
  consumes the request; later tabs and windows use the Default Shell.
- Packaged OMXTerm holds one single-instance lock per profile (userData
  directory, so each `--user-data-dir` is separate). A launch while that
  profile's process runs hands its request to it and exits at once with status
  0, so a caller waiting on it doesn't wait for the command. The running
  process opens a new Terminal Window whose first tab consumes the request
  (Default Shell for a plain launch), after its own startup has finished. A
  malformed request still fails in the new process. On macOS the running app
  comes forward; Dock and Finder activation only activates it. Source runs
  (`npm run dev`, test fixtures) take no lock.
- A trailing `-e` with no program is an actionable startup failure and never
  falls back to the Default Shell.
- An explicit command starts in the user's home directory, inherits the same
  session environment as the Default Shell (see
  [Terminal identity and replies](#terminal-identity-and-replies)), and
  receives the Terminal Capability Identity. It is a
  Busy Session for its whole live lifetime and uses the normal Live Terminal
  Session lifecycle for clean exit, unexpected signal, spawn failure, requested
  close, tab and window closure, and last-window quit.

### Terminal focus

- After its Terminal Surface mounts, an active Terminal Window focuses terminal
  input unless the user moved focus to panel or overlay controls while
  initialization was pending. Surface construction never implicitly focuses a
  window-owned pane. Deliberate tab creation or selection keeps its focus
  behavior when no other control took focus during mounting.
- Returning from another application or OMXTerm window keeps focused
  panel/overlay controls. Otherwise only the active Terminal Window restores
  selected Surface focus, including its focused search field. Focus restoration
  never activates, raises, or shows OMXTerm by itself.

### Closing and quitting

- Close Tab terminates every session in the selected tab. Closing a window's last
  tab closes the window. Close Window closes all of the selected window's tabs;
  closing the last window quits OMXTerm.
- `confirmClose` defaults to `true` and guards pane close, tab close, window
  close, and Quit. OMXTerm asks only when the action affects a Busy Session: a
  Live Terminal Session whose PTY foreground process differs from the idle
  Default Shell. Closing only idle sessions proceeds immediately.
- Each action asks at most once: closing a window with several tabs asks once
  for the whole window, and Quit asks once for all windows. Close Pane considers
  only its captured focused pane, Close Tab every pane of the tab, and Close
  Window and Quit every pane.
- The foreground process name is read only for this in-memory decision and is
  never logged, displayed, or sent. An unreadable name counts as Busy, including
  unavailable Linux native foreground lookups; the spawned shell is not a
  substitute. On Windows, ConPTY exposes a static console title instead of the
  foreground process name, so every live Windows session counts as Busy.
- A pending confirmation keeps its original target. Approval never retargets a
  later selection and does nothing if that tab has already ended. Repeated
  requests during the confirmation share its decision, even if the sessions
  become idle. An accepted Busy close keeps the original pane even if selection
  changes while its dialog is pending.
- Selection reports the tab's session set even while the focused pane is still
  mounting or is retained after native exit. A pending or dead focused pane never
  borrows another tab's Busy decision.
- The renderer subscribes to tab commands, clipboard, Find, zoom, tab-bar, and
  snippets actions during host setup, without waiting for the first Surface.
  Host-owned zoom, tab-bar state, and the Snippets panel work during mounting.
  Actions that need an unavailable Surface (such as terminal clipboard or Find)
  do nothing and are not replayed after mount; there is no command buffer.
  Existing modal guards still apply. Host readiness remains first-mount
  settlement, not command registration.
- Close Tab cancels a pending first tab through the normal empty-window
  lifecycle. Queued New Tab commands cannot revive an emptied owner. Close
  Window and Quit use separate main-owned paths and also cancel pending
  initialization.
- An accepted Quit, including automatic last-window quit, stops new session
  starts and waits for every owned native PTY to report exit before finishing,
  including sessions whose tabs or windows already closed. Window/controller
  disposal and a native kill request do not count as completion. Repeated quit
  requests share one shutdown; a pending or denied Busy confirmation does not
  start it. Main owns completion independently of disposed renderer callbacks
  ([ADR 0028](adr/0028-wait-for-native-sessions-before-application-quit.md)).
- After actual exit, the window controller delivers immutable end context and
  releases the session object. Pending failure acknowledgements keep only their
  ownership metadata; retired identities cannot route input, resize, title,
  bell, or ACKs.

### Session exit and failures

- After the Default Shell starts, an ordinary shell exit closes its pane (and its
  tab or window only when it was the last one) without confirmation or a failure
  dialog, whatever its exit code.
- A pane whose fonts or rendering are still initializing keeps its tab and
  window, even before its PTY starts; another session's ordinary exit cannot
  close that window. The pending pane either finishes and starts one session or
  is cancelled without starting one. Cancelling the final pending pane of the
  final tab closes the window; a final pre-start rendering failure keeps a native
  failure dialog until acknowledged.
- The renderer's tab owner commits last-tab closure; it is not inferred from a
  zero native-PTY count.
- Native executable-start failure is distinct from a program that ran and
  returned nonzero. Unix reports exec failure through a private native status
  channel. On Windows the pinned dependency marks its asynchronous agent
  connection/worker failure through the same boolean forwarding, while
  missing-file rejection stays synchronous. Neither platform infers startup
  failure from an exit code, error text, or Terminal Payload
  ([ADR 0032](adr/0032-report-native-exec-failures-outside-terminal-payload.md)).
  This applies to explicit commands and the Default Shell, with no fallback
  shell. Safe Operational Events classify it as `spawn-failure`.
- A spawn failure or unexpected signal stays visible in a native error dialog and
  the local log until acknowledged; then the failed pane closes, and its tab
  closes only when no panes remain. Each pending acknowledgement keeps its window
  even if a sibling exits or another failure is acknowledged first. Automatic
  window closure waits for both an empty renderer tab owner and every pending
  acknowledgement. Explicit window closure and Quit stay separate, and late
  dialog results cannot act on disposed owners. Native shutdown completion is
  recorded independently of renderer notification.
- SSH Connect's core-transferred terminals do not depend on the extension's
  lifetime. Exit 0 closes normally. An ordinary nonzero exit keeps readable,
  copyable, searchable output with an explicit exit-code notice and Close. The
  ended Surface keeps rendering and fonts for local refit/zoom until removal, but
  gets no native input, resize, or protocol replies, including exit replay before
  start resolves. Native records still retire on actual exit, and ended content
  is not Busy. Startup/signal acknowledgement and authorized removal take
  precedence ([ADR 0041](adr/0041-transfer-ssh-launches-to-core.md)).
- The owning Live Terminal Session contains native resize failures. The pinned
  Unix closed-descriptor race is quiet teardown metadata at debug level; other
  failures record a fixed `native-failure` category at error level, without
  native error text. The failed request is dropped and later valid resizes may
  retry. A resize failure never closes a tab, terminates siblings, or replaces
  the native exit notification used for session completion
  ([ADR 0033](adr/0033-contain-native-resize-failures-without-completing-sessions.md)).

### Grid, rendering, and minimum size

- The Terminal Surface and session grid refit in both directions after window
  width or height changes, Window Font Zoom, and tab selection. With enough
  content space, the grid fits inside the visible area with its bottom row
  visible.
- A hidden Terminal Tab keeps its last real grid; a hidden layout box or hidden
  font change never resizes the Surface or PTY from concealed geometry.
- Hidden Surfaces, including mounts that complete while hidden, do no frame
  clears, draws, or render uploads. They keep synchronous ordered output
  ingestion, Adapter ACKs, protocol replies, parsed events, and Scrollback Buffer
  retention. Selecting the tab refits and redraws current content and cursor
  before the first visible frame, without a background render-budget delay or
  replacing the Surface, core, or session.
- An unchanged Surface stops requesting display frames. It draws at blink phases
  only while something on screen blinks (a blinking cursor, or SGR 5 text while
  cursor blink is on); a steady, hidden, or unfocused cursor over plain text
  draws nothing. It rechecks state that changes without a render request (such
  as a reveal without refit) at most every 250 ms. Output, input, resize, focus,
  theme, and configuration changes appear on the next display frame.
- Native windows have a minimum size of 320 by 200 px. At startup and after a
  valid reload, main grows it using configured font metrics, line height,
  padding, a scrollbar allowance, and title space, reserving two columns and one
  row. It ignores auxiliary-panel and tab-strip space, creation-time fonts kept
  by older Surfaces, and Window Font Zoom, so a visible grid at the native
  minimum is not guaranteed in every layout. The panel's 180 px terminal layout
  allowance is not a column-count or extreme-padding guarantee. Widen the
  window, reduce padding, or hide the panel to get terminal space back.

### Window Chrome

- Every window can be moved by its visible title area, or by its small
  hover-revealed handle when that area is hidden. Native dragging is limited to
  these areas; the rest of the Surface stays interactive.
- macOS: visible chrome keeps the blended `hiddenInset` appearance, with native
  traffic lights on the left and a 30 px title/drag inset above configured top
  padding. The Terminal Theme background continues behind the controls, with no
  separately colored title strip. Hiding removes the controls and inset without
  recreating the native window.
- Linux and Windows: a frameless native window with a hideable, app-drawn 34 px
  title/drag row. The sanitized selected Terminal Title (with the existing
  fallback) sits at the left; minimize, maximize/restore, and close sit at the
  right. Colors follow the active Terminal Theme. Controls invoke native actions
  in main; Close uses the guarded Close Window lifecycle. Native resize,
  maximize/restore, and edge/corner snapping stay window-manager behavior.
- `View -> Toggle Title Bar` (`toggleTitleBar`, default `Cmd+Shift+D` on macOS
  and `Ctrl+Shift+D` on Linux and Windows) changes only the selected window's
  title-bar choice. It never rewrites configuration or recreates the window,
  renderer, Surfaces, or sessions. The layout change refits the selected Surface
  and PTY and keeps focused auxiliary-panel controls, otherwise restoring
  terminal focus; hidden Surfaces keep valid geometry.
- With the title area hidden outside fullscreen, hovering in the top 150 logical
  px of content reveals three dots at the top center. Only their 90 by 14
  logical-px rectangle is a native drag target. Reveal/hide changes no layout or
  PTY size, and the rest of the hover region does not intercept selection, tab
  interaction, or terminal mouse input. No cursor positions or terminal contents
  are logged.
- Native fullscreen suppresses app title chrome and the hover handle without
  changing the window's chosen visibility; leaving fullscreen restores it.
  Configured padding and the macOS safe area stay unchanged; transient system
  chrome may overlay content without hover-driven padding or PTY resizing.
  Entry and exit refit the selected Surface and PTY only.
- On Linux and Windows, pressing and releasing Alt alone opens the current native
  application menu as a popup, with the installed menu's hierarchy, actions, and
  effective shortcuts (including after reload). Its top-left anchor is
  `x=8, y=42` (8 logical px below the 34 px title row), or `x=8, y=8` with the
  title hidden or in fullscreen. The native menu owns styling, keyboard
  navigation, and dismissal; no DOM menu or menu bar is added. Opening or
  dismissing it keeps the selected tab, window, Surface, and PTY. Alt
  combinations, AltGr, repeats, intervening input, and focus loss do not open
  it. This is fixed chrome behavior, not a configurable shortcut; macOS's menu
  and Option input are unchanged.
- The selected Terminal Theme fills app-controlled content, including title
  chrome and configured padding, but not native popups.
- Hiding chrome never replaces sessions
  ([ADR 0027](adr/0027-hide-window-chrome-without-replacing-sessions.md)).

### Tab bar toggle

- `View -> Toggle Tab Bar` (`toggleTabBar`, default `Cmd+Shift+B` on macOS and
  `Ctrl+Shift+B` on Linux and Windows) changes only the selected window's tab-bar
  flag, even with one tab; with no selected window it does nothing.
- Disabling removes the whole strip row, refits the selected Surface and PTY,
  and keeps focused auxiliary-panel controls, otherwise restoring terminal focus.
  Hidden Surfaces keep valid geometry and keep ingesting output.
- Toggling keeps tab identities, order, selection, titles, and sessions. Keyboard
  and native Window menu navigation work while hidden. Title/BEL updates and tab
  creation, selection, and closure never reveal a disabled strip. Enabling shows
  the same live tabs when at least two remain.
- The flag survives configuration reload but is never persisted or shared: new
  windows and restarts use `window.showTabBar` (default enabled). Title-bar
  visibility and fullscreen are independent.

### State Marks

One core system shows pane and window state
([ADR 0050](adr/0050-show-ongoing-states-as-quiet-state-marks.md)), in the
quietest form that works:

- Idle or success shows nothing, except that an explicit action with no other
  visible result (Save layout) confirms itself with one transient sentence.
- An ongoing state is a State Mark: one small glyph at the pane's top-right
  edge, in its top padding, with a tooltip and an accessible name and no
  on-screen text. With the tab strip visible, the tab shows each state's glyph
  once before its title. Core owns the glyphs: Mirror Typing `↔`, a program
  working `⋯`, and a program asking for attention `●`
  ([program progress and attention](#program-progress-and-attention)).
- A surprise, or that confirmation, is one transient overlay sentence that
  disappears after four seconds.
- Something that needs the user is one overlay sentence without counts that
  stays until dismissed. A newer sentence replaces the previous one, but a
  surprise never hides a notice that is still waiting.
- None of these enters the layout flow: showing, changing or removing one never
  refits a Surface or resizes a PTY, with or without the title bar or tab
  strip. Stopping an ongoing state uses existing actions (shortcut, Command
  Palette, menu), never a separate button. A state may also make its pane mark
  clickable: the same glyph becomes a button whose tooltip and accessible name
  add the action, and clicking it keeps terminal focus. The tab's glyph is never
  clickable.

### About dialog

- `About OMXTerm` in the application menu opens one compact in-window dialog on
  every Supported Platform. It shows the application icon, name, running
  version, and MIT license, and text links on one line to the project,
  contributors, issue tracker, and license. Developer lists live in `CONTRIBUTORS.md`, not the
  dialog; no individual copyright is spotlighted, and legal notices stay in the
  distribution.
- Main supplies runtime metadata and opens only fixed named destinations after
  validating the owning renderer's main frame. Opening About makes no network
  request. The displayed icon is the same locally bundled asset in development
  and packages.
- Native menu keyboard navigation can open About. Close or Escape dismisses it
  and focuses the live selected Application Tab. A closing Escape or
  Enter-on-Close gesture stays owned by About through held repeats and release,
  including Kitty event reporting; the next fresh terminal press is not consumed.
  Window blur and owner disposal clear outstanding gesture ownership. Space keeps
  the button's native release-time activation.
- Opening again, including during metadata loading, focuses the same dialog.
  Returning from the browser does not steal its focus. Owner disposal removes it
  without restoring terminal focus; late metadata and link errors cannot reopen
  it. About has no configurable shortcut, settings service, or persistent state.

### Command Palette

- `View -> Command Palette…` opens a temporary searchable dialog for core
  application actions. `commandPalette` is remappable on every Supported Platform
  and defaults to `CommandOrControl+Shift+P` on macOS and `Control+Shift+P` on
  Linux/Windows. Explicit remaps and `null` stay effective; an existing custom
  binding on that combination gets the standard collision error, never an
  automatic rewrite or reassignment.
- It shows localized labels and effective shortcuts from the internal Action
  Catalog shared with the native menu and main key matcher. Matching is
  case-insensitive substring in en-US or pt-BR, with no fuzzy matching, aliases,
  ranking, or history.
- Up/Down selects a result; Enter or a click invokes it after dismissal. Escape
  or the backdrop cancels. Enter/Escape repeats and release stay owned by the
  closing dialog; keyboard invocation waits for the owned Enter release, and
  blur or a lost release cancels it.
- Copy, Paste, Select All, Find, positional tab selection, Command Palette
  itself, and native role-only Minimize are not results. Edit actions and
  shortcuts still work outside the palette; while its query owns input,
  clipboard actions edit the query, not the terminal.
- The palette captures the selected Application Tab and focused pane before
  reading its catalog snapshot. Changed selection (including away and back),
  removed or ended targets, or owner disposal prevent dispatch to a replacement.
  Main validates the selected trusted main frame and a one-shot catalog token;
  window blur, renderer loss/reload, selection/session lifecycle changes, and
  catalog replacement invalidate pending authorization. Renderer-bound dispatch
  rechecks the captured target before running the action handler. Busy Session
  confirmation and action guards still apply.
- Settings stays retained nonmodal content beneath the palette: its controls
  become inert and shortcut recording cancels, without discarding drafts or
  pending saves. Dismissal restores a surviving interactive prior control when
  the captured target is still current.
- Labels and bindings are a per-opening snapshot; after changing language or
  bindings, reopen the palette. It adds no persistent toolbar, configuration
  migration, public action registration, or Extension SDK.

### Modal overlay rules

About, Command Palette, Local Image Preview, and the Snippets preview are modal
overlays.

- They never stack: opening one while another is choosing, loading, or showing
  is ignored. Settings is nonmodal application content; About and menu-triggered
  image preview can open above it. Modal activation makes Settings inert,
  cancels shortcut recording, and invalidates clipboard interaction. Dismissal
  restores selected-content focus, including a surviving Settings field; writes
  already submitted may settle.
- While a modal owns input, terminal clipboard, file drop, zoom, snippet,
  tab-bar/title-bar toggles, tab navigation, new tab, and pane
  split/focus/equalize actions are suppressed and not queued, without changing
  their state or stealing focus. Local Image Preview also suppresses the hover
  drag handle and the Linux/Windows Alt menu. Pane dividers and
  passive mount/rebuild focus consult the same modal owner. Output,
  configuration updates, approved pane/tab/session/window closure, failure
  acknowledgement, and Quit stay active. Already accepted terminal input is not
  rolled back.
- About, Command Palette, Local Image Preview and the Snippets preview share
  one overlay recipe: theme-derived surface, subtle hairline, 8 px radius,
  quiet filled buttons and the same typography (the SSH exit notice uses the
  same surface). Their background tint follows effective window transparency
  without fading text or keyboard focus; no opaque scrim overrides that
  preference. The tint composites over application content but is not native
  desktop blur, which stays main-owned and best effort.
- While any of these overlays is open, a shared fixed 12 px CSS filter
  softens the non-dialog body-child underlays (terminal, Settings, chrome),
  including underlays inserted later, and ends on dismissal or disposal. It does
  not filter body/html, the body tint, the modal foreground, or transparent
  backdrops, does not change tint alpha, and is independent of the
  `window.blur` preference.

### Developer Tools, Local Image Preview, and file drops

- `View -> Toggle Developer Tools` is a menu/palette diagnostic action for the
  selected window, in development and packages. It opens or closes Electron's
  local Developer Tools without enabling remote debugging, and never opens them
  automatically. They can expose private Terminal Payload and runtime state, so
  review and redact diagnostic output, screenshots, traces, and profiles before
  sharing.
- `File -> Open Local Image…` is a menu/palette action for the selected window.
  A native picker chooses one local static PNG or JPEG, previewed in a temporary
  overlay without writing the file or changing User Configuration
  ([ADR 0026](adr/0026-preview-explicitly-activated-local-images.md)). The
  picker and visible local-image sources share the bounded read and overlay
  rules under [Terminal behavior](#terminal-behavior).
- Escape, the close button, or the backdrop dismisses the overlay, releases its
  renderer Blob source synchronously, and returns focus to the live selected
  Application Tab. Picker cancellation returns focus without an error. Page
  activation does not steal preview focus. Dismissal restores ordinary routing.
- Dropping native file-manager files or folders anywhere in a window (without an
  active Local Image Preview) inserts their absolute paths into the focused pane
  of the selected tab only. Paths keep platform order, are separated by one
  space, and go through Protected Paste without Enter.
- Drag navigation is prevented over the whole renderer document. Internal tab
  dragging only reorders tabs. Apart from the [Files drag route](#files-panel), drops
  without native files have no terminal effect, and Files entry/candidate MIME
  payloads (even mixed with native files or tab drags) never fall through to
  native-file insertion.

### Configuration reload

- `View -> Reload User Configuration` (default `Cmd+Shift+,` on macOS and
  `Ctrl+Shift+,` on Linux and Windows) rereads and validates the complete
  configuration.
- A successful reload updates, in place: font-size baseline, padding, terminal
  context-menu eligibility, scrollback, ligatures, Option Key Mode, theme,
  transparency, blur, the shared Auxiliary Panel side, close confirmation,
  logging, menu, and keybind delivery.
- It updates the Always-on-Top, title-bar, and tab-bar defaults for new windows
  and, on Windows, shell selection for new Default Shell sessions. Existing
  windows keep their visibility choices, Always-on-Top state, and Window Font
  Zoom delta; Actual Size returns to the new baseline.
- Font family and line height are creation-time settings. Reload is not
  transactional across consumers; failure and font-acquisition limits are under
  [configuration and local state](#configuration-and-local-state).

### Auxiliary Panel

The Auxiliary Panel is one nonmodal side panel per window, below the full-width
title and tab chrome. Built-in Snippets, installed Snippets, Files, and SSH
Connect share it; no per-tool placement or second panel exists.

**Opening tools**

- `View -> Toggle Snippets` (default `Cmd+Option+S` on macOS and `Ctrl+Shift+S`
  on Linux and Windows, remappable through `keybinds`) opens, reveals, or closes
  the selected window's Snippets view. It is the only menu/palette entry for
  Snippets, including with remapped or null bindings.
- Snippets is an optional installed extension on Linux ARM64/x64, macOS ARM64,
  and Windows ARM64. Those packages bundle Snippets `0.1.0` as a
  [removable default](dev/default-snippets.md), enabled but dormant only for
  positively new packaged profiles; existing users are never enrolled and
  install it through the official catalog (which offers `0.1.1`) or a verified
  local/offline archive. Updates are never automatic. Windows x64 keeps the
  built-in view and is not a default-provisioning or catalog target. Existing YAML, bindings, and
  disabled/removed choices are preserved
  ([ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md);
  [migration guide](dev/snippets-migration.md)).
- Without an enabled installation, Toggle Snippets opens Extensions management
  with an optional-tool explanation and the actual installed state,
  without installing, enabling, or running code. Settings and modal owners stay
  no-op targets. A runtime failure never brings back a competing built-in view.
- Installed Files and SSH Connect join the panel through their own actions.
  Each tool's entry point closes it when it is selected and visible; otherwise it
  opens or reveals it. Views are created lazily.

**Header and switching**

- With one open tool the header shows its name. With several, a labeled,
  single-line switcher (long names truncate) fills the same header and
  identifies the selected tool,
  without a second host title. One view is visible at a time; switcher buttons
  select without closing.
- The host keeps the panel's accessible name and does not inspect or strip
  extension content. Files and SSH Connect pages leave tool identity to the host
  and keep named child regions and content sections; installed older archives
  keep their own headings (packages are immutable).
- Switching views deactivates the old view and focuses the new one directly,
  with no intermediate terminal focus.

**Close, Hide, and Escape**

- Header Close (or a selected-visible tool's toggle) closes only the selected
  tool and hides the panel; other open tools stay retained. Built-in Snippets
  disposes its view but keeps its lazy factory. Native tool close retires the
  view through the acknowledged host lifecycle, not extension disable or backend
  retirement. Reopening creates fresh view state and invocation context.
  Repeated closes coalesce; a pending close never queues an automatic reopen.
- Header Hide (a chevron toward the panel's edge, distinct from Close's ×, both
  with tooltips) and Escape (from inside the panel) keep every opened tool and
  its state.
- Close and Hide return focus to the live selected terminal after native
  acknowledgement, unless a newer selection or modal owns focus. Neither closes
  terminal sessions. Escape in the terminal stays terminal input. An Escape or
  Enter-on-Close/Hide gesture owns its repeats and release, including Kitty event
  reporting.
- Only a fresh non-composing Escape starts dismissal, both in the built-in panel
  and in the native hosted-view fallback. A composing Escape and an unowned
  repeat stay with the focused control; an already-owned dismissal still consumes
  its repeats and release during composition. This DOM policy does not establish
  what a particular OS or IME delivers.
- There is no backdrop, focus trap, or global Escape interception. Returning to
  the page keeps focused panel controls; deliberate terminal/tab actions still
  focus the terminal.

**Toggle Auxiliary Panel**

- `View -> Toggle Auxiliary Panel` (`keybinds.toggleAuxiliaryPanel`, default
  `null`) hides or reveals the container. Reveal restores the remembered open
  tool, or the first remaining one. Hiding does not keep active semantic-input
  authority.
- In an eligible terminal selection with no open tools, it lazily opens or
  reveals installed and enabled Snippets (the built-in view on Windows x64). It
  never installs, enables, fetches a catalog, opens Settings, or shows a native
  error dialog.
- If nothing can open, a localized, noninteractive status says “No tools are
  open. Open an extension to use the panel.” for about four seconds without
  moving focus. Further failed attempts do not repeat or extend it; this budget
  covers one main-process lifetime across its windows. Later manual installation
  or enablement can make a future attempt succeed.
- Tab/pane selection, another tool, modal ownership, native window blur, close,
  and disposal revoke a pending empty-panel open; delayed native publication
  cannot reveal or focus that stale view. Main rechecks the intent after awaited
  manager work, and cancelled or superseded intent never gets a success result.
  Native window blur revokes main intent and notifies core even when
  publication is already in transit, but core DOM blur caused by creating or
  focusing an owned child does not.
  Blocked/suspended targets and pending tool retirement do not trigger the
  fallback. Existing action identities, defaults, and custom/null bindings are
  unchanged. This is access fallback, not default installation.

**Panel side and width**

- **Settings → Window → Auxiliary panel side** persists
  `window.auxiliaryPanelSide` (`left` or `right`, default `right`) and applies
  live to all windows. A side change ends active resizing and keeps preferred
  width, visibility, selection, drafts, focus, and view/Surface/session
  identities. It does not activate, hide, reopen, or reload a tool.
  Position-only native changes refresh the coalesced presentation path without
  focus intent; overlay, selection, and retirement guards still apply.
- `View -> Move Auxiliary Panel to Other Side` (`keybinds.moveAuxiliaryPanel`,
  default `CommandOrControl+Shift+Alt+P` on macOS and `Control+Shift+Alt+P` on
  Linux/Windows) changes only the focused window's side and never writes
  configuration. It works from a terminal, Settings, or a nonmodal hosted tab,
  does not reveal a suspended panel, and is suppressed by a modal or other
  presentation owner. One physical press moves the panel once and owns its
  repeats and release across core and child focus, including a modified Escape
  binding that would otherwise dismiss a focused companion. Plain Escape and
  companion-tool shortcuts keep their ownership. The override lasts for that
  window and clears when `window.auxiliaryPanelSide` changes.
- Preferred border-box width starts at 280 CSS px per window, bounded to
  220–560 px, plus a separate 6 px terminal-facing separator and a 180 px
  terminal layout allowance. The effective maximum is
  `min(560, contentWidth - 186)`. Automatic clamping keeps the preferred width.
  Below 406 px of content width the panel hides and deactivates and does not
  reopen automatically when space returns; opening it then reports “Widen the
  window to open Snippets”.
- Primary-pointer dragging captures the pointer, grows a right panel when moving
  left (a left panel when moving right), and paints at most once per animation
  frame. Pointer up, cancel, lost capture, hide, switch, overlay activity, and
  disposal end dragging at the last valid width.
- The separator is a focusable vertical separator exposing current/min/max
  pixels and readable value text. Left/Right move it physically by 10 px (Left
  grows a right panel, Right grows a left panel);
  Home/End choose the current limits. Resize keys are consumed only on the
  separator. It paints a 1 px line inside its 6 px target with the same default
  hover/drag and keyboard-focus states as pane dividers, but its decorative
  color/null choice is separate, and the panel never gets an active-pane
  highlight.
- The preferred width survives hiding, view switching, reload, theme, and chrome
  changes in that window's memory only; new windows and restarts reset width and
  visibility.
  Only the side preference is persisted. Layout changes keep Surface, core,
  Adapter, and session identities, refit the selected grid, and keep hidden-tab
  geometry and output.

**View lifecycle**

- Window composition creates the shared panel independently of Snippets wiring.
  Built-in Snippets contributes its lazy view definition; installed tools use
  the native companion presenter. Core owns semantic preview in both modes.
- The host owns exclusive visibility, header/Close, resize, focus, and lifecycle;
  the view owns its query, scroll, and catalog.
- Snippets activation shows loading/search and focuses search immediately,
  rereading `snippets.yaml` each time without file watching. Old rows cannot act
  during loading. Results, including empty/error results, replace the catalog
  without refocusing. Late results from a hidden, superseded, or disposed
  activation are inert. Query and scroll survive hiding in memory; scroll clamps
  after shorter results.
- Deactivation stops active-only work; disposal releases every created view and
  listener once. Native extension views keep their page state while hidden.
  Closing discards view drafts and revokes view requests, but accepted filesystem
  work may still finish with an unknown outcome: close is not rollback, and
  reopening never replays it. Backend scratch state may survive view close.
  Core-owned SSH launches and accepted Surface-owned paste do not depend on view
  lifetime.
- Terminal-tab changes keep the selected companion view. Settings and general
  hosted tabs suspend the panel and restore its selected view on terminal
  return.
- Panel tools are owned by the window, not the terminal that opened them.
  Backend or window loss and disable/update/uninstall still retire their views.
- One window-native presentation owner orders panel and tab geometry, focus,
  acknowledged hiding before DOM overlays, and stale-continuation rejection.

**Clipboard and overlays in the panel**

- Native Copy, Paste, and Select All (menu and default or remapped shortcuts)
  edit the focused panel text field, never the PTY. Paste inserts at the
  selection with line breaks replaced by spaces; asynchronous completion
  rechecks focus and an active, unblocked lifetime. Unsupported panel controls
  or unavailable clipboard edits suppress terminal delivery. Terminal-focused
  actions keep their routing.
- About and Local Image Preview keep panel layout and state but make controls and
  the separator inert, cancel dragging, and ignore competing actions instead of
  queueing them. Valid visible reads may settle without taking focus. Each
  overlay keeps its own dismissal, tab/closure, and file-drop policies.
- The fixed header/Close and independently scrolling results contain long
  content and keep light/dark theme, background-opacity, and hidden-chrome
  composition.

### Snippets panel

- Each row shows its default action before activation: **Insert** (`execute`
  false or omitted) or **Run · adds Enter** (`execute: true`). Clicking a current
  row captures the focused pane's live Surface at that moment, injects the exact
  body with that intent through Protected Paste, and returns focus immediately.
- Enter on a row owns that gesture's held repeats and release, so they cannot
  add a terminal Enter outside the snippet's `execute` choice. A fresh terminal
  key is ordinary input.
- A separate **Preview** control opens a temporary read-only dialog that shows
  the stored body exactly, without trimming or normalization. It captures the
  focused pane's live Surface first; with no live Surface it does not open. Its
  final **Insert — no added Enter** or **Run — adds Enter** choice wins over
  `execute`, is accepted once, closes the preview, and returns focus to the
  terminal.
- Cancel or Escape sends nothing and restores focus to the Preview control (when
  still connected, enabled, and interactive in the visible view), otherwise
  panel search, otherwise the live selected terminal. It never reopens a hidden
  panel.
- If the captured Surface ends or fails while the preview is open, its actions
  are disabled even if the pane stays visible for failure acknowledgement.
  Removal, tab closure, and host disposal also end that target exactly once,
  before exit or fatal failure is forwarded. Nothing goes to a sibling or
  replacement pane, and an unavailable Surface cannot be captured for a new
  preview.
- Language switching relabels row/preview controls and the unavailable notice
  without replacing DOM, moving focus, rereading YAML, recapturing the target,
  changing user text, or re-enabling a dead target's actions.
- Insert only omits the added Enter: embedded line breaks or control characters
  can still execute, and Protected Paste may still ask for confirmation. Hiding
  does not cancel accepted Surface-owned delivery; closing that Surface stops
  remaining chunks and Enter without rollback.

### Files panel

Files is a separately installed extension
([availability](files-availability.md)). Its archive version and host range are
maintained separately; see [Architecture boundaries](#architecture-boundaries).

- Files opens at Home. An explicit host focus intent focuses its loaded-entry
  filter unless an open operation editor needs focus; restore intent keeps an
  eligible focused control.
- The tree is an expandable local folder tree with keyboard navigation,
  discoverable Actions, and item/background context menus. Links are not
  expanded implicitly.
- The filter only narrows already-loaded rows in expanded folders. It keeps
  matching ancestors and visible loading/error/truncation rows, never searches
  collapsed folders, and makes no filesystem requests. Dotfile visibility applies
  first. Filtering away the selection clears it.
- Tab reaches the tree, even when empty. If rows arrive while the empty tree has
  focus, Up/Down enters them explicitly. Focusing a row selects it; F2 and the
  context menu select a previously unselected fallback row before acting. The
  Rename / move menu item advertises F2.
- Unsubmitted address drafts survive listing updates. Row actions ignore
  composing and other modified gestures (except Shift+F10). Cancel returns to the
  initiating row or control when possible, otherwise Actions. A late
  permanent-delete confirmation does not steal focus after the user moves away.
  A composing Escape, or an unowned Escape repeat, stays with an operation editor
  or menu, keeping the draft.
- The navigation toolbar uses quiet icon buttons with localized accessible names
  and visible explanations on hover or focus; Go means Enter in the address
  field, not a global shortcut. Explanations follow notice and language changes,
  hide while their anchor is offscreen, and do not intercept other interactive
  targets; their unobstructed areas stay hoverable. Controls that need a root are disabled until one exists. Up is
  disabled but focusable at the filesystem root; New folder is disabled while a
  mutation is pending; Refresh stays available during listing. Menu and
  destructive confirmation labels stay explicit, and operation editors keep
  their captured targets.
- Moving: a single internal entry can be dragged onto a directory row (with
  valid/invalid feedback), or moved with the keyboard-accessible Move to folder
  action. External payloads never become internal moves. Both require
  confirming the captured source and destination; identities are rechecked
  before the no-replace move. Same-directory, self/descendant, and final-symlink
  destinations are refused; symlink sources move as links. Conflicts never
  overwrite, cross-volume moves never fall back to copy/delete, and unknown
  outcomes are not retried. These checks are not a hostile filesystem race
  sandbox.
- The page follows the host's en-US/pt-BR language, relabelling retained
  controls, accessible names, menus, confirmations, and notices without
  rereading listings, replaying operations, or resetting focus, caret, drafts,
  selection, or deletion tokens. Names, paths, and technical error codes stay
  literal.
- Successful mutations refresh the current root and surviving expanded folders
  without navigating back. Failures and unknown outcomes never trigger a retry.
  Manual refresh handles external changes; there are no watchers or polling.
  Listings stay bounded, moves never clobber, and permanent delete needs a
  one-shot confirmation.

**Reported directory**

- The explicit reported-directory action captures the selected live pane's
  latest local OSC 7 report at action time. Main asks the core renderer to
  confirm the captured session and selection revision, and refuses a reordered
  or changed selection instead of retargeting.
- No report, a known SSH Connect pane, or an incomplete, remote, or invalid
  report produces an explanation without changing location. Only the visible
  Files panel in its focused window can ask; main chooses the window and pane,
  never a caller-supplied target. It is not continuous following and does not
  retarget a started request or filesystem operation. Other extension
  invocation contexts stay captured at invocation.
- The [OSC 7 limits](#terminal-panes) apply. The action opens the fixed path
  locally without a modal and is labeled as the last reported path, with those
  limits in an inline hint, tooltip, and accessible description. Older
  compatible archives keep their earlier label, without the hint or tooltip.

**Inserting paths into the terminal**

Both routes below share these rules:

- The original Surface owns accepted Protected Paste, including confirmation and
  remaining chunks, and never adds Enter. Accepted work continues after Files
  retires; Surface termination stops remaining chunks.
- Completion means every chunk was accepted by the captured live local session
  and passed to node-pty without a synchronous error, not that the OS, shell, or
  program consumed it. Unknown outcomes are explained and never replayed.
- After successful delivery, focus returns to the captured pane's terminal input
  (not a retained search query) only if it is still the live selection and no
  newer tool, field, pane, companion selection, or overlay intent exists. A
  later selection is never focused instead.
- Paths are refused, never rewritten. Ordinary spaces and quotes survive. There
  is no string/URI parsing, filesystem lookup, or second PTY/paste route.

**Insert path into terminal**

- **Insert path into terminal** (in Actions, or Shift+Enter on a focused row)
  captures one visible selected file, folder, or link and requests insertion
  immediately.
- At invocation, the app-owned child preload privately stamps its latest observed
  core-selection revision and visible-admission generation. Main checks both at
  receipt and commit; core independently refuses a changed selection before
  capturing the Surface. Missing or stale observations fail closed instead of
  retargeting. There is no global ordering across processes.
- Missing, closed, busy, invalid, and incomplete outcomes are explained without
  automatic replay.
- Only NUL and a bracketed-paste terminator are refused. Any other control
  character or newline in the path can still act on the receiving program.

**Drag to terminal**

- A Files row drag carries one opaque gesture per owner window, valid for at
  most ten seconds including claim and handoff. Registration in the child main
  frame captures the literal bounded absolute path and kind against its
  installed view, epoch, and window; no path enters DataTransfer.
- When the protected handoff consumer is available (Files declares
  `terminal.insertPath.v1`), the row adds a terminal-candidate MIME and uses
  copyMove; directory rows inside Files still move with confirmation. Without
  the consumer the row is move-only.
- Only the visible terminal area of the selected tab's focused live pane shows
  the localized “Drop to insert path (not run)” candidate and copy cursor. Other
  panes, chrome, tabs, panels, search controls, Settings, overlays, and blocked
  presentations are inert. Candidate feedback is not authorization.
- A drop synchronously captures the pane, Surface, DOM focus, and selection
  revision, and claims the terminal ticket plus the matching internal token
  before any asynchronous work. A canceled or internal-move dragend revokes
  unclaimed rows but not a claimed drop. A completed native copy keeps only its
  original ticket, which may reach main after the child's dragend without
  extending the deadline or granting input.
- Hide, retirement, window loss, blur/minimize, installation revocation, and
  timeout revoke either phase, with no revival on reveal. Mixed, native, tab,
  forged, expired, or replayed claims are refused. An eligible drop whose claim
  fails (another window's Files, or past the deadline) shows a localized “Path
  not inserted” notice there. Main settles every claimed drop.
- Paths containing any C0 or C1 control character, overlong paths, and otherwise
  invalid paths still register, and are refused only when dropped on a terminal,
  never at drag start. A private one-shot ticket binds the request to the
  original renderer Surface, never recaptured. Stale selection, Surface, or DOM
  focus and blocked presentation refuse admission.
- The Surface stops Mirror Typing before delivery. Visible Files shows localized
  accepted, refused, incomplete, or unknown notices. A claimed timeout revokes
  input authority and sends one unknown notice, only to the original
  still-live, visible source; late settlement sends nothing more. Successful
  focus return goes through the native presentation owner.

### SSH Connect in the panel

- SSH Connect opens a new Terminal Tab, keeping earlier sessions and the visible
  panel. Its foreground handoff acknowledges native focus returning to core
  while the panel stays visible; a background result does not steal focus.

### Program progress and attention

Programs report what they are doing with standard sequences
([ADR 0053](adr/0053-mark-program-progress-and-attention.md)):

- OSC 9;4 progress (`ESC ] 9 ; 4 ; state ; percent ST`, BEL or ST
  terminated) shows a static "working" [State Mark](#state-marks) on the
  reporting pane and its tab. States 1–4 show it; state 0 or a missing state
  clears it. It also clears when the same pane asks for attention or its
  session ends. There is no timeout. OSC 9;4 and ConEmu's other OSC 9
  subcommands (`9;1` through `9;12`) are never notifications.
- BEL, OSC 9 text (`ESC ] 9 ; text ST`) and OSC 777 notify
  (`ESC ] 777 ; notify ; title ; body ST`, split at the first `;` after the
  title) ask for attention. BEL stays silent and the title stays the
  program's. The pane and its tab show an "attention" State Mark until the
  pane is seen: selected in a focused window, focused again while selected, or
  typed into. The mark appears even on the pane in front of the user.
- Program text is untrusted plain text. Controls and line breaks become
  spaces, bidirectional controls are removed, and titles and bodies are cut to
  128 and 512 code points with an ellipsis. It never reaches logs.
- When the window isn't focused, or the session isn't one of the selected
  tab's panes, OMXTerm shows a native notification (`notifications.enabled`,
  on by default). Its title is the OSC 777 title, or else the session's title.
  Its body is the program's text, or "Rang the bell." for BEL. Each session
  keeps at most one notification: a newer one replaces it, and repeats within
  one second are dropped. Seeing the pane or ending its session closes it.
  Clicking it brings the window forward and selects the session's tab and
  pane. Linux bodies are markup-escaped.
- `notifications.sound` (off by default) plays the system notification sound
  with the notification, or the system alert sound when notifications are off.
  With `notifications.soundFile`, an absolute path, OMXTerm plays that file
  instead (at most 4 MiB, decoded in the window, skipped if unreadable or
  undecodable, with the system alert sound when it can't be read). OMXTerm
  ships no sound.
- An unfocused window also requests native attention once until the user
  focuses or interacts with it: an informational Dock bounce on macOS, or
  per-window attention on Linux and Windows. Focus, terminal interaction, or
  window disposal cancels the outstanding request. Native desktop policy
  decides how attention and notifications are shown.

## Saved Layout

The optional [Saved Layout extension](saved-layout.md) brings window structure
back with fresh shells
([ADR 0042](adr/0042-save-layouts-without-restoring-sessions.md),
[ADR 0047](adr/0047-reopen-the-last-windows-at-startup.md),
[developer notes](saved-layout-development.md)). Version 0.2.0 needs host
0.27.0 or later; reopening at startup needs 0.3.0 and a host that knows
`terminal.reopenLayout.v1`.

### Reopening at startup

- Reopening is on while an installed, enabled extension declares
  `terminal.reopenLayout.v1`. No extension code runs at startup. Disabling or
  uninstalling it while OMXTerm runs deletes the remembered windows; an
  extension runtime that fails to load doesn't.
- A 3 s tick captures every terminal window only after layout or PTY activity
  (pane start, close or exit, input, output, resize, tab selection), and a
  closing window saves right away. Main writes
  `<profile>/layout-session/last.json` only when the arrangement changed. It
  never writes while quitting, for zero windows, or when a capture fails.
  Closing one of several windows forgets it; Quit and closing the last window
  keep the arrangement. Windows without a terminal tab are skipped; tabs past
  16 tabs or 32 panes count as omitted; at most 16 windows.
- A reopened pane whose saved folder was unavailable keeps that folder until
  its shell reports another.
- A start without `-e` opens each remembered window from the same plan as Open
  (folders checked, home fallback, fresh Default Shells), skipping windows saved
  on another OS; if none open, one ordinary window opens. A start with `-e`
  opens as asked and neither reopens nor remembers.
- Only the process holding `layout-session/session.lock` reopens and
  remembers. Packaged launches share one process per profile, so this matters
  for source runs and for a process started with `-e`: launches that join it
  aren't remembered either. A `reopening` marker left by a start whose reopened windows were
  never saved and that didn't quit normally drops the remembered windows; that
  start opens one ordinary window.
- Window position and size are not remembered.

### Saving a window

- The page shows the saved snapshot (tab and pane counts, save time) with Open,
  Save/Replace and Forget. Open is the primary action when a snapshot exists,
  otherwise Save. **Try again** appears only after a failed read.
- **Save layout** (`saveLayout`, `Cmd+Shift+L` on macOS, `Ctrl+Shift+L` on
  Linux and Windows) saves the focused window without opening the page: one
  entry in the File menu and Command Palette, not the context menu, present
  only while the extension is installed and enabled and declares
  `terminal.captureLayout.v1` and `state.v1`. Main captures the window, then
  asks the extension's backend to read and replace its snapshot at the revision
  it just read, like the page's Save. Success flashes "Layout saved."; a
  refused or failed save leaves one dismissible notice; a write whose outcome
  is unknown says it couldn't confirm the save. Nothing is retried, one save
  runs at a time, and disabling, updating or uninstalling the extension revokes
  a held entry. An open page shows the new snapshot once it's shown again.
- Saving captures only the original window's terminal tabs, weighted flat pane
  trees, focus and selection, and reported-local/launch-local/home directory
  provenance. Graphical tabs are excluded and counted. When no pane has a
  reported folder, the page says panes reopen where they started.
- Limits are 16 tabs, 16 panes per tab, 32 panes in total, and 256 KiB. Larger
  requests are refused whole, never truncated.
- Opening transfers a fully validated plan to one new core window with no dummy
  shell. Every pane starts through normal Surface initialization using the
  Default Shell, never consuming a pending `-e`. Current work is untouched;
  partial failures keep healthy panes. The page reports folder fallbacks.
- The window shows nothing while restored panes open or when they all opened.
  When some panes couldn't open, it leaves one dismissible
  [State Marks](#state-marks) notice without counts. Panes closed meanwhile and
  shells that exit cleanly aren't failures.
- Core owns tokens, status, cancellation, and native shutdown independently of
  extension retirement. Keyboard Open waits for the Enter release; delayed
  presentation respects newer focus intent.
- Saving uses an extension-scoped native-lease/CAS state adapter outside
  configuration and immutable packages. Opaque revisions and Forget tombstones
  prevent stale destructive writes. Data survives disable, update, and
  uninstall.
- A conflicting write, or one whose outcome is unknown, is never retried; the
  page reads the saved state again and shows it, and reads again whenever it is
  shown. Malformed or unreadable state is not repaired. Forget removes the
  active snapshot, not possible interrupted-write temp copies.
- No terminal payload, command, environment, title, process, or SSH target is
  stored.
- Directory provenance uses the same folder as split panes, read right before
  each capture: `reported-local` is an OSC 7 report or the shell's cwd. Without
  either, an invalid, remote, or overlong report revokes launch fallback. Known
  SSH, explicit-command, ended, and pending panes use home slots.
- Directory checks are asynchronous and fall back to home on missing or
  unavailable paths, without creating folders or retrying a failed PTY launch.
  OS-mounted folders and ordinary shell startup may access the network.

## Mirror Typing

The separately installed
[Mirror Typing extension](mirror-typing.md) copies typing to a fixed set of
panes in one tab
([ADR 0043](adr/0043-revoke-visible-mirror-typing-routes.md)). Version 0.2.0
needs host 0.27.0 or later; 0.3.0, a transparent dialog body without its own
title, needs 0.29.1-dev.0 or later.

- An explicit action captures one terminal tab and its live, mounted focused
  pane before setup opens. An ineligible original focus refuses, even with live
  siblings. Setup is a [Hosted Dialog](#hosted-extension-content) over the tab
  (any installed version), so opening it never changes the terminal grid.
- Setup inspects a fixed subset of 2–16 live panes that always includes the
  original focus. Start counts only from the shown setup dialog. It consumes
  fresh setup authority and returns only to that exact tab and source, after
  the dialog's acknowledged native hide and focus/lifetime revalidation. The
  hidden setup view stays alive while mirroring; main retires it when Mirror
  Typing opens again. A tab or panel selection that hides the dialog during
  Preparing cancels Start. If keyboard focus returns to the window a moment after the
  hide, Start waits for it, bounded by the prepare timer; blur still cancels.
- In source mode, core mirrors final genuine keyboard bytes exactly once per
  member. Any selected member can become the source; new panes never join.
  Mouse, pointer-origin prompt reports, focus/program/parser replies, and
  graphical fields stay local. Extension code never receives keyboard payloads.
- Paste, snippet Insert/Run, and drops synchronously Stop mirroring before
  ordinary delivery to the captured original target, including empty or
  unsupported terminal paste, and before clipboard reads or Protected Paste
  confirmation. Cancelled paste stays stopped; delayed local approval cannot fan
  out or restart mirroring.
- While the route is armed, every member carries a core
  [State Mark](#state-marks) whose name says source or member and "Click or
  press Cmd+Shift+M to stop." with the binding in effect at Start (just "Click
  to stop." when `toggleMirrorTyping` is unbound). Clicking any member's mark,
  pressing that binding, or opening the Command Palette (a modal entry) stops
  the group, even with hidden chrome and whether or not the
  extension responds. Preparing shows nothing, is input-inert and cancellable;
  Start key releases cannot leak into terminal input.
- The one **Mirror Typing** entry (File menu, terminal context menu, Command
  Palette, and its `toggleMirrorTyping` shortcut) is a toggle that acts only on
  its window: a running or preparing group there stops; otherwise a shown setup
  dialog closes; otherwise setup opens for the selected tab. It never stops or
  changes a group in another window; each window keeps its own group. One
  press acts once; repeats and release never reach the terminal. Because
  opening the Command Palette already stops the group, choosing the entry there
  opens setup.
- An ordinary stop removes the marks and shows nothing. A paste, snippet or
  drop stop flashes one transient sentence; a failed write leaves one
  dismissible sentence warning that some panes may have missed input.
- Selecting an unselected pane or tab, modal entry, member loss, view/backend
  loss, local disable/update/uninstall, renderer/window teardown, and
  hide/minimize revoke the whole group. Active-window blur blocks input but keeps
  the group; a pending Start cancels on blur. Healthy resize, reorder, theme,
  language, and chrome changes neither restart nor end it.
- One settled-replacement setup per extension and window prevents piling up
  obsolete views. Returning to setup stops the group; another Start needs fresh
  authority. Main/native and renderer generation fences reject stale starts and
  input. Backend lifetime loss revokes views before settlement; cleanup is not
  input authority.
- Membership, tokens, and leases are memory-only and excluded from Saved Layout,
  startup, configuration, and extension state.
- Limits: source-mode bytes are not per-recipient semantic keys or synchronized
  shell state, so use matching programs and modes. Stop cannot undo input or
  synthesize key releases. Native writes are best-effort sequential, not atomic,
  with no replay or rollback. Cross-instance revocation is not instantaneous.

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
  Its output filter hands raw OSC 9 and OSC 777 payloads to the host's OSC
  route, where OMXTerm's own parser reads progress and notifications. Title
  sanitization, fallback, ownership, attention marks, focus/interaction reset,
  notifications and platform attention are host policy. OSC BEL
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
- Everything else comes from OMXTerm's own environment. On Linux under an
  AppImage (an absolute `APPDIR`), sessions do not inherit the AppImage
  runtime: `APPIMAGE`, `APPDIR`, `ARGV0`, `OWD` and `CHROME_DESKTOP` are
  removed, and so are the entries under `APPDIR` in `PATH`, `LD_LIBRARY_PATH`,
  `XDG_DATA_DIRS` and `GSETTINGS_SCHEMA_DIR`, along with the defaults AppRun
  appends to `XDG_DATA_DIRS`. The user's own entries keep their order, and a
  list left empty is unset. OMXTerm's own environment is not changed, and other
  platforms pass it through as is.
- On Linux, Chromium also changes OMXTerm's own environment during startup:
  `NO_AT_BRIDGE=1` (GTK initialization), `FC_FONTATIONS=1`, and
  `EGL_PLATFORM=wayland` on Wayland. Sessions get the values OMXTerm was
  launched with instead: main reads them while its module code first runs,
  before GTK initialization, and a session receives each one back, or unset if
  it was unset. `FC_FONTATIONS` and `EGL_PLATFORM` are set before any
  application code runs, so a launch value equal to Chromium's (`1`, or
  `wayland` when main started on Wayland) cannot be told apart and is removed;
  a user's own `FC_FONTATIONS` is overwritten by Chromium and cannot be
  recovered. macOS and Windows sessions are unaffected.
- Restty answers DA1 as `CSI ? 1 ; 2 c` and DA2 as `CSI > 0 ; 0 ; 0 c`, once
  per query.
- Ghostty answers cursor-position queries (`CSI 6 n`) from its parser cursor at
  the query's place in the output stream, including wide/combining text and
  pending-wrap resize, without a render frame or JavaScript cursor hint.
  Origin-mode reports are relative to the scrolling margins.
- Replies keep stream order. DA1, DA2, XTVERSION, window-size and color replies
  wait for the core's replies to earlier queries, such as a Kitty graphics
  query (`a=q`), mode reports (DECRQM) and DECRQSS, so a probe that stops
  reading at DA1 still sees them.
- `CSI 16 t` gets the cell size from the Surface metrics once the Surface opens.
- Not every xterm extension is guaranteed. OMXTerm installs no custom terminfo,
  does not touch shell startup files. Inline-image support does not
  impersonate another terminal or inject application-specific capability
  variables.

### Inline Terminal Images

A Live Terminal Session renders bounded static images sent with the Kitty
graphics protocol
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
- Direct transmission (`t=d`) of PNG (`f=100`), RGB (`f=24`) or RGBA (`f=32`),
  optionally zlib-compressed (`o=z`), as kitten icat 0.47
  `--transfer-mode=stream`, timg 1.6 `-pk`, yazi 26.9 previews and snacks.nvim
  in Neovim 0.12 send it. icat's 128 KiB chunks repeat `a=T,q=2` and its last
  chunk omits `m`; a chunk that repeats only `a=T` and `q` continues the
  pending image. Photo-sized payloads are covered, within the limits below.
- Placing a stored image again (`a=p`) under placement IDs (`p`), and Unicode
  placeholders (`U=1`) with two or three diacritics.
- The same producers inside tmux 3.7 with `allow-passthrough on`, when they
  wrap their output for tmux (icat, timg, yazi and snacks.nvim do; Chafa needs
  `--passthrough tmux`).
- The PTY reports the cell grid's pixel size (`TIOCGWINSZ`) on macOS and Linux:
  columns × cell width by rows × cell height in device pixels, padding
  excluded, so `ws_xpixel / ws_col` is the cell width `CSI 16 t` reports. Tools
  then size images to the window, and tmux to the real cell. Windows ConPTY has
  no pixel size.

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
  transmission (including Chafa's prelude) replaces it, while a chunk that
  repeats only `a=T` and `q` continues it. Completion, reset, alternate-buffer
  exit and Surface disposal release it.
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

- SIXEL, the iTerm2 Inline Image Protocol, animation, downloads, persistence,
  and file, temporary-file or shared-memory transmission (`t=f`, `t=t`, `t=s`);
  the core answers those with `EINVAL: unsupported medium`. Images through
  `screen` or another multiplexer, and tmux without `allow-passthrough`. viu
  inside tmux and ranger's `kitty` method. Other Kitty and Chafa paths the
  core exposes are unclaimed.
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
  operating system to open it. Extension views reach the same route only with
  a manifest-declared link id (`links.open.v1`).
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
- If reading the selection or writing to the clipboard fails, Copy shows the
  clipboard-operation failure notice and leaves the Terminal Surface usable.
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
  non-executing literal-block example `snippets.yaml`; the optional-Snippets targets
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
Snippets. [One-time default Snippets](dev/default-snippets.md) has the full policy.

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
- `keybinds.<action>` for the vocabulary under [Keybinds](#keybinds);
- `notifications.enabled` (default `true`), `notifications.sound` (default
  `false`) and `notifications.soundFile` (an absolute path; see
  [program progress and attention](#program-progress-and-attention)).

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
  background**, including background-color erase and alternate screens. Inverse
  text uses opaque background-color ink and the foreground color as its opaque
  cell background. A TUI that paints its own background may stay opaque.
  Theme colors stay strict `#RRGGBB` with no opacity field.
- With positive transparency, `blur: true` requests native macOS background blur
  (radius 20), Windows Acrylic, or the KDE blur-region hint on each owned X11
  window when `xprop` is available. Effects apply after native show without
  recreating a window, Surface or PTY. If blur cleanup cannot be confirmed,
  main does not stack another effect; a later reload, show or restore may
  retry, but there is no background retry.
- Blur is best effort. The OS or compositor may ignore it or keep its own tint;
  missing helpers and native errors are quiet fallbacks, never launch
  prerequisites; API success does not prove visible blur.
- Windows windows stay non-transparent natively to keep resize, maximize/restore,
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
  macOS and Linux accept it without filesystem access or warning and ignore
  it.
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
  `swapPaneLeft`, `swapPaneRight`, `swapPaneUp`, `swapPaneDown`,
  `equalizePanes`, `commandPalette`, `toggleMirrorTyping`, `saveLayout`. New actions, global shortcuts, chords and
  per-platform maps are unsupported.
- A value is `null` or a case-insensitive Electron accelerator with exactly one
  key and at least one non-Shift modifier. Only `F1`–`F24` may be bare or
  Shift-only.
- Omitted actions keep platform defaults. Linux and Windows use `Ctrl+Shift+F`
  for Find and `F11` for full screen; macOS uses `Cmd+F` and `Ctrl+Cmd+F`.
  Command Palette is `CommandOrControl+Shift+P` on macOS and `Control+Shift+P`
  elsewhere; Mirror Typing is `CommandOrControl+Shift+M` on macOS and
  `Control+Shift+M` elsewhere; Save layout is `CommandOrControl+Shift+L` on
  macOS and `Control+Shift+L` elsewhere. An existing custom binding on any of
  these combinations keeps its key and that default becomes unbound; nothing
  is rewritten.
- `null` removes only that shortcut: the menu item stays, and OMXTerm stops
  consuming the key (the OS or another binding may still take it). A `null`
  entry holds no shortcut and cannot collide.
- One Action Catalog feeds the native menu, the Command Palette and the main key
  matcher; the menu shows the effective accelerator. PTY control sequences are
  untouched.

Files, SSH Connect, Mirror Typing and Saved Layout slots:

- `toggleFiles` and `toggleSshConnect` default to `Cmd+Option+F` and
  `Cmd+Option+O` on macOS and to `null` on Linux and Windows, where `Ctrl+Alt`
  is AltGr; `toggleMirrorTyping` and `saveLayout` have the defaults above. The first
  three reuse the installed extension's action and guards and its single
  File-menu and palette entry. `saveLayout` is a second entry beside Saved
  Layout's page entry (see [Saved Layout](#saved-layout)). Other extension
  contributions get no configurable shortcuts.
- A missing, disabled or unsupported tool keeps its configuration but has no
  entry or active shortcut, so its key is not consumed. Collision checks ignore
  installation state, and nothing is activated, installed or enabled to check
  availability. Later activation failures use the existing unavailable
  handling.
- They toggle like other tools (close visible, reveal hidden, or open fresh).
  One press invokes once; its repeats and release stay owned across focus
  transfer and never reach the terminal. Recording takes priority.
  `moveAuxiliaryPanel` is also once-per-press; other actions keep their repeat
  behavior. Mirror Typing toggles as described in [Mirror Typing](#mirror-typing).

Validation:

- Unknown actions, malformed accelerators and two explicit entries on one key
  are errors under the
  [resilient failure contract](#validation-errors-and-reload).
- An explicit entry wins over another action's default: that action becomes
  unbound (`null`) in the effective map. A new default therefore never
  invalidates a previously valid file, and the file is never rewritten.
  Defaults never collide with each other.
- Duplicates are judged on the effective native map: `CommandOrControl` is
  `Command` on macOS and `Control` elsewhere; `Super` and `Meta` are the Command
  family; `AltGr` is distinct from `Alt` and `Control+Alt`; intrinsic Shift
  counts (`Control+!` = `Control+Shift+1`; `Control+Plus` =
  `Control+Shift+Plus` = `Control+Shift+=`); on macOS, Option-only top-row and
  keypad bindings for the same digit (`Alt+9`, `Alt+num9`) collide.
- OMXTerm never moves an action to another key. The collision diagnostic names
  both actions and the key as derived from the parsed accelerator (never the
  configured text), and suggests another shortcut or `null`.
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
- On macOS, a main-only native provider may map a fresh Option-only
  `KeyA`–`KeyZ`/`Digit0`–`Digit9` keydown to its current-layout identity for
  recording and core/hosted-child delivery. Digits use validated top-row native
  codes; letters use only a single ASCII, Option-stripped current-layout
  letter, not the physical position. The sample must match the owned key
  window, event type, native code, characters, Option-only flags and the
  current keyboard-layout input source, with no composition or AltGr. Repeats,
  mismatches, IMEs and missing data fall back to the normal matcher and
  native-menu path. An unobservable dead-key keydown cannot be recovered.
  Nothing is cached or sent to the renderer.
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
  [Snippets migration guide](dev/snippets-migration.md).
- One UTF-8 YAML 1.2 core document (parsed with `yaml` v2): exactly
  `version: 1` and a `snippets` array of at most 512 entries. Each entry has
  `name` (non-empty, ≤128 UTF-16 code units), `body` (non-empty, ≤65,536),
  optional `description` (≤512) and optional boolean `execute` (default
  `false`).
- Limits: 1 MiB read, rejected before decoding; at most 16 collection levels
  (the root is level 1) and 4,096 total mapping pairs and sequence entries
  (mapping keys included), checked iteratively before recursive composition.
  Duplicate keys, aliases, custom or non-core tags, non-scalar keys, non-1.2
  versions and multiple documents are rejected. Literal block chomping is
  preserved: `|-` strips trailing line breaks, `|` keeps one, `|+` keeps all.
- Injection uses Protected Paste. Without bracketed paste, multiline or
  control-character bodies need approval and are then delivered unchanged, so
  they may execute through embedded line breaks or control characters. With
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
  object; no migration happens. There are no configurable widths or controls
  for these roles.
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
  colors and the 16 ANSI colors as two terminal-style text lines on the draft
  background (each normal color directly above its bright variant). Below it,
  one row per named color shows the normal and bright swatches side by side,
  kept together as the grid reflows, plus a translated hint. Picking a swatch
  selects that role for editing, like the role selector. Names stay in
  interface colors; only sample paint reflects draft contrast. It is not a live
  Surface, PTY or desktop-effects simulation and never paints the document root
  or live configuration.
- An omitted or empty `appearance`, hex and `null` values, and untouched color
  spellings survive every operation, even without dedicated controls.
- Save guard-replaces the resolved target by revision, keeping links. Save copy
  writes a new direct `themes/*.json` (two-space JSON, trailing newline,
  portable OS-safe leaf name, no path or shell expansion) and never replaces an
  existing file; a successful copy becomes the base for later Saves.
- Export publishes the captured valid draft through a window-owned native save
  chooser without replacing anything; the UI says first that export never
  replaces an existing file, even if the platform dialog offers replacement. Export returns no
  writable base, changes no configuration and does not mark edits as saved.
- Copy and export fail rather than clobber when no-replace linking is
  unavailable. Publication followed by a cleanup failure still counts as saved
  or exported, with a warning.
- Detected revision, target or permission changes keep the draft and offer
  reload or copy, never automatic overwrite, rebase or retry. Linked parents,
  private temporary files, mode preservation, identity-checked cleanup and
  last-check races follow ADR 0003; no cross-process atomic compare-and-swap is
  promised.
- Saving a theme file never writes configuration or applies appearance. Use
  saved theme needs a clean
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
  `theme.path`, `transparency`, `blur` and the `notifications` fields
  (Terminal page).
- A change saves immediately; clearing a field removes the entry. The language
  selector shows **English (United States)** and **Português (Brasil)** in any
  interface language.
- Appearance has a labelled native transparency slider (0–100%, 1% steps,
  percentage readout) and a desktop-blur checkbox. Pointer and keyboard input
  save while adjusting, updating the real windows rather than a preview;
  release adds no extra request and no view timer delays the final choice. A
  one-line hint says 0% is opaque and blur needs transparency and desktop
  support. Native blur stays distinct from the modal underlay blur.

Shortcuts page:

- Shows each action's effective shortcut as a key chip. Custom and unbound
  bindings are marked in text; an unmarked binding is the default. Default removes the entry (and an emptied group), Unbind writes
  `null`, and recording writes an accelerator, all through the normal save.
  Recording another action's default takes the key; that action shows no
  shortcut until it is recorded again or the taking entry is reset.
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
  Snapshot parsing happens before writing.
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
  deactivation, modals, focus loss and disposal invalidate them, even after
  returning to the same unchanged field. Hidden save
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

Layout follows the [design system](ui-style-guide.md#surfaces): a
full-area, theme-aware page with six core categories plus Extensions, sized for
640×480 without changing native window minimums, scrolling instead of
clipping. Core notices use theme green, red and yellow for success, error and
warning (informational ones stay neutral) and repaint on theme changes;
installed extension notices keep their own styling. The Extensions page lists
installed extensions as quiet rows: name, version and a state only when it
isn't the normal one (Off, Update available), with Disable or Enable and
Uninstall. Uninstalled extensions leave the list. Official extensions load only
on Browse, and installing from a file or an HTTPS link sits on one quiet line
below. Errors are one short sentence; Refresh appears only after an error that
may leave the page out of date. Native control
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
  or Refresh; the bounded, versioned JSON supplies plain-text release cards.
  A card offers Install, or Update when its release is newer than the
  installed version. Otherwise it says Installed, or that the offer isn't
  available on this system or doesn't work with this OMXTerm version. Settings
  never offers an older version, a reinstall or different bytes of the
  installed version. A failed refresh keeps a visibly stale
  snapshot; a cold failure is unavailable, not empty. Local management works
  offline. See [extension distribution](extension-distribution.md).
- Installs require exact archive size, SHA-256 and manifest identity, version
  and engines, then the one-shot trust flow. Main bounds acquisition and passes
  the captured bytes through archive validation and explicit trust. Manual
  archives check host/API,
  not catalog targets. Host compatibility is semver plus the narrow
  development-host bridges in the
  [archive contract](dev/extension-installation-foundation.md#archive-contract).
  Install and Update never activate code automatically. A catalog selection
  that would downgrade or swap the installed bytes, such as one from a stale
  card in another window, still gets a replacement warning in the native trust
  prompt. Official
  means project-maintained, not sandboxed or signed. Settings says what
  extensions can do in one plain sentence with a link to the
  [trust notes](extension-distribution.md#trust); idle and loaded catalogs and
  successful refreshes show no notice.
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

Hosted content is optional Application Tab, companion-panel or Hosted Dialog
content; Settings and terminal panes are unaffected.

- Main picks Files and SSH panel presentation, and Mirror Typing's dialog
  presentation, from package metadata, without implying trust or extra
  capability. Identities and presentations are owner-bound; native views hide
  before host overlays show, and only a current owner is restored.
- A Hosted Dialog
  ([ADR 0051](adr/0051-present-short-extension-setup-as-a-hosted-dialog.md))
  is a modal `ui-dialog`, 440 px wide and 480 px tall at most, that core draws
  over the selected tab: the view's title, a Close (×) and the view filling the
  body. The view reports its content height and the dialog fits it, scrolling
  past the maximum.
  It adds no Application Tab, so the strip and the terminal grid don't change.
  While shown it holds the window's one native presentation; an open panel
  tool's view hides meanwhile. Close, Escape (in the frame, or in the view
  through core) or a newer dialog closes its view. Selecting a tab or a panel
  tool takes the presentation back and hides the dialog after the acknowledged
  native hide, keeping its view. A dialog that arrives over a modal or before
  any tab is closed instead.
- A full-page hosted tab's frame paints the page surface in the design-system
  font and draws the view's title and Close on one row, as Settings does; the
  view draws no title of its own.
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
- `terminal.insertPath.v1` inserts one bounded absolute lexical path, quoted by
  the
  shared platform policy, under the same admission and Protected Paste rules
  ([ADR 0021](adr/0021-insert-lexical-shell-quoted-paths-through-protected-paste.md)).
  Main checks its private selection and visible-admission stamps at entry and
  commit, and core checks selection independently, so a hide/reveal before
  commit cannot revive a request; a same-view geometry refresh does not revoke
  it. Completion is reported separately from
  acceptance and means every chunk reached node-pty without a synchronous
  error, not that the shell read it; interrupted delivery may be partial and
  should be inspected before retrying.
- Neither capability lets a caller pick a terminal or reach the raw PTY. Older
  hosts reject unknown capabilities.
- `links.open.v1` opens a docs link from a visible view. The manifest declares
  up to eight ids, each mapped to one exact `https://` URL; the view sends only
  an id. Main checks the capability, the id against that installed version's
  manifest and current visibility, then opens the URL through the
  [External Link route](#links-and-local-paths). Anything else, including a
  URL in the request, is refused without reaching the backend
  ([ADR 0045](adr/0045-open-declared-extension-links-by-id.md)).
- The optional Snippets package (`extensions/snippets`) shares the Snippets UI
  and bounded catalog client; its separate action is withheld from production.
  On the extension targets the Snippets command opens the installed optional
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
  `~/.local/share/applications/omxterm.desktop`. Before replacing any file,
  install checks all three names: directories or other non-regular,
  non-symlink entries are refused; files and
  symlinks (even dangling or pointing at directories) are replaced as entries
  without touching link targets. Uninstall removes only those entries and
  keeps unrelated files and parent directories.
- Install and update replace the three files in sequence under rollback traps,
  not atomically. Invalid input leaves the previous install untouched. Failure
  before the third replacement attempts restoration; an original it cannot
  restore stays at a reported backup path and is never deleted, incomplete
  recovery is reported, and the first failure's status and diagnostics are
  kept.
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

The package is organized by runtime responsibility: main, preload, renderer, and
the portable Terminal Surface.

### Process boundaries

- Electron main owns native windows, PTY creation, filesystem access,
  configuration, logs, clipboard capabilities, external-link opening, and
  bounded Local Image Preview reads
  ([ADR 0006](adr/0006-isolate-the-renderer-from-local-capabilities.md)).
- The renderer runs with context isolation and without Node integration. Main
  validates IPC request senders and payloads; the preload validates response and
  event payloads exposed by its minimal typed bridge.
- The font route accepts no path; a request must name the active validated
  configured family. A started read may return that captured family's bounded
  bytes across a reload, together with fixed local fallback candidates. Font
  paths, family names, and bytes stay out of Operational Events, but native
  read-error text is not consistently redacted from font IPC rejections.
- Chromium sandboxing is enabled on macOS and Windows and disabled on Linux.
  Context isolation and the narrow bridge still limit renderer authority on
  Linux, but they do not equal the Chromium sandbox.

### Terminal Surface

The framework-independent DOM Terminal Surface hides Restty setup, Ghostty
parsing, text and Kitty image rendering, input, resize, theme, fonts, clipboard,
zoom, and cleanup behind a small interface. It receives the local IPC/PTY
Adapter instead of importing Electron or `node-pty`. Restty is the only
implementation; there is no renderer selector or registry
([ADR 0008](adr/0008-make-the-terminal-surface-the-portable-module.md),
[ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md)).

### Internal installed-package foundation

- The internal Installed Packages module owns local archive validation and
  installation, compatibility, immutable version pins, generation-based
  admission, disable/tombstones, and deferred physical cleanup.
- Every supported target uses it through production Settings with
  captured-byte trust.
- It owns neither extension execution, catalog/network acquisition, nor a public
  SDK. Main owns HTTPS acquisition separately; terminal ownership is unchanged.
- Its interface and limits are in the
  [foundation contract](dev/extension-installation-foundation.md) and
  [ADR 0038](adr/0038-pin-immutable-installed-packages.md).

### Internal extension backend runtime

**Platforms**

- macOS ARM64, Linux ARM64/x64, and Windows ARM64/x64 builds include the runtime
  and its native lease addon.
- Every supported target admits explicit extension installation and activation
  through the same management, runtime, and view owners.
- Windows x64 still keeps built-in Snippets and its starter example; the other
  targets use the optional Snippets extension (see
  [Auxiliary Panel](#auxiliary-panel)).

**Activation and retirement**

- Startup builds infrastructure but never activates installed code; explicit
  shared action invocation does. The official catalog reuses the same
  installation owner and store. There is no public SDK or extension shortcut
  configuration. An empty catalog is valid but is not public distribution.
- Activation lazily forks one standard Node ChildProcess per active
  extension/application runtime, using bundled Electron Run-as-Node and Node IPC.
  Independent captured-version pins, fresh parent/child admission checks, and
  bounded epoch authority come before ESM import. No store writer spans spawn,
  import, or retirement. Cancellation revokes owned infrastructure, not trusted
  Node effects already admitted. Trusted children keep ordinary Node
  capabilities.
- Retirement allows two seconds of cooperation, then at most one owned forced
  kill. Actual exit and stream closure are distinct from logical disposal or kill
  acceptance. Unknown outcomes are not retried automatically. There is no custom
  supervisor, PID reaper, sandbox, or descendant-containment promise. Normal Quit
  retirement is bounded. The web-content host is owned separately
  ([ADR 0039](adr/0039-own-packaged-web-content-by-epoch.md)).
- The [runtime contract](dev/extension-backend-runtime.md) and
  [ADR 0040](adr/0040-run-backends-in-owned-node-children.md) cover its internal
  interfaces and limits.

**Files native primitives**

- The Files move addon ships on every supported target. It uses Linux
  `renameat2(RENAME_NOREPLACE)`, macOS `renameatx_np(RENAME_EXCL)` or Windows
  `MoveFileExW` without replace or copy flags behind one bounded asynchronous
  interface, and refuses unsupported filesystems and cross-device moves with no
  overwrite-capable fallback.
- macOS ARM64 trash uses Foundation `NSFileManager` in the same native addon and
  owned Node child, sharing its bounded asynchronous admission. Root, trailing
  separators, and empty or dot path components are refused instead of resolving
  a final symlink. Already-aborted calls refuse before dispatch; dispatched work
  keeps its actual completion, with the existing request deadline and child
  retirement and no cancellation or rollback guarantee. Native errors and
  missing results stay fixed and path-free. There is no permanent-delete
  fallback, automatic retry, Finder automation, or new main RPC.
- Windows trash uses the shell's `IFileOperation` with the Recycle Bin, no UI,
  in the same addon and with the same admission. Windows move and trash take
  drive-absolute paths only and refuse the same ambiguous spellings, alternate
  data streams, any part ending in a dot or space (Windows would act on the
  trimmed name), reserved or control characters (`<>"|?*` would act as
  wildcards in the shell), and device names such as `CON` or `lpt1.txt`. Files
  refuses the same names when creating entries. Moves use the `\\?\` long-path form. An item the shell can't
  recycle (too large, or on a drive without a Recycle Bin) is refused with
  `ENOTRASH` and left untouched, never deleted permanently.
- Linux trash runs the literal `gio` trash command.

**Files archive compatibility**

- Files archive versions and compatibility are maintained separately from the
  host. Files `0.9.0` declares `terminal.insertPath.v1`, minimum host `>=0.26.0`,
  and API `0.1.x`. It reads POSIX and Windows drive paths (`C:\...`) alike and
  needs the host's move and trash services; hosts without them (Windows and
  Linux x64 before 0.28.0) refuse rename, move and Windows trash as
  unsupported before acting. A Recycle Bin refusal reads as "nothing was
  deleted", not as an unknown outcome.
  Production admission and the catalog refuse hosts below `0.26.0`.
- Published archives are immutable; older Files releases keep their own host
  ranges and labels. Each catalog offers one release per extension ID, so hosts
  below an entry's range keep local or link installation of an older archive
  ([extension distribution](extension-distribution.md)).
- Narrow [development bridges](dev/extension-installation-foundation.md#archive-contract)
  let a recognized `0.24.1-dev.N`, `0.25.0-dev.N`, `0.26.0-dev.N`,
  `0.26.1-dev.N`, `0.27.0-dev.N`, `0.27.1-dev.N`, `0.28.0-dev.N`, `0.28.1-dev.N`, `0.29.1-dev.N`, `0.30.1-dev.N` or `0.31.0-dev.N` host admit a
  range only when ordinary semver admits both stable
  endpoints of that family. Other development families and incompatible APIs
  are refused. Admission alone does not qualify native behavior or packages.

**Packaging**

- Archives and build receipts are not included in application packages. A build
  receipt binds the final archive bytes to source/tool metadata without claiming
  qualification.
- Package inspection exercises packaged store/lease/bootstrap resolution and
  the Files no-clobber move on every target, not backend activation or the Files
  lifecycle. Native extension addons must be explicitly unpacked; macOS also
  needs the complete application seal. The macOS and Windows probes also check
  the trash export and root refusal without running a trash mutation
  ([building an extension archive](release.md#building-an-extension-archive)).

## Release contract

The [release procedure](release.md) owns preparation, verification, tagging,
uploads, and download checks. This section states only the contract it follows.

- OMXTerm uses the MIT License and follows the
  [versioning policy](versioning.md).
- Packages are built natively on their own architecture, on native filesystems
  rather than VM shared folders: DMG for macOS ARM64, AppImage for Linux
  ARM64/x64, and NSIS for Windows ARM64/x64.
- A maintainer-approved Windows x64 release may use x64 emulation on Windows
  ARM64 while native hardware is unavailable; its release evidence must
  identify that exception and the pending native qualification
  ([ADR 0034](adr/0034-support-native-windows-x64-packages.md)).
- Linux and Windows x64 packages from the owner-approved native CI lanes have
  build-only qualification. Desktop, GPU, installer, and ordinary-user OS
  integration are unverified and are not release gates. Inspection-only never
  launches the GUI, runs NSIS, or installs the Linux helper: it checks package
  contents and loads the exact packaged addon in Electron Run-as-Node mode.
  Linux also checks real PTY output, exit, and resize, and tells exec failure
  apart from a successful exit 1. Windows unpacked inspection does not verify
  NSIS contents. Exact checksums and provenance accompany the 7-day Actions
  artifacts; publication stays manual ([ADR 0036](adr/0036-distribute-build-only-x64-ci-artifacts.md)).
- Each Linux target also ships `linux_install.sh` and `linux_install.sh.sha256`.
  The helper's embedded version matches the application version, and the Linux
  helper pairs for the same cut are byte-identical.
- Each target ships independently under an immutable OS/architecture-prefixed
  tag, from one reviewed frozen cut per application version. Changing product,
  dependency, or build inputs after a target ships needs a new application
  version; later targets of an unchanged cut need no artificial bump or rebuild.
  Actual build SHAs and proven non-artifact differences are retained. Tags never
  move.
- Once every target of a version has shipped, a complete `vMAJOR.MINOR.PATCH`
  release carries the same verified assets and is GitHub's global Latest, so
  `/releases/latest` always offers the newest version for every platform, with
  a plain "which file do I download?" guide at the top of its notes.
- The [README download index](../README.md#platforms-and-downloads) links each
  target's version, assets, checksums, and notes.
- Artifacts include SHA-256 checksums but no verified publisher identity. The
  macOS release app is signed with OMXTerm's stable self-signed certificate, so
  its designated requirement (`identifier "com.otaviomiranda.omxterm" and
certificate root = H"7208e5…"`) is the same in every release and macOS
  privacy permissions survive updates; builds without the release key are
  ad-hoc. Every macOS build gives its executables their own Mach-O UUID, so
  Local Network privacy never mistakes OMXTerm for Electron or another app on
  the same Electron version. It is not Developer ID signed or notarized
  ([ADR 0046](adr/0046-sign-macos-releases-with-a-stable-self-signed-certificate.md));
  Windows NSIS is unsigned. Installation guidance explains
  Gatekeeper and SmartScreen without recommending disabling system-wide
  protections.
- An owner-requested release covers the procedure's steps without per-step
  approval. Manual testing is optional: macOS daily use supplies feedback, and
  Linux and Windows rely on native automation and user reports. Unobserved
  visual or desktop behavior is recorded as unverified, never as a pass.

## Acceptance boundary

- Tests cover configuration, tabs and window lifecycle, PTY startup, resize and
  output flow, Unicode, scrollback, Kitty images, local-image reads and overlay
  cleanup, link gestures, clipboard policy, title sanitization, logging, IPC
  boundaries, and packaged startup.
- Chromium tests keep the production CSP, context isolation, disabled Node
  integration, and platform sandbox policy.
- macOS native verification uses temporary HOME/XDG/profile paths, which do not
  isolate per-bundle OS preferences (see
  [side effects on your desktop](development.md#side-effects-on-your-desktop)).
- Linux package verification checks AppRun bytes and the available installed
  launch modes against the fixed no-sandbox policy. It installs the exact helper
  but removes the fixture home instead of running the helper's `uninstall`;
  separate helper tests cover uninstall.
- Windows exact-installer verification needs an explicitly authorized
  disposable VM and a literal CLI opt-in
  ([ADR 0023](adr/0023-verify-exact-nsis-only-in-authorized-disposable-vms.md)).
  `/D=` changes the destination without isolating old-version removal,
  registration, shortcuts, or processes. Verification refuses unsafe or unknown
  installation state. Only its newly created transaction directory is bound to a
  native long path with matching object identity before NSIS arguments are
  built; both path spellings keep the original reparse/process/cache
  inspections. Foreign registration or command ownership is not normalized.
  Ownership-checked cleanup preserves user data and is part of full
  verification; unpacked-only diagnostics are partial.
- Release verification keeps behavioral tests, native builds, exact-artifact
  checks, and publication separate. Each artifact is verified against its own
  identity and checksum: natively by default, or under the ADR 0034 emulation
  exception or the ADR 0036 build-only lanes, with limits recorded. Build-only
  checks never claim full verification.
- Results are reused only when the relevant inputs are known to be equivalent.
  Version-only changes need new packages and package/version checks, not
  wholesale behavioral reruns; changed product, dependency, or build inputs
  invalidate the affected results. Applicable failures need a diagnosis-supported disposition, not an inferred pass from a
  later rerun. The [release procedure](release.md) records checks, limitations,
  and reuse; this specification is not an execution record.

The [ADRs](adr) explain architectural choices.
