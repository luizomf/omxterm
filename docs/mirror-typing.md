# Mirror Typing

Mirror Typing sends what you type to several panes of one tab at once, like
tmux's `synchronize-panes`. Use it to run the same commands on a few servers,
or in a few folders, side by side. It's an optional add-on (an extension).

## Availability

The official extension catalog offers Mirror Typing 0.2.0 on **Macs with
Apple silicon**, **Windows on ARM** and **Linux on ARM64**. Use OMXTerm 0.28.0
or later on Linux; on 0.27.0, Start sometimes stops right away (open it again
to retry). Other platforms aren't tested yet. See the
[developer notes](mirror-typing-development.md) for how it works.

## Install

1. Open **Settings → Extensions** and choose **Browse official extensions**.
2. Find **Mirror Typing**, choose **Install** and review the trust warning.
   Extensions run with your account's permissions; the warning is not a sandbox.

## Use it

1. Split a tab into two or more panes and click the pane you want to type in.
2. Open **Mirror Typing** from the **File** menu, the terminal's right-click
   menu or the Command Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Linux
   and Windows; type `mirror`).
3. Every pane is checked, and **Start mirroring** has focus: press **Enter** to
   mirror them all. To leave some out, uncheck them first, then choose **Start
   mirroring**.

OMXTerm returns to your tab. Each mirrored pane shows a small **↔** at its
top-right corner (and so does the tab, when the tab bar is showing); hover it to
see whether that pane is the source or a member. Type in any of them and the
others follow.

## Stop

Click the **↔** on any mirrored pane. From the keyboard, open the Command
Palette (`Cmd+Shift+P` on macOS, `Ctrl+Shift+P` on Linux and Windows) and press
`Esc` to close it again. The marks go away. Mirroring also stops on its own
when you:

- paste, insert a snippet or drop a file: the text goes only to the pane you're
  in;
- click a pane that isn't mirrored, switch tabs, or open Settings or Mirror
  Typing again;
- close a mirrored pane or minimize the window.

Stopping doesn't close shells or undo what was already typed. To mirror again,
open Mirror Typing and start a new group. New panes never join on their own.

## Good to know

- Only typing is copied: keys, Enter, Ctrl+C and the like. Paste, snippets,
  drops and mouse clicks always go to one pane.
- Each key is sent exactly as the pane you type in encodes it. Mirror panes that
  run the same kind of program (shells with shells, the same editor with the
  same editor), or the panes may read the keys differently.
- A key such as `Ctrl+V` inside a terminal program is still typing: each program
  handles it on its own, for example by reading its own clipboard.
- Nothing is saved. Mirroring ends when OMXTerm quits and never starts on its
  own.
- If a pane can't receive input, mirroring stops and a notice says some panes
  may have missed what you typed. Check them before typing again.
