# Everyday OMXTerm use

[Install OMXTerm](installation.md), open it, and start typing. It launches your default shell in your home folder (on Windows, Windows PowerShell by default).

**[Tabs](#windows-tabs-and-sessions)** · **[Command Palette](#command-palette)** · **[Shortcuts](#built-in-platform-shortcuts)** · **[Copy and paste](#copy-and-paste)** · **[Images](#previewing-local-images)** · **[Troubleshooting](#troubleshooting)**

For fonts, themes, shortcuts, and snippets, see [Configuration](configuration.md). [How it works](how-it-works.md) explains the relationship between the terminal, your shell, and running sessions.

## Windows, tabs, and sessions

Choose **File → New Tab** for another session in the same window, or **File → New Window** for a separate window. Each Terminal Tab starts with one independent shell and can hold several panes.
**Settings…** opens a graphical tab in the same strip, with no shell. It is
included in reordered/numbered/next/previous navigation, and repeated open
returns to the same editor. Settings remains open after the last terminal exits;
closing the last application tab closes the window. See [Settings](configuration.md#settings)
for retained drafts and explicit JSON Save.

- **Tab bar:** appears automatically when a window has two or more tabs. Click a tab to select it, drag horizontally to reorder tabs, or use keyboard shortcuts. **View → Toggle Tab Bar** (`Cmd+Shift+B` / `Ctrl+Shift+B`) hides or shows the strip at any time.
- **Tab titles:** Settings has a localized title; each Terminal Tab starts with your active shell or program name (such as `zsh` or `powershell.exe`) and updates automatically when a program sets a terminal title.
- **Closing:** closing a tab ends its sessions, and closing the last window exits the app. Typing `exit` in your shell closes that pane, or the tab when it is its last pane.

### Split panes

Choose **View → Pane → Split Right** (`Cmd+D` / `Ctrl+Shift+O`) or **Split Down** (`Cmd+Shift+E` / `Ctrl+Shift+E`) to divide the current pane into two independent shells in the same tab.

- **Where the new shell starts:** in the directory your shell last reported through OSC 7, if it reports one (many shells do when configured to; OMXTerm never changes your shell setup to make it happen), otherwise in your home directory. Non-local host names and unavailable directories fall back to home. An empty or local host name emitted over SSH cannot be distinguished from a local report; program output can emit it too. The report can only select an existing local start directory, never execute shell text.
- **Focus:** click a pane, or use **Focus Next/Previous Pane** (`Cmd+]` / `Cmd+[`, `Ctrl+Shift+]` / `Ctrl+Shift+[`) and the arrow variants (`Cmd+Alt+Arrow` / `Alt+Shift+Arrow`). Typing, Copy, Paste, Find, snippets and dropped paths go to the focused pane, which, in a split tab, has a thin top line inset by its horizontal terminal padding (no side or bottom outline). The line uses your theme's cyan, falling back to its foreground if cyan has low contrast against the configured background and foreground improves it. Custom themes and transparent backgrounds can still make it hard to see. The tab title follows it.
- **Resize:** drag the line between panes, or focus it with Tab and use the arrow keys. The visible line is 1 px within a 4 px resize target; hover and drag share a neutral highlight, while keyboard focus highlights just the line. **Equalize Panes** (`Cmd+Ctrl+=` / `Ctrl+Shift+0`) gives the panes beside the focused one equal space. New splits require room for two usable grids of at least 20 columns by 5 rows, including padding and dividers. The source pane's current cell size is the new pane's admission reference. A later window shrink or zoom may make those minima impossible: sessions and layout survive, and an impossible divider move keeps the existing proportions.
- **Close:** **Close Pane** (`Cmd+Alt+W` / `Ctrl+Shift+K`) ends the focused pane's session; its neighbor takes the space. You can also right-click a pane and choose **Close Pane** from its context menu, which appears while the tab is split. The popup stays tied to that pane: if it ends or you change panes/tabs before activation, the old menu does nothing rather than acting on a replacement. Closing the last pane closes the tab.

### Close confirmation

To protect active work, OMXTerm asks for confirmation before closing a pane, tab or window with a running command. Close Pane only asks about the focused pane; Close Tab asks once for all of the tab's panes. On Windows, confirmation is shown for all live sessions. You can disable this prompt anytime by setting `"confirmClose": false` in `config.json`.

### Save a terminal arrangement

The optional Linux ARM64 [Saved Layout extension](saved-layout.md) explicitly
saves one window's terminal tabs, splits and available local folders. Open starts
fresh shells in a new window without closing current work. It does not restore
output, processes or commands. Installation, conflicts, folder provenance and
Forget's active-snapshot/remnant limits are described in its guide.

### Mirror typing to selected panes

The optional Linux ARM64 [Mirror Typing preview](mirror-typing.md) copies final
keyboard bytes to an inspected fixed group in one tab. Use matching terminal
programs/modes. Paste, snippets and drops stop mirroring before ordinary
single-pane delivery; core Stop remains visible with hidden title/tab chrome.
Install/build availability and limitations are described in the guide.

## Window controls

- **Zoom:** changes the font size in the current window (`Cmd++` / `Cmd+-` on macOS, `Ctrl++` / `Ctrl+-` on Linux/Windows). **Actual Size** (`Cmd+0` / `Ctrl+0`) resets to your configured size.
- **View → Toggle Title Bar:** hides or shows the window title bar (`Cmd+Shift+D` / `Ctrl+Shift+D`). When hidden, move your pointer near the top center of the window and drag the three-dot handle to reposition the window.
- **View → Toggle Full Screen:** fills the display (`Ctrl+Cmd+F` on macOS, `F11` on Linux/Windows) and hides the title bar while in fullscreen.
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
| Split Right               | `Cmd+D`           | `Ctrl+Shift+O`                  |
| Split Down                | `Cmd+Shift+E`     | `Ctrl+Shift+E`                  |
| Close Pane                | `Cmd+Alt+W`       | `Ctrl+Shift+K`                  |
| Focus Next/Previous Pane  | `Cmd+]` / `Cmd+[` | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Focus Pane in a direction | `Cmd+Alt+Arrow`   | `Alt+Shift+Arrow`               |
| Equalize Panes            | `Cmd+Ctrl+=`      | `Ctrl+Shift+0`                  |
| Copy                      | `Cmd+C`           | `Ctrl+Shift+C`                  |
| Paste                     | `Cmd+V`           | `Ctrl+Shift+V`                  |
| Select All                | `Cmd+A`           | `Ctrl+Shift+A`                  |
| Find                      | `Cmd+F`           | `Ctrl+Shift+F`                  |
| Zoom In                   | `Cmd++`           | `Ctrl++`                        |
| Zoom Out                  | `Cmd+-`           | `Ctrl+-`                        |
| Actual Size               | `Cmd+0`           | `Ctrl+0`                        |
| Toggle Full Screen        | `Ctrl+Cmd+F`      | `F11`                           |
| Toggle Tab Bar            | `Cmd+Shift+B`     | `Ctrl+Shift+B`                  |
| Toggle Title Bar          | `Cmd+Shift+D`     | `Ctrl+Shift+D`                  |
| Toggle Snippets           | `Cmd+Shift+S`     | `Ctrl+Shift+S`                  |
| Reload User Configuration | `Cmd+Shift+,`     | `Ctrl+Shift+,`                  |

On keyboards where `+` shares the `=` key, include `Shift` (`Cmd+Shift+=` or `Ctrl+Shift+=`).

On Linux and Windows, press and release **Alt** to open the application menu (even when the title bar is hidden), and press `Escape` to close it. On macOS, use the system menu bar. To customize shortcuts, see [keybinds](configuration.md#keybinds).

## Command Palette

Choose **View → Command Palette…** to search core application actions. On Linux
and Windows, release **Alt** to reach the native menu; on macOS, use the system
menu bar. The default shortcut is **Cmd+Shift+P** on macOS and **Ctrl+Shift+P** on
Linux/Windows. Remap or disable it in **Settings → Shortcuts → Command Palette…**
or [`keybinds.commandPalette`](configuration.md#keybinds). Explicit remaps and
`null` are preserved. If a custom action already uses this combination, resolve
the standard configuration collision error by remapping or disabling either
binding; no automatic config rewrite occurs.

Type part of an action's displayed name, use **↑/↓** to select a result, then
press and release **Enter**, or click a result. The dialog closes before the
existing action runs, keeping its normal guards and close confirmations.
**Escape** or clicking the backdrop cancels. Copy/Paste/Select All edit the
palette query while it owns input, not your terminal.

Results include window/tab and pane actions, Settings, About, local-image
preview, reload and developer tools, with their current shortcuts where bound.
Search uses case-insensitive substring matching in the selected interface
language (en-US or pt-BR); there is no fuzzy search or command history. Copy,
Paste, Select All, Find, numbered tab selection and the palette itself are not
results. **Find is intentionally omitted:** routing it back to the formerly
focused Terminal Surface after palette input is not established. Use
**Edit → Find…** directly instead.

The palette keeps its original tab/pane target; if that target changes or ends,
it does not run the action against a replacement. It can open above Settings
without discarding drafts or pending saves, but does not stack with About,
image preview or snippet preview. Cancel returns focus to the surviving prior
control when its target is still current. If the window loses focus, cancel and
reopen the palette before choosing an action: its old authorization is no longer
valid. Reopen after a language or shortcut change to refresh the catalog. Opening or searching does not rewrite your
configuration, and adds no persistent toolbar.

## Copy and paste

- **Copy:** select text with the mouse, then use **Edit → Copy**, its shortcut, or the right-click menu. Selecting text alone does not overwrite your clipboard. If a terminal app (like Vim or `tmux`) captures mouse clicks, hold **Shift** while dragging to select text.
- **Paste:** use **Edit → Paste**, its shortcut, or the right-click menu.
- **Terminal control keys:** `Ctrl+C` interrupts the running command, and `Ctrl+V` is sent directly to the terminal program (for example, CLI tools that use `Ctrl+V` to attach clipboard images).

To hide OMXTerm's popup over terminal content and padding, disable **Terminal
context menu** in **Settings → Terminal**, or set
[`terminal.contextMenuEnabled`](configuration.md#terminal-context-menu) to
`false` and reload. Application mouse input is unchanged. This also disables
keyboard-originated terminal popups, without a Shift exception; existing Edit
actions/keybindings and the Scrollback Search query menu remain available.

### Searching the scrollback

Choose **Edit → Find…** (`Cmd+F` / `Ctrl+Shift+F`) to search the focused pane's scrollback and visible screen. The search field gets focus, matches highlight as you type, and the counter shows the selected match and total. While the search field has focus, press `Enter` (or **↓**) for the next match, `Shift+Enter` (or **↑**) for the previous one, and `Escape` to close the bar and return to the terminal. Copy, Paste, and Select All also work on the search text there.

Click the terminal to keep typing with the bar still open: your keys, including `Enter` and `Escape`, go to the terminal program as usual. Choose **Find…** again to return to the search field.

Search only sees output the pane still holds in memory, so lines beyond your [scrollback limit](configuration.md) are not found. Each pane keeps its own search, and the query is never saved or logged.

### Protected Paste

When you paste multiple lines or control characters into a program that has not enabled **bracketed paste**, OMXTerm asks for confirmation before sending the text so pasted newlines do not accidentally execute commands right away.

Modern shells and editors that enable bracketed paste receive pasted text directly without an extra dialog. Snippets and dropped file paths use the same protection.

## Inserting file and folder paths

Drag files or folders from your file manager into OMXTerm to insert their shell-quoted paths into the focused pane, separated by spaces. You can also copy files in your file manager and paste them into the terminal (on Windows, drag-and-drop supports multiple files at once, while clipboard paste inserts one file).

Paths are quoted for POSIX shells on macOS/Linux and PowerShell on Windows. Review the inserted text before pressing Enter, especially if you are inside Git Bash, WSL, or an SSH session.

## Opening visible web links

Hold **Cmd** (macOS) or **Ctrl** (Linux/Windows) while hovering over an `http://` or `https://` URL in terminal output. Click the underlined link to open it in your default browser.

## Previewing local images

You can preview local PNG and JPEG images in an overlay without leaving OMXTerm (up to 64 MiB, 8192 pixels per side, and 32 megapixels; animated images are not supported):

- **Click a path in output:** hold **Cmd** (macOS) or **Ctrl** (Linux/Windows) and click a visible image path or `file:///` URL.
- **Open via file picker:** choose **File → Open Local Image…** from the menu.
- **Relative paths:** if you click a relative path (like `./screenshot.png`), OMXTerm prompts you to choose the base folder.
- **Close the preview:** press **Escape**, click the close button, or click outside the image to return focus to the selected content (terminal or Settings).

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
move between its buttons and **Escape** or **Close** to return to the selected terminal or Settings control.
Links open in your default browser only when activated. Contributor credits
live in [CONTRIBUTORS.md](../CONTRIBUTORS.md), while legal notices remain bundled.
About and local-image preview do not stack; dismiss one before opening the other. Pane splitting, focus navigation and equalizing are ignored while either owns input, including image choosing/loading. Confirmed closure and failure acknowledgement still work.

## Troubleshooting

### The download will not open

See the [installation guide](installation.md) for your platform:

| Symptom                                                      | Solution                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS warns about an unverified developer                    | Open **System Settings → Privacy & Security** and click **Open Anyway** ([details](installation.md#first-launch-on-macos)).                             |
| Linux says `Permission denied`                               | Run `chmod +x OMXTerm-*.AppImage` first, and make sure the file is on a partition that allows executing programs.                                       |
| Linux reports a FUSE or mount error                          | Launch with `./OMXTerm-*.AppImage --appimage-extract-and-run` or install with `linux_install.sh`.                                                       |
| Linux reports `GLIBC_2.42 not found`                         | The ARM64 AppImage needs glibc 2.42+ (for example Fedora 43+ or Ubuntu 25.10+). See [architecture-specific requirements](installation.md#requirements). |
| Linux reports an executable format error                     | Check `uname -m`: use `-arm64.AppImage` for `aarch64`, or the build-only `-x64.AppImage` for `x86_64`.                                                  |
| Windows reports a missing runtime DLL or `ERR_DLOPEN_FAILED` | Install the Microsoft Visual C++ Redistributable for your architecture (ARM64 or x64), see [installation](installation.md#windows).                     |
| Checksum verification fails                                  | Ensure both the installer and `.sha256` file were downloaded from the same release.                                                                     |

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
- Changes to `font.family` and `font.lineHeight` apply to new panes/tabs and require restarting OMXTerm to update existing Surfaces. A native font read already started for a pending Surface can finish with its original family. Requests must still match the current family at admission; obsolete queued reads that have not started can fail initialization.
- Changes to `windowsShell` apply to new Default Shell sessions; changes to default bar visibility (`showTitleBar`, `showTabBar`, `alwaysOnTop`) apply to new windows.
- Edits to `snippets.yaml` load automatically whenever you close and reopen the Snippets sidebar.

See [reloading user configuration](configuration.md#reloading-user-configuration) and [theme troubleshooting](configuration.md#theme-troubleshooting) for details.

### Insert, run or preview a snippet

Linux ARM64/x64 and macOS ARM64 source, along with the published Linux ARM64
**0.24.0-dev.11**, macOS ARM64 **0.24.0-dev.16** and Linux x64 **0.24.0-dev.30**
previews, use optional installed Snippets. Stable **0.23.0** and published Windows
hosts retain the built-in tool. The [Linux x64 preview](snippets-migration.md#linux-x64-published-preview-and-catalog-candidate)
uses explicit local-archive installation while catalog promotion and public-HTTPS
consumption remain separate.
Both ARM64 previews offer Snippets through **Settings → Extensions → Browse official
extensions**; explicit local/offline archive installation also remains available.
The [migration guide](snippets-migration.md) links the matching previews and explains
installation, disabled/unavailable states, unchanged catalogs and qualification
limits. On optional-Snippets hosts, the existing shortcut opens Extensions
management when no enabled package is available.

Each snippet row shows what clicking it does: **Insert** types the snippet without pressing Enter, and **Run · adds Enter** types it and presses Enter (`execute: true` in `snippets.yaml`). Click **Preview** to see the exact text first, then choose **Insert — no added Enter** or **Run — adds Enter**; that choice wins over the snippet's default. The snippet goes only to the focused pane captured when you opened the preview, never to a later selected or replacement pane. If that terminal ends, fails or is removed, the actions are disabled and nothing is sent, even if its pane remains visible for failure acknowledgement. Insert only skips the final Enter: a snippet with several lines can still run each line, and multiline text may still ask for paste confirmation.

Change the interface language in **Settings → General → Language**. Row and preview controls update in place, including an unavailable-terminal notice; your snippet text, captured target, focus and disabled actions are retained. About, local-image and snippet previews do not stack. Those modals block pane split/focus/equalize, tab navigation and divider input; approved closure still works. Settings is instead a normal tab: terminal-only actions do nothing there, while tab/window actions stay available. Pane menus, Surface names and resize separators also follow the interface language without replacing sessions.

### Shared companion panel

The Linux ARM64 preview's installed **Files** and **SSH Connect** tools open beside
the terminal through their existing File-menu, palette or terminal-context actions.
Optional `toggleFiles` and `toggleSshConnect` shortcuts can be configured in
**Settings → Shortcuts**; neither has a default binding. They use the same tool
entry points, once per key press. Missing or disabled tools do not consume their
configured key or install/enable themselves.
The panel's labeled buttons switch between opened tools without closing them.
**Hide panel** (−) or Escape retains their state. **Close tool** (×) closes the
selected tool and hides the panel, retaining any other open tools. Invoking a
tool's ordinary entry point closes it only when it is already selected and
visible; otherwise it reveals or opens it. Reopening a closed tool creates a
fresh view, discarding its old drafts/search state.

**View → Toggle Auxiliary Panel** independently hides or reveals retained tools.
It has no default shortcut; configure `toggleAuxiliaryPanel` in Settings or
`keybinds`. Reveal restores the remembered open tool or the first remaining one;
with no open tools it does nothing. Tool close does not disable the extension
or end terminal sessions. Accepted file operations or SSH launches may still
finish; close does not promise cancellation or rollback, and reopening does not
repeat an operation.
Switching terminal tabs keeps the panel visible. Connecting through SSH opens a
new terminal tab without replacing the current session or closing the panel.
Settings and general extension tabs temporarily suspend it.

Files keeps the terminal directory captured when its view first opened. Closing
that terminal leaves the tool available; disabling or removing the extension
retires its view. Published legacy extension pages retain their own styling.

### Resize or close Snippets

Choose **Settings → Window → Auxiliary panel side** for left or right placement (right by default). This saved choice applies live to the shared Snippets/Files/SSH panel in all windows, preserving tool drafts and focus. Width and visibility remain memory-only. Drag the separator between the panel and terminal to resize. Its 1 px line matches pane dividers but retains a 6 px resize target; keyboard focus highlights the line, not a rectangle. You can also focus the separator with Tab: Left/Right move it physically by 10 px (Left grows a right-side panel; Right grows a left-side panel), and Home/End choose the current minimum/maximum. The default width is 280 px, bounded to 220–560 px and the available window space. The header's Hide button or Escape inside the panel hides it and returns terminal focus. Close disposes the selected tool instead. `Cmd+Shift+S` / `Ctrl+Shift+S` (**View → Toggle Snippets**) closes selected-visible Snippets, otherwise opens or reveals it.

The panel shrinks automatically in narrow windows and hides below 406 px of content width. Widen the window and open it again; it does not reopen automatically. Your preferred width, search and scroll survive hiding and configuration/theme changes in that window only, not restart. The remaining terminal allowance does not guarantee columns with extreme padding.

Snippets is nonmodal: clicking the terminal keeps normal terminal input. Copy/Paste/Select All edit the search field while it holds focus; unsupported panel controls suppress terminal clipboard delivery instead. Selecting Settings or a general extension tab suspends the panel; returning to a terminal restores the selected tool. About, snippet preview and Local Image Preview temporarily make the retained visible panel inert.

### A program draws text in the wrong place

This is a known issue ([#568](https://github.com/luizomf/omxterm/issues/568)). Programs that ask the terminal where the cursor is can get a slightly wrong answer after emoji, other wide characters, or a window resize.

### The renderer cannot start

OMXTerm requires **WebGL2** to draw the terminal. On Linux it permits Chromium's SwiftShader WebGL fallback when available, with higher CPU use and [lower graphics/JIT security guarantees](adr/0037-allow-the-linux-software-webgl-fallback.md). Initialization may still fail; the error alone does not diagnose a driver problem. Separate, opt-in Mesa/blocklist troubleshooting remains available through the Linux installer's [graphics compatibility mode](linux-installer.md#only-if-graphics-fail) or the launch flags in [Linux graphics troubleshooting](linux-desktop.md#graphics-troubleshooting).

### macOS asks for folder permissions again after an update

Quit OMXTerm before replacing `OMXTerm.app` in `/Applications`, and approve folder access if macOS prompts you on launch.

## Local diagnostics

To inspect runtime diagnostics, choose **View → Toggle Developer Tools**. Be sure to redact any private paths or terminal output before sharing screenshots.

OMXTerm writes bounded operational logs (up to two 5 MiB files: `omxterm.jsonl` and `omxterm.previous.jsonl`) in:

- **macOS and Linux:** `~/.local/state/omxterm/logs` (or `$XDG_STATE_HOME/omxterm/logs`)
- **Windows:** `%USERPROFILE%\.local\state\omxterm\logs`

You can set `"logLevel"` in `config.json` to `"error"`, `"info"` (default), or `"debug"`. Logs record only app lifecycle and operational events — never your terminal text, commands, clipboard, or configuration values.
