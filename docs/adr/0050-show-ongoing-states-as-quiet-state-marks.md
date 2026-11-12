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
2. Something ongoing: a **State Mark**, one small glyph at the pane's top-right
   edge, in the top padding over the canvas. It has a tooltip and an
   accessible name and no text on screen. When the tab strip is visible, the
   tab shows each owner's glyph once, labelled from its focused pane.
3. A surprise (paste stopped mirroring): a one-sentence `ui-overlay` that goes
   away by itself after four seconds.
4. Something that needs the user: a one-sentence `ui-overlay` notice, without
   counts, that stays until they dismiss it. A newer notice replaces it.

Nothing in the system enters the layout flow, so no state changes the terminal
grid or resizes a PTY, in any window mode. Stopping an ongoing state never
needs a permanent button; it goes through the existing action surfaces
(shortcut, Command Palette, menu).

The API is plain data: `set(pane, owner, { glyph, label })` with a glyph from a
small core-owned vocabulary (`stateGlyphs`) and a label that is literal text or
a core string resolver; `undefined` removes the owner's mark. `flash(text)` and
`notify(text)` show the overlay tiers. Reporters never supply colors, HTML or
their own glyphs, so an extension capability can later forward the same data
(a pane handle, a glyph name, a literal label) without reshaping the API.

## Mirror Typing and Saved Layout

Mirror Typing marks every member while its route is armed; the label says
whether the pane is the source or a member and that opening the Command Palette
stops mirroring. Opening the Command Palette or any modal, switching tabs,
selecting an unmirrored pane, or opening Mirror Typing again stops the group,
as before; the Command Palette is the keyboard-reachable Stop that works with
hidden chrome and an unresponsive extension. An ordinary stop shows nothing,
a semantic-input stop flashes, and a failed write leaves a notice.
Preparing is brief and input-inert, so it shows nothing.

Saved Layout shows nothing while panes open or when they all opened, including
folder fallbacks. When some panes couldn't open, it leaves one notice. Panes
the user closed meanwhile and shells that exit cleanly aren't failures.

## Tradeoffs

A glyph is easier to miss than a strip, on purpose: the terminal comes first.
The mark can cover a few pixels of the top-right cell when the configured top
padding is smaller than the glyph. Without the strip, stopping Mirror Typing
takes a known gesture (the Command Palette shortcut) instead of a visible
button; the mark's tooltip and the guide say so.
