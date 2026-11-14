# Everyday OMXTerm use

[Install OMXTerm](installation.md), then follow [your first session](../README.md#first-session) to run a command. OMXTerm opens your default shell in your home folder (Windows uses Windows PowerShell by default).

For fonts, themes, shortcuts, and snippets, see [Configuration](configuration.md). [How it works](how-it-works.md) explains the relationship between the terminal, your shell, and running sessions.

## Windows, tabs, and sessions

Choose **File → New Tab** for another session in the same window, or **File → New Window** for a separate window. Each Terminal Tab starts with one independent shell and can hold several panes. **Settings…** opens a graphical tab without a shell. Closing the last application tab closes the window.

The tab bar appears when a window has two or more tabs. Click a tab to select it, drag tabs to reorder, or use the next/previous shortcuts below. **View → Toggle Tab Bar** hides or shows it. Typing `exit` closes that pane, or the tab if it is the last pane.

### Split panes

Choose **View → Pane → Split Right** (`Cmd+D` / `Ctrl+Shift+O`) or **Split Down** (`Cmd+Shift+E` / `Ctrl+Shift+E`). Each pane has its own shell. Click a pane or use the focus shortcuts below; typing, copy, paste, Find, snippets, and dropped paths go to the focused pane. Drag the divider to resize. **Swap Pane Left**, **Right**, **Above** or **Below** trades the focused pane with its neighbor and keeps its shell running; these have no default shortcut, so assign one in Settings if you use them. **Close Pane** (`Cmd+Option+W` / `Ctrl+Shift+K`) ends that shell and gives its space to the neighbor.

The **Close Pane** context-menu action is available in split tabs. Closing a pane, tab, or window with a running command asks for confirmation. Disable confirmation with `"confirmClose": false` in `config.json`.

### Source previews

The optional [Saved Layout](saved-layout.md) add-on saves a window's tabs, splits and folders and opens them again with fresh shells. The optional [Mirror Typing](mirror-typing.md) add-on types into several panes of a tab at once.

## Window controls

- **Zoom:** changes text size in the current window (`Cmd++` / `Cmd+-` on macOS; `Ctrl++` / `Ctrl+-` on Linux and Windows). **Actual Size** (`Cmd+0` / `Ctrl+0`) resets it.
- **View → Toggle Title Bar:** hide or show the title bar (`Cmd+Shift+D` / `Ctrl+Shift+D`). Drag the three-dot handle at the top to move a window without its title bar.
- **View → Toggle Full Screen:** use `Ctrl+Cmd+F` on macOS or `F11` on Linux/Windows.
- **Window → Always on Top:** keep the current window above normal windows.
- **Window → Allow Agents in This Window:** let a program you run, such as a coding agent, drive this window (see [Letting an agent drive a window](#letting-an-agent-drive-a-window)).

These toggles affect the current window. Set defaults for new windows in [Configuration](configuration.md).

## Built-in platform shortcuts

The application menu displays active shortcuts, including custom bindings.

| Action                        | macOS                           | Linux and Windows               |
| ----------------------------- | ------------------------------- | ------------------------------- |
| New Window / New Tab          | `Cmd+N` / `Cmd+T`               | `Ctrl+Shift+N` / `Ctrl+Shift+T` |
| Close Tab / Close Window      | `Cmd+W` / `Cmd+Shift+W`         | `Ctrl+Shift+W` / `Ctrl+Shift+Q` |
| Quit                          | `Cmd+Q`                         | `Ctrl+Alt+Shift+Q`              |
| Next / Previous Tab           | `Ctrl+Tab` / `Ctrl+Shift+Tab`   | `Ctrl+PageDown` / `Ctrl+PageUp` |
| Select Tab 1–9                | `Cmd+1` … `Cmd+9`               | `Alt+1` … `Alt+9`               |
| Split Right / Down            | `Cmd+D` / `Cmd+Shift+E`         | `Ctrl+Shift+O` / `Ctrl+Shift+E` |
| Close Pane                    | `Cmd+Option+W`                  | `Ctrl+Shift+K`                  |
| Focus Next / Previous Pane    | `Cmd+]` / `Cmd+[`               | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Focus Pane by Direction       | `Cmd+Option+Arrow`              | `Alt+Shift+Arrow`               |
| Swap Pane by Direction        | unbound                         | unbound                         |
| Equalize Panes                | `Cmd+Ctrl+=`                    | `Ctrl+Shift+0`                  |
| Copy / Paste                  | `Cmd+C` / `Cmd+V`               | `Ctrl+Shift+C` / `Ctrl+Shift+V` |
| Select All / Find             | `Cmd+A` / `Cmd+F`               | `Ctrl+Shift+A` / `Ctrl+Shift+F` |
| Zoom In / Out                 | `Cmd++` / `Cmd+-`               | `Ctrl++` / `Ctrl+-`             |
| Actual Size                   | `Cmd+0`                         | `Ctrl+0`                        |
| Full Screen                   | `Ctrl+Cmd+F`                    | `F11`                           |
| Toggle Pane Marks             | `Cmd+Shift+H`                   | `Ctrl+Shift+H`                  |
| Toggle Tab Bar / Title Bar    | `Cmd+Shift+B` / `Cmd+Shift+D`   | `Ctrl+Shift+B` / `Ctrl+Shift+D` |
| Toggle Snippets               | `Cmd+Option+S`                  | `Ctrl+Shift+S`                  |
| Files / SSH Connect (add-ons) | `Cmd+Option+F` / `Cmd+Option+O` | unbound                         |
| Mirror Typing (add-on)        | `Cmd+Shift+M`                   | `Ctrl+Shift+M`                  |
| Save Layout (add-on)          | `Cmd+Shift+L`                   | `Ctrl+Shift+L`                  |
| Allow Agents in This Window   | unbound                         | unbound                         |
| Reload Configuration          | `Cmd+Shift+,`                   | `Ctrl+Shift+,`                  |

If `+` shares a key with `=`, press Shift as well. On Linux and Windows, press and release **Alt** to open the application menu; on macOS use the system menu bar. Customize shortcuts in [Settings](configuration.md#keybinds).

## Command Palette

Choose **View → Command Palette…**, then type part of an action name, use the arrow keys to select it, and press **Enter** or click. **Escape** or clicking outside cancels. The default shortcut is `Cmd+Shift+P` on macOS and `Ctrl+Shift+P` on Linux/Windows; change it in **Settings → Shortcuts** or through [`keybinds.commandPalette`](configuration.md#keybinds). The palette is also available from the menu if unbound.

The palette searches actions in the selected interface language. It does not search terminal output or provide fuzzy search/history. Use **Edit → Find…** to search terminal text. The palette retains the tab and pane it opened for; if either closes, it will not run an action against another target.

## Copy and paste

Select terminal text with the mouse, then choose **Edit → Copy**, use its shortcut, or right-click and choose **Copy**. If Vim or `tmux` captures mouse clicks, hold **Shift** while selecting. Use **Edit → Paste** or its shortcut to paste.

Double-click selects a word, and triple-click selects the whole line, wrapped rows included. To fix a selection that's a little off, **Shift+click** (or Shift+drag): a click before the selection moves its start, a click after it moves its end, and a click inside moves the nearer end. The other end stays where it was. When Vim or `tmux` captures mouse clicks, Shift+click adjusts the same way, and Shift+drag starts a new selection.

`Ctrl+C` interrupts the running command. `Ctrl+V` is sent to the terminal program. To hide the terminal context menu, clear **Terminal context menu** in **Settings → Terminal**; existing Edit actions and shortcuts remain available.

### Searching terminal history

Choose **Edit → Find…** (`Cmd+F` / `Ctrl+Shift+F`) to search the focused pane. Matches highlight as you type. Press **Enter** or **↓** for the next match, **Shift+Enter** or **↑** for the previous one, and **Escape** to close search. Click the terminal to return keyboard input to the program while keeping the search bar open. Search covers the current screen and recent terminal history kept in memory. Each pane keeps its own query.

### Exporting terminal text

Right-click the terminal and choose **Export Selection…** when text is selected, or **Export Terminal Content…** to save the pane's recent terminal history and current screen. A full-screen program such as Vim may temporarily replace the terminal history with its own screen; in that case, only that screen is exported. Choose a destination in the save dialog. Export is user initiated and saves plain UTF-8 text; it does not record terminal output automatically.

### Protected Paste

When pasted text contains multiple lines or control characters, OMXTerm asks before sending it unless the terminal program tells OMXTerm it can handle pasted text safely. The same protection applies to snippets and dropped paths.

## Inserting file and folder paths

Drag files or folders from your file manager into OMXTerm to insert their paths in the focused pane. You can also copy files and paste them. OMXTerm quotes paths for POSIX shells such as Bash or Zsh on macOS/Linux and for PowerShell on Windows; Command Prompt and other shells may need different quoting. This assumes insertion at a new argument, not inside existing quotes.

Review the inserted text before pressing Enter, especially in Git Bash, WSL, or an SSH session. In a shell, pasted text with line breaks can send more than one command.

## Opening visible web links

Hold **Cmd** (macOS) or **Ctrl** (Linux/Windows) while hovering over an `http://` or `https://` URL in terminal output, then click the underlined link to open it in your default browser.

## Previewing local images

OMXTerm can preview local PNG and JPEG files in an overlay. Hold **Cmd** (macOS) or **Ctrl** (Linux/Windows) and click a visible image path or `file:///` URL, or choose **File → Open Local Image…**. A relative path prompts you to choose its base folder. Press **Escape** or click outside the image to close the preview. Paths refer to files on the machine running OMXTerm, including paths printed by an SSH session.

## Inline terminal images

OMXTerm supports a subset of the Kitty graphics protocol for inline images. Tools that speak it include `kitten icat --transfer-mode=stream`, `timg -pk`, yazi previews and snacks.nvim in Neovim. With [Chafa](https://hpjansson.org/chafa/), run:

```sh
chafa -f kitty /path/to/image.png
```

Inside tmux, turn on passthrough with `set -g allow-passthrough on` in `~/.tmux.conf`. Chafa also needs `--passthrough tmux` there; the other tools above wrap their output for tmux themselves. `screen` isn't supported.

With Pi, enable Kitty images in its settings (this option works across shells):

```json
{
  "terminal": {
    "images": "kitty"
  }
}
```

Or, in a POSIX shell, start one session with `PI_IMAGE_PROTOCOL=kitty pi`. Inline images stay with their terminal cells while scrolling, zooming, or resizing.

## Program progress and attention

Programs such as coding agents can tell OMXTerm what they're doing:

- **Working (an open ring):** while a program reports progress (OSC 9;4), its pane and tab show a small open ring. It goes away when the program says it's done, asks for attention, or exits.
- **Attention (a solid dot):** when a program rings the bell or sends a notification (OSC 9 or OSC 777), its pane and tab show a solid dot until you look at that pane. Bells stay silent.

If the window is in the background, or the program's tab isn't selected, OMXTerm also shows a desktop notification with the program's message. Click it to jump to that tab. Sound is off by default. To turn notifications off or add a sound, see [Notifications](configuration.md#notifications).

Most agents only send these to terminals they recognize, so you may need to tell them to:

- **Claude Code:** set `preferredNotifChannel` to `iterm2` (OSC 9) or `ghostty` (OSC 777, with a title) in `~/.claude/settings.json`. Claude Code shows its own progress only in terminals it recognizes, so its working mark doesn't appear in OMXTerm.
- **Codex:** in `~/.codex/config.toml`, under `[tui]`, set `notification_method = "osc9"`.
- **Gemini CLI:** turn on `general.enableNotifications`; it sends OSC 777 by default.

You can test it from a shell in a background tab:

```sh
sleep 3; printf '\e]777;notify;Build;Finished\e\\'
```

## Letting an agent drive a window

You can let a program you run, such as a coding agent in one pane, work the panes of its window: type commands, press keys (arrows, function keys) in full-screen programs, read their output and wait for them to finish. It only ever reaches the windows you allow.

1. Choose **Window → Allow Agents in This Window** (or find it in the Command Palette). A `◆` appears on every pane and tab of that window.
2. Ask the agent to use OMXTerm. Every pane has `OMXTERM_CTL`, the path of OMXTerm's small client, so the agent can run `"$OMXTERM_CTL" guide` to learn how, and `"$OMXTERM_CTL" status` to check (on Windows, in PowerShell, `& $env:OMXTERM_CTL status`). Before you allow it, `status` tells the agent which menu item to ask you for.
3. To stop, click any pane's `◆`, or choose the menu item again. Closing the window or quitting OMXTerm also stops it.

For example, from one pane an agent can run a command in the pane next to it:

```sh
"$OMXTERM_CTL" list
"$OMXTERM_CTL" send s2 --text 'npm test' --enter --wait
"$OMXTERM_CTL" read s2 --lines 40
```

Agents that speak MCP, such as Claude Code and Codex, can also use OMXTerm as an MCP server, `"$OMXTERM_CTL" mcp`. The guide says how to register it. Register it once from an OMXTerm pane and start a new agent session; from then on it works in every window you allow, and allowing a window later needs no restart.

Inside tmux, a pane gets the tmux server's environment, not the OMXTerm pane's, so agents there don't see `OMXTERM_CTL`. Add this line to `~/.tmux.conf` and attach again from an OMXTerm pane; new tmux windows and panes then have the variables:

```sh
set -ga update-environment " OMXTERM_CTL OMXTERM_PANE OMXTERM_PROFILE"
```

A tmux pane opened before that keeps its old environment; open a new one for the agent.

Allowing a window lets an agent do what you could do at its keyboard, including in SSH sessions open there, and read its scrollback. That includes the window's shortcuts, such as opening tabs, zooming, copying or closing the window, but not allowing or stopping agents, pasting your clipboard, or closing anything still running: those stay yours. Keep sensitive sessions in another window. The [Agent API reference](dev/agent-api.md) has every command.

## About and credits

Choose **OMXTerm → About OMXTerm** for the running version, project links, contributors, issue tracker, and license. Press **Escape** or choose **Close** to return to your terminal or Settings. Contributor credits are in [CONTRIBUTORS.md](../CONTRIBUTORS.md).

## Troubleshooting

### The download will not open

See the [installation guide](installation.md) for platform-specific steps.

| Symptom                               | Next step                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| macOS blocks the first launch         | Open **System Settings → Privacy & Security → Security → Open Anyway**. See [first launch](installation.md#first-launch-on-macos). |
| Linux says `Permission denied`        | Run `chmod +x OMXTerm-*.AppImage`; check that the partition allows execution.                                                      |
| Linux reports FUSE or mount errors    | Try `./OMXTerm-*.AppImage --appimage-extract-and-run` or use `linux_install.sh`.                                                   |
| Linux reports `GLIBC_2.xx not found`  | Check the [Linux requirement](installation.md#linux).                                                                              |
| Linux reports executable format error | Run `uname -m` and choose the matching AppImage architecture.                                                                      |
| Checksum verification fails           | Download the installer and `.sha256` file from the same release.                                                                   |

If the problem persists, [open a bug report](../CONTRIBUTING.md#report-a-problem) with your OS, OMXTerm version, and the error.

### Background blur or transparency does not appear

Set `window.transparency` above `0`; on Windows also set `window.blur` to `true`. Reload configuration. See [background effects](configuration.md#background-transparency-and-blur) and the [Linux desktop guide](linux-desktop.md).

### Bright screen flashes in Bash or Vim

For Bash, run `bind 'set bell-style none'` or add `set bell-style none` to `~/.inputrc`. For Vim or Neovim, run `:set belloff=all` or add `set belloff=all` to your Vim configuration.

### Shell preferences do not load

OMXTerm starts macOS and Linux shells as interactive login shells. Zsh reads `~/.zshrc`; Bash reads the first existing login profile. If your aliases are in `~/.bashrc`, source it from that profile. On Windows, check the configured shell's standard startup profile. Open a new tab after editing.

### Configuration changes do not appear

After editing `config.json` or a theme, choose **View → Reload Settings** (`Cmd+Shift+,` / `Ctrl+Shift+,`). Invalid JSON leaves the previous valid settings active. Font family and line height apply to new tabs; restart to update existing tabs. Shell changes apply to new tabs, and window defaults apply to new windows. Snippets reload when you open the sidebar. See [configuration help](configuration.md#reload-and-troubleshooting).

### Insert or run a snippet

Snippets may require installation on your system. See [Optional tools](README.md#optional-add-ons). Hover a snippet to see its text (long text is cut short). **Insert** sends text without adding Enter; **Run** adds Enter. Multiline snippets can run multiple shell commands, so check the text before you click. See [Snippets configuration](configuration.md#snippets).

### Files and SSH Connect

Files and SSH Connect are optional extensions. See [Optional tools](README.md#optional-add-ons) for platform availability, and the [SSH Connect guide](ssh-connect.md) for connecting to a host.

### Resize or close the auxiliary panel

Choose **Settings → Window → Side panel position** to set its default side. Drag the separator to resize. **Hide** or **Escape** keeps the tool open; **Close tool** closes it. **View → Toggle Side Panel** hides or reveals the panel. See [Settings](configuration.md#settings).

### A program draws text in the wrong place

This is a known issue ([#568](https://github.com/luizomf/omxterm/issues/568)): after emoji, other wide characters, or a window resize, a program may receive a slightly wrong cursor position.

### The renderer cannot start

OMXTerm needs graphics support to display the terminal. On Linux, a CPU-based fallback may work when hardware graphics are unavailable, but it can be slower and has lower security guarantees (see the [graphics decision](adr/0037-allow-the-linux-software-webgl-fallback.md)). See [Linux graphics troubleshooting](linux-desktop.md#graphics-troubleshooting).

### macOS asks for folder permissions again after an update

Quit OMXTerm before replacing `OMXTerm.app` in `/Applications`, then approve folder access if macOS asks again.

## Local diagnostics

Choose **View → Toggle Developer Tools** to inspect runtime diagnostics. Redact private paths or terminal output before sharing screenshots. Logs are stored under `~/.local/state/omxterm/logs` on macOS/Linux (or `$XDG_STATE_HOME/omxterm/logs`) and `%USERPROFILE%\.local\state\omxterm\logs` on Windows. Set `logLevel` in `config.json` to `error`, `info` (default), or `debug`. Logs exclude terminal text, commands, clipboard contents, and configuration values.

For implementation details and less common edge cases, see the [usage development notes](dev/usage-development.md).
