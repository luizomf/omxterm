# How OMXTerm works

OMXTerm is the desktop window around your command-line tools. It provides tabs, GPU-accelerated text rendering, copy/paste, themes, and image previews, while your shell and the programs you run do the actual work.

To get started right away, head to [Installation](installation.md) or [Everyday use](usage.md).

## The terminal, the shell, and your programs

Three layers work together whenever you type a command:

| Layer                    | What it does                                             | Examples                    |
| ------------------------ | -------------------------------------------------------- | --------------------------- |
| **OMXTerm (Terminal)**   | Displays text/graphics and sends your keystrokes         | Tabs, selection, font zoom  |
| **Shell**                | Reads your commands, expands arguments, and starts tools | Zsh, Bash, PowerShell       |
| **Command-line program** | Runs the task you asked for                              | Git, Neovim, SSH, AI agents |

When you type `pwd` and press Enter, OMXTerm sends those characters to your shell, the shell runs the command, and OMXTerm draws the output on screen. Your custom prompt, aliases, and command history belong to your shell configuration (like `.zshrc` or `.bashrc`), while your font, window colors, and app shortcuts belong to OMXTerm.

## What happens when you open OMXTerm

1. **Preferences load.** OMXTerm reads `~/.config/omxterm/config.json` and your selected theme. On your very first launch, it creates editable starter files for you.
2. **A window and tab open.** Each tab gets its own terminal surface powered by Restty and Ghostty's terminal core over WebGL2.
3. **A local PTY session starts.** Once the display is ready, OMXTerm connects the tab to an operating-system pseudo-terminal (**PTY**) and starts your shell in your home directory:
   - **macOS and Linux:** your user account's default shell, started as an interactive login shell.
   - **Windows:** Windows PowerShell by default, or the shell configured via `windowsShell` (such as PowerShell 7 or Git Bash).

OMXTerm never modifies your shell startup files or injects custom shell scripts. If your prompt or aliases look different in Bash, see [shell startup preferences](usage.md#shell-preferences-do-not-load).

## How input and output flow

```text
Keyboard ─▶ OMXTerm ─▶ PTY ─▶ Shell / program
Screen   ◀─ OMXTerm ◀─ PTY ◀─ Shell / program
```

- **OMXTerm** turns the program's output (text, colors, cursor movement, full-screen apps, and inline images) into pixels using your GPU.
- **The PTY** (pseudo-terminal) is the operating system's pipe between OMXTerm and your shell.
- **Resizing:** when you resize the window or zoom, OMXTerm tells the PTY the new number of rows and columns, so apps like Vim or `btop` redraw to fit.

## Tabs and sessions

Each tab runs its own isolated shell process and keeps its own in-memory scrollback history:

- Changing directories or environment variables in one tab never affects another tab.
- Switching tabs keeps background sessions running and receiving output.
- Closing a tab ends its shell process; closing the last window quits OMXTerm. By default, OMXTerm asks for confirmation before closing a busy session.
- **Session persistence:** OMXTerm does not save or restore running sessions after you quit. If you want long-running sessions to stay alive in the background, run `tmux` inside your shell.

See [Everyday use](usage.md#windows-tabs-and-sessions) for tab and window shortcuts.

## Customization and conveniences

- **Your settings stay yours:** OMXTerm separates app settings (`config.json`), color palettes (`themes/*.json`), and reusable text snippets (`snippets.yaml`). Save settings or theme changes and press `Cmd+Shift+,` (macOS) or `Ctrl+Shift+,` (Linux/Windows) to reload them live; close and reopen the Snippets sidebar for snippet edits. See [configuration](configuration.md) for file formats and visual editing options.
- **Safe paste and path insertion:** [Protected Paste](usage.md#protected-paste) warns before pasting multiple lines into a program that hasn't enabled bracketed paste. Dragging files into the window inserts their shell-quoted paths so you can review them before pressing Enter.
- **Two ways to view images:** you can `Cmd+click` / `Ctrl+click` a local PNG or JPEG path to open a quick [overlay preview](usage.md#previewing-local-images), or display [inline terminal images](usage.md#inline-terminal-images) directly in the grid with tools like `chafa` and `pi`.

## Privacy and local data

- **No network calls:** OMXTerm makes zero network requests — no telemetry, analytics, or background update checks. The CLI tools you run inside your shell keep their normal network access.
- **Memory-only terminal output:** your terminal scrollback and images live only in memory while the tab is open. Local diagnostic logs record only app-level events and never log your commands, terminal output, or clipboard.

<a id="a-short-demonstration"></a>

## Quick tour

If you want to explore OMXTerm's main features in a few minutes (or demonstrate it to students and colleagues):

1. **Run a command:** try `pwd` and `echo "Hello from OMXTerm"`.
2. **Open a second tab:** press `Cmd+T` / `Ctrl+Shift+T`, run a command, and drag tabs to reorder them.
3. **Make room:** zoom in (`Cmd++` / `Ctrl++`), reset (`Cmd+0` / `Ctrl+0`), and toggle the title bar (`Cmd+Shift+D` / `Ctrl+Shift+D`) or tab bar (`Cmd+Shift+B` / `Ctrl+Shift+B`). When the title bar is hidden, hover near the top center to use the drag handle.
4. **Reload a setting live:** change `font.size` in `~/.config/omxterm/config.json` from `16` to `18`, save, and reload (`Cmd+Shift+,` / `Ctrl+Shift+,`).
5. **Insert a snippet:** toggle Snippets (`Cmd+Shift+S` / `Ctrl+Shift+S`), click the starter snippet to insert it into your prompt, and press Enter.
6. **Preview an image:** use **File → Open Local Image…** (or `Cmd+click` / `Ctrl+click` an image path in terminal output), then press `Escape` to return to your shell.

For deep technical details, see the [product specification](spec.md), [architecture decisions](adr/README.md), and [contributing guide](../CONTRIBUTING.md).
