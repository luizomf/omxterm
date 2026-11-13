# Mark program progress and attention

Status: accepted. Amends
[ADR 0050](0050-show-ongoing-states-as-quiet-state-marks.md), whose glyph
vocabulary gains `working` and `attention`, and replaces the bell's title
marker.

## Context

People run several coding agents in tabs and want to know, without watching
each one, which is still working and which has stopped to wait for them. Today
that takes tmux window options plus a sound script. Terminals already have
sequences for both states:

- **Progress:** ConEmu's OSC 9;4 (`ESC ] 9 ; 4 ; state ; percent ST`), also
  understood by Windows Terminal, Ghostty and iTerm2. State 0 clears it; 1 to 4
  are normal, error, indeterminate and paused.
- **Attention:** iTerm2's OSC 9 (`ESC ] 9 ; text ST`), rxvt's OSC 777
  (`ESC ] 777 ; notify ; title ; body ST`), and BEL.

OSC 9;4 shares OSC 9's prefix, and so do ConEmu's other subcommands (`9;9` is a
working directory report). Restty 0.3.0 parsed OSC 9 and OSC 777 itself and
swallowed every ConEmu subcommand, so progress never reached OMXTerm.

What agents send matters more than what terminals accept. Claude Code 2.1
sends OSC 9;4 only to terminals it recognizes (ConEmu, Ghostty, iTerm2), using
state 3 while a turn runs and state 0 when it ends, once per change and never
repeated. Its notifications are OSC 9, OSC 777 or BEL, chosen by
`preferredNotifChannel`. Codex rings BEL by default and sends OSC 9 when
configured; Gemini CLI sends OSC 777 to terminals it doesn't recognize.

## Decision

**One parser, owned by OMXTerm.** A checksum-guarded Restty correction hands
the raw OSC 9 and OSC 777 payloads to the host route that already receives OSC 52. `src/terminal-surface/attention-osc.ts` tells them apart: `9;4` is
progress, `9;1` through `9;12` are ignored, any other OSC 9 is notification
text, and OSC 777 is read only as `notify;title;body`, splitting at the first
`;`. Text is untrusted plain text: controls become spaces, bidirectional
controls are removed, and titles and bodies are cut to 128 and 512 code points
before they leave the Surface, then checked again in preload and main. It is
never logged.

**Working** is a State Mark (`⋯`, static) on the reporting pane and its tab,
renderer-local, with no IPC. It shows while the program's progress report is
active and clears when the program reports state 0, when the same pane asks
for attention (a finished or waiting program), or when its session ends. There
is no timeout, because agents report progress once per change and a long turn
would otherwise lose its mark.

**Attention** is a State Mark (`●`) for BEL, OSC 9 and OSC 777 alike. Main
decides it, because main already knows when the user looked: the title
controller's bell state becomes the session's attention state, with the same
rules. The mark is set even on the pane in front of the user, and it clears
when that pane is selected in a focused window, when the window regains focus
with it selected, or when the user types in it. Main pushes each change to the
renderer. The bell no longer prefixes `🔔` to the title, so there is one
visual per pane, and a bell in a split pane that isn't focused still shows on
its tab.

**Notifications.** When the window isn't focused, or the session isn't one of
the selected tab's panes, main shows a native notification:

- **Title:** the program's title (OSC 777), or else the session's title.
- **Body:** the program's text, or a short localized sentence for BEL.

Each session keeps at most one notification. A newer one replaces it, and
repeats within a second are dropped. A notification closes when its attention
clears or its session ends. Clicking it brings the window forward and selects
the session's tab and pane. Linux bodies are markup-escaped so they stay text.
macOS Dock bounces and Linux/Windows frame flashes are unchanged.

**Preferences.** `notifications.enabled` defaults to on and
`notifications.sound` to off. With sound on, OMXTerm uses the system's
notification sound, or `shell.beep()` when notifications are off. If
`notifications.soundFile` names an absolute path, main reads at most 4 MiB of
that file and the renderer plays it through Web Audio, leaving the page's
media policy closed. OMXTerm ships no sound. A user command hook on attention
is a later step.

## Tradeoffs

- **Claude Code progress:** Claude Code won't send progress to OMXTerm unless
  OMXTerm claims to be another terminal, which it doesn't, so its working mark
  appears only for programs that send OSC 9;4 to any terminal.
- **Clearing working:** a program that dies without clearing progress or asking
  for attention keeps its working mark until the session ends.
- **Focused-pane mark:** the attention mark on the focused pane of a focused
  window clears on the next keystroke. That is the old title marker's behavior,
  kept so a bell is never invisible.
