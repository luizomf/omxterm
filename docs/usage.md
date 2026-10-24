# Everyday OMXTerm use

[Install OMXTerm](installation.md), open it, and start typing. It launches your default shell in your home folder (on Windows, Windows PowerShell by default).

**[Tabs](#windows-tabs-and-sessions)** · **[Shortcuts](#built-in-platform-shortcuts)** · **[Copy and paste](#copy-and-paste)** · **[Images](#previewing-local-images)** · **[Troubleshooting](#troubleshooting)**

For fonts, themes, shortcuts, and snippets, see [Configuration](configuration.md). [How it works](how-it-works.md) explains the relationship between the terminal, your shell, and running sessions.

## Windows, tabs, and sessions

Choose **File → New Tab** for another session in the same window, or **File → New Window** for a separate window. Each tab runs its own independent shell.

- **Tab bar:** appears automatically when a window has two or more tabs. Click a tab to select it, drag horizontally to reorder tabs, or use keyboard shortcuts. **View → Toggle Tab Bar** (`Cmd+Shift+B` / `Ctrl+Shift+B`) hides or shows the strip at any time.
- **Tab titles:** each tab starts with your active shell or program name (such as `zsh` or `powershell.exe`) and updates automatically when a program sets a terminal title.
- **Closing:** closing a tab ends its session, and closing the last window exits the app. Typing `exit` in your shell closes that tab immediately.

### Close confirmation

To protect active work, OMXTerm asks for confirmation before closing a tab or window with a running command. On Windows, confirmation is shown for all live sessions. You can disable this prompt anytime by setting `"confirmClose": false` in `config.json`.

## Window controls

- **Zoom:** changes the font size in the current window (`Cmd++` / `Cmd+-` on macOS, `Ctrl++` / `Ctrl+-` on Linux/Windows). **Actual Size** (`Cmd+0` / `Ctrl+0`) resets to your configured size.
- **View → Toggle Title Bar:** hides or shows the window title bar (`Cmd+Shift+D` / `Ctrl+Shift+D`). When hidden, move your pointer near the top center of the window and drag the three-dot handle to reposition the window.
- **View → Toggle Full Screen:** fills the display (`Ctrl+Cmd+F` on macOS, `F11` on Linux/Windows) and hides the title bar while in fullscreen.
- **Window → Always on Top:** keeps the current window floating above normal windows.

These toggles apply to the current window. To change the defaults for new windows, see [Configuration](configuration.md).

## Built-in platform shortcuts

The application menu displays your active shortcuts, including any custom bindings from `config.json`.

| Action                    | macOS             | Linux and Windows  |
| ------------------------- | ----------------- | ------------------ |
| New Window                | `Cmd+N`           | `Ctrl+Shift+N`     |
| New Tab                   | `Cmd+T`           | `Ctrl+Shift+T`     |
| Close Tab                 | `Cmd+W`           | `Ctrl+Shift+W`     |
| Close Window              | `Cmd+Shift+W`     | `Ctrl+Shift+Q`     |
| Quit                      | `Cmd+Q`           | `Ctrl+Alt+Shift+Q` |
| Next Tab                  | `Ctrl+Tab`        | `Ctrl+PageDown`    |
| Previous Tab              | `Ctrl+Shift+Tab`  | `Ctrl+PageUp`      |
| Select Tab 1 through 9    | `Cmd+1` … `Cmd+9` | `Alt+1` … `Alt+9`  |
| Copy                      | `Cmd+C`           | `Ctrl+Shift+C`     |
| Paste                     | `Cmd+V`           | `Ctrl+Shift+V`     |
| Select All                | `Cmd+A`           | `Ctrl+Shift+A`     |
| Find                      | `Cmd+F`           | `Ctrl+Shift+F`     |
| Zoom In                   | `Cmd++`           | `Ctrl++`           |
| Zoom Out                  | `Cmd+-`           | `Ctrl+-`           |
| Actual Size               | `Cmd+0`           | `Ctrl+0`           |
| Toggle Full Screen        | `Ctrl+Cmd+F`      | `F11`              |
| Toggle Tab Bar            | `Cmd+Shift+B`     | `Ctrl+Shift+B`     |
| Toggle Title Bar          | `Cmd+Shift+D`     | `Ctrl+Shift+D`     |
| Toggle Snippets           | `Cmd+Shift+S`     | `Ctrl+Shift+S`     |
| Reload User Configuration | `Cmd+Shift+,`     | `Ctrl+Shift+,`     |

On keyboards where `+` shares the `=` key, include `Shift` (`Cmd+Shift+=` or `Ctrl+Shift+=`).

On Linux and Windows, press and release **Alt** to open the application menu (even when the title bar is hidden), and press `Escape` to close it. On macOS, use the system menu bar. To customize shortcuts, see [keybinds](configuration.md#keybinds).

## Copy and paste

- **Copy:** select text with the mouse, then use **Edit → Copy**, its shortcut, or the right-click menu. Selecting text alone does not overwrite your clipboard. If a terminal app (like Vim or `tmux`) captures mouse clicks, hold **Shift** while dragging to select text.
- **Paste:** use **Edit → Paste**, its shortcut, or the right-click menu.
- **Terminal control keys:** `Ctrl+C` interrupts the running command, and `Ctrl+V` is sent directly to the terminal program (for example, CLI tools that use `Ctrl+V` to attach clipboard images).

### Searching the scrollback

Choose **Edit → Find…** (`Cmd+F` / `Ctrl+Shift+F`) to search the selected tab's scrollback and visible screen. The search field gets focus, matches highlight as you type, and the counter shows the selected match and total. While the search field has focus, press `Enter` (or **↓**) for the next match, `Shift+Enter` (or **↑**) for the previous one, and `Escape` to close the bar and return to the terminal. Copy, Paste, and Select All also work on the search text there.

Click the terminal to keep typing with the bar still open: your keys, including `Enter` and `Escape`, go to the terminal program as usual. Choose **Find…** again to return to the search field.

Search only sees output the tab still holds in memory, so lines beyond your [scrollback limit](configuration.md) are not found. Each tab keeps its own search, and the query is never saved or logged.

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

## About and credits

Choose **OMXTerm → About OMXTerm** in the application menu for the running
version, project, contributors, issue tracker and MIT license. On Linux and
Windows, release **Alt** to open that menu; on macOS use the system menu bar.
The same compact dialog appears on every supported platform. Use **Tab** to
move between its buttons and **Escape** or **Close** to return to the terminal.
Links open in your default browser only when activated. Contributor credits
live in [CONTRIBUTORS.md](../CONTRIBUTORS.md), while legal notices remain bundled.
About and local-image preview do not stack; dismiss one before opening the other.

## Troubleshooting

### The download will not open

See the [installation guide](installation.md) for your platform:

| Symptom                                                      | Solution                                                                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| macOS warns about an unverified developer                    | Open **System Settings → Privacy & Security** and click **Open Anyway** ([details](installation.md#first-launch-on-macos)).         |
| Linux says `Permission denied`                               | Run `chmod +x OMXTerm-*.AppImage` first, and make sure the file is on a partition that allows executing programs.                   |
| Linux reports a FUSE or mount error                          | Launch with `./OMXTerm-*.AppImage --appimage-extract-and-run` or install with `linux_install.sh`.                                   |
| Linux reports `GLIBC_2.42 not found`                         | Your distribution is too old for the prebuilt AppImage. It needs glibc 2.42+ (for example Fedora 43+ or Ubuntu 25.10+).             |
| Linux reports an executable format error                     | Check `uname -m` — prebuilt packages require `aarch64` (ARM64).                                                                     |
| Windows reports a missing runtime DLL or `ERR_DLOPEN_FAILED` | Install the Microsoft Visual C++ Redistributable for your architecture (ARM64 or x64), see [installation](installation.md#windows). |
| Checksum verification fails                                  | Ensure both the installer and `.sha256` file were downloaded from the same release.                                                 |

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
- Edits to `snippets.yaml` load automatically whenever you close and reopen the Snippets sidebar.

See [reloading user configuration](configuration.md#reloading-user-configuration) and [theme troubleshooting](configuration.md#theme-troubleshooting) for details.

### Resize or close Snippets

Drag the left separator to resize the right-side Snippets panel. You can also focus the separator with Tab: Left/Right grow/shrink by 10 px, and Home/End choose the current minimum/maximum. The default width is 280 px, bounded to 220–560 px and the available window space. The header's Close button, Escape inside the panel, or `Cmd+Shift+S` / `Ctrl+Shift+S` (**View → Toggle Snippets**) hides it and returns terminal focus.

The panel shrinks automatically in narrow windows and closes below 406 px of content width. Widen the window and open it again; it does not reopen automatically. Your preferred width, search and scroll survive hiding and configuration/theme changes in that window only, not restart. The remaining terminal allowance does not guarantee columns with extreme padding.

Snippets is nonmodal: clicking the terminal keeps normal terminal input. Copy/Paste/Select All edit the search field while it holds focus; unsupported panel controls suppress terminal clipboard delivery instead. About and Local Image Preview temporarily make the retained panel inert.

### A program draws text in the wrong place

This is a known issue ([#568](https://github.com/luizomf/omxterm/issues/568)). Programs that ask the terminal where the cursor is can get a slightly wrong answer after emoji, other wide characters, or a window resize.

### The renderer cannot start

OMXTerm requires **WebGL2** to draw the terminal. If WebGL2 fails to initialize (common in some virtual machines without 3D acceleration), try the Linux installer's [graphics compatibility mode](linux-installer.md#only-if-graphics-fail) or the launch flags in [Linux graphics troubleshooting](linux-desktop.md#graphics-troubleshooting).

### macOS asks for folder permissions again after an update

Quit OMXTerm before replacing `OMXTerm.app` in `/Applications`, and approve folder access if macOS prompts you on launch.

## Local diagnostics

To inspect runtime diagnostics, choose **View → Toggle Developer Tools**. Be sure to redact any private paths or terminal output before sharing screenshots.

OMXTerm writes bounded operational logs (up to two 5 MiB files: `omxterm.jsonl` and `omxterm.previous.jsonl`) in:

- **macOS and Linux:** `~/.local/state/omxterm/logs` (or `$XDG_STATE_HOME/omxterm/logs`)
- **Windows:** `%USERPROFILE%\.local\state\omxterm\logs`

You can set `"logLevel"` in `config.json` to `"error"`, `"info"` (default), or `"debug"`. Logs record only app lifecycle and operational events — never your terminal text, commands, clipboard, or configuration values.
