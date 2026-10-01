# Adopt tabs with one live session per tab

[ADR 0028](0028-wait-for-native-sessions-before-application-quit.md) refines
application shutdown to await actual native session exits independently of
closed windows and disposed controllers.

Supersedes [ADR 0007](0007-one-live-session-per-independent-window.md).
Amended by [ADR 0017](0017-confirm-close-only-for-busy-sessions.md): the
`confirmClose` consequence recorded below was later narrowed to ask only for
Busy Sessions.
Amended by [ADR 0027](0027-hide-window-chrome-without-replacing-sessions.md): title
and tab visibility now have configurable new-window defaults, and hideable
platform-specific Window Chrome replaces the fixed title-area policy below.

A Terminal Window holds one or more Terminal Tabs, each of which owns exactly
one Live Terminal Session. `Cmd+T` (the `newTab` default) creates a tab in the
selected window, while `Cmd+N` continues to create an independent window. The
OMXTerm-drawn tab strip occupies a full-width row above the Terminal Surface and
Snippets Sidebar row. It appears when the window has at least two tabs and its
window-local tab bar enabled flag is true, leaving a single-tab window identical
to the earlier contract. On macOS the row sits below the app-controlled 30 px
title inset. Linux and Windows place native title and menu chrome outside the
renderer, so the row begins at the top of app-controlled content there.

A later tab bar amendment adds `View -> Toggle Tab Bar` (`toggleTabBar`) beside
Toggle Snippets. Its default is `Cmd+Shift+B` on macOS and `Ctrl+Shift+B` on
Linux and Windows. Renderer-owned tab presentation keeps the enabled flag,
initially `true`, independent of tab and session lifecycle. The toggle changes
that flag even with one tab and survives configuration reload. It is scoped to
one window and kept only in memory. Other windows retain their state, and newly
created windows start enabled. Main sends a payload-free notification only to the selected window
through the validated preload bridge. The host ignores the notification while a
Local Image Preview is active and removes its subscription on disposal. Hiding
or restoring the row uses the selected Surface's existing focus and refit path,
preserving hidden-Surface geometry and every live session. ADR 0018 continues to
own delivery through the shared native-menu and main-process key-event action;
the amendment adds no renderer shortcut system or visibility setting.

A later macOS fullscreen amendment keeps the row below the 30 px inset while the
window is windowed or maximized, then sets the app-owned inset to zero in native
fullscreen. Electron's completed enter and leave events drive each window
independently. Main derives the effective inset from native state and includes it
in the existing validated configuration snapshot and subscription during
initialization and reload. The same Surface and session remain in place. System
safe-area behavior and configured padding stay unchanged; transient native chrome
may overlay content when revealed, without causing hover-driven layout changes.
Fullscreen state and tab-bar visibility remain independent.

Native Linux AppImage dogfooding showed why the inset is platform-specific:
reusing the macOS inset below Linux's existing title and menu produced an empty
30 px band before the tabs and reduced the Terminal Surface for no native drag
behavior. The Electron main process therefore owns the platform choice and
provides zero inset on Linux while preserving the settled macOS chrome.

Excluding tabs protected the first-release scope and the simplicity of one
window, renderer, and session, with tmux expected to cover multiplexing. Use of
v0.1.0 and v0.2.0 showed that tmux did not replace native tabs. The restriction
served release scope rather than product identity, so this ADR supersedes
ADR 0007 while preserving its session-ownership guarantee.

The ownership guarantee from ADR 0007 survives: each Live Terminal Session has
exactly one lifetime owner, now a Terminal Tab. Sessions are ephemeral, and tmux
remains the user's session manager. The old window lifecycle maps directly onto
tabs. An ordinary shell exit closes its tab. Closing a tab terminates its
session under the `confirmClose` contract. Closing a window closes all of its
tabs with one confirmation. Closing the last tab closes its window, and closing
the last window quits OMXTerm. ADR 0017 later narrowed confirmation to Busy
Sessions using minimal foreground-process inspection.

A later initialization-lifetime correction makes the renderer's tab owner the
source of ordinary last-tab closure. Native PTY counts omit tabs waiting for
fonts and rendering (ADR 0025), so main no longer closes a window merely because
an ordinary exit leaves zero PTYs. Removing the last tab sends an owned,
main-frame-validated empty notification through preload and commits that
renderer owner to closing; queued New Tab commands cannot revive it. Cancelling
a pending tab uses the same path. A final rendering failure before Adapter start
uses only a fixed failure reason, retaining main's native acknowledgement before
closure. Native spawn/signal/runtime-failure reporting remains session-owned;
application shutdown still waits independently for actual PTY exits (ADR 0028).
This avoids a mirrored tab registry or an early-shell workaround.

Failure acknowledgements are independently counted per window, including failures
that originated while sibling sessions were live. An empty renderer notification
is retained until every pending acknowledgement completes; it is not dropped
while a dialog is open. Acknowledging a session failure requests removal of only
that session's tab even when it was the last native PTY. Spawn rejection commits
empty after removing its failed tab. Runtime rendering failure retains its tab
even after disposing its Surface: the failed session's asynchronous native exit
must first reach main and receive acknowledgement. A termination request is not
an exit, and releasing the tab beforehand would leave an unowned interval.
Thus native counts cannot discard mounting siblings or earlier unacknowledged
failures. Explicit
window/application closure remains authorized separately, and disposed owners
make late dialog completion inert. After actual exit, the window controller
constructs immutable end context, delivers it, and retires its session object
rather than keeping a closed-state tombstone. Failure acknowledgement retains
only separate window ownership and the failed identity, not a native wrapper.
Closed or retired identities cannot route terminal control or display events.
Controller disposal releases its local session references after requesting close;
ADR 0028's independent native completion barrier remains authoritative.

Terminal titles stay display-only per [ADR 0010](0010-keep-terminal-titles-display-only.md),
applied per session: a tab shows its own sanitized title, an untitled tab falls
back to the Default Shell's name (known from the spawn, never from process
inspection), and the native window title mirrors the active tab with `OMXTerm`
as the final fallback. The keybind vocabulary gains `newTab`, `closeTab`,
`nextTab`, `previousTab`, and `selectTab1` through `selectTab9`. Following the
macOS convention, `Cmd+W` moves from `closeWindow` to `closeTab` and
`closeWindow` becomes `Cmd+Shift+W`; tab cycling defaults to `Ctrl+Tab` and
`Ctrl+Shift+Tab`, and tab selection to `Cmd+1` through `Cmd+9` (literal
positions). On Linux, application shortcuts preserve ordinary terminal `Ctrl`
input: tab cycling uses `Ctrl+PageDown` and `Ctrl+PageUp`, literal tab selection
uses `Alt+1` through `Alt+9`, and tab/window actions use the conventional
shifted terminal shortcuts recorded in the product contract. These are native
platform defaults, not a profile system. All remain remappable and
duplicate-checked on the effective native map.

A later amendment accepts horizontal drag-only reordering within one Terminal
Window. The renderer-owned tab array remains the source of visual and logical
order, so cycling and literal positional selection immediately follow the moved
identities. Reordering preserves the selected tab by identity and does not
close, recreate, restart, dispose, or move any Live Terminal Session, Terminal
Surface, or adapter. The order remains ephemeral and per-window. Internal tab
drag data is distinguished at the renderer's whole-document drop boundary so it
cannot navigate or become file-path insertion, while native file and folder
drops retain their existing selected-tab behavior. This changes no main,
preload, Terminal Surface, or ownership boundary.

Session restoration, workspaces, splits, and moving tabs between windows stay
out of this round — deferred, not foreclosed. ADR 0007's "will not add" phrasing
proved too absolute when dogfooding contradicted it, so this decision records no
permanent rejections: any deferred capability returns only through its own
issue and ADR. Main consequences: IPC routing gains per-session identity beneath
the existing per-window controller, the active tab's grid refits on selection,
and the spec's window-and-session contract is rewritten around the tab model.
