# Everyday OMXTerm use

[Install OMXTerm](installation.md), open it, and start typing. It launches your default shell in your home folder (on Windows, Windows PowerShell by default).

**[Tabs](#windows-tabs-and-sessions)** · **[Shortcuts](#built-in-platform-shortcuts)** · **[Copy and paste](#copy-and-paste)** · **[Images](#previewing-local-images)** · **[Troubleshooting](#troubleshooting)**

For fonts, themes, shortcuts, and snippets, see [Configuration](configuration.md). [How it works](how-it-works.md) explains the relationship between the terminal, your shell, and running sessions.

## Windows, tabs, and sessions

Choose **File → New Tab** for another session in the same window, or **File → New Window** for a separate window. Each tab runs its own independent shell.

- **Tab bar:** appears automatically when a window has two or more tabs. Click a tab to select it, drag horizontally to reorder tabs, or use keyboard shortcuts. **View → Toggle Tab Bar** (`Cmd+Shift+B` / `Ctrl+Shift+B`) hides or shows the strip at any time.
- **Tab titles:** each tab starts with your active shell or program name (such as `zsh` or `powershell.exe`) and updates automatically when a program sets a terminal title.
- **Closing:** closing a tab ends its session, and closing the last window exits the app. Typing `exit` in your shell closes that tab immediately.

### Tab menu and groups

Right-click a tab (or press `Shift+F10` on it) to rename it, give it a color, duplicate it, or put it in a group. Grouped tabs stay together behind a colored chip; click the chip to collapse or expand the group, or right-click it to rename, recolor or ungroup. A duplicated tab opens the same saved session or SSH target, or a shell in the same folder.

### Close confirmation

To protect active work, OMXTerm asks for confirmation before closing a tab or window with a running command. On Windows, confirmation is shown for all live sessions. You can disable this prompt anytime by setting `"confirmClose": false` in `config.json`.

## Starting from a terminal

OMXTerm accepts a few options when you start it from a shell (`omxterm`, or the full path to the app):

| Option                                        | What it does                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `-w <dir>`, `--working-directory <dir>`       | Starts the first tab in `<dir>`.                                                                    |
| `--ssh <[user@]host[:port]>`                  | Opens the first tab as an SSH connection, like Quick Connect. A failed connection offers Reconnect. |
| `-e <program> [arguments...]`                 | Runs `<program>` in the first tab instead of your shell. Everything after `-e` goes to the program. |
| `--log-level <error\|info\|debug>`, `--debug` | Changes how much OMXTerm writes to its [diagnostics log](#local-diagnostics) for this run.          |
| `--version`, `--help`                         | Prints the version or this list and exits.                                                          |

Each launch opens a new window in a new OMXTerm process.

## Window controls

- **Zoom:** changes the font size in the current window (`Cmd++` / `Cmd+-` on macOS, `Ctrl++` / `Ctrl+-` on Linux/Windows). **Actual Size** (`Cmd+0` / `Ctrl+0`) resets to your configured size.
- **View → Toggle Title Bar:** hides or shows the window title bar (`Cmd+Shift+D` / `Ctrl+Shift+D`). When hidden, move your pointer near the top center of the window and drag the three-dot handle to reposition the window.
- **View → Toggle Full Screen:** fills the display (`Ctrl+Cmd+F` on macOS, `Ctrl+Shift+F` on Linux/Windows) and hides the title bar while in fullscreen.
- **Window → Always on Top:** keeps the current window floating above normal windows.

These toggles apply to the current window. To change the defaults for new windows, see [Configuration](configuration.md).

## Built-in platform shortcuts

The application menu displays your active shortcuts, including any custom bindings from `config.json`.

| Action                    | macOS             | Linux and Windows               |
| ------------------------- | ----------------- | ------------------------------- |
| New Window                | `Cmd+N`           | `Ctrl+Shift+N`                  |
| New Tab                   | `Cmd+T`           | `Ctrl+Shift+T`                  |
| Close Tab                 | `Cmd+W`           | `Ctrl+Shift+W`                  |
| Close Window              | `Cmd+Shift+W`     | `Ctrl+Shift+Q`                  |
| Quit                      | `Cmd+Q`           | `Ctrl+Alt+Shift+Q`              |
| Next Tab                  | `Ctrl+Tab`        | `Ctrl+PageDown`                 |
| Previous Tab              | `Ctrl+Shift+Tab`  | `Ctrl+PageUp`                   |
| Select Tab 1 through 9    | `Cmd+1` … `Cmd+9` | `Alt+1` … `Alt+9`               |
| Copy                      | `Cmd+C`           | `Ctrl+Shift+C`                  |
| Paste                     | `Cmd+V`           | `Ctrl+Shift+V`                  |
| Select All                | `Cmd+A`           | `Ctrl+Shift+A`                  |
| Zoom In                   | `Cmd++`           | `Ctrl++`                        |
| Zoom Out                  | `Cmd+-`           | `Ctrl+-`                        |
| Actual Size               | `Cmd+0`           | `Ctrl+0`                        |
| Toggle Full Screen        | `Ctrl+Cmd+F`      | `Ctrl+Shift+F`                  |
| Toggle Tab Bar            | `Cmd+Shift+B`     | `Ctrl+Shift+B`                  |
| Toggle Title Bar          | `Cmd+Shift+D`     | `Ctrl+Shift+D`                  |
| Toggle Snippets           | `Cmd+Shift+S`     | `Ctrl+Shift+S`                  |
| Reload User Configuration | `Cmd+Shift+,`     | `Ctrl+Shift+,`                  |
| Split Right               | `Cmd+D`           | `Ctrl+Shift+O`                  |
| Split Down                | `Cmd+Shift+E`     | `Ctrl+Shift+E`                  |
| Close Pane                | `Cmd+Alt+W`       | `Ctrl+Shift+K`                  |
| Next / Previous Pane      | `Cmd+]` / `Cmd+[` | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Focus Pane by Direction   | `Cmd+Alt+Arrow`   | `Alt+Shift+Arrow`               |
| Maximize or Restore Pane  | `Cmd+Shift+Enter` | `Ctrl+Shift+Z`                  |
| Equalize Panes            | `Cmd+Alt+0`       | `Ctrl+Shift+0`                  |
| Broadcast Input to Panes  | `Cmd+Alt+I`       | `Ctrl+Shift+I`                  |

On keyboards where `+` shares the `=` key, include `Shift` (`Cmd+Shift+=` or `Ctrl+Shift+=`).

On Linux and Windows, press and release **Alt** to open the application menu (even when the title bar is hidden), and press `Escape` to close it. On macOS, use the system menu bar. To customize shortcuts, see [keybinds](configuration.md#keybinds).

## Saved sessions and SSH

Press `Cmd+Shift+J` / `Ctrl+Shift+H` (**View → Toggle Sessions**) to open the Sessions sidebar. It stays closed until you open it.

- **Quick Connect:** type `user@host:port` (user and port are optional) and press **Connect** to open an SSH tab without saving anything.
- **Saved sessions:** use **+** to create a session or folder. A _local_ session can start in a chosen directory, run a specific program with literal arguments (one per line), and type an initial command once the shell is ready. An _SSH_ session stores the host, port, user, authentication method, an optional key file, a jump host, agent/X11 forwarding, compression, connection reuse, port forwards (`L 8080:localhost:80`, `R …`, `D 1080`), a command to run after login and extra `-o` options.
- **Opening:** double-click a session or press `Enter` to open it in a new tab; `Shift+Enter`, or the context menu, opens it in a split. The tab takes the session's color.
- **SSH tabs:** a tab running an SSH session shows a server icon before its title (`user@host:path`). Hovering it shows the session name, the connection (`user@host:port`), folder, authentication, jump host, options and since when it is connected.
- **Status dots:** after each session's name, a dot shows its panes in this window: green while one is connected, red when all of them ended (disconnected), grey when none is open. The number inside is how many are open. Hovering a session lists its type, folder, host, port, user, authentication, key file, jump host, options, forwards, remote command, last use and notes. Right-clicking it starts the menu with the panes open in this window; choosing one goes to its tab.
- **Organizing:** right-click (or use the context-menu key) to edit, duplicate, favorite, move or delete. Drag a session onto a folder to move it. Search matches names, hosts and directories. Favorites and recently used sessions appear at the top.
- **Import and export:** the **⋯** menu imports hosts from `~/.ssh/config` and imports or exports sessions as JSON. Exports never contain passwords or keys.

OMXTerm runs your system's OpenSSH client (`ssh`, or `ssh.exe` on Windows), so `~/.ssh/config`, your SSH agent and `known_hosts` all apply. Unknown host keys are confirmed in the terminal as usual. With **Password** authentication you can type the session's password (the eye button shows or hides it) to keep it in your system keyring, or check **Password (typed when prompted)** to type it at ssh's prompt each time. A stored password is never shown again, exported or put on a command line; unknown host keys, verification codes and a retry after a wrong password are still typed in the terminal. Without a secure keyring (or on Windows) ssh always asks. If an agent or key session fails with "Permission denied", the error banner offers switching it to Password (typed when prompted) and reconnecting. Settings that make ssh run local programs, such as `ProxyCommand`, belong in `~/.ssh/config` and are refused as extra options.

When a saved or Quick Connect session fails (for example, `Connection refused`), its tab stays open with the error visible and offers **Reconnect** and **Close**. When ssh itself fails (exit code 255), **Solution** explains the cause and the next step: check the network, the SSH server or the name; switch to a password after a refused sign-in; or, when the computer's identity changed (**REMOTE HOST IDENTIFICATION HAS CHANGED**, for example after it was reinstalled), compare the fingerprint shown with the one on that computer and choose **Remove old key and reconnect**. OMXTerm then removes only the old key from your `~/.ssh/known_hosts` (keeping `known_hosts.old`), and ssh asks you to accept the new key in the terminal. It never accepts a key for you.

## Searching the terminal

Press `Cmd+F` / `Ctrl+Shift+G` (**Edit → Find…**) and type to highlight every match in the focused pane, including its scrollback. Use **Previous** and **Next** to move between matches, and **Close** or the same shortcut to hide the search bar.

## Command palette

Press `Cmd+Shift+P` / `Ctrl+Shift+P` (**View → Command Palette…**) and type part of what you want, such as `split` or the name of a saved session, then press `Enter`. Every menu action with a shortcut is listed, so you can run it without remembering the keys.

## Reopening windows at startup

Turn on **Restore Windows at Startup** in the application menu (the **OMXTerm** menu, or the menu that opens when you press and release `Alt` on Linux and Windows). When you quit, OMXTerm remembers its windows, tabs and split panes. Shells reopen in the folders they were in, and saved sessions and Quick Connect tabs reconnect. Closing a window while others stay open forgets that window. Turning the option off erases what was saved.

Starting OMXTerm with `-e`, `-w` or `--ssh` opens just what you asked for.

## Running commands from the Command Manager

Press `Cmd+Shift+M` / `Ctrl+Shift+M` (**View → Toggle Commands**) to open the Commands sidebar. It lists ready-made commands for the system you are on: files and archives, processes, memory and disk, services and logs, packages (`apt`, `dnf`, `pacman`, Homebrew or `winget`), network checks, SSH keys, Git and Docker. Windows shows PowerShell versions of the same tasks.

- **Running:** click a command (or press `Enter`) to open its form. Fill in the fields and check the **Command preview**, which shows exactly what will be typed. **Insert in Terminal** types it into the focused pane without running it; **Run in Terminal** also presses `Enter`. Nothing runs until you choose one.
- **Safe values:** text you type in a field is quoted for the shell (POSIX shells or PowerShell), so a host name such as `example.com; reboot` stays a single argument.
- **Missing tools:** a command whose program is not installed is dimmed and says which program is missing.
- **Your own commands:** use **+** to create one. Write the command with `{name}` placeholders, for example `rsync -av {source} {destination}`, and choose a label and type (text, number, switch, list, file or folder) for each placeholder. Right-click a built-in command to duplicate it as a starting point, to mark it as a favorite, or to hide it; **⋯** shows hidden commands again.

## Highlighting command output

Turn on **View → Highlight Output** to color common patterns in command output: errors, warnings, success and state words, IP and MAC addresses, URLs and quoted strings. When you run a known command, including one started from the Command Manager or a snippet, OMXTerm switches to rules made for it, for example `ping`, `df`, `free`, `ip`, `systemctl`, `docker`, `kubectl`, `journalctl` and about 45 more. The rule sets come from AshyTerm.

Highlighting is off by default and stays out of the way:

- Full-screen programs (Vim, htop, less, tmux), pasted text, images and lines that a program already colored are never changed.
- Tools that color their own output or draw a full-screen interface (`ls`, `git`, `grep`, `vim`, `htop`, `ssh` and others) are skipped.
- Very fast output, such as a large file printed with `cat`, passes through unchanged.
- Colors come from your terminal theme's palette.

**View → Highlight Rules…** lets you turn rule sets on or off, choose which commands are never changed, and add your own rules: a name, a regular expression and a color. Patterns that could slow the terminal down are refused.

The choice and any custom rules are saved in `highlights.json` next to `config.json`.

## Split panes

Use **Terminal → Split Right** or **Split Down** to divide the focused pane. Each pane is an independent terminal with its own shell, scrollback and selection; a new pane starts in the focused pane's current directory when OMXTerm can determine it (from the shell's OSC 7 report, or on Linux from the shell process), and in your home directory otherwise.

- Click a pane, or use the pane focus shortcuts, to move focus. The focused pane of a split shows a thin accent edge.
- Drag a divider to resize, or focus a divider with `Tab` and use the arrow keys. **Equalize Panes** gives every pane the same share.
- **Maximize or Restore Pane** temporarily shows only the focused pane; the others keep running.
- **Close Pane** ends only the focused pane's session (it asks first when a program is running, like Close Tab). In a split tab you can also right-click a pane and choose **Close Pane**; right-clicking focuses that pane first, so Copy, Paste and Save Output act on it too. Closing a tab closes all of its panes, and when a pane's shell exits, its neighbor takes its place.
- A tab holds up to 16 panes. Tab labels show the focused pane's title and the pane count, for example `vim (3)`.

### Broadcasting input

**Terminal → Broadcast Input to Panes** mirrors what you type in the focused pane to every other pane in the same tab, after a confirmation. While it is active, every receiving pane has an orange edge and a **Broadcasting** indicator with a **Stop** button stays visible. Only keystrokes are mirrored: pastes, snippets and terminal replies are not. OMXTerm cannot tell when a remote program is asking for a password, so stop broadcasting before typing secrets.

## Copy and paste

- **Copy:** select text with the mouse, then use **Edit → Copy**, its shortcut, or the right-click menu. Selecting text alone does not overwrite your clipboard. If a terminal app (like Vim or `tmux`) captures mouse clicks, hold **Shift** while dragging to select text.
- **Paste:** use **Edit → Paste**, its shortcut, or the right-click menu.
- **Terminal control keys:** `Ctrl+C` interrupts the running command, and `Ctrl+V` is sent directly to the terminal program (for example, CLI tools that use `Ctrl+V` to attach clipboard images).

### Protected Paste

When you paste multiple lines or control characters into a program that has not enabled **bracketed paste**, OMXTerm asks for confirmation before sending the text so pasted newlines do not accidentally execute commands right away.

Modern shells and editors that enable bracketed paste receive pasted text directly without an extra dialog. Snippets and dropped file paths use the same protection.

## Inserting file and folder paths

Drag files or folders from your file manager into OMXTerm to insert their shell-quoted paths into the current tab, separated by spaces. You can also copy files in your file manager and paste them into the terminal (on Windows, drag-and-drop supports multiple files at once, while clipboard paste inserts one file).

Paths are quoted for POSIX shells on macOS/Linux and PowerShell on Windows. Review the inserted text before pressing Enter, especially if you are inside Git Bash, WSL, or an SSH session.

## Opening visible web links

Hold **Cmd** (macOS) or **Ctrl** (Linux/Windows) while hovering over an `http://` or `https://` URL in terminal output. Click the underlined link to open it in your default browser.

## Previewing local images

You can preview local PNG and JPEG images in an overlay without leaving OMXTerm (up to 64 MiB, 8192 pixels per side, and 32 megapixels; animated images are not supported):

- **Click a path in output:** hold **Cmd** (macOS) or **Ctrl** (Linux/Windows) and click a visible image path or `file:///` URL.
- **Open via file picker:** choose **File → Open Local Image…** from the menu.
- **Relative paths:** if you click a relative path (like `./screenshot.png`), OMXTerm prompts you to choose the base folder.
- **Close the preview:** press **Escape**, click the close button, or click outside the image to return focus to your terminal.

If an image path contains spaces, wrap it in single or double quotes in your terminal output (or print the full path on its own line) so OMXTerm can recognize the complete path. Note that clicked paths always open files on the machine running OMXTerm, even if the text was printed inside an SSH session.

## Inline terminal images

OMXTerm also renders inline images directly inside the terminal grid using the Kitty graphics protocol subset supported by [Chafa](https://hpjansson.org/chafa/) and [Pi](https://github.com/badlogic/pi-mono) in direct sessions (outside `tmux` or `screen`).

With **Chafa**:

```sh
chafa -f kitty /path/to/image.png
```

With **Pi**, enable Kitty images in your Pi settings:

```json
{
  "terminal": {
    "images": "kitty"
  }
}
```

Or for a single session:

```sh
PI_IMAGE_PROTOCOL=kitty pi
```

Inline images stay anchored to their terminal cells as you scroll, zoom, or resize the window.

## Bells and attention

Terminal bells (`BEL`) are silent. When a session rings the bell, OMXTerm adds a `🔔` badge to the tab title and requests desktop attention if the window is unfocused (such as bouncing the Dock icon on macOS). Focusing the window or interacting with the tab clears the indicator.

## Troubleshooting

### The download will not open

See the [installation guide](installation.md) for your platform:

| Symptom                                                      | Solution                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| macOS warns about an unverified developer                    | Open **System Settings → Privacy & Security** and click **Open Anyway** ([details](installation.md#first-launch-on-macos)). |
| Linux says `Permission denied`                               | Run `chmod +x OMXTerm-*.AppImage` first, and make sure the file is on a partition that allows executing programs.           |
| Linux reports a FUSE or mount error                          | Launch with `./OMXTerm-*.AppImage --appimage-extract-and-run` or install with `linux_install.sh`.                           |
| Linux reports `GLIBC_2.42 not found`                         | Your distribution is too old for the prebuilt AppImage. It needs glibc 2.42+ (for example Fedora 43+ or Ubuntu 25.10+).     |
| Linux reports an executable format error                     | Check `uname -m` — prebuilt packages require `aarch64` (ARM64).                                                             |
| Windows reports a missing runtime DLL or `ERR_DLOPEN_FAILED` | Install the [Microsoft Visual C++ Redistributable for ARM64](installation.md#windows).                                      |
| Checksum verification fails                                  | Ensure both the installer and `.sha256` file were downloaded from the same release.                                         |

Still having trouble? [Open a bug report](../CONTRIBUTING.md#report-a-problem) with your OS, OMXTerm version, and the error message.

### Background blur or transparency does not appear

Set `window.transparency` above `0` (for example `0.2`) in `config.json`, save, and reload (`Cmd+Shift+,` / `Ctrl+Shift+,`). On Windows, also set `"blur": true`. Note that full-screen TUI apps that paint their own solid background color will appear opaque over the blurred window. See [background effects](configuration.md#background-transparency-and-blur) and [Linux desktop tips](linux-desktop.md).

### Bright screen flashes in Bash or Vim

Some shells and editors use a full-screen visual flash instead of a standard bell:

- **Bash:** run `bind 'set bell-style none'` for the current session, or add `set bell-style none` to `~/.inputrc`.
- **Vim / Neovim:** run `:set belloff=all`, or add `set belloff=all` to your `.vimrc` / `init.vim`.

### Shell preferences do not load

OMXTerm starts your default shell on macOS and Linux as an interactive **login shell** and does not inject custom startup scripts:

- **Zsh** reads `~/.zshrc`.
- **Bash** login shells read the first existing file among `~/.bash_profile`, `~/.bash_login`, and `~/.profile`. If you keep your aliases and prompt in `~/.bashrc`, source `~/.bashrc` from your login profile.
- **Windows** starts your configured shell (`windowsShell` or Windows PowerShell) using its standard startup profile.

Open a new tab after editing your shell profile to see the changes.

### Configuration changes do not appear

Editing `config.json` does not apply changes until you press `Cmd+Shift+,` (macOS) or `Ctrl+Shift+,` (Linux/Windows), or choose **View → Reload User Configuration**:

- If `config.json` has a syntax error or invalid value, OMXTerm displays an error banner explaining what to fix while keeping your previous valid settings active.
- Changes to `font.family` and `font.lineHeight` apply to new tabs and require restarting OMXTerm to update existing tabs.
- Changes to `windowsShell` apply to new tabs; changes to default bar visibility (`showTitleBar`, `showTabBar`, `alwaysOnTop`) apply to new windows.
- Edits to `snippets.json` load automatically whenever you close and reopen the Snippets sidebar.

See [reloading user configuration](configuration.md#reloading-user-configuration) and [theme troubleshooting](configuration.md#theme-troubleshooting) for details.

### The snippets sidebar crowds out a narrow window

The Snippets sidebar has a fixed width of 280 px. In a very narrow window, widen the window or press `Cmd+Shift+S` / `Ctrl+Shift+S` (**View → Toggle Snippets**) to hide the sidebar.

### A program draws text in the wrong place

This is a known issue ([#568](https://github.com/luizomf/omxterm/issues/568)). Programs that ask the terminal where the cursor is can get a slightly wrong answer after emoji, other wide characters, or a window resize.

### The renderer cannot start

OMXTerm requires **WebGL2** to draw the terminal. On Linux it falls back to Chromium's software WebGL when the GPU cannot provide WebGL2, such as in virtual machines without 3D acceleration. If WebGL2 still fails to initialize, try the Linux installer's [graphics compatibility mode](linux-installer.md#only-if-graphics-fail) or the launch flags in [Linux graphics troubleshooting](linux-desktop.md#graphics-troubleshooting).

### macOS asks for folder permissions again after an update

Quit OMXTerm before replacing `OMXTerm.app` in `/Applications`, and approve folder access if macOS prompts you on launch.

## Local diagnostics

To inspect runtime diagnostics, choose **View → Toggle Developer Tools**. Be sure to redact any private paths or terminal output before sharing screenshots.

OMXTerm writes bounded operational logs (up to two 5 MiB files: `omxterm.jsonl` and `omxterm.previous.jsonl`) in:

- **macOS and Linux:** `~/.local/state/omxterm/logs` (or `$XDG_STATE_HOME/omxterm/logs`)
- **Windows:** `%USERPROFILE%\.local\state\omxterm\logs`

You can set `"logLevel"` in `config.json` to `"error"`, `"info"` (default), or `"debug"`. Logs record only app lifecycle and operational events — never your terminal text, commands, clipboard, or configuration values.
