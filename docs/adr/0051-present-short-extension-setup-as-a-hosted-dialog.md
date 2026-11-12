# Present short extension setup as a Hosted Dialog

Status: accepted. Amends
[ADR 0043](0043-revoke-visible-mirror-typing-routes.md), whose setup page was
a full Application Tab.

## Context

Mirror Typing setup is a few checkboxes and one button. It opened as a
window-context extension tab: a whole page, mostly empty. Opening it added a
second tab, so the tab strip appeared and resized every terminal in the
window, and its host frame showed Close in the document's serif font on a
tinted row above the view's opaque page.

Extension views are native child views over the window. Core already presents
them in two places, an Application Tab and the Auxiliary Panel, with one view
visible per window at a time.

## Decision

Core adds a third presentation, the **Hosted Dialog**: a `ui-dialog` that
core draws over the selected tab. Core draws the frame (the view's title and a
Close ×); the native view fills the body and draws only its
content, transparent and scrolling inside. The dialog is as tall as the view's content
(the view reports it, `extension-view:content-height`), up to a maximum. It is modal like any `ui-dialog`:
the window behind softens and doesn't take pointer input.

- **It is not a tab.** Opening it adds no Application Tab, so the strip, the
  tab order and the terminal grid don't change.
- **It borrows the one native presenter** while shown. Any other tab or panel
  selection takes the presenter back and hides the dialog after the native hide
  is acknowledged, without closing its view. Close, Escape (from the frame or,
  through core, from the view) or a newer dialog closes the view.
- **Main picks it**, like the panel: `extensionPresentation` maps the official
  `omxterm.mirror-typing` view to `"dialog"`. No manifest field changes, so
  third-party extensions can't opt in yet.
- **A dialog never opens over a modal** or an empty window; core closes it and
  the user asks again.

Mirror Typing's Start now requires its view to be the shown dialog, where it
used to require the selected hosted tab. Start's handoff hides the dialog
through the presenter and waits for the acknowledged native hide, as before.
The hidden view stays alive while mirroring because view loss still revokes
the group ([ADR 0043](0043-revoke-visible-mirror-typing-routes.md)); main
retires it when Mirror Typing opens again or the window closes. A selection
that hides the dialog during Preparing cancels Start.

Window-context views that need room (Saved Layout) stay full-page tabs. Their
host frame takes the design-system font, paints the page surface and draws the
view's title and Close on one row, as Settings does; the view draws no title.

## Tradeoffs

A long pane list scrolls inside the dialog once it reaches its maximum height. While it is shown, an open Auxiliary Panel tool's view is
hidden, because a window shows one native view at a time. An installed Mirror
Typing 0.2.0 opens in the dialog too, with its own title and opaque page;
0.3.0 drops both and needs a host with this presentation. Mirror Typing is
the only Hosted Dialog until a manifest value is worth adding.
Saved Layout 0.3.1 drops its own title and needs this host
(`>=0.29.1-dev.0`); an installed 0.3.0 keeps working but shows its title twice.
