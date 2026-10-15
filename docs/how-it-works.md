# How OMXTerm works

OMXTerm is the desktop window around your command-line work. It gives you tabs,
text rendering, copy/paste, colors, and a few conveniences; your shell and the
programs you launch do the actual work.

This guide explains that relationship and offers a [short demonstration](#a-short-demonstration)
you can follow or use to plan a video. To get started instead, go to
[Installation](installation.md).

## The terminal is not the shell

Three pieces work together:

| Piece                    | Its job                                                   | Example                       |
| ------------------------ | --------------------------------------------------------- | ----------------------------- |
| **OMXTerm**              | Display output and send your input to the running program | Tabs, selection, font zoom    |
| **Shell**                | Read commands, expand arguments, and launch programs      | Zsh, Bash, PowerShell         |
| **Command-line program** | Do the requested work                                     | Git, Vim, SSH, a coding agent |

Type `pwd` and press Enter. OMXTerm sends your input; the shell handles the
command; OMXTerm displays the result. A prompt, aliases, and command history
come from your shell setup, not from OMXTerm's theme.

The same distinction applies to remote work and AI tools: running `ssh` connects
through your SSH client, and running a coding agent starts your assistant inside the shell.
OMXTerm acts as your unified, responsive workbench for all of them.

## From opening the app to seeing a prompt

1. **Load preferences.** OMXTerm reads `config.json` and the selected theme.
   On a first launch without a configuration, it creates editable starter files.
2. **Create a window and its first tab.** Each tab gets its own terminal display.
3. **Prepare the display.** Fonts and the terminal engine initialize with a
   working WebGL2 graphics backend. The shell starts only after this succeeds.
4. **Start a local session.** OMXTerm connects the tab to a pseudo-terminal, or
   **PTY**: the operating-system connection that lets a shell behave as if it
   were attached to a terminal, with keyboard input, output, and a screen size.
5. **Run the shell in your home folder.** On macOS and Linux, this is your
   account's login shell. On Windows, it is Windows PowerShell by default, or
   the installed executable selected by `windowsShell`.

Your shell decides which startup files to read; OMXTerm does not edit or inject
them. In particular, a Bash login shell does not automatically read `.bashrc`.
See [shell startup preferences](usage.md#shell-preferences-do-not-load) if your
prompt or aliases differ from another terminal.

## The round trip behind each command

```text
Your keyboard
     │
     ▼
Terminal display → session adapter → Electron main → local PTY → shell/program
     ▲                                                  │
     └──────────── output returns through the same route ┘
```

The **Terminal Surface** is OMXTerm's display-and-input module. It uses Restty,
with Ghostty's terminal core, to interpret terminal output and draw text and
supported inline images through WebGL2. Output includes ordinary characters and
control sequences: instructions for colors, cursor movement, screen clearing,
and other terminal behavior. This is why a full-screen editor can update a
single area instead of printing a new page every time.

The **session adapter** carries input, output, resize, and close operations.
It connects the portable display module to Electron through a small typed
bridge. Electron's **main process** owns native windows, the PTYs, configuration
files, and operating-system actions such as clipboard access and opening links.
The display module does not start native processes directly.

Resizing the window or changing font zoom recalculates how many rows and columns
fit and sends that size to the same session. The shell or editor can then redraw
for the new space.

## Tabs keep separate work running

Each tab has its own shell or launched program, screen, and in-memory scrollback.
Changing folders in one tab does not move another tab. Switching tabs keeps the
hidden session running and collecting output; returning to it shows its current
state. Reordering tabs changes their positions, not their processes.

A few useful boundaries:

- **Tab bar:** appears with two or more tabs; hiding it leaves keyboard navigation
  available.
- **Zoom:** applies to all tabs in the current window, not other windows.
- **Closing:** closing a tab ends its session; closing the last window quits the
  app. By default, OMXTerm asks before closing busy work. Windows asks for every
  live session because it cannot reliably identify an idle shell.
- **Persistence:** OMXTerm does not restore tabs or running sessions after quit.
  Use a session manager such as tmux when you need work to survive a closed tab.

See [Everyday use](usage.md#windows-tabs-and-sessions) for controls and shortcuts.

## Customization belongs to you

OMXTerm separates application preferences (`config.json`), terminal colors (a
selected theme file), and reusable text (`snippets.json`). Its first-launch
starter files are editable defaults, not an ongoing synchronization service.
Your shell's prompt, aliases, and editor settings remain separate.

OMXTerm validates these files and shows actionable errors without rewriting your
preferences. Saving alone does not reload them. The [configuration guide](configuration.md)
owns file locations, examples, [Studio's visual editing workflow](configuration.md#edit-visually-with-omxterm-studio),
and [when changes take effect](configuration.md#reloading-user-configuration).

Transparency affects the terminal background rather than fading the entire
window. Text, selection, and inline images keep their normal opacity. Blur comes
from the operating system or desktop compositor; a program that paints its own
background can remain opaque.

## Conveniences around the session

**Input is not command validation.** Paste, snippets, and dropped-file paths
send text to the selected program. Protected Paste can ask about multiline or
control-character input, but cannot decide whether a command is safe. A snippet
is reusable text, not a separate task runner. See [copy and paste](usage.md#copy-and-paste),
[file paths](usage.md#inserting-file-and-folder-paths), and [snippets](configuration.md#snippets)
for controls and precautions.

**Local previews and inline images are different.** An explicitly opened local
PNG/JPEG appears in a temporary overlay; its path always names the computer
running OMXTerm, even when SSH printed it. Inline images arrive as terminal
output from programs such as Chafa or Pi and stay in the terminal grid. See
[local previews](usage.md#previewing-local-images) and
[inline image setup](usage.md#inline-terminal-images) for the supported paths.

## What stays on your computer

Preferences and bounded diagnostic logs are local files. Terminal scrollback and
images stay in memory; OMXTerm does not save a terminal transcript. Your shell
and other programs may save their own history or files.

OMXTerm makes no application network requests. Programs you run retain their
usual network access, and explicitly opened web links go to your browser.
Linux uses X11/XWayland and runs without Chromium's sandbox; macOS and Windows
keep that sandbox enabled. The [installation guide](installation.md) covers
platform requirements and first-launch approval.

## A short demonstration

Start with a roomy window, a harmless local PNG/JPEG, and settings backed up.
Use menu labels when recording so viewers can follow on another platform; on
Linux and Windows, press and release **Alt alone** to open the menu.

1. **Show a normal shell.** Run `pwd` and `echo Hello from OMXTerm`. Explain the
   terminal/shell distinction while the audience sees the round trip.
2. **Open a second tab.** Run a different command there, switch back, and drag
   the tabs to reorder them. Show that each keeps its own output.
3. **Make room.** Zoom in, reset with Actual Size, hide the title/tab bars, and
   bring them back. With the title hidden, show the hover-revealed drag handle.
4. **Change one preference.** Change `font.size` from `16` to `18`, save, and
   reload. The text changes without restarting the shell. Optionally show the
   editable theme or modest transparency.
5. **Use a saved command.** Open Snippets, insert the single-line greeting with
   `execute: false`, and press Enter. Explain that it is reusable text, not a
   separate task runner.
6. **Preview an image.** Use File → Open Local Image, then Escape to return to
   the same tab. If Chafa is installed, contrast it with
   `chafa -f kitty /path/to/image.png` using your real image path.
7. **Close deliberately.** Type `exit` in one shell and show that only its tab
   ends. Explain that persistent work belongs in a tool such as tmux.

For implementation details after the overview, follow the
[product contract](spec.md), [architecture decisions](adr/README.md), or
[contribution guide](../CONTRIBUTING.md).
