# Adopt tabs with one live session per pane

A Terminal Window holds one ordered collection of Application Tabs, exactly one
selected. Each entry is a Terminal Tab or one lazy retained Settings tab. A
Terminal Tab owns one or more Terminal Panes; each pane owns a Terminal Surface
and, after successful initialization, one ephemeral Live Terminal Session.
A Terminal Tab starts with one pane. Application-drawn tabs and panes provide selectable independent local
sessions; tmux remains the user's persistence and reconnection tool.

## Panes

`View -> Pane` splits the selected tab's focused pane to the right or down.
Splitting in the parent's direction adds a sibling, so a layout is an n-ary
tree of rows and columns with weights; rebuilding it moves pane containers and
never recreates a Surface or session. A split is admitted only when the
prospective weighted layout fits usable grids of at least 20 columns by 5 rows
in both resulting panes. The new pane uses the source's current cell geometry as
its admission reference; existing Surfaces each supply their own cell metrics
and non-grid space, including padding and scrollbar overhead. Every divider,
including internal subtree and additional n-ary dividers, consumes space. Unknown
geometry refuses a split, and a tab holds at most 16 panes. A refused split
creates no Adapter/session. Dividers are pointer- and keyboard-operable separators
limited by the same uncapped subtree minima with all internal weights retained:
along the split axis, divide each child's requirement by its weight and take the
maximum, then add internal dividers; across the axis, take the maximum. Resizing
an ancestor never silently rebalances its descendants. A later resize or zoom
that cannot fit every minimum keeps sessions and layout rather than closing panes or raising
the window's minimum size; impossible divider moves retain existing proportions. Maximizing a pane is outside this slice.

Exactly one pane per tab is focused. It receives keyboard input and every
terminal-directed action (clipboard, Find, snippets, file drops). Explicit optional
[Mirror Typing](0043-revoke-visible-mirror-typing-routes.md) is the narrow exception:
core routes final genuine keyboard bytes to a fixed inspected same-tab group;
paste/insertion stops that route before ordinary single-target delivery. Clicking a
pane or Focus Next/Previous/Left/Right/Above/Below moves focus, and the focused
pane in a split tab carries only a 1 px top line, horizontally inset by its own
Surface's left/right padding. A non-intercepting `::after` overlay paints above
the canvas even with zero top padding and opaque first-row terminal backgrounds;
a Surface-local stacking context keeps it below external app overlays. Restty's
search and scrollbar layers remain above the marker. There is no side/bottom
ring, layout change, dimming or recoloring of the others. The host propagates a theme-derived accent
on initial configuration and reload: cyan when its contrast against the configured
opaque background is at least 3:1, otherwise foreground if it improves contrast.
A low-contrast custom palette can still fail that threshold; transparency/blur
and the thin marker prevent any universal accessibility claim.

Pane dividers paint a shared 1 px pseudo-element while retaining their 4 px
resize target and layout allocation. The Auxiliary Panel separator shares that
paint but retains its 6 px target/allocation. Hover and captured drag use the
same neutral highlight; keyboard focus uses the foreground-colored line, not a
rectangle around the target. Separator keyboard handling, ARIA values and
pointer geometry remain independent of the painted line.
Structural rebuilds preserve the exact surviving DOM control (including search
selection), without changing logical pane selection or taking focus from panel
or modal controls. Removal chooses a non-wrapping neighbor in the nearest split;
explicit next/previous navigation still wraps. About, snippet preview
and Local Image Preview share the window's modal predicate. Settings is ordinary
graphical tab content, not a modal or fake pane. Terminal-only actions and hidden
pane focus/divider activity are inert while Settings is selected. The modal
predicate suppresses competing pane split/focus/equalize and tab-navigation/new-tab commands,
including image choosing/loading, and guards passive mount/rebuild focus and
divider input. Captured closure and failure acknowledgement remain deliverable.
Application clipboard actions still edit a focused Settings field before
terminal suppression; stale field reads never reach a pane.

Snippet actions capture the focused pane and its exact Surface, never resolve
through later selection. Its one end transition invalidates captured delivery
before native exit/fatal notice, including a retained failure; removal, tab close
and host disposal use the same transition. Accepted Protected Paste remains
Surface-owned and stops future chunks/Enter after disposal without replay.
Pane accessible names and separators relabel through the existing window
language without layout reconstruction; pending mounts replay latest Surface
labels as well as current live configuration.
Equalize Panes resets the shares of the split that holds the focused pane.

A new pane starts the Default Shell. When the source pane's shell reported a
local directory through OSC 7 in its own output, the new pane starts there if
that directory still exists; otherwise it starts in the home directory, like a
new tab. Main reads OSC 7 from the PTY output it already relays, accepts only an
empty, `localhost` or local host name and a local absolute path (a drive path on
Windows; UNC and device paths are rejected), and never logs the directory.
Explicit optional Saved Layout capture may send provenance to its trusted
extension for persistence, never to the terminal renderer (ADR0042). CAN/SUB cancellation discards an unfinished report and resumes
scanning subsequent output without accepting the cancelled URI. Overflow still
invalidates an older cwd regardless of chunk boundaries; an in-bound cancellation
alone leaves the last completed report unchanged. OMXTerm injects nothing to
make shells report it (ADR 0013). A
remote shell that reports no host name, or this machine's name, is
indistinguishable from a local one, and program output can also emit the
sequence; either can only choose an existing local start directory, never run
anything. Known SSH Connect launches are excluded before OSC7 tracking; their
splits/new tabs use home and the Default Shell (ADR0041). This does not identify
manually typed ssh. A Launch Request applies only to the first tab's first pane.

## Window presentation

The renderer-owned tab strip occupies a full-width row above the Terminal
Surface and right-side Auxiliary Panel containing Snippets. The panel owns its
own nonmodal lifecycle, focus and bounded resizing; layout changes retain every
Surface/session and hidden-tab geometry. The tab strip appears only with at least two tabs and an
enabled window-local tab-bar flag. Title/tab visibility initializes from
`window.showTitleBar` and `window.showTabBar`, both true by default. Existing
windows retain their choices after reload; new windows use the latest defaults.
[ADR 0027](0027-hide-window-chrome-without-replacing-sessions.md) owns the current
hideable chrome: a 30 px macOS native-title inset or a 34 px Linux/Windows
drawn title row, removed when hidden or in fullscreen.

`View -> Toggle Tab Bar` changes only the selected window's in-memory flag,
including with one tab. Main sends a payload-free command through preload;
the host suppresses it during Local Image Preview. Removing/restoring the row
refits the selected existing Surface and PTY without changing tab order,
identities, sessions or hidden-tab geometry. Title/BEL updates do not reveal a
disabled strip. The flag is neither persisted nor shared between windows.

Horizontal drag reorders tabs within one window. The renderer tab array owns
both visible order and next/previous/literal-position selection; the selected
tab remains selected by identity. No Surface or session is recreated or moved.
Internal tab drag data is excluded from file-path insertion at the document drop
boundary. Moving tabs across windows is not implemented.

## Session ownership and lifecycle

SSH Connect ordinary nonzero exits retain an ended-readable Surface until pane
removal, with an exit-code notice and Close (ADR0041). Transport authority ends,
but Restty/fonts remain for local copy/search/refit, including fast exit during
start. The native record retires normally and the ended pane is not Busy.
Exit0, startup/signal acknowledgement and authorized removal keep their rules.

Every session has exactly one pane lifetime owner. Ordinary shell exit closes
its pane, and its nearest sibling takes the space and focus; removing a tab's
last pane closes the tab through the existing last-tab path. Close Pane requests
termination of the focused pane's session; closing a tab requests termination
of all its panes. Closing a window closes its tabs. Closing the final tab
closes its window, and closing the last window requests application quit. Close
confirmation is once per action and only for affected Busy Sessions under
[ADR 0017](0017-confirm-close-only-for-busy-sessions.md): Close Pane counts the
focused pane only, Close Tab every pane of the tab. The renderer reports the
focused pane's session (explicitly null when pending or retained dead) together
with the selected tab's current sessions, even before the focused pane mounts.
Main counts only sessions it still owns, never a previous tab or unrelated
window sessions once a complete selection snapshot is known. A retired focused
identity cannot route native input but does not prevent a fresh tab snapshot.
[ADR 0028](0028-wait-for-native-sessions-before-application-quit.md) independently
waits for actual native exit before accepted Quit completes; tab/controller
disposal or `kill()` is not completion.

The renderer tab owner, not a native-PTY count, commits ordinary last-tab
closure. Mounting tabs waiting for fonts/WebGL still own their window. Removing
its final tab sends a main-frame-validated empty notification and prevents queued
New Tab commands from reviving that owner. Cancelling a mounting tab can close
an empty window without starting a shell. Explicit window closure/Quit cancels
pending initialization through owner disposal.

`terminal-window-host.ts` subscribes to tab commands, clipboard actions, Find,
zoom, tab-bar toggles and snippets synchronously during host setup, after modal
and disposal setup, without awaiting the first Surface. Close Tab can cancel
that pending tab before a shell starts, following the same normal empty-window
path as later-tab cancellation. Host-owned zoom/tab-bar state and Snippets are
available while mounting; terminal clipboard, Find and other actions requiring
an unavailable Surface are no-ops, never deferred or replayed. Existing modal
guards remain active. Page teardown removes these subscriptions even while the
first mount is pending. Host `ready` still represents first-mount settlement,
not command reception. Native Close Window/Quit retain their separate paths.

Main counts failure acknowledgements independently per window, including
pre-start rendering failures and failures while siblings remain live. An empty
tab-owner notification waits for all pending acknowledgements. Acknowledgement
removes only the failed pane (its tab when it is the last pane); sibling exit or
another acknowledged failure does
not release its window. Runtime rendering failure requests session termination
and retains its failed pane until native exit and acknowledgement. Explicit
window/application closure remains separately authorized; disposed owners make
late dialogs inert.

After native exit, the controller constructs immutable end context and retires
its session object in `finally`. Failure acknowledgement retains separate
ownership metadata, not the native wrapper. Retired identities cannot route
input, resize, title, bell or ACKs. Controller disposal drops its references
after requesting close; the independent main shutdown record remains until
native completion.

## Titles and commands

Titles remain display-only under
[ADR 0010](0010-keep-terminal-titles-display-only.md). Each tab shows its focused
pane's sanitized session title or starting-shell basename; the selected tab's
focused pane supplies the native window title with `OMXTerm` as final fallback. No foreground-process name is
used as a display label.

New Tab/Window defaults are `Cmd+T`/`Cmd+N` on macOS and
`Ctrl+Shift+T`/`Ctrl+Shift+N` on Linux/Windows. Close Tab/Window defaults are
`Cmd+W`/`Cmd+Shift+W` and `Ctrl+Shift+W`/`Ctrl+Shift+Q`, respectively. Tab
cycling uses `Ctrl+Tab`/`Ctrl+Shift+Tab` on macOS and
`Ctrl+PageDown`/`Ctrl+PageUp` on Linux/Windows; literal tab positions use
`Cmd+1` through `Cmd+9` or `Alt+1` through `Alt+9`. Toggle Tab Bar uses
`Cmd+Shift+B` or `Ctrl+Shift+B`. Split Right/Down default to `Cmd+D`/
`Cmd+Shift+E` and `Ctrl+Shift+O`/`Ctrl+Shift+E`; Close Pane to `Cmd+Alt+W` and
`Ctrl+Shift+K`; Focus Next/Previous Pane to `Cmd+]`/`Cmd+[` and
`Ctrl+Shift+]`/`Ctrl+Shift+[`; directional pane focus to `Cmd+Alt+Arrow` and
`Alt+Shift+Arrow`; Equalize Panes to `Cmd+Ctrl+=` and `Ctrl+Shift+0`.

The effective native map remains remappable and duplicate-checked. Main's menu
and key-event delivery share actions under
[ADR 0018](0018-deliver-menu-refused-accelerators-in-main.md); no renderer shortcut
system is added. Settings participates at its literal position in that same
order without creating a pane, Surface, Adapter or session. Unselected-tab removal preserves selection by identity; selected
removal chooses its right neighbor or, at the end, its left neighbor.

## Settings content ownership

Settings appends on first open; subsequent opens select it without reread,
reorder, draft/category/scroll reset or replacing its focused field. Switching
retains the editor lifetime and pending save results while ending recording and
invalidating clipboard interaction. Closing disposes it; reopening snapshots
through the existing main queue. No implicit raw Save or new unsaved-change
prompt is introduced. Escape is not application-tab closure; the visible Close
control retains its Enter repeats/release in a document-owned gesture guard
that outlives the removed view.

Settings selection hides/deactivates Snippets, retaining memory state but not
automatically restoring visibility. It leaves window and application-tab actions
available, and prevents terminal pane/Find/zoom/snippet/file-drop delivery. About
and menu-opened images may cover it with the ordinary modal guards. Retained
views distinguish alive from interactive: saves can settle hidden, but loading,
clipboard and capture cannot focus or edit a hidden/blocked view. Clipboard
interaction generations invalidate leave-and-return and blur races.

Main validates a fixed `{ kind: "settings" }` selection, distinct from a pending
terminal's empty session snapshot. It counts no Busy Sessions and selects a
localized app-owned title, never renderer-provided text. Background titles/bells
continue per terminal without taking graphical title ownership or clearing unseen
bells. Closing a terminal still retains its captured target even after selecting
Settings. Last-terminal exit/cancellation/failure leaves graphical content alive;
first-mount rejection is not host-setup failure, and `ready` still rejects.
Only final Application Tab removal reports owner emptiness. Queued Settings/New
Tab opens cannot revive it; native acknowledgement/drain guarantees are unchanged.

The strip and both content lifetimes compose through the existing host, not a
plugin registry, workspace persistence layer or second tab index. Native window
minima stay unchanged. Layout tokens/budgets are recorded in the
[style guide](../ui-style-guide.md).

## Consequences and verification

IPC gains per-session identity beneath each window controller, and selection
refits the active grid. Tab order and visibility are in-memory presentation;
workspaces, unrestricted broadcast input, pane maximize and moving tabs or panes between
tabs or windows are outside current scope. Explicit optional
[Saved Layout](0042-save-layouts-without-restoring-sessions.md) is the narrow
exception for saving terminal order/layout/cwd and opening fresh shells in a
new window. Complete initial pane ownership precedes bounded ordinary mounts;
no dummy session or repeated split-action simulation is used.

Headless style and host tests cover shared separator paint, retained target sizes,
per-Surface marker insets, initial/reloaded accent propagation, and both split-axis
keyboard/ARIA behavior. Opaque sRGB contrast checks give bundled `omtheme` cyan
(`#80d4ff`) against its black background 12.78:1. The same cyan against the
representative light test background (`#f5f5f5`, not a bundled light theme) gives
1.51:1; its foreground fallback (`#161616`) gives 16.60:1. A darker cyan
(`#006b80`) gives 5.64:1 on that light background and is retained. These checks
establish palette math and source/DOM contracts, not native pixel rendering or
physical keyboard accessibility.

Production ownership tests cover mounting siblings, ordinary exits, failure
acknowledgement, tab and pane removal, split admission, pane focus routing,
selection and native shutdown. Exact native
artifact evidence is separate from source review and mocked/DOM tests.
