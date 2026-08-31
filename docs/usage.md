# Everyday OMXTerm use

This is a practical, non-normative guide to the OMXTerm behavior available
today. The [product contract](spec.md) remains the authority for observable
behavior, and the [User Configuration guide](configuration.md) explains the
preferences and keybind format.

A quick status key:

- **Current** means the behavior is available now.
- **Configurable** means the behavior is current, but User Configuration can
  change its default or shortcut.
- **Deferred** means it is intentionally not a current feature.

## Windows, tabs, and sessions

**Current:** Starting OMXTerm opens one Terminal Window with one selected
Terminal Tab. Every tab owns a separate Live Terminal Session: a new tab starts
another shell rather than showing another view of the existing shell. A new
window is independent of every existing window and its tabs.

Use `File -> New Tab` to add a tab to the selected window. Use
`File -> New Window` to open another window. The tab strip stays hidden with one tab and
appears when the window has two or more tabs. A newly created tab is selected.

To move around:

- click a tab to select it and return terminal focus to its Terminal Surface;
- drag a tab horizontally to reorder it within its current window;
- use next/previous tab to cycle with wraparound; or
- use a position shortcut to select tab 1 through 9. A position that is not
  open does nothing.

A drag changes the visible order, cycling order, and positional shortcuts
immediately. It does not restart or replace any session. Order is independent
per window and lasts only until the window closes.

**Deferred:** tabs are not saved or restored, and they cannot be moved between
windows. Saved sessions, reconnectable sessions, splits, and workspaces are not
current OMXTerm features. If a process must survive a tab or window closing,
use a session tool such as tmux.

See the normative [window and session behavior](spec.md#window-and-session-behavior).

## Closing tabs, windows, and the app

**Current:** closing a tab terminates only its Live Terminal Session. Closing a
window terminates every session in that window. Closing the last tab also
closes its window, and closing the last window quits OMXTerm. Sessions are not
preserved for reconnection.

Close confirmation protects running work rather than every idle shell:

- Close Tab checks the selected session.
- Close Window checks all sessions in that window and asks at most once.
- Quit checks all open windows and asks at most once.

A confirmation appears only when `confirmClose` is enabled and at least one
affected session is **Busy**. A session is Busy when its PTY foreground process
is not the idle Default Shell. If OMXTerm cannot read that process name, it
safely treats the session as Busy. An ordinary Default Shell exit closes its
tab without a close confirmation, regardless of its exit code.

**Windows limitation:** ConPTY does not expose the foreground process name that
this check needs. OMXTerm therefore treats every live Windows session as Busy,
so closing a live tab, its window, or the app asks while confirmation is
enabled.

**Configurable:** `confirmClose` defaults to `true`. See the
[configuration reference](configuration.md#configuration-reference) rather
than copying a configuration schema from this guide.

## Window controls

**Current:** Window Font Zoom changes terminal font size for one Terminal
Window. It applies to every current tab in that window and to tabs created there
later. Zoom is ephemeral: it does not edit User Configuration, another window
keeps its own zoom, and a new window begins at the configured font-size
baseline. Actual Size returns the selected window to that baseline.

`View -> Toggle Full Screen` toggles only the selected window.
`Window -> Always on Top` likewise toggles only the selected window and does
not rewrite User Configuration.

**Configurable:** `window.alwaysOnTop` chooses the default for newly created
windows. Existing windows keep their current runtime toggle. Font size sets the
baseline; Window Font Zoom remains temporary. Details are in the
[User Configuration guide](configuration.md).

## Built-in platform shortcuts

These are the current built-in defaults. Application menus show the effective
shortcut.

| Action                 | macOS             | Linux and Windows  |
| ---------------------- | ----------------- | ------------------ |
| New Window             | `Cmd+N`           | `Ctrl+Shift+N`     |
| New Tab                | `Cmd+T`           | `Ctrl+Shift+T`     |
| Close Tab              | `Cmd+W`           | `Ctrl+Shift+W`     |
| Close Window           | `Cmd+Shift+W`     | `Ctrl+Shift+Q`     |
| Quit                   | `Cmd+Q`           | `Ctrl+Alt+Shift+Q` |
| Next Tab               | `Ctrl+Tab`        | `Ctrl+PageDown`    |
| Previous Tab           | `Ctrl+Shift+Tab`  | `Ctrl+PageUp`      |
| Select Tab 1 through 9 | `Cmd+1` … `Cmd+9` | `Alt+1` … `Alt+9`  |
| Copy                   | `Cmd+C`           | `Ctrl+Shift+C`     |
| Paste                  | `Cmd+V`           | `Ctrl+Shift+V`     |
| Select All             | `Cmd+A`           | `Ctrl+Shift+A`     |
| Zoom In                | `Cmd++`           | `Ctrl++`           |
| Zoom Out               | `Cmd+-`           | `Ctrl+-`           |
| Actual Size            | `Cmd+0`           | `Ctrl+0`           |
| Toggle Full Screen     | `Ctrl+Cmd+F`      | `Ctrl+Shift+F`     |

Always on Top has a menu action but no built-in shortcut.

**Configurable:** application shortcuts can be remapped through `keybinds`.
Unmapped actions keep these defaults. A remapped application action consumes
its key instead of sending it to the PTY, so take care not to shadow a shell or
TUI control key. See the complete [keybind guide](configuration.md#keybinds)
for accepted accelerators, collision rules, and warnings.

On Linux and Windows, the native application menu is hidden by default so the
Terminal Surface gets more room. Press and release `Alt` by itself to reveal
it temporarily. Using or dismissing the menu hides it again. macOS keeps its
normal menu behavior.

## Inline terminal images

**Current, direct sessions only:** OMXTerm renders bounded static PNG images
sent through the Pi-compatible Kitty graphics protocol. This works in regular
and fullscreen terminal interfaces when the child application emits the
supported protocol directly. It does not work through tmux, screen, or another
terminal multiplexer, and OMXTerm does not add passthrough wrappers.

Pi 0.84.4 does not yet recognize `TERM_PROGRAM=OMXTerm` automatically. Select
Kitty explicitly in Pi until that recognition ships:

```json
{
  "terminal": {
    "images": "kitty"
  }
}
```

For one run, `PI_IMAGE_PROTOCOL=kitty pi` selects the same protocol. OMXTerm
keeps its truthful Terminal Capability Identity and does not rewrite Pi
settings, inject Pi-specific variables, install terminfo, or add Shell
Integration.

Each Terminal Surface accepts Pi's direct PNG transmissions and image-ID,
delete-all, and delete-all-placements commands. It replies to Pi's cell-size
query and keeps supported images anchored while the direct session scrolls,
the Terminal Window resizes, Window Font Zoom changes, tabs are selected, or a
valid User Configuration Reload applies. Reset, alternate-buffer exit, and tab
disposal release the applicable images.

The per-Surface controls are 4,194,304 placement pixels, a 33,554,432-byte
Kitty transport target, and approximately 64,000,000 bytes of canvas-only FIFO
storage. Pi's padded Base64 ceiling under that transport target is 44,739,240
characters / 33,554,430 decoded bytes. An evicted image may become a
placeholder.

These controls are not a complete memory limit. The pinned beta addon has known
gaps around compressed and raw-pixel paths, natural PNG dimensions before
browser decode, retained payload Blobs, and an aggregate-uncapped pending map
where each distinct unfinished chunked image can retain an approximately 4 MiB
decoder until completion, reset, or tab disposal. Canvas rescaling, Chromium
decoding, and aggregate use across tabs are also outside the controls. The compatibility target is Pi's default
autoresized 2,000-by-2,000 pipeline; disabling Pi image autoresize removes that
finite compatibility envelope. SIXEL, iTerm2 images, animation, placement IDs,
remote images, downloads, and image persistence are unsupported.

Image bytes remain memory-only Terminal Payload on the existing PTY output IPC
path. Kitty support adds no image-specific IPC capability and never copies the
bytes into the clipboard, files, Operational Events, or application network
traffic. Clipboard Image Input remains a separate child-CLI behavior.

See the normative [Terminal behavior](spec.md#terminal-behavior) and
[ADR 0022](adr/0022-render-bounded-kitty-images-in-direct-sessions.md).

## Copy and paste

**Current:** selection alone never copies. After selecting text, deliberately
choose `Edit -> Copy`, the Copy shortcut, or Copy in the native context menu.
Paste is likewise an explicit menu, shortcut, or context-menu action.

The distinction between app actions and terminal input is deliberate:

- macOS uses `Cmd+C` and `Cmd+V` for OMXTerm copy and paste;
- Linux and Windows use `Ctrl+Shift+C` and `Ctrl+Shift+V`; and
- bare `Ctrl+C` and `Ctrl+V` remain PTY input under the built-in defaults.

That last point lets shells, TUIs, and local CLIs receive their normal control
keys. For example, `Ctrl+C` can interrupt a foreground process, while a child
CLI can handle `Ctrl+V` and read an image directly from the operating-system
clipboard. OMXTerm does not send clipboard image bytes through the PTY.

A non-empty plain-text clipboard value, including whitespace-only text, is
pasted unchanged and takes priority over native file-list formats. Paste is
never truncated, interpreted, summarized, or logged.

See the normative [Clipboard contract](spec.md#clipboard).

## Inserting file and folder paths

**Current:** drop native file-manager files or folders anywhere in a Terminal
Window to insert their absolute paths into the selected tab. The same path
insertion is available through Paste when the clipboard has no plain text and
exposes a supported native file list. Paths keep the platform-provided order,
are separated by one space, pass through Protected Paste, and never add Enter.

OMXTerm treats paths lexically: it does not read, resolve, normalize, or check
the targets. Each path becomes its own single-quoted token for the initial
Default Shell:

- macOS and Linux use POSIX shell quoting; and
- Windows uses Windows PowerShell 5.1 single-quote rules.

This quoting assumes insertion starts at a fresh ordinary argument-token
boundary. Without Shell Integration, OMXTerm cannot know the receiving
language or its current parse state. Do not rely on the generated quoting
inside a partial quote, nested shell, SSH session, REPL, or TUI; review and
adjust the inserted text there before running it.

Malformed, mixed, empty, or over-bound native lists insert nothing rather than
a partial list. The current limits are 256 paths, 32,768 UTF-16 code units per
path, and 1,048,576 code units for the decoded source or formatted result. A
serialized native UTF-8 source larger than 1,048,576 bytes is rejected before
decoding.

**Windows clipboard limitation:** Electron currently exposes only one Explorer
`FileNameW` path through its public clipboard API, so clipboard Paste inserts
one Windows path. Dropping several Windows files remains complete and ordered.
Plain-text URLs and other non-file URI-list entries are never guessed to be
paths.

See the normative [drop behavior](spec.md#window-and-session-behavior) and
[path insertion rules](spec.md#clipboard).

## Protected Paste

**Current:** when bracketed paste is not enabled by the receiving process,
OMXTerm shows a Protected Paste warning before sending text that contains
multiple lines or control characters. Choose **Paste** to send the complete
text or **Cancel** to send nothing; Cancel is the default choice. Printable
single-line text does not require this confirmation.

When the receiver has enabled bracketed paste, OMXTerm does not show that
warning. It wraps the text in bracketed-paste markers so the receiver gets one
paste-aware operation even if transport needs multiple chunks. Bracketed paste
means the receiving program explicitly opted into paste handling; it is not an
OMXTerm judgment that the contents are safe. Review commands before executing
them.

File drops, clipboard paths, and other paste-like injection use this same
Protected Paste path. Clipboard contents do not become diagnostics.

See the normative [Clipboard contract](spec.md#clipboard).

## Opening visible web links

**Current:** only a literal, visible `http://` or `https://` URL in Terminal
Payload becomes an External Link. Hidden OSC 8 link metadata is ignored, even
when its destination differs from the text on screen.

Activate a link with primary-button `Cmd+click` on macOS or `Ctrl+click` on
Linux and Windows. The Terminal Surface sends the exact visible URL to the
Electron main process, which independently validates the sender, URL,
HTTP(S) protocol, and host before asking the operating system to open it.
Other protocols and invalid URLs have no external-opening side effect.

Terminal output is untrusted, so the activation gesture is consent, not proof
that a destination is safe. Check the visible destination before opening it.

See the normative [Terminal link behavior](spec.md#terminal-behavior).

## Bells and attention

**Current:** BEL is silent. Instead, OMXTerm prepends `🔔` to the ringing
session's Terminal Title. The marker appears on its tab and, when that tab is
selected, in the native window title.

Focusing a window clears the selected ringing session's marker. Selecting a
ringing tab while its window is focused, or interacting with that selected
session, also clears its marker. A marker on another, unselected tab remains
until that session receives attention.

If the ringing session's window is unfocused, OMXTerm requests Dock attention
once. Further bells do not repeat that request until focus or interaction
resets the attention state.

See the normative [window and session behavior](spec.md#window-and-session-behavior).

## Local Operational Events

**Current:** OMXTerm writes bounded, local JSONL Operational Events for behavior
it owns, such as application and window lifecycle, configuration validation,
IPC boundary rejections, PTY control and resize, duration, and normalized
failures.

Logs live under `$XDG_STATE_HOME/omxterm/logs` when `XDG_STATE_HOME` is
non-empty, or `~/.local/state/omxterm/logs` otherwise. The current file is
`omxterm.jsonl`; rotation keeps only `omxterm.previous.jsonl` alongside it.
Each file is capped at 5 MiB. `logLevel` selects `error`, `info`, or `debug` and
defaults to `info`.

Even at debug level, Operational Events exclude Terminal Payload and private
input. They never contain PTY input or output, clipboard data, environment or
configuration contents, executable names, command arguments, commands, titles,
secrets, or transcripts. OMXTerm does not send these logs remotely and makes no
telemetry, analytics, crash-reporting, or update-check requests. Processes
inside Live Terminal Sessions keep their normal network access.

**Configurable:** only the validated `logLevel` changes event verbosity; it
does not relax the privacy boundary. See the normative
[configuration and local-state contract](spec.md#configuration-and-local-state).
