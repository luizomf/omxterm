# Share the macOS title row with the tabs

Status: accepted, for
[#1194](https://github.com/luizomf/omxterm/issues/1194). It amends
[ADR 0027](0027-hide-window-chrome-without-replacing-sessions.md) and
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

## Context

On macOS the title area is a 30 px band that holds only the traffic lights.
With two or more tabs the strip took a second row under it: about 62 px of
chrome above the terminal, half of it empty. Ghostty's
`macos-titlebar-style = tabs` shows the alternative, tabs beside the lights.

## Decision

**On macOS the tab strip is the title row.** With the title bar showing, the
window not in fullscreen and the strip visible, the strip sits at the top of
the window, beside the traffic lights. Nothing else changes: the strip still
needs its flag on and two or more tabs, and a window with one tab shows the
same 30 px row with only the lights.

**The strip is 30 px tall on macOS, the row's own height.** Opening a second
tab, closing back to one, and toggling the title bar while the strip shows move
no terminal content and resize no PTY. The traffic lights are centered in that
row (`trafficLightPosition`), 3 px higher than the system default.

**Both ends of the row drag the window.** The strip starts 84 px in, after the
lights, and ends in an empty gutter of the same width. Tabs still share the
remaining width equally, so without the gutter a full row would leave little
to hold the window by. When tabs reach their 36 px minimum the gutter gives
way first, down to 40 px; past that the strip clips at the window's edge as it
always has, and the lights' side still drags. The row is a native drag region
and each tab is not: a tab clicks, and drags to reorder, as before. A double-click on the empty part
follows the macOS title-bar double-click preference. Local Image Preview
suspends this drag region like the others.

**It is the default, with no setting.** There is one macOS look. The two-row
arrangement is gone; `window.showTitleBar` and `View -> Toggle Title Bar` still
remove the lights, and then the strip takes its usual sides, lined up with the
terminal text. Fullscreen does the same.

**Linux and Windows are unchanged.** Their app-drawn 34 px title row keeps the
window title and controls, with the strip below it. They may follow later.

## Tradeoffs

- A window with tabs gets about 32 px back, and its chrome is one row.
- The tabs lose up to 168 px of the row to the lights and the gutter, so a
  narrow window clips its tabs sooner: a 420 px one holds 7 where it held 10.
  A 960 px window still holds 21.
- On macOS the strip is 1.6 px shorter than before, with or without the title
  bar, so its height is the same in every state.
- The lights sit 3 px above where macOS puts them for this title-bar style, in
  windows with one tab too, so they do not move when the strip appears.
- Hiding the title bar while tabs show no longer gives the terminal 30 px: that
  band is already gone.
- Nobody can go back to two rows. A setting for that would be one more choice
  to explain for a look we no longer want.

## Ownership

The renderer owns all of it except the lights' position. Main sets it at
window creation and again whenever the lights are shown after being hidden,
because Electron otherwise leaves them a few px off until the next redraw. The chrome owner that publishes the 30 px title inset also
flags the title row; the strip's CSS reads that flag, so per-window toggles and
fullscreen follow without another state. The fixed title drag band that serves
windows without a strip steps aside while the strip shows: it comes later in
the document, and a later drag region would otherwise cover the tabs.
