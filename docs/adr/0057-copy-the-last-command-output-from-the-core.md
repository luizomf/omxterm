# Copy the last command's output from the core

Status: accepted. Amends
[ADR 0055](0055-jump-between-prompts-in-the-core.md) for
[#1027](https://github.com/luizomf/omxterm/issues/1027).

## Context

With command marks (ADR 0054), users expect to copy what one command printed
without selecting it by hand, as iTerm2 (Edit → Select Output of Last Command)
and kitty (browse last command output, `Ctrl+Shift+G`) allow. The prompt and the command line must
stay out.

Only the Ghostty core knows which cells are prompt, typed input or output: the
`A`, `B` and `C` marks tag each cell as it is written, and the tags follow
reflow and scrollback trimming. Main's reader (ADR 0054) knows stream offsets,
not cells, and stripping a prompt from text afterwards would guess.

## Decision

**The core finds the output.** OMXTerm's core patch exports
`restty_last_command_output`, built on Ghostty's own prompt iterator and
output-content lookup (what Ghostty's `selectOutput` uses). It returns the
text formatted the same way as a manual selection, and the prepared runtime
reads it like an export: selection, scroll and hover stay as they are.

**Which command.** The latest finished command that printed something. The
bottom prompt is skipped, since it's the live prompt or the command still
running. An empty Enter, `cd` or `true` prints nothing and looks the same in
the core, so the action keeps walking up to the command before it.

**Edit → Copy Last Command Output**, after the prompt jumps, in the Command
Palette and in Settings → Shortcuts. `Cmd+Shift+A` on macOS (Select All's chord
plus Shift), `Ctrl+Shift+G` on Linux and Windows (kitty's chord for its last
command output), since `Ctrl+Shift+A` is already Select All there. Both chords
were free, they follow the
Cmd/Ctrl+Shift rule for core actions and stay off `Ctrl+Alt` (AltGr). An
agent's `press` runs it on the pane it names, like Copy (ADR 0052): a pane
program can already write the clipboard.

**No feedback.** It copies quietly, like Copy. With no marks, on the alternate
screen, or with no output yet, the clipboard stays as it was.

## Tradeoffs

- **PowerShell marks output through PSReadLine.** PowerShell has no hook for
  a command's start, so its lines wrap PSReadLine's `PSConsoleHostReadLine`
  and print `C` once the line is read, as VS Code's integration does. Without
  PSReadLine there's no `C` and nothing to copy. A wrapper that reads no line
  throws, so PowerShell reads the line itself (checked with Windows PowerShell
  5.1 and PowerShell 7.7 through ConPTY).
- **Terminal programs lose `Ctrl+Shift+G` on Linux and Windows.** It can be
  rebound or unbound in `keybinds`, like other shifted shortcuts there.
- **A rebuilt core.** One more export in the tracked patch and WASM, rebuilt
  with the pinned Zig.
