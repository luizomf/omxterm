# How OMXTerm works

OMXTerm is a desktop app for your command-line programs. It adds tabs, split panes, copy and paste, themes, and image previews around the shell already on your computer. It uses your graphics processor to draw terminal text and images.

To get started right away, head to [Installation](installation.md) or [Everyday use](usage.md).

## The terminal, the shell, and your programs

Three layers work together whenever you type a command:

| Layer                  | What it does                         | Examples                   |
| ---------------------- | ------------------------------------ | -------------------------- |
| **OMXTerm (terminal)** | Shows text and sends your keystrokes | Tabs, selection, font zoom |
| **Shell**              | Reads commands and starts programs   | Zsh, Bash, PowerShell      |
| **Program**            | Does the task you asked for          | Git, Neovim, SSH           |

When you type `pwd` and press Enter, OMXTerm sends those characters to your shell, the shell runs the command, and OMXTerm draws the output on screen. Your shell's prompt, aliases (short command names), and command history come from its settings files, such as `.zshrc` or `.bashrc`. Your font, window colors, and app shortcuts belong to OMXTerm.

## What happens when you open OMXTerm

1. **Preferences load.** OMXTerm reads `~/.config/omxterm/config.json` and your selected theme. On your very first launch, it creates editable starter files for you.
2. **A window and tab open.** Each tab starts with one shell; you can split a tab into panes, each with its own shell.
3. **Your shell starts.** OMXTerm connects the tab to your shell through a system text connection called a pseudo-terminal (**PTY**) and starts it in your home directory:
   - **macOS and Linux:** the default shell for your account.
   - **Windows:** PowerShell, unless you have configured another shell.

OMXTerm never modifies your shell startup files or injects custom shell scripts. If your prompt or aliases look different in Bash, see [shell startup preferences](usage.md#shell-preferences-do-not-load).

## How input and output flow

```text
Keyboard ─▶ OMXTerm ─▶ PTY ─▶ Shell / program
Screen   ◀─ OMXTerm ◀─ PTY ◀─ Shell / program
```

- **OMXTerm** turns the program's output (text, colors, cursor movement, full-screen apps, and inline images) into pixels on your screen.
- **The PTY** (pseudo-terminal) carries keystrokes from OMXTerm to your shell and returns the shell's output to the window.
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

- **No automatic downloads:** OMXTerm sends no telemetry and does not download updates on its own. Installing an add-on or using a network feature you choose can contact its service. Programs you run in the terminal can use the network as usual.
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
