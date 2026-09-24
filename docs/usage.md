# Everyday OMXTerm use

[Install OMXTerm](../README.md#installation), then launch it to open your shell
in your home directory. No configuration is required.

- [Tabs and windows](#windows-tabs-and-sessions)
- [Shortcuts](#built-in-platform-shortcuts)
- [Copy, paste, and file paths](#copy-and-paste)
- [Web links](#opening-visible-web-links)
- [Local and inline images](#previewing-local-images)
- [Troubleshooting](#troubleshooting)

For fonts, themes, keybinds, and snippets, see [Configuration](configuration.md).
These guides follow the current source tree; the [README](../README.md) identifies
the latest download, and [release notes](releases/) describe older versions.

## Windows, tabs, and sessions

Choose **File → New Tab** for another session in the current window, or
**File → New Window** for an independent window. Every tab starts its own shell.

The tab bar appears when a window has at least two tabs. Click a tab to select
it, drag it horizontally to reorder it, or use the shortcuts below. Next/previous
tab wraps around; selecting a position that is not open does nothing.

**View → Toggle Tab Bar** hides or enables the bar for the current window.
Shortcuts and the native Window menu still switch tabs when it is hidden. The
choice survives configuration reload, but new windows start with the bar enabled.

Tab order and sessions are not saved between launches. OMXTerm has no splits or
cross-window tab moves. Use tmux or another session tool when work must survive
closing a tab or window.

### Closing tabs, windows, and the app

Closing a tab ends its session. Closing a window ends all its sessions; closing
the last tab closes the window, and closing the last window quits OMXTerm.
An ordinary shell exit closes its tab without confirmation.

By default, OMXTerm asks before closing running work. It checks the affected
sessions and asks at most once per action. On macOS and Linux, an idle shell does
not need confirmation; an unreadable foreground process counts as Busy.
**On Windows, every live session counts as Busy** because ConPTY does not expose
the foreground process name. Set `confirmClose` to `false` only if you want to
disable these confirmations.

## Window controls

- **Zoom** changes font size for every tab in the current window, including new
  tabs. It is temporary; **Actual Size** returns to the configured baseline.
- **View → Toggle Full Screen** affects the selected window. On macOS, native
  fullscreen reclaims the app's title inset while preserving configured padding
  and the system safe area.
- **Window → Always on Top** toggles the current window. To choose the default
  for new windows, set `window.alwaysOnTop` in your configuration.

These window actions do not edit configuration files.

## Built-in platform shortcuts

Application menus show the effective shortcuts, including your custom bindings.

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
| Toggle Snippets           | `Cmd+Shift+S`     | `Ctrl+Shift+S`     |
| Reload User Configuration | `Cmd+Shift+,`     | `Ctrl+Shift+,`     |

For `+`, include the Shift needed to type the symbol: often `Ctrl+Shift+=` or
`Cmd+Shift+=`. A dedicated keypad `+` needs no Shift.

On Linux and Windows, press and release **Alt** to reveal the hidden application
menu. Always on Top, Open Local Image, and Developer Tools are menu-only actions.
To remap the supported shortcuts, use [keybinds](configuration.md#keybinds).
Application shortcuts consume their key instead of sending it to the shell.

## Copy and paste

Select text, then use **Edit → Copy**, its shortcut, or the native context menu.
Selection alone never copies. In a program that captures the mouse, hold **Shift**
to select terminal text instead of sending mouse input to that program.

Paste is also an explicit menu, shortcut, or context-menu action. Under the
built-in bindings, bare `Ctrl+C` and `Ctrl+V` remain terminal input. This lets
`Ctrl+C` interrupt a process and lets a child CLI handle `Ctrl+V` itself, for
example to read an image from the system clipboard. OMXTerm does not send
clipboard image bytes through the terminal.

Plain text takes priority over clipboard file lists and is pasted unchanged.

### Protected Paste

If the receiving program has not enabled bracketed paste, OMXTerm asks before
pasting multiple lines or control characters. Choose **Paste** to send the whole
text or **Cancel** to send nothing.

With bracketed paste enabled, the text is delivered as one paste-aware operation
without that prompt. Review commands before executing them. Snippets and file
path insertion use the same Protected Paste handling.

## Inserting file and folder paths

Drag files or folders from your file manager into OMXTerm to insert their
absolute paths in the selected tab. Paste also inserts file paths when the
clipboard contains a supported native file list and no plain text.

OMXTerm quotes each path, separates paths with spaces, and does not press Enter.
Review the inserted text before running it. Quoting uses POSIX shell syntax on
macOS/Linux and Windows PowerShell syntax on Windows, even if you selected Git
Bash. Adjust it when working in another shell, SSH session, REPL, or a partially
written quoted argument.

On Windows, clipboard Paste currently reads only one Explorer path; dragging
several files inserts them all. OMXTerm inserts paths without reading their files.

## Opening visible web links

Hold **Cmd** on macOS or **Ctrl** on Linux/Windows while pointing at a visible
`http://` or `https://` URL. OMXTerm underlines the destination; click with that
modifier held to open it in your browser. Check the visible destination first.

The whole URL must be visible, including wrapped lines. Scroll it into view if
it will not activate. Hidden OSC 8 destinations are ignored; only the literal
visible URL is opened. Modified clicks do not also reach a mouse-aware TUI.

## Previewing local images

Choose **File → Open Local Image…** and select a PNG or JPEG. A temporary overlay
shows the image; press **Escape**, click its close button, or click the backdrop
to return to the terminal. Clipboard, snippets, file drops, zoom, and tab-bar
actions are paused while the preview is active.

You can also use **Cmd+click** (macOS) or **Ctrl+click** (Linux/Windows) on a visible
absolute path or authority-free `file:///` URL. For native paths, put the path on
its own or between whitespace, without quotes or trailing punctuation. Use the
picker for names containing spaces.

Supported previews are static PNG/JPEG files up to **16 MiB**, **8192 pixels per
side**, and **16 million pixels**. Relative paths, `~`, UNC paths, animated images,
and other formats are unsupported. Paths always refer to the machine running
OMXTerm, even when SSH printed them. OMXTerm reads only after activation and does
not download remote images or save preview copies.

## Inline terminal images

OMXTerm also renders static images emitted directly by supported Pi and Chafa
Kitty graphics paths. These are terminal output, separate from local previews.
They work in direct sessions, **not through tmux or screen**.

For Chafa's tested 1.18.2 Kitty output, replace the example path with your image:

```sh
chafa -f kitty /path/to/image.png
```

Pi 0.84.4 needs explicit Kitty selection. Merge this into your Pi settings:

```json
{
  "terminal": {
    "images": "kitty"
  }
}
```

Or, for one run in a POSIX shell:

```sh
PI_IMAGE_PROTOCOL=kitty pi
```

Keep Pi's default image autoresizing enabled. Images follow terminal scrolling,
resize, zoom, and tab changes. SIXEL, iTerm2 images, animation, and other Kitty
paths are unsupported. The [product contract](spec.md#terminal-behavior) records
the exact protocol and resource limits.

## Bells and attention

BEL is silent. OMXTerm marks the ringing tab with `🔔` and, if its window is
unfocused, requests native attention once: a Dock bounce on macOS or the
desktop's attention indicator on Linux/Windows. Focusing or interacting with
that session clears its marker. Unselected tabs keep their markers until visited.

Screen inversion is a separate terminal effect. If Bash or Vim flashes the
screen, use the preferences below.

## Troubleshooting

### Bright flashes in Bash

Some Bash setups enable Readline's visual bell. Disable it for the current session:

```bash
bind 'set bell-style none'
```

For future sessions, add or change `set bell-style none` in your Bash
`~/.inputrc` (or the file selected by `INPUTRC`). Preserve other settings and put
it after existing includes. If creating a new file, use:

```text
$include /etc/inputrc
set bell-style none
```

Open a new Bash session. This changes Bash/Readline's bell, not other programs'
screen-inversion behavior.

### Bright flashes in Vim

In Vim, run:

```vim
:set belloff=all
```

To keep it, add `set belloff=all` to your `.vimrc`. See `:help 'belloff'` for details.

### Configuration changes do not appear

Save `config.json`, then choose **View → Reload User Configuration**. Fix any
reported error and reload again; a failed reload keeps the previous settings.
Font family and line height require a restart for existing tabs. Snippets are
reread when their sidebar opens, not by configuration reload.

See [configuration reload](configuration.md#reloading-user-configuration) and
[theme troubleshooting](configuration.md#theme-troubleshooting) for details.

### The renderer cannot start

OMXTerm needs WebGL2 and its bundled fonts/core before starting a tab's shell;
there is no software-rendering fallback. A rendering failure reports an error
rather than leaving an invisible shell. Irrecoverable graphics-context loss
closes only the affected session. Include your OS, GPU/environment, OMXTerm
version, and the error when reporting a problem.

### macOS asks for file access again after an update

Ad-hoc-signed builds can need renewed privacy approval after replacement. Quit
OMXTerm before replacing it, keep one installation in Applications, and approve
the needed access in **System Settings → Privacy & Security**. Full Disk Access
is not required for ordinary terminal use.

## Local diagnostics

**View → Toggle Developer Tools** opens local Electron diagnostics for the
selected window; it does not enable remote debugging. Inspectors, screenshots,
console output, and profiles can expose terminal content and local paths.
Review and redact them before sharing.

Operational logs are stored locally:

- with `XDG_STATE_HOME` set: `$XDG_STATE_HOME/omxterm/logs`;
- otherwise: `~/.local/state/omxterm/logs` (Windows:
  `%USERPROFILE%\.local\state\omxterm\logs`).

The files are `omxterm.jsonl` and `omxterm.previous.jsonl`, capped at 5 MiB each.
`logLevel` selects `error`, `info` (default), or `debug`. Even debug logs exclude
terminal input/output, clipboard data, configuration and environment contents,
commands, arguments, executable names, and titles. OMXTerm sends no remote logs
or telemetry. Child programs retain their normal network access.

For a report, include the version or source commit, platform, minimal reproduction,
expected result, and actual result. See [Contributing](../CONTRIBUTING.md).
