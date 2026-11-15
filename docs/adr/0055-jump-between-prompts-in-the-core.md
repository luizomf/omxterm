# Jump between prompts in the core

Status: accepted. Amends
[ADR 0054](0054-read-command-marks-for-agents.md), whose "Navigation later"
it carries out, for
[#1027](https://github.com/luizomf/omxterm/issues/1027).

## Context

With the command marks of ADR 0054, a user can jump from prompt to prompt in
scrollback, as in Ghostty, iTerm2 and WezTerm. The Ghostty core already marks
every row a prompt starts on (`A`), keeps the marks as it reflows and trims
scrollback, and scrolls by prompts itself (`jump_to_prompt` in Ghostty). The
WASM build Restty ships exported only row scrolling.

Main's reader (ADR 0054) knows where commands end in the output stream, not
which rows they landed on after wrapping, resizing and trimming, so a row
index kept beside the core would drift from it.

## Decision

**The core moves the view.** OMXTerm's core patch exports Ghostty's prompt
scroll (`restty_scroll_viewport_prompt`), and the prepared runtime calls it
the way it scrolls by rows: the selection follows its text, a link hover
clears and the frame redraws. No row index is kept anywhere else.

**Jump to Previous Prompt / Jump to Next Prompt** act on the focused pane. The
previous or next prompt's first row becomes the top of the view; a next
prompt on the live screen returns the view to the bottom. Without marks, or
on the alternate screen, nothing moves and nothing is shown.

**Shortcuts and menus.** `Cmd+Shift+Up` / `Cmd+Shift+Down` on macOS (iTerm2's
and Ghostty's), `Ctrl+Shift+Up` / `Ctrl+Shift+Down` on Linux and Windows
(Ghostty's). Both default tables had them free, they stay off `Ctrl+Alt`
(AltGr), and arrows read as the direction. The actions sit under Find in the
Edit menu, in the Command Palette and in Settings → Shortcuts. An agent's
`press` runs them on the pane it names, like Select All (ADR 0052).

## Tradeoffs

- **Terminal programs lose those chords on Linux and Windows.**
  `Ctrl+Shift+Up/Down` no longer reaches the shell or a TUI there; editors
  that use it can be given another chord, or the action unbound, in
  `keybinds`. An agent's `press Ctrl+Shift+Up` now runs the action instead of
  sending the key.
- **Text fields keep the chord, so main needs to know about them.**
  Shortcuts run in main before the page sees the key, and these chords
  select to the start or end of the text in a field. The window's page tells
  main whether a text field (Find, Settings, the palette) holds focus, and main
  then leaves these two chords to it; extension views (the Snippets editor)
  never get the jumps. No other shortcut does this yet.
- **Ghostty's rules, not ours.** Previous skips prompts already in view, and
  Next from the last prompt in scrollback lands on the live screen.
- **A rebuilt core.** The export is one more function in the tracked patch
  and WASM, rebuilt with the pinned Zig.
  [ADR 0057](0057-copy-the-last-command-output-from-the-core.md) adds the
  next one, for Copy Last Command Output.
