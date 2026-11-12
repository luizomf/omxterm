# Show ongoing states as quiet State Marks

Status: accepted. Amends
[ADR 0043](0043-revoke-visible-mirror-typing-routes.md), whose in-flow status
row and Stop button this replaces.

## Context

Mirror Typing and Saved Layout each added their own full-width strip above the
terminal. The strips sat in the layout flow, so showing one resized the PTY
(tmux and vim redrew); neither ever went away; with tabs they sat between the
tab strip and the terminal, and without a title bar the macOS traffic lights
drew over them. More states are coming (an SSH session, an autosaved layout,
maybe an agent attached to a pane). If each one invents its own strip, badge or
color, the window stops being a clean terminal.

## Decision

Core owns one system, `src/renderer/state-marks.ts`, and every feature reports
its state through it. Each state takes the quietest form that works:

1. Idle or success: nothing.
2. Something ongoing: a **State Mark**, one glyph, no chip or background,
   inset from the pane's top and right edges by the terminal padding and
   centered on the first text row, in the secondary color at about the
   terminal's font size. It has a tooltip and an accessible name and no text
   on screen. When the tab strip is visible, the
   tab shows each owner's glyph once, labelled from its focused pane.
3. A surprise (paste stopped mirroring): a one-sentence `ui-overlay` that goes
   away by itself after four seconds.
4. Something that needs the user: a one-sentence `ui-overlay` notice, without
   counts, that stays until they dismiss it. A newer notice replaces it; a
   surprise never hides it.

Nothing in the system enters the layout flow, so no state changes the terminal
grid or resizes a PTY, in any window mode. Stopping an ongoing state never
needs a separate button: it goes through the existing action surfaces
(shortcut, Command Palette, menu), and the owner may also let its mark act.
An actionable mark is the same glyph rendered as a `ui-icon-button`; its
tooltip and accessible name add the action ("Click to stop."). Clicking it
keeps terminal focus. The tab's copy stays a plain glyph, because a tab is
already a button.

The API is plain data plus one callback: `set(pane, owner, { glyph, label,
action? })` with a glyph from a small core-owned vocabulary (`stateGlyphs`), a
label that is literal text or a core string resolver, and an optional
`action: { label, run }`; `undefined` removes the owner's mark. `flash(text)` and
`notify(text)` show the overlay tiers; `notify` returns a function that clears
only its own sentence. Reporters never supply colors, HTML or
their own glyphs, so an extension capability can later forward the same data
(a pane handle, a glyph name, a literal label) without reshaping the API.

## Mirror Typing and Saved Layout

Mirror Typing marks every member while its route is armed; the label says
whether the pane is the source or a member, and clicking any member's mark
stops the group. Opening the Command Palette or any modal, switching tabs,
selecting an unmirrored pane, or opening Mirror Typing again stops the group,
as before; the Command Palette is the keyboard-reachable Stop, and the mark the
pointer one, both working with hidden chrome and an unresponsive extension. An ordinary stop shows nothing,
a semantic-input stop flashes, and a failed write leaves a notice.
Preparing is brief and input-inert, so it shows nothing.

Saved Layout shows nothing while panes open or when they all opened, including
folder fallbacks. When some panes couldn't open, it leaves one notice. Panes
the user closed meanwhile and shells that exit cleanly aren't failures.

## Tradeoffs

A glyph is easier to miss than a strip, on purpose: the terminal comes first.
The mark floats over the canvas and can cover the last column or two of the
first row; that is accepted, and it never changes the grid. An actionable mark
is a 24 px hit target with a pointer cursor, a visible hover state and a
tooltip that appears quickly, so it is easy to find once you look for it.
Without the strip, the stop is the mark
itself: only its tooltip says it can be clicked.
