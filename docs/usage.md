# Everyday OMXTerm use

[Install OMXTerm](installation.md), open it, and start typing. It launches your
usual shell in your home folder; on Windows, the default is Windows PowerShell.

**[Tabs](#windows-tabs-and-sessions)** · **[Shortcuts](#built-in-platform-shortcuts)** ·
**[Copy and paste](#copy-and-paste)** · **[Images](#previewing-local-images)** ·
**[Troubleshooting](#troubleshooting)**

For fonts, colors, shortcuts, and snippets, see [Configuration](configuration.md).

## Windows, tabs, and sessions

Choose **File → New Tab** for another session, or **File → New Window** for a
separate window. Each tab starts its own shell.

The tab bar appears when there are at least two tabs. Click to select a tab,
drag to reorder it, or use the shortcuts below. **View → Toggle Tab Bar** hides
or shows the bar; keyboard shortcuts still work while it's hidden.

Each started tab shows its shell or explicit program's basename until it supplies
a valid terminal title, even when the program emits no title at startup. The
window title follows the selected tab. Titles are display-only and never saved
or logged.

Closing a tab ends its session. Closing a window ends all its sessions; closing
the last window quits OMXTerm. Tabs and their order aren't saved between launches.
Use a session manager such as tmux for work that needs to survive closing a tab.

### Closing tabs, windows, and the app

By default, OMXTerm asks before closing running work, with one confirmation per
action. Idle shells close immediately on macOS and Linux. **Windows asks for
every running session**, because it cannot reliably tell whether a shell is idle.
You can turn confirmations off with `confirmClose` in your settings.

Close Tab confirmation applies only to its original tab. If that session exits
while the question is open, approving it leaves the surviving tabs alone.

A background tab closing or exiting does not change your selected session or
where typing, Paste and snippets go. Closing the selected tab selects its right
neighbor, or its left neighbor if it was last.

Typing `exit` closes that shell's tab, without closing another tab that is still
initializing. You can close an initializing tab without starting its shell.
A session failure dialog stays open for acknowledgement even if another shell
exits meanwhile. Acknowledging one failure leaves other pending failures and
usable or initializing tabs alone. You can still explicitly close the window
or quit the app. A command or Default Shell that cannot execute shows a startup
failure; OMXTerm does not substitute another shell. A program that did start
and returns a nonzero exit code still closes normally without a failure dialog.

The app may take a moment to finish shutting down its processes after its last
window closes.

## Window controls

- **Zoom** changes the font size in the current window. **Actual Size** resets it.
- **View → Toggle Title Bar** hides or shows the title area. When it's hidden,
  move your pointer near the top and drag the three dots to move the window.
- **View → Toggle Full Screen** fills the display and temporarily hides the title
  area. Leaving fullscreen restores your previous choice.
- **Window → Always on Top** keeps the current window above ordinary windows.

These choices last for that window. Set defaults for new windows in
[Configuration](configuration.md).

## Built-in platform shortcuts

The app menus show your current shortcuts, including any custom bindings.

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
| Zoom In                   | `Cmd++`           | `Ctrl++`           |
| Zoom Out                  | `Cmd+-`           | `Ctrl+-`           |
| Actual Size               | `Cmd+0`           | `Ctrl+0`           |
| Toggle Full Screen        | `Ctrl+Cmd+F`      | `Ctrl+Shift+F`     |
| Toggle Tab Bar            | `Cmd+Shift+B`     | `Ctrl+Shift+B`     |
| Toggle Title Bar          | `Cmd+Shift+D`     | `Ctrl+Shift+D`     |
| Toggle Snippets           | `Cmd+Shift+S`     | `Ctrl+Shift+S`     |
| Reload User Configuration | `Cmd+Shift+,`     | `Ctrl+Shift+,`     |

For `+`, include Shift when needed to type the symbol: often `Ctrl+Shift+=` or
`Cmd+Shift+=`. A keypad `+` needs no Shift.

On Linux and Windows, press and release **Alt alone** to open the application
menu, including when the title bar is hidden. Press Escape to dismiss it.
On macOS, use the menu bar at the top of the screen.

Always on Top, Open Local Image, and Developer Tools are available through the
menus. To change keyboard shortcuts, see [keybinds](configuration.md#keybinds).

## Copy and paste

Select text, then use **Edit → Copy**, its shortcut, or the right-click menu.
In a program that captures the mouse, hold **Shift** while selecting text.

Use the Paste shortcut or menu to paste. **Ctrl+C interrupts a command**, while
**Ctrl+V goes to the running program**. Some tools use Ctrl+V to attach clipboard
images themselves. Selecting text alone doesn't copy it.

### Protected Paste

OMXTerm asks before pasting multiple lines or control characters when the
receiving program isn't set up to handle pasted text. Choose **Paste** to send
the whole text or **Cancel** to send nothing.

Programs that enable **bracketed paste** can distinguish pasted text from typing,
so they receive it without this prompt. Review commands before running them.
Snippets and inserted file paths use the same handling.

## Inserting file and folder paths

Drag files or folders into OMXTerm to insert their full paths in the selected
tab. Copying files in a file manager and using Paste also works when the clipboard
contains a supported file list. Plain text takes priority if both are present.

OMXTerm quotes each path and separates them with spaces. You press Enter when
ready. The quoting is designed for POSIX shells on macOS/Linux and Windows
PowerShell on Windows. Adjust it if you're using another shell (including Git
Bash on Windows), a remote session, or an unfinished quoted argument.

On Windows, Paste currently inserts only one Explorer path; drag several files
to insert them all.

## Opening visible web links

Hold **Cmd** on macOS or **Ctrl** on Linux/Windows over an `http://` or `https://`
URL. It becomes underlined; click while holding the key to open it in your browser.

The whole URL must be visible, including wrapped lines. Scroll it into view if
it won't activate. OMXTerm opens the visible URL rather than hidden link targets.

## Previewing local images

Choose **File → Open Local Image…** and select a PNG or JPEG. Press **Escape**,
click the close button, or click outside the image to return to your terminal.
Close the preview before pasting, zooming, or changing the title or tab bars.

You can also **Cmd+click** (macOS) or **Ctrl+click** (Linux/Windows) a visible full
path or `file:///` URL. The complete reference must be visible, including wrapped
lines. Surround a path containing spaces with matching single or double quotes.
For example: `'/Users/demo/Pictures/a photo.png'` or `'C:\Pictures\a photo.jpg'`.
Quotes are literal wrappers, not shell syntax: no variables, escapes or commands
are evaluated. Brackets, assignment prefixes and trailing punctuation are not
trimmed; use the native file picker for forms the recognizer cannot express.

`~` and `~/...`, including quoted forms, refer to the local OMXTerm user's home.
Relative references beginning `./` or `../` (also `.\` or `..\` on Windows),
and relative names ending `.png`, `.jpg`, `.jpeg` or `.webp`, prompt you to choose
their **local base folder**. The directory picker starts at home, but home is not
assumed: choose the intended folder or cancel without opening anything. Each
activation asks again; OMXTerm never tracks or guesses an agent's/shell's cwd.
`..` resolves normally against your selected folder, not inside a new sandbox.

Tool locations such as `/tmp/image.png:12` or `~/image.png:12:3` first try the
literal filename, then remove the positive line/column suffix only if that exact
file is absent. Existing files are never replaced by this fallback on a format,
permission or decode failure. Quotes disambiguate: `'/tmp/image.png:12'` means the
literal colon filename only; `'/tmp/image.png':12` means `image.png` with a tool
location outside the quotes. The native picker and `file:///` URLs always name
literal files without tool-suffix interpretation. `%` and `#` in native paths
remain literal filename characters.

Previews support static PNG/JPEG files up to **16 MiB**, **8192 pixels per side**,
and **16 million pixels**. **Actual WebP is not supported**, even when its path
is recognized; an unsupported-format message distinguishes it from an unavailable
file. Content, not the extension, determines format. Network shares, device paths
and remote files are unsupported. Even if SSH printed the path, it refers to the
computer running OMXTerm, never the remote host.

## Inline terminal images

OMXTerm can display images sent by [Chafa](https://hpjansson.org/chafa/) and
[Pi](https://github.com/badlogic/pi-mono). These appear in terminal output, unlike
the temporary preview above. Use them directly in OMXTerm; images through tmux
or screen aren't supported.

For Chafa's tested 1.18.2 Kitty output, replace the example path with your image:

```sh
chafa -f kitty /path/to/image.png
```

For Pi 0.84.4, merge this into your Pi settings:

```json
{
  "terminal": {
    "images": "kitty"
  }
}
```

Or select Kitty images for one run in a POSIX shell:

```sh
PI_IMAGE_PROTOCOL=kitty pi
```

Keep Pi's default image autoresizing enabled. The [technical reference](spec.md#terminal-behavior)
records supported image formats and size limits.

## Bells and attention

Terminal alerts are silent. OMXTerm marks the tab with `🔔` and asks the desktop
for attention when its window is unfocused (a Dock bounce on macOS). Return to
and interact with the tab to clear its marker.

If Bash or Vim flashes the whole screen instead, try the fixes below.

## Troubleshooting

### The download will not open

Start with the [installation guide](installation.md) for your system.

| Symptom                                                      | Try this                                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| macOS warns about an unidentified developer                  | Verify the download and follow the [per-app Open Anyway steps](installation.md#if-macos-blocks-the-first-launch).                  |
| Linux says “Permission denied”                               | Use the guide's `chmod +x` step as your ordinary user. If that fails, move the app to a local folder that allows running programs. |
| Linux reports FUSE or a mount failure                        | Use `--appimage-extract-and-run` after verification.                                                                               |
| Linux reports `GLIBC_2.42 not found`                         | This distribution is too old for the AppImage. Use a compatible distribution; keep its system glibc intact.                        |
| Linux reports an executable format error                     | Check `uname -m`: the package needs `aarch64`.                                                                                     |
| Windows reports a missing runtime DLL or `ERR_DLOPEN_FAILED` | Install the [official ARM64 Visual C++ runtime](installation.md#windows).                                                          |
| A checksum fails or names a missing file                     | Download the package and checksum from the same release, check the filenames, and verify again before running it.                  |

Still stuck? [Tell us what happened](../CONTRIBUTING.md#report-a-problem).
Include your system, OMXTerm version, and the error you saw.

### Background blur or transparency does not appear

Set transparency above `0`, save, and reload. On Windows, enable blur too.
Your desktop may need its blur effect enabled, and programs that paint their own
background can stay opaque. See [background effects and desktop tips](configuration.md#background-transparency-and-blur).

### Bright flashes in Bash

Turn off Bash/Readline's visual bell for the current session:

```bash
bind 'set bell-style none'
```

For future sessions, add `set bell-style none` after any includes in `~/.inputrc`
(or the file selected by `INPUTRC`). If you're creating a new file, use:

```text
$include /etc/inputrc
set bell-style none
```

Open a new Bash session. Other programs have their own bell preferences.

### Bright flashes in Vim

Run `:set belloff=all` in Vim. To keep it, add `set belloff=all` to your `.vimrc`.

### Configuration changes do not appear

Save `config.json`, then choose **View → Reload User Configuration**. If an error
appears, fix it and reload; the previous settings stay active until then.

- Check the [file location](configuration.md#create-the-configuration-directory)
  and make sure the filename is `config.json`, not `config.json.txt`.
- Use straight double quotes and valid JSON, without comments or trailing commas.
- Restart for font family or line-height changes in existing tabs.
- Open a new tab for a changed Windows shell, or a new window for title/tab-bar
  defaults. Use the View menu to change the bars in your current window.
- Close and reopen the snippets sidebar to load snippet edits.

See [reload details](configuration.md#reloading-user-configuration) or
[theme troubleshooting](configuration.md#theme-troubleshooting) for more help.

### The renderer cannot start

OMXTerm needs **WebGL2**, the graphics capability that draws the terminal. If
initialization fails, it shows an error before starting the shell. On Linux,
try the desktop helper's [graphics compatibility mode](linux-installer.md#only-if-graphics-fail).
For a report, include your system, GPU or virtual machine if known, and the error.

### macOS asks for file access again after an update

Quit OMXTerm before replacing it, keep one installation in Applications, and
approve the folders you need in **System Settings → Privacy & Security**.
Ordinary use doesn't require Full Disk Access.

## Local diagnostics

A description of the problem is enough to open a report. If you want to dig
further, **View → Toggle Developer Tools** opens local diagnostics. Review
screenshots and diagnostic output for private terminal content before sharing.

Logs live in `~/.local/state/omxterm/logs` (Windows:
`%USERPROFILE%\.local\state\omxterm\logs`). If `XDG_STATE_HOME` is set, use
`$XDG_STATE_HOME/omxterm/logs` instead.

The files are `omxterm.jsonl` and `omxterm.previous.jsonl`, capped at 5 MiB each.
Set `logLevel` to `error`, `info` (the default), or `debug`. Logs describe app
operations and leave out terminal contents, commands, clipboard data, and
settings. They stay on your computer.
