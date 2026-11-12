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

With Saved Layout 0.3.0 or later on OMXTerm 0.28.0 or later, there's nothing to do:
quit OMXTerm (or let it update, or even crash) and the next start reopens the
same windows, tabs, splits, focused panes and folders. Closing one of several
windows forgets that one. Window positions and sizes aren't kept, and starting
OMXTerm with `-e` to run a command opens just that. Opening OMXTerm again while
it runs adds a window to the running one, so it's remembered too (unless that
OMXTerm was itself started with `-e`).

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

## Folders

On macOS and Linux, OMXTerm 0.28.0 and later find each pane's folder on their
own: they read where the pane's shell is, the same way tmux does,
without changing your shell. A program that changes its own folder (or an
`ssh` session) doesn't move the pane's folder. Splits use the same folder.

On Windows, PowerShell has to report its folder (a standard signal called
OSC 7), which it doesn't do out of the box. Without it, panes reopen where they
started, usually your home folder, and the Saved Layout page says so. To turn
it on, add this to your profile, then open a new tab.

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

PowerShell only runs `$PROFILE` if scripts are allowed; if it doesn't, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. Many
prompt tools (such as Starship or Oh My Posh) can report the folder too; check
their documentation.

If a saved folder no longer exists, that pane opens in your home folder and the
page tells you how many did.

## Good to know

- A saved window opens only when you choose it.
- Both the saved window and the remembered windows live in OMXTerm's profile
  folder, not in your configuration file. Updating the extension keeps both.
  Disabling or removing it keeps the saved window (use **Forget** first if you
  don't want to keep it) and deletes the remembered ones.
- A pane running SSH Connect or a command started with `-e` reopens as a plain
  shell in your home folder.
- Folder reports aren't checked: a program, or a remote shell over a plain
  `ssh`, can report a folder that also exists on your computer.

How it works and how to change it: [developer notes](saved-layout-development.md).
