# Adopt tabs with one live session per tab

Supersedes [ADR 0007](0007-one-live-session-per-independent-window.md).
Amended by [ADR 0017](0017-confirm-close-only-for-busy-sessions.md): the
`confirmClose` consequence recorded below was later narrowed to ask only for
Busy Sessions.

A Terminal Window holds one or more Terminal Tabs, and each tab owns exactly
one Live Terminal Session. `Cmd+T` (the `newTab` default) creates a tab in the
selected window while `Cmd+N` keeps creating independent windows. The tab strip
is an OMXTerm-drawn full-width row above the Terminal Surface and Snippets
Sidebar row, and appears only when a window has at least two tabs — a single-tab
window looks and behaves exactly like the previous contract. On macOS the row
sits below the app-controlled 30 px title inset. Linux already places its native
title and application menu outside the renderer, so its row starts at the top
of the app-controlled content without a duplicate inset.

Native Linux AppImage dogfooding showed why the inset is platform-specific:
reusing the macOS inset below Linux's existing title and menu produced an empty
30 px band before the tabs and reduced the Terminal Surface for no native drag
behavior. The Electron main process therefore owns the platform choice and
provides zero inset on Linux while preserving the settled macOS chrome.

ADR 0007 recorded no rationale, so the 2026-07-19 design interview with the
maintainer reconstructed it: the rejection protected first-release scope and
the one-window–one-renderer–one-session simplicity, and assumed tmux would cover
multiplexing. Daily dogfooding of v0.1.0 and v0.2.0 invalidated that
assumption — missing tabs became the single most-felt gap. The rejection was
never product identity, so tabs enter through this explicit supersession
rather than a silent override.

What ADR 0007 protected survives unchanged: a Live Terminal Session lives and
dies with exactly one owner — now a Terminal Tab — nothing is preserved or
reconnectable, and tmux remains the user's session manager. Lifecycle maps the
old window semantics onto tabs: an ordinary shell exit closes its tab; closing
a tab terminates only its session under the existing `confirmClose` contract
without child-process inspection; closing a window closes all of its tabs with
one confirmation; a window's last tab closing closes the window, and the last
window closing quits OMXTerm.

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
