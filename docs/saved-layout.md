# Saved Layout

Saved Layout remembers how your windows are arranged (their tabs, split panes
and the folder each pane was in) and brings that back with a fresh shell in
every pane: when OMXTerm starts, and whenever you open a window you saved. It's
an optional add-on (an extension).

It brings back the structure, nothing else: no output, no running programs, no
command history and no SSH connections. Your shell starts normally, as if you
had opened the tab yourself and changed to that folder.

## Install it

Saved Layout needs OMXTerm 0.27.0 or later on macOS, Linux, or Windows on ARM.
Reopening windows at startup needs Saved Layout 0.3.0, which needs a newer
OMXTerm than 0.27.

1. Open **Settings → Extensions** and choose **Browse official extensions**.
2. Find **Saved Layout**, choose **Install** and review the trust warning.
   Extensions run with your account's permissions; they aren't sandboxed.

## Your windows come back

With Saved Layout 0.3.0 or later on a newer OMXTerm, there's nothing to do:
quit OMXTerm (or let it update, or even crash) and the next start reopens the
same windows, tabs, splits, focused panes and folders. Closing one of several
windows forgets that one. Window positions and sizes aren't kept, and starting
OMXTerm with `-e` to run a command opens just that. Open more windows with
**File → New Window**: windows of a second OMXTerm started separately aren't
remembered.

To stop it, disable or remove Saved Layout in **Settings → Extensions**; that
also deletes the remembered windows.

## Save a window for later

1. Arrange a window the way you like it: tabs, splits, folders.
2. Open **Saved Layout** from the **File** menu or the Command Palette.
3. Choose **Save this window**.

Later, open **Saved Layout** again and choose **Open in a new window**. The new
window gets the same tabs, splits, focused pane and folders, each with a new
shell. Your current windows stay as they are.

There's one saved layout. **Replace with this window** overwrites it, and
**Forget** removes it. Settings and extension tabs aren't saved, and a window
can have at most 16 tabs and 32 panes.

## Bring folders back

OMXTerm only knows a pane's folder when the shell reports it (a standard signal
called OSC 7), and most shells don't do that out of the box. Without it, panes
reopen in the folder they started in, usually your home folder, and the Saved
Layout page says so. Splits work the same way: a new split starts in the folder
its pane last reported.

To turn it on, add a few lines to your shell's startup file, then open a new
tab.

**zsh** (`~/.zshrc`, the macOS default):

```zsh
_report_folder() { printf '\033]7;file://%s%s\033\\' "$HOST" "$PWD"; }
autoload -Uz add-zsh-hook
add-zsh-hook precmd _report_folder
```

**bash** (`~/.bashrc`, the default on most Linux systems):

```bash
_report_folder() { printf '\033]7;file://%s%s\033\\' "$HOSTNAME" "$PWD"; }
PROMPT_COMMAND="_report_folder${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
```

**PowerShell** (the file named by `$PROFILE`, the Windows default):

```powershell
function prompt {
  $location = $ExecutionContext.SessionState.Path.CurrentLocation
  if ($location.Provider.Name -eq 'FileSystem') {
    $path = $location.ProviderPath -replace '\\', '/'
    $hostName = [System.Net.Dns]::GetHostName()
    [Console]::Write("$([char]27)]7;file://$hostName/$path$([char]27)\")
  }
  "PS $location> "
}
```

On Windows, PowerShell only runs `$PROFILE` if scripts are allowed; if it
doesn't, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. Many
prompt tools (such as Starship or Oh My Posh) can report the folder too; check
their documentation.

If a saved folder no longer exists, that pane opens in your home folder and the
page tells you how many did.

## Good to know

- A saved window opens only when you choose it.
- Both the saved window and the remembered windows live in OMXTerm's profile
  folder, not in your configuration file. Disabling, updating or removing the
  extension keeps the saved window (use **Forget** first if you don't want to
  keep it) and deletes the remembered ones.
- A pane running SSH Connect or a command started with `-e` reopens as a plain
  shell in your home folder.
- Folder reports aren't checked: a program, or a remote shell over a plain
  `ssh`, can report a folder that also exists on your computer.

How it works and how to change it: [developer notes](saved-layout-development.md).
