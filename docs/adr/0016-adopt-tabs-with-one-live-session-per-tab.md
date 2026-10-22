# Adopt tabs with one live session per tab

A Terminal Window holds one or more Terminal Tabs. Each tab owns a Terminal
Surface and, after successful initialization, one ephemeral Live Terminal
Session. Application-drawn tabs provide selectable independent local sessions;
tmux remains the user's persistence and reconnection tool.

## Window presentation

The renderer-owned tab strip occupies a full-width row above the Terminal
Surface and Snippets Sidebar. It appears only with at least two tabs and an
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

Every session has exactly one tab lifetime owner. Ordinary shell exit closes
its tab; closing a tab requests termination of that session. Closing a window
closes its tabs. Closing the final tab closes its window, and closing the last
window requests application quit. Close confirmation is once per action and
only for affected Busy Sessions under
[ADR 0017](0017-confirm-close-only-for-busy-sessions.md).
[ADR 0028](0028-wait-for-native-sessions-before-application-quit.md) independently
waits for actual native exit before accepted Quit completes; tab/controller
disposal or `kill()` is not completion.

The renderer tab owner, not a native-PTY count, commits ordinary last-tab
closure. Mounting tabs waiting for fonts/WebGL still own their window. Removing
its final tab sends a main-frame-validated empty notification and prevents queued
New Tab commands from reviving that owner. Cancelling a mounting tab can close
an empty window without starting a shell. Explicit window closure/Quit cancels
pending initialization through owner disposal.

**Current first-tab limitation:** `terminal-window-host.ts` subscribes to tab
commands, clipboard actions, zoom, tab-bar toggles and snippets only after
`tabs.ready`; preload does not buffer earlier notifications. An early Close Tab,
New Tab or navigation command can therefore be lost, and the first pending tab
can ignore Close Tab and later start its shell.
[#571](https://github.com/luizomf/omxterm/issues/571) tracks this
command-registration bug. Later-tab cancellation and native Close Window/Quit use
separate paths.

Main counts failure acknowledgements independently per window, including
pre-start rendering failures and failures while siblings remain live. An empty
tab-owner notification waits for all pending acknowledgements. Acknowledgement
removes only the failed tab; sibling exit or another acknowledged failure does
not release its window. Runtime rendering failure requests session termination
and retains its failed tab until native exit and acknowledgement. Explicit
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
[ADR 0010](0010-keep-terminal-titles-display-only.md). Each tab shows its sanitized
session title or starting-shell basename; the selected tab supplies the native
window title with `OMXTerm` as final fallback. No foreground-process name is
used as a display label.

New Tab/Window defaults are `Cmd+T`/`Cmd+N` on macOS and
`Ctrl+Shift+T`/`Ctrl+Shift+N` on Linux/Windows. Close Tab/Window defaults are
`Cmd+W`/`Cmd+Shift+W` and `Ctrl+Shift+W`/`Ctrl+Shift+Q`, respectively. Tab
cycling uses `Ctrl+Tab`/`Ctrl+Shift+Tab` on macOS and
`Ctrl+PageDown`/`Ctrl+PageUp` on Linux/Windows; literal tab positions use
`Cmd+1` through `Cmd+9` or `Alt+1` through `Alt+9`. Toggle Tab Bar uses
`Cmd+Shift+B` or `Ctrl+Shift+B`.

The effective native map remains remappable and duplicate-checked. Main's menu
and key-event delivery share actions under
[ADR 0018](0018-deliver-menu-refused-accelerators-in-main.md); no renderer shortcut
system is added. Unselected-tab removal preserves selection by identity; selected
removal chooses its right neighbor or, at the end, its left neighbor.

## Consequences and verification

IPC gains per-session identity beneath each window controller, and selection
refits the active grid. Tab order and visibility are in-memory presentation.
[ADR 0035](0035-split-tabs-into-independent-terminal-panes.md) extends a tab to
several pane sessions; inter-window moves remain out of scope.

Production ownership tests cover mounting siblings, ordinary exits, failure
acknowledgement, tab removal, selection and native shutdown. Exact native
artifact evidence is separate from source review and mocked/DOM tests.
