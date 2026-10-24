# Hide Window Chrome without replacing sessions

## Decision

Title and tab visibility are independent per-window presentation choices.
`window.showTitleBar` and `window.showTabBar`, both true by default, initialize
new windows. Reload updates those defaults without replacing existing choices.
Menu/keybind toggles affect only the selected window, never configuration or
session identities. An enabled tab strip needs at least two tabs.

macOS uses blended `hiddenInset` chrome and native traffic-light controls.
Hiding removes the buttons and the 30 px app-owned title inset. Linux and Windows
use frameless native windows with a 34 px renderer-drawn title/drag row, sanitized
selected title and native minimize/maximize/restore/close actions. Colors follow
the theme and background ownership in
[ADR 0029](0029-compose-background-effects-with-explicit-cell-identity.md).

Hiding a drawn row or native buttons avoids window recreation and session
migration. Renderer chrome sits outside the portable Terminal Surface. Main
validates requests from the owning main frame; custom Close invokes guarded
Close Window under [ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md),
not direct destruction. Native resize, snapping and maximize/fullscreen state
remain window-manager/Electron behavior.

## Native application menu in frameless windows

Linux/Windows frameless windows have no native menu bar. Standalone Alt release
opens the currently installed application `Menu` as a native popup. Main uses
`Menu.getApplicationMenu()` when opening, not a cloned action map; reload keeps
hierarchy, actions and shortcuts aligned with
[ADR 0018](0018-deliver-menu-refused-accelerators-in-main.md). macOS menu and
Option input are unaffected.

The chrome owner computes the content-relative anchor: `(8, 42)` below the
visible title row, otherwise `(8, 8)`. Native styling, navigation and dismissal
are OS-owned. Alt-down remains unconsumed so X11 can deliver Alt-up. Only a
qualifying opening release is consumed. Other keys, repeats, composition,
AltGr, mouse activity and blur cancel candidacy. Preview/lifecycle changes
retire the popup; reload dismisses it before replacing the menu. Dismissal
preserves focus without activating a window.

## Hidden-title interaction

Outside fullscreen, hovering in the top 150 logical px reveals three dots when
the title area is hidden. Only the centered 90 by 14 logical-pixel handle is a
native drag region. Reveal/hide changes no layout or PTY geometry; the wider
hover region does not capture terminal input.

Native drag hit testing can suppress DOM pointer events, so main samples the
pointer at a bounded cadence while the handle is needed. Only presentation
state reaches the renderer; coordinates are not persisted or logged. Sampling
and listeners belong to the window and are disposed with it.

Fullscreen suppresses title chrome and the handle while retaining visibility
choices for exit. Native enter/leave events drive presentation and sampler
lifetime directly: the Windows `isFullScreen()` getter can lag those events.
macOS safe-area behavior and configured padding are unaffected. Local Image
Preview suppresses title/tab toggles and the hover handle while choosing,
loading or displaying an image and retains focus.

## Ownership and consequences

Layout changes refit the selected existing Surface and PTY; hidden Surfaces
retain their last real geometry. The right-side Auxiliary Panel remains below
full-width chrome; title/tab/fullscreen geometry changes retain its memory-only
preferred width and focused controls without replacing terminal owners. Theme
changes do not reset visibility or panel preference. Small
explicit drag regions preserve selection and application mouse input; recreating
windows or making the terminal a large invisible drag target would threaten
those boundaries.

Tests cover configuration defaults, window-local toggles/reload, native/IPC
ownership, guarded close, title/preview/fullscreen state, geometry and cleanup.
DOM drag declarations and mocked native calls do not prove visible OS movement,
popup placement or navigation. Native qualification records actual coverage
under the [release procedure](../release.md).
