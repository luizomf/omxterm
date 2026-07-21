# Adopt tabs with one live session per tab

Supersedes [ADR 0007](0007-one-live-session-per-independent-window.md).

A Terminal Window holds one or more Terminal Tabs, and each tab owns exactly
one Live Terminal Session. `Cmd+T` (the `newTab` default) creates a tab in the
selected window while `Cmd+N` keeps creating independent windows. The tab strip
is an OMXTerm-drawn full-width row below the fixed 30 px title inset, above the
Terminal Surface and Snippets Sidebar row, and appears only when a window has
at least two tabs — a single-tab window looks and behaves exactly like the
previous contract.

ADR 0007 recorded no rationale, so the 2026-07-19 design interview with Otávio
reconstructed it: the rejection protected first-release scope and the
one-window–one-renderer–one-session simplicity, and assumed tmux would cover
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

Session restoration, workspaces, splits, moving tabs between windows, and
in-window tab reordering stay out of this round — deferred, not foreclosed.
ADR 0007's "will not add" phrasing aged badly the moment dogfooding
contradicted it, so this decision records no permanent rejections: any deferred
capability returns only through its own issue and ADR. Main consequences: IPC
routing gains per-session identity beneath the existing per-window controller,
the active tab's grid refits on selection, and the spec's window-and-session
contract is rewritten around the tab model.
