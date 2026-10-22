# Split tabs into independent terminal panes

A Terminal Tab now owns a split layout of one or more **Terminal Panes**. Each
pane is a complete Terminal Surface with its own Restty instance, WebGL canvas,
Terminal Adapter and Live Terminal Session. This refines ADR 0016: a tab is the
lifetime owner of all of its panes' sessions.

## Why separate Surfaces

Restty can split its own root, but OMXTerm's Surface contract (ADR 0025)
binds one transport, font lease, hidden-render policy and failure path to one
Surface. Composing whole Surfaces keeps every existing lifecycle, focus,
clipboard, image and failure guarantee per pane, with no change to the
portable Surface interface. The cost is one WebGL context per pane, so a tab
holds at most 16 panes.

## Layout

The layout is an n-ary tree. A split in the same direction as its parent adds
a sibling, so three side-by-side panes share one row. Pane elements are moved
between split containers, never recreated, so Surfaces keep their canvas and
session. Restty's own size observer refits each grid and PTY after divider
moves, maximize or equalize. Hidden tabs and the siblings of a maximized pane
are `hidden` at the Surface element, preserving the rule that hidden Surfaces
never draw.

## Sessions and confirmation

- A new split starts the Default Shell in the focused pane's directory. The
  renderer sends only an `inherit` intent naming the source session. Main
  resolves it from that session's OSC 7 report (only for this machine's host
  names) or, on Linux, from `/proc/<pid>/cwd`, and checks that the directory
  still exists. The renderer never names paths or programs (ADR 0006).
- An ordinary pane exit removes the pane; the tab closes with its last pane.
- A signal exit still waits for its native failure acknowledgement.
- Close Pane uses the Close Tab confirmation flow scoped to the focused pane:
  the renderer captures the target before the dialog, and approval never
  retargets.
- A split tab reports every pane's session with its selection, so Close Tab
  asks when any of them is Busy.

## Broadcast

Broadcast input is explicit, per tab and confirmed natively. Only keyboard
input typed into the focused pane is mirrored. Paste, snippet injection and
parser replies (cursor reports, device attributes) are never mirrored, because
the Surface reports only `key`-origin input. Receiving panes show a warning
edge, and a persistent indicator offers Stop. Reliable password-prompt
detection is not claimed.
