# Usage development notes

[Everyday OMXTerm use](../usage.md) covers what users do. This page lists the edge
cases behind those features that matter when you change them. The
[product contract](../spec.md) is the full behavior reference.

## Tabs and Settings

- **Settings…** opens a tab with no shell. It takes part in reorder, numbered,
  next and previous navigation. Opening it again returns to the same editor.
- Settings stays open after the last terminal exits. Closing the last
  application tab closes the window.

## Split panes

- A new pane starts in the directory the focused shell last reported through
  OSC 7, or, without a report on macOS and Linux, in that shell's working
  directory; otherwise in the home directory. Non-local host names and missing directories
  fall back to home. An empty or local host name sent over SSH looks the same as
  a local report, and program output can send it too. The report only selects an
  existing local directory; it never runs shell text.
- The focused pane in a split tab shows a thin top line inset by the horizontal
  terminal padding. It uses the theme's cyan, or the foreground when cyan has low
  contrast with the background and the foreground does better.
- The divider is a 1 px line inside a 4 px resize target. Hover and drag share a
  neutral highlight; keyboard focus highlights only the line.
- A split needs room for two grids of at least 20 columns by 5 rows, including
  padding and dividers, measured with the source pane's current cell size. A
  later shrink or zoom can make that impossible: sessions and layout survive,
  and a divider move that can't fit keeps the current proportions.
- The **Close Pane** context menu is bound to the pane it opened on. If that pane
  ends or focus moves to another pane or tab first, the menu does nothing.

## Close confirmation

Close Pane asks only about the focused pane. Close Tab asks once for all of its
panes. Windows confirms for every live session, because it can't tell whether a
command is running. `"confirmClose": false` turns the prompt off.

## Command Palette

- Remaps and `null` for `keybinds.commandPalette` are kept. A custom action on
  the same combination keeps it and leaves Command Palette unbound; nothing
  rewrites the config.
- The dialog closes before the chosen action runs, so the action keeps its normal
  guards and close confirmations. Copy, Paste and Select All edit the query while
  the palette owns input.
- Like About, it follows the window tint and transparency and softens the content
  behind it. That effect is separate from native blur and doesn't depend on
  `window.blur`.
- Results cover window, tab and pane actions, Settings, About, local-image
  preview, reload and developer tools, with their bound shortcuts. Search is a
  case-insensitive substring match in the selected interface language.
- Copy, Paste, Select All, Find, numbered tab selection and the palette itself
  are not results. Find is left out because returning input to the previously
  focused Terminal Surface after palette input isn't established.
- The palette keeps its original tab and pane target and never runs against a
  replacement. It can open above Settings without losing drafts or pending
  saves, but doesn't stack with About or image preview. Cancel
  returns focus to the prior control if its target still exists.
- Losing window focus invalidates the open palette; reopen it before choosing.
  Reopen after a language or shortcut change to refresh the list.

## Terminal context menu

Turning off **Terminal context menu** (`terminal.contextMenuEnabled: false`)
also disables keyboard-opened terminal popups, with no Shift exception.
Application mouse input, Edit actions, keybindings and the Find query menu are
unchanged.

## Exporting terminal text

- The menu belongs to the pane it opened on. If that pane ends or focus moves
  first, the old menu can't export another pane.
- Text is captured when the user chooses Export, so later focus changes don't
  affect the file. Closing the window while the save dialog is open prevents a
  new write; a write already started may finish.
- Export accepts up to 16 MiB of UTF-8, inclusive. Larger text shows a notice and
  saves nothing; it is never truncated.
- Text and destinations stay out of operational logs.

## Protected Paste

Text that contains a closing bracketed-paste marker is refused, not changed or
partly sent. The window shows a clipboard failure notice and the terminal stays
usable. Snippets and dropped paths use the same check.

## Local images

Preview accepts PNG and JPEG up to 64 MiB, 8192 pixels per side and
32 megapixels. Animated images are not supported. Paths with spaces need quotes
or a line of their own to be recognized.

About and image preview don't stack. While either owns input (including image
choosing and loading), split, pane focus, swap and equalize are ignored. Confirmed
closure and failure acknowledgement still work.

## Configuration reload

A native font read already started for a pending Surface can finish with its
original family. New requests must still match the current family when
admitted, so a queued read for an old family that hasn't started can fail
initialization.

## Renderer

The renderer needs WebGL2. On Linux, Chromium's SwiftShader software fallback is
allowed ([ADR 0037](../adr/0037-allow-the-linux-software-webgl-fallback.md)).
Initialization can still fail, and the error alone doesn't identify a driver
problem.

## Logs

Operational logs rotate between two files of up to 5 MiB each, `omxterm.jsonl`
and `omxterm.previous.jsonl`.
