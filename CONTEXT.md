# OMXTerm terminology

OMXTerm (`luizomf/omxterm`) is an open-source personal desktop terminal: a local
terminal environment its user can shape over time. **OMXTerm Web**
(`luizomf/omxterm-web`) is a separate browser-based SSH broker.

This glossary explains terms used in the code and documentation. The
[specification](docs/spec.md) describes behavior and limitations;
[ADRs](docs/adr/) explain the architecture.

## Platform and architecture

**Supported Platform** — An operating-system/architecture target with maintained
native packages and tests: macOS ARM64, Linux ARM64, Windows ARM64 and Windows x64. Linux
uses X11/XWayland.

**Terminal Surface** — The portable DOM module that renders and operates the
terminal using Restty and its Ghostty core. It receives a session Adapter rather
than importing Electron or `node-pty`.

**PTY Adapter** — OMXTerm's local transport between the Terminal Surface and a
pseudo-terminal (PTY), through the typed preload bridge and Electron main.

## Windows and sessions

See [window and session behavior](docs/spec.md#window-and-session-behavior).

**Terminal Window** — An independent native window containing one or more
Terminal Tabs, with exactly one selected.

**Terminal Tab** — A selectable container owning a Terminal Surface and, after
initialization succeeds, one Live Terminal Session. Pending initialization and
failure acknowledgement also retain window ownership. Tabs can be reordered
within their window. Their state is temporary; removing the last tab follows the
window-close lifecycle, including pending failure acknowledgement.

**Live Terminal Session** — A running shell or explicitly launched program and
its terminal state. Closing its tab ends its processes; application quit waits
for owned native sessions to exit. Session persistence belongs to tools such as
tmux.

**Default Shell** — The shell used for a new session unless an explicit command
was requested. macOS and Linux use the OS-configured shell. Windows uses
`windowsShell` when configured, otherwise PowerShell with a ComSpec fallback.

**Launch Request** — Startup `-e <program> [arguments...]`, consumed by the
first tab. The program and literal argument list go directly to the PTY.

**Initial Working Directory** — The operating-system account's home directory,
where both the Default Shell and an explicit Launch Request start.

**Busy Session** — A session whose PTY foreground process differs from the idle
Default Shell. An unreadable foreground name, any live explicit command, and all
live Windows sessions count as busy for close confirmation. Foreground names
stay in memory and are not displayed or logged.

**Window Chrome** — Controls around the terminal, including the hideable title
area and tab strip. macOS uses native window buttons; Linux and Windows draw a
themed title row with native window actions.

**Always-on-Top Window** — A window temporarily kept above ordinary windows by
its native floating behavior. The menu toggles the selected window;
configuration sets the default for new windows.

**Window Font Zoom** — A temporary font-size adjustment shared by all tabs in
one window, relative to its configured baseline.

**Terminal Title** — A sanitized, bounded session label from OSC 0/2, shown on
the tab and selected window. It is untrusted display text, excluded from logs
and PTY replies.

**Terminal Bell** — A silent BEL request: a title marker and, for an unfocused
window, one native attention request until focus or interaction clears it.

## Appearance and configuration

See [configuration and local state](docs/spec.md#configuration-and-local-state)
and the [configuration guide](docs/configuration.md).

**User Configuration** — The versioned, validated `config.json` containing the
user's preferences. OMXTerm creates an initial kit when no configuration exists;
subsequent edits belong to the user.

**User Configuration Reload** — A manual, serialized load and validation
followed by sequential application. Validation rejection keeps active settings;
application-time exceptions can leave partial updates. Surfaces keep their
creation-time font family and line height; new tabs use the latest values. A
family change during pending font acquisition can fail an initializing tab.

**Terminal Theme** — The terminal palette: foreground, background, cursor,
selection and ANSI colors. The bundled default is `omtheme`.

**Terminal Font Stack** — The ordered fonts used to render terminal text. An
explicitly configured installed family takes precedence; otherwise FiraCode Nerd
Font Mono is the default, with bundled and OS fallback faces for coverage.

**Option Key Mode** — The macOS `keyboard.optionAsAlt` choice: preserve native
layout input (`none`), or use `left`, `right` or `both` Option keys as terminal
Alt.

**Snippets Sidebar** — A per-window list loaded from the user's `snippets.yaml`
(single bounded YAML 1.2 core document with version-1 snippet fields).
Activating a snippet sends its body through Protected Paste to the selected tab;
`execute` controls whether Enter is appended. Its fixed 280 px width is not
included in native minimum-window sizing and can crowd out the visible grid.

## Terminal data and interaction

See [terminal behavior](docs/spec.md#terminal-behavior) and
[clipboard behavior](docs/spec.md#clipboard).

**Terminal Payload** — Private input and output exchanged with terminal
processes. It is transported without becoming application history, logs or
persisted state. Only an Explicit Export writes it, to a file the user chooses.

**Explicit Export** — A user-requested save of the selected text, or of the
active tab's retained Scrollback Buffer and screen, to a file picked in a native
dialog. It is never automatic or continuous recording.

**Scrollback Buffer** — In-memory output retained above a session's visible
screen. Each session has its own buffer, with an approximate configured line
target and an independent core byte limit; zero lines disables retention.

**Scrollback Search** — An explicitly opened find bar over one tab's Scrollback
Buffer and visible screen. It takes keys and clipboard actions only while its
query field holds focus. Its query and matches live only in that tab's memory;
they are never persisted, logged or shared with other tabs.

**Terminal Capability Identity** — The environment advertised to programs:
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm` and the
running version in `TERM_PROGRAM_VERSION`. Cursor-position replies have known
Unicode and resize inaccuracies despite this xterm identity.

**Shell Integration** — Terminal-specific shell startup hooks. OMXTerm leaves
shell initialization to the user and injects no hooks.

**Clipboard Boundary** — Explicit text copy/paste between the terminal and OS
clipboard. Selection alone does not copy. Programs can request bounded OSC 52
writes, but cannot read or clear the clipboard.

**Protected Paste** — Confirmation for multiline or control-character paste when
the receiving process has not enabled bracketed paste. It is not command
validation; clipboard contents remain private.

**Clipboard Image Input** — A local terminal program reading an image from the
OS clipboard after OMXTerm forwards its shortcut. Image bytes do not pass
through the PTY.

**Inline Terminal Image** — A bounded, memory-only PNG or raw-RGBA image
rendered as cell-anchored output through the supported Kitty protocol subset.
The supported Pi and Chafa paths use direct sessions rather than multiplexer
passthrough.

**Local Image Preview** — A temporary overlay for a local static PNG or JPEG,
explicitly chosen or activated from a visible path reference or `file:///` URL.
Home shorthand is local; relative references require explicit base-folder
selection. Main resolves references and validates the bounded file read. A path
always names a file on the OMXTerm host, even when SSH produced the text.

**External Link** — A literal visible HTTP(S) URL in terminal output. Opening it
requires explicit user activation and validation in main. Hidden OSC 8
destinations are not used. Some Unicode wrap boundaries prevent recognition;
see the [terminal contract](docs/spec.md#terminal-behavior).

## Diagnostics and distribution

**Operational Event** — Safe structured metadata about OMXTerm lifecycle,
validation, IPC, PTY control or failures. Local logs exclude Terminal Payload,
clipboard, configuration and environment contents, commands and titles.

**Application Network Boundary** — OMXTerm makes no application network
requests. Child processes retain normal network access; explicitly activated web
links open through the OS.

**Release Artifact** — An exact native package (ARM64, or x64 on Windows) (DMG, AppImage or NSIS)
published with its source tag, checksum and verification evidence: native by
default, or explicitly approved Windows x64 emulation with recorded limitations
under [ADR 0034](docs/adr/0034-support-native-windows-x64-packages.md).
Artifacts have no verified publisher identity; the macOS app has an ad-hoc
integrity seal, not Developer ID signing or notarization. See the
[release procedure](docs/release.md).
