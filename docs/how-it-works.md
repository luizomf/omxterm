# How OMXTerm works

OMXTerm is a desktop terminal for your command-line programs. It adds tabs, split panes, copy and paste, themes, and image previews around the shell already on your computer. Your shell and programs do the command-line work; OMXTerm displays their output in the terminal window.

New here? [Install OMXTerm](installation.md), try the [first session](../README.md#first-session), then see [Everyday use](usage.md).

## The terminal, the shell, and your programs

- **OMXTerm** displays text and sends your keystrokes.
- Your **shell** (for example, Zsh, Bash, or PowerShell) reads commands and starts programs.
- A **program** (such as Git or Neovim) does the requested work.

A prompt is the shell's invitation to enter a command. OMXTerm sends your input through a local system connection called a **pseudo-terminal (PTY)** to the shell, then displays the output. Your prompt, aliases (short command names), history, and startup settings belong to your shell; OMXTerm does not edit its startup files. See [shell startup help](usage.md#shell-preferences-do-not-load) if your usual prompt or aliases do not appear.

## What happens when you open OMXTerm

1. **Settings load.** OMXTerm reads your configuration and theme. It can create starter files without replacing yours; see [Configuration](configuration.md).
2. **The terminal opens.** A window starts with one tab and one pane—the area that shows a shell.
3. **Your shell starts** in your home folder. On macOS and Linux, OMXTerm starts your account's shell in interactive login mode. On Windows, it uses the configured shell or Windows PowerShell; if PowerShell is absent, it tries the Windows command processor (`ComSpec`). OMXTerm supplies no login flag on Windows. See [Windows shell preferences](configuration.md#choose-the-windows-default-shell).

## How input and output flow

```text
Keyboard ─▶ OMXTerm ─▶ PTY ─▶ Shell / command
Screen   ◀─ OMXTerm ◀─ PTY ◀─ Shell / command
```

OMXTerm draws the result—including colors, full-screen apps, and inline images—on your screen. When you resize or zoom the window, OMXTerm updates the terminal's rows and columns so programs can redraw to fit.

## Tabs and sessions

A terminal tab starts with one pane. Splitting it creates another pane with its own independent session: a shell and its terminal state. Changing folders in one pane does not change another. See [tabs and sessions](usage.md#windows-tabs-and-sessions) and [split panes](usage.md#split-panes).

Switching tabs leaves sessions running. Closing a pane ends its session; closing a tab ends all its panes. OMXTerm does not restore running sessions after you quit. To keep a process running beyond the window, use a session manager such as `tmux` inside your shell.

## Customization and conveniences

- Use **Settings** for fonts, themes, and shortcuts. If you edit a configuration or theme file yourself, choose **View → Reload User Configuration**; see [Configuration](configuration.md).
- **Snippets** saves reusable text. A new installation adds it once from the app's own files (Windows x64 has it built in). See [Snippets setup](configuration.md#snippets) and [Snippets availability](snippets-availability.md), including a known Windows ARM64 issue.
- **Protected Paste** can ask before sending multiline text. You can also [preview local images](usage.md#previewing-local-images); see [Protected Paste](usage.md#protected-paste) for its limits.

## Privacy and local data

- OMXTerm has no telemetry, analytics, crash reporting, automatic update checks, or remote log delivery. On Windows, we have not yet confirmed that the app makes no network requests at all.
- OMXTerm does not automatically save terminal text. Scrollback (earlier output) stays in memory while a pane is open. Operational logs record app events, not terminal contents, commands, clipboard data, or configuration values.
- Programs and extensions use your permissions, including access to files and the network. Extensions are not sandboxed; install only code you trust. The official catalog is fetched when you choose Browse or Refresh, and an online install can use the network. The bundled Snippets attempt uses local app files instead.

<a id="a-short-demonstration"></a>

## Quick tour

Use the menu bar on macOS; on Linux/Windows, press and release **Alt** to open the app menu.

1. **Run a command:** at the prompt, type `pwd` and press Enter to print your current folder. This works in common shells; in Windows Command Prompt, use `cd` instead. For another configured shell, use its equivalent.
2. **Open a tab:** press `Cmd+T` on macOS or `Ctrl+Shift+T` on Linux/Windows. The new tab has its own shell session.
3. **Split the tab:** choose **View → Pane → Split Right** (`Cmd+D` / `Ctrl+Shift+O`) for another shell. If there is not enough space for a split, enlarge the window or reduce zoom. See [split-pane details](usage.md#split-panes).
4. **Change the look:** open **Settings → Appearance** and change **Font size**. Once applied, it changes open panes.
5. **Return to a terminal tab**, then choose **View → Toggle Snippets** (`Cmd+Shift+S` / `Ctrl+Shift+S`). If **Settings → Extensions** opens instead, enable Snippets if installed but disabled, or [install it](snippets-migration.md#install-deliberately). Return to a terminal tab and toggle again; if unavailable, skip to step 7.
6. **Try a snippet:** the panel may be empty. Add an entry to `snippets.yaml`, creating it if needed. It normally sits beside `config.json`; see [locations and exceptions](configuration.md) and the [example](configuration.md#snippets). Adapt the example to your shell: `printf` is for POSIX shells. Close and reopen the panel, then choose **Preview**. Choose **Cancel** to send nothing, or **Insert** or **Run** to send it. Insert adds no Enter, but embedded newlines or controls can still execute commands; Run adds Enter.
7. **Preview a local image:** choose **File → Open Local Image…**, select an existing supported PNG or JPEG in the chooser, and view the preview. Press `Escape` to return. See [image previews](usage.md#previewing-local-images) for limits.

Shortcuts can be remapped; the application menu shows the active bindings. For technical details, see the [product specification](spec.md), [architecture decisions](adr/README.md), and [contributing guide](../CONTRIBUTING.md).
