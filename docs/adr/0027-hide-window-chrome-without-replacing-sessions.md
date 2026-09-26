# Hide Window Chrome without replacing sessions

[ADR 0029](0029-compose-background-effects-with-explicit-cell-identity.md) amends
native construction and paint ownership to support live background effects.

Amends [ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md)'s fixed
platform title area and initially enabled tab strip. The tab/session ownership
model, [ADR 0018](0018-deliver-menu-refused-accelerators-in-main.md)'s keybind
routing, and platform security/display policies remain unchanged.

## Decision

Title and tab visibility are independent per-Terminal-Window presentation
choices. User Configuration adds `window.showTitleBar` and `window.showTabBar`,
both defaulting to true. They initialize newly created windows. A valid reload
updates defaults for future windows while preserving existing windows' choices,
just as the Always-on-Top default does. The native menu and effective keybinds
toggle the selected window without editing configuration or restarting sessions.
An enabled tab bar still requires at least two tabs to appear.

The visible title area is deliberately platform-specific:

- macOS keeps the existing blended `hiddenInset` appearance and native
  traffic-light controls on the left. Hiding changes native button visibility
  and removes the 30 px app-owned title inset. It does not introduce a colored
  title strip or replace the familiar native controls.
- Linux and Windows create frameless native windows and draw a compact 34 px
  title/drag row. The selected sanitized Terminal Title is on the left; simple
  minimize, maximize/restore and close controls are on the right. Colors follow
  the active Terminal Theme. The accepted layout is intentionally small rather
  than a new toolbar or general-purpose window-management interface.

Native window construction is not toggled on Linux/Windows. Hiding or restoring
an app-drawn row avoids recreating the BrowserWindow, renderer, Terminal Surface
or PTY merely to change its decorations. macOS uses its existing native
button-visibility capability instead. This preserves the Live Terminal Session
ownership model rather than introducing renderer reparenting or session migration.

## Native application menu in frameless windows

Issue #408 exposed an incompatible assumption: Electron 43.1.1 registers
accelerators for frameless Views windows but deliberately never creates their
native menu bar. `autoHideMenuBar` and `setMenuBarVisibility` cannot reveal a
nonexistent bar. Native differentials on Windows, Ubuntu and Fedora confirmed
this; restoring `frame: true` would violate the hideable-title decision above.

The accepted presentation is the current installed application `Menu` as a
native popup, opened by standalone Alt release on Linux and Windows. It uses
`Menu.getApplicationMenu()` at opening time, not a cloned template or separate
action map, so configuration reload keeps hierarchy, actions and effective
accelerators aligned. Native styling, navigation and dismissal remain OS-owned.
macOS retains its menu and Option input without this interception.

The Window Chrome owner already knows chosen title visibility, fullscreen,
preview and lifetime. It owns Alt candidacy and computes the content-relative
logical-pixel anchor: `(8, 42)` below the visible 34 px row, otherwise `(8, 8)`.
A narrow native popup callback keeps Electron menu construction in main without
renderer geometry queries, injected JavaScript, new IPC or configuration keys.
Alt-down is left untouched because preventing it also suppresses Chromium's
Alt-up delivery on X11. Only a qualifying opening release is consumed. Other
keys, repeated/composing/AltGr input, observable mouse/input activity and blur
cancel candidacy; preview and lifecycle changes also retire the popup. Native
dismissal restores prior focus without explicitly activating or focusing a
window. Reload retires the old popup before replacing the installed menu.

This changes presentation, not ADR 0018's single shortcut registration and
invocation path. It adds no DOM menu, application toolbar, window recreation or
session migration. Behavioral tests exercise main's input/chrome interface;
real Electron fixtures cover popup integration and menu replacement. Those are
not substitutes for native desktop evidence of visible placement, keyboard
navigation, dismissal and action selection.

## Hidden-title interaction

Outside fullscreen, the top 150 logical px of content reveal three small dots
on hover when the title area is hidden. Only the centered 90 by 14 logical-pixel
handle is a native drag region. The larger reveal region does not capture
terminal input. Showing the dots does not change layout or resize a PTY.

Native drag hit testing can suppress DOM pointer events. Main may observe the
native pointer at a bounded cadence while the handle is needed and publish
only the resulting presentation state. Cursor coordinates are not a renderer
capability, persisted state or logging payload. Sampling and listeners belong
to the owning window and are disposed with it. This is ordinary application
code, not injected prototype JavaScript or a development environment flag.

Fullscreen suppresses the title area and handle but preserves the chosen
visibility for exit. macOS safe-area behavior and configured padding stay
unchanged. Local Image Preview suppresses title/tab toggles and the hover handle
while choosing, loading or displaying an image; it retains focus. Other windows
and hidden tabs keep their independent state and valid geometry.

## Ownership and consequences

The renderer draws Window Chrome outside the portable Terminal Surface. Main
owns native controls and visibility, and accepts only narrow validated requests
from the owning main frame through preload. Custom Close invokes the existing
Close Window action, including Busy Session confirmation, rather than destroying
a window directly. Terminal titles remain sanitized, display-only values and
never become logs or executable markup.

A title/tab layout change refits the existing selected Surface and PTY; hidden
Surfaces retain their last real geometry. Theme changes update chrome in place
without changing title/tab visibility. Minimize, maximize/restore, resizing and
platform snapping remain native window-manager actions, not simulated geometry
algorithms.

The alternatives were retaining unhideable native decorations on Linux/Windows,
recreating windows when their frame changed, or turning a large invisible
terminal area into a drag target. The first prevents the requested interaction,
the second threatens session continuity, and the third breaks selection and
application mouse input. A modifier-held whole-window drag mode adds keyboard
and focus state without a demonstrated need.

The owner-selected prototypes establish the intended visual design and provide
native interaction evidence, not production acceptance. Integration tests must
exercise configuration defaults, window-local toggles and reload, native/IPC
ownership, guarded close, title/preview/fullscreen behavior, geometry and cleanup.
Native checks supplement DOM tests because a CSS drag declaration alone cannot
prove an operating system moved the window. No release or additional platform
support is implied by this decision.
