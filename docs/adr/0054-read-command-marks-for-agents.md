# Read command marks for agents

Status: accepted. Amends
[ADR 0013](0013-do-not-inject-shell-integration.md), whose "does not infer
prompt state" now has one exception, and implements slice 8 of
[ADR 0052](0052-let-a-local-agent-drive-a-granted-window.md) in part
([#1027](https://github.com/luizomf/omxterm/issues/1027)).

## Context

Shells can mark their prompts and commands with OSC 133 (FinalTerm's
semantic prompts): `A` where a prompt starts, `B` where the typed command
starts, `C` where it runs, and `D;<exit code>` where it ended. fish 4.0 and
later print them by default, per fish's documentation; zsh, bash and
PowerShell print them only through a few lines of shell integration.

OMXTerm is mostly used to run agents, and an agent that types a command can
today only guess when it finished: `wait` answers when the pane goes quiet, or
when given text shows up. Command marks answer it exactly, with the exit code.
Users also jump from prompt to prompt in other terminals.

Two choices were open:

- **Injecting integration or documenting it.** Ghostty, kitty and VS Code
  inject their own integration through `ZDOTDIR`, `--rcfile` or
  `ENV`. That works with no setup, but it means OMXTerm runs code in the
  user's shell startup, which ADR 0013 refuses, and it still never reaches a
  shell over ssh or inside tmux.
- **The first use.** An exact end of a command, with its exit code, for the
  agent API; or prompt-to-prompt navigation for users.

Restty 0.3.0 reads OSC 133 in its output filter, but keeps only four booleans
for prompt clicks and drops the exit code. The Ghostty core marks prompt rows
for itself, but the WASM build exports nothing to find them.

## Decision

**Opt-in shell integration, documented, never injected.** The [shell
integration guide](../shell-integration.md) has a few lines for zsh, bash
(4.4 or later) and PowerShell (Windows PowerShell 5.1 and PowerShell 7) that the user adds to their own startup file; fish needs none.
OMXTerm reads the marks a shell prints and never asks for them: no startup
file, environment variable or argument changes. Their prompt mark says
`redraw=0`: the Ghostty core otherwise clears a marked prompt on resize for
the shell to redraw. The one visible change is the core's: a marked prompt
after output that didn't end its line starts on a new line, as in Ghostty and
kitty.
The same lines work in a shell on another computer, over ssh or SSH Connect,
which injection can't reach. Inside tmux the marks don't reach OMXTerm, since
tmux keeps them.

**Main reads the marks.** Main scans each pane's output for OSC 133, as it
does for OSC 7 (ADR 0013), with no Restty or WASM change and nothing sent to
the window. The renderer's own handling of OSC 133 is unchanged. Main notes
that a pane's shell prints marks, and keeps each command end with the pane's
output position at the end of the chunk that holds it: the last 64 per pane,
dropped when the session ends. A mark is at most 256 characters; a longer,
cancelled or unterminated one is ignored. An exit code is the integer after
`D` (from -2³¹ to 2³²−1, for Windows codes), or nothing. Marks are the
program's text like any output: an exit code is reported, never trusted for
anything else, and never logged.

**The first use is the agent's `wait`.** `commandEnd: true` (CLI and MCP
`--command`) waits for the first command end past `after`, and answers
`command-end` with its `exitCode` and offset, once the window shows that
output. A command still running at `after` is the one that answers, which is
what text typed into it (an answer to its prompt) wants, and what a wait asked
again after a timeout needs; the CLI's timeout says which offset to wait from.
A pane whose shell never printed a mark answers the error `no-command-marks`
once it has been quiet for a second, instead of running into its timeout; the
CLI adds the offset its text was sent at, so the agent can wait with `idle` or
`match` instead. `match`, `idle` and `exited` keep their meaning, and the
first condition met answers.

**Navigation later.** Jumping between prompts needs the prompt rows, which
only the core knows; that waits for a core export, and nothing in the UI
changes now.

## Tradeoffs

- **Setup.** Users add the lines themselves. In return OMXTerm never runs
  code in their shell, and an agent learns at once when they're missing.
- **One command, as the shell sees it.** An ssh session, tmux or a REPL the
  agent starts is one command until it quits. A remote shell with the lines
  marks its own commands.
- **Type-ahead.** A command typed while another still runs is answered with
  the running one's end, so an agent should wait for one command before
  typing the next.
- **bash before 4.4** has no hook for a command's start, so the lines skip
  it: no marks, and an agent learns so at once.
- **fish** is taken at its word; it wasn't run here.
- **Windows.** ConPTY passes the marks through: checked with OMXTerm's bundled
  `conpty.dll` on Windows 11 ARM64 (build 26300, where the inbox one passes
  them too), for Windows PowerShell 5.1 and PowerShell 7.7. PowerShell has no
  hook for a command's start, so its lines mark only prompts and ends, and a
  failed cmdlet reports 1. cmd.exe can't report exit codes in its prompt and
  has no lines.
