# Shell integration

With a few lines in your shell's startup file, your shell tells OMXTerm where
each command starts and ends, and its exit code (OSC 133 command marks). An
agent you allow in a window can then wait for a command to finish and know
whether it worked, instead of guessing from the screen
([agent API](dev/agent-api.md#wait)).

OMXTerm never edits your startup files or adds anything to your shell
([ADR 0054](adr/0054-read-command-marks-for-agents.md)). It only reads the
marks your shell prints, so the lines are yours to keep or remove. They are
harmless in other terminals, which ignore marks they don't use or use them
the same way.

## zsh

Add this to the end of `~/.zshrc`:

```zsh
# Command marks for the terminal (OSC 133)
__omxterm_precmd() {
  local code=$?
  [[ -n $__omxterm_ran ]] && print -n "\e]133;D;$code\a"
  __omxterm_ran=
  print -n "\e]133;A;redraw=0\a"
}
__omxterm_preexec() { __omxterm_ran=1; print -n "\e]133;C\a"; }
precmd_functions=(__omxterm_precmd $precmd_functions)
preexec_functions+=(__omxterm_preexec)
```

## bash

bash 4.4 or newer (macOS ships bash 3.2; Homebrew's bash is current). Add this
to the end of `~/.bashrc`:

```bash
# Command marks for the terminal (OSC 133), bash 4.4 or newer
if (( BASH_VERSINFO[0] * 100 + BASH_VERSINFO[1] >= 404 )); then
  __omxterm_prompt() {
    local code=$?
    [[ -n $__omxterm_ran ]] && printf '\e]133;D;%s\a' "$code"
    __omxterm_ran=
    printf '\e]133;A;redraw=0\a'
    return "$code"
  }
  PROMPT_COMMAND="__omxterm_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
  # As a command starts: the mark, and a flag set by an empty array lookup.
  PS0+='\e]133;C\a${__omxterm_none[__omxterm_ran=1]}'
fi
```

## PowerShell

Windows PowerShell 5.1 and PowerShell 7. Add this to the end of your profile
(`notepad $PROFILE`; if it doesn't exist yet, create it first with
`New-Item -Force $PROFILE`):

```powershell
# Command marks for the terminal (OSC 133)
$global:__omxtermPrompt = $function:prompt
$global:__omxtermLastId = (Get-History -Count 1).Id
function global:prompt {
  $ok = $?
  $id = (Get-History -Count 1).Id
  $code = if ($ok) { 0 }
    elseif ($Error[0].InvocationInfo.HistoryId -eq $id) { 1 }
    else { $global:LASTEXITCODE }
  $e = [char]27; $a = [char]7
  $mark = if ($id -and $id -ne $global:__omxtermLastId) { "$e]133;D;$code$a" } else { "" }
  $global:__omxtermLastId = $id
  "$mark$e]133;A;redraw=0$a" + (& $global:__omxtermPrompt)
}
```

If Windows PowerShell says running scripts is disabled, it isn't loading any
profile; `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` lets it load
yours. A failed cmdlet reports exit code 1; a program reports its own.

## fish

fish 4.0 and newer print the marks themselves
([fish's terminal compatibility notes](https://fishshell.com/docs/current/terminal-compatibility.html)),
so there's nothing to add.

## Check it

Open a new window, turn on **Window → Allow Agents in This Window** and split
the pane. In one pane, run `"$OMXTERM_CTL" list` to see the other pane's id
(the one not marked `self`), then:

```sh
"$OMXTERM_CTL" send s2 --text 'false' --enter --command --timeout 5000
```

In PowerShell:

```powershell
& $env:OMXTERM_CTL send s2 --text 'cmd /c exit 1' --enter --command --timeout 5000
```

It prints `command-end 1`. Without the marks, it says the shell doesn't
report when commands end.

The prompt mark ends in `redraw=0`, which keeps your prompt on screen when
you resize the window. One thing does change: after output that didn't end
its line (`printf foo`), the prompt starts on a new line instead of right
after it, as in other terminals that read these marks. The prompt mark is what
does it, so without these lines nothing changes.

## Where marks don't arrive

- **tmux** keeps its panes' marks to itself, so commands run inside tmux
  aren't reported. tmux itself is one long command of the shell that started
  it.
- **ssh** reports the remote shell's commands only when that computer has the
  same lines. Otherwise the whole session is one command.
- **cmd.exe** can't put a command's exit code in its prompt, so it has no
  lines.
