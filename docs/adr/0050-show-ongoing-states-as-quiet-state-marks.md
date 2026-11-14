# Show ongoing states as quiet State Marks

Status: accepted. Amends
[ADR 0043](0043-revoke-visible-mirror-typing-routes.md), whose in-flow status
row and Stop button this replaces. Amended by
[ADR 0053](0053-mark-program-progress-and-attention.md), which adds the
`working` and `attention` glyphs, and by
[ADR 0052](0052-let-a-local-agent-drive-a-granted-window.md), which adds the
window-scoped `agent` mark and the one accent tone, and later moves that mark
to the error tone. Amended below ([#1071](https://github.com/luizomf/omxterm/issues/1071)):
the glyphs are icons from one set, and a pane's marks sit in a small capsule.

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

1. Idle or success: nothing. One exception: an explicit action with no other
   visible result (Save layout) confirms itself with tier 3's transient
   sentence ("Layout saved."), since otherwise the user can't tell it ran.
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
as before. The Mirror Typing shortcut (or the Command Palette) is the
keyboard Stop, and the mark the pointer one, all working with hidden chrome and
an unresponsive extension; the mark's label names the shortcut ("Click or press
Cmd+Shift+M to stop."). An ordinary stop shows nothing,
a semantic-input stop flashes, and a failed write leaves a notice.
Preparing is brief and input-inert, so it shows nothing.

Saved Layout shows nothing while panes open or when they all opened, including
folder fallbacks. When some panes couldn't open, it leaves one notice. Save
layout flashes "Layout saved." and leaves a notice when it couldn't save or
couldn't confirm the save; the next save clears that notice. Panes
the user closed meanwhile and shells that exit cleanly aren't failures.

## Tradeoffs

A glyph is easier to miss than a strip, on purpose: the terminal comes first.
The mark floats over the canvas and can cover the last column or two of the
first row; that is accepted, and it never changes the grid. An actionable mark
is a 24 px hit target with a pointer cursor, a visible hover state and a
tooltip that appears quickly, so it is easy to find once you look for it.
Without the strip, the stop is the mark
itself: only its tooltip says it can be clicked.

## Amendment: window marks and one accent (ADR 0052)

An agent grant covers a whole Terminal Window, so marks gain a window scope:
`setWindow(owner, mark)` puts the mark after each pane's own marks on every
pane of the window, including panes opened later, and once on every tab,
Application Tabs included. When the selected tab has no pane and the tab strip
is hidden, so nothing else could carry it, the mark sits in the page's
top-right corner. The pane and corner copies can carry the action; the tab
copy stays a plain glyph.

The `agent` glyph (`◆`) is the only mark with a tone of its own: `--ui-accent`,
derived like the focused-pane line (the theme's cyan, or its foreground when
cyan lacks contrast) but never switched off by
`appearance.activePaneHighlight`. The accent means "something other than you
can act here", so `working` and `attention` keep the secondary color. Reporters
still never pass a color: CSS maps the glyph to its tone.

## Amendment: the agent mark's error tone (ADR 0052, slice 4)

Built with [#1050](https://github.com/luizomf/omxterm/issues/1050). Now that
agents can press shortcuts in a granted window, the `agent` mark moves from
the accent to the theme's error tone: the theme's red (the color
behind `--ui-error-accent`, as on error notices), or its foreground when the
red lacks contrast against the background, the same fallback as the accent.
Its label reads "Agents can do anything you can in this window. Click this
mark to stop them." Same glyph, same placement and click, no banner: it stays
the one mark with a tone of its own, and reporters still never pass a color.
While a grant exists the mark is always visible: no hidden chrome, extension
tab or state the agent can toggle may hide it. The token is `--ui-agent`,
which replaces `--ui-accent`, and the corner copy shows whenever the selected
tab has no pane, so there is always a mark to click.

## Amendment: one icon set and a capsule for pane marks (#1071)

The four Unicode glyphs (`↔`, `⋯`, `●`, `◆`) came out at four sizes and
weights, differed between tab and pane, and tangled with the output they
floated over: the working mark vanished inside the letters under it. Testing
line weights showed that no stroke reads bare over busy text; a backing
decides legibility, the stroke only taste.

So tier 2 changes in two ways, and nothing else does:

- **Marks are icons from the interface's one icon set**
  (`src/shared/ui-icons.ts`: Lucide geometry at stroke 1.75, vendored as path
  data, no dependency). An outline is an ambient state (mirror: a two-headed
  arrow; working: a static open ring); a solid shape needs the user
  (attention: a dot; agent: a diamond, still the only mark with a tone). One
  optical size per place: 12 px on a tab, and on a pane 0.8 of the terminal
  font size, never under 16 px, in a target of one text row, never under
  24 px. `stateGlyphs` still names them and reporters still pass only a name.
- **A pane's marks share one capsule**, which replaces "no chip or
  background": a fully round surface tint with a backdrop blur, a faint top
  rim and a soft shadow, only as wide as its marks and gone with the last
  one. It is one home for every state, never a chip per feature. The tint
  alone must carry it, because the blur is an enhancement that not every
  compositor gives.

The cost is stated plainly: the capsule hides the end of row 1 instead of
letting it show through, and it is wider than "a column or two". At the
default 15 px font one mark covers about 28 px (3 columns) and all four
about 104 px (11 columns). It still never enters the layout flow or changes
the grid. A setting and shortcut to hide pane marks, which never hide the
agent mark, are planned separately for people who want row 1 back.
