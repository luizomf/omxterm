# OMXTerm

OMXTerm is an open-source personal desktop terminal built around the Personal
Terminal concept: an environment deliberately shaped by its user. OMXTerm Web
is the separate browser-based SSH broker previously named OMXTerm.

## Language

**Personal Terminal**:
A terminal environment owned and deliberately shaped by its user, where polish,
customization, and ease of evolution matter more than market differentiation.
_Avoid_: AI terminal, Ghostty competitor, terminal MVP

**OMXTerm Web**:
The separate browser-based SSH broker from which selected terminal experience
may be ported. It is not a runtime dependency or variant of OMXTerm.
_Avoid_: OMXTerm, bastion, local terminal

**Repository Identity**:
The canonical one-to-one mapping between product and repository names: the
desktop terminal is `luizomf/omxterm`, and the browser SSH broker is
`luizomf/omxterm-web`. During bootstrap the desktop repository temporarily used
`luizomf/omxterm-local` while the web repository occupied `luizomf/omxterm`;
ADR 0005 records the ordered rename that established the canonical mapping.
_Avoid_: permanent omxterm-local, shared omxterm repository, product variant

**Terminal Assistance**:
An optional capability that helps the user prepare or understand terminal input
without defining the terminal's identity or being required for normal operation.
_Avoid_: terminal core, autonomous agent, smart terminal

**Supported Platform**:
An operating-system and architecture pair on which OMXTerm is deliberately
built, tested, and claimed to work. The initial Supported Platforms are macOS
arm64, Linux arm64, and Windows arm64. x64 and Intel macOS are deferred rather
than support commitments.
_Avoid_: compatible platform, planned platform, support tier

**Terminal Surface**:
The full-bleed area in which the terminal is rendered and operated. It is the
primary visible experience of OMXTerm.
_Avoid_: terminal page, terminal card, browser terminal

**Terminal Theme**:
The OMXTerm-owned visual palette for the Terminal Surface, including terminal
foreground, background, cursor, selection, and ANSI colors. Its default is the
canonical `omtheme` palette.
_Avoid_: xterm theme, Ghostty theme, application CSS

**Terminal Font Stack**:
The ordered faces used by the Terminal Surface: an explicitly configured system
font when present; bundled regular and bold FiraCode Nerd Font Mono defaults;
bundled regular and bold DejaVu Sans Mono coverage fallback; the retained
bundled JetBrainsMono Nerd Font Mono coverage face; and representative operating
system emoji, CJK, and symbol fallbacks last. A configured family that does not
exist is an error rather than a silent fallback.
_Avoid_: terminal font, webfont, system default font

**Window Font Zoom**:
An ephemeral font-size adjustment for one Terminal Window through `Cmd++`,
`Cmd+-`, and `Cmd+0`, shared by every Terminal Tab in that window. It never
rewrites User Configuration, and a new window starts from the configured font
size rather than inheriting another window's zoom.
_Avoid_: font configuration, application zoom, persisted zoom

**Option Key Mode**:
The macOS interpretation of the Option keys. By default OMXTerm preserves the
active keyboard layout's native Unicode input. User Configuration may set
`keyboard.optionAsAlt` to `none`, `left`, `right`, or `both` when terminal Alt
sequences are preferred; OMXTerm never guesses or rewrites this choice.
_Avoid_: Meta key, keyboard remapping, tmux keybinding

**Terminal Capability Identity**:
The standard environment contract advertised to terminal applications:
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and the
installed version in `TERM_PROGRAM_VERSION`. It describes supported behavior
without requiring an OMXTerm-specific terminfo entry.
_Avoid_: xterm-omxterm, omxterm terminfo, branded TERM

**Shell Integration**:
Optional code injected into a user's shell initialization or environment to
provide terminal-specific behavior. OMXTerm does not install or inject Shell
Integration in its first version; the user's shell and dotfiles remain solely
the user's responsibility.
_Avoid_: automatic shell setup, managed shell, OMXTerm hooks

**Terminal Window**:
An independent native window containing one or more Terminal Tabs, exactly one
of them selected. OMXTerm may own several Terminal Windows without workspaces
or a user-facing session manager.
_Avoid_: workspace, application instance, tab group

**Terminal Tab**:
One selectable container inside a Terminal Window owning exactly one Live
Terminal Session and its Terminal Surface. Closing a tab terminates only its
session, and a window's last tab closing closes the window. Tabs are
ephemeral: their order may be changed by dragging within their current window,
but they are not saved, restored, or moved between windows — capabilities
deferred rather than permanently rejected (ADR 0016).
_Avoid_: saved tab, workspace, split pane

**Always-on-Top Window**:
A Terminal Window temporarily kept above ordinary windows using the native
macOS floating level. `Window → Always on Top` toggles only the selected window;
`window.alwaysOnTop` defines the default for newly created windows, and the menu
never rewrites User Configuration.
_Avoid_: global always-on-top mode, overlay, pinned session

**Window Chrome**:
Visible application or operating-system controls surrounding the Terminal
Surface, such as a title bar, toolbar, or window controls.
_Avoid_: Chrome, browser header, terminal UI

**Live Terminal Session**:
An active shell and its terminal state owned by OMXTerm. It is ephemeral:
closing it terminates its processes rather than preserving them for reconnection,
and when its shell exits there is no inactive terminal surface left behind.
_Avoid_: saved session, persistent session, tmux session

**Default Shell**:
The user's operating-system-configured interactive shell, launched when no
explicit command is requested.
_Avoid_: bundled shell, OMXTerm shell, hard-coded zsh

**Busy Session**:
A Live Terminal Session whose PTY foreground process is not the idle Default
Shell — something is running in it. Close confirmations ask only for Busy
Sessions; the foreground process name is an in-memory detail that is never
logged, displayed, or transmitted, and an unreadable name counts as Busy
(ADR 0017).
_Avoid_: dirty session, active tab, process inspection beyond the foreground
name

**Initial Working Directory**:
The directory inherited by a newly launched Default Shell. It is the user's home
directory unless a future explicit launch request says otherwise.
_Avoid_: application directory, repository directory, inherited launcher cwd

**User Configuration**:
The versioned, validated JSON document containing the user's explicit OMXTerm
preferences. It is the shared configuration source for text editing now
and a possible graphical preferences interface later.
_Avoid_: settings database, custom configuration language, application state

**User Configuration Reload**:
The explicit manual action that rereads and validates the complete User
Configuration through the same boundary used at startup, then atomically
applies every valid preference according to its existing ownership semantics.
A failed reload keeps the last valid in-memory configuration active and reports
the new error; it never watches files or partially applies a document.
_Avoid_: theme reload, automatic reload, partial configuration reload

**Terminal Payload**:
The opaque input and output exchanged between the user-facing terminal and its
processes. It belongs to the user and is transported without becoming
application history, diagnostics, or persisted state.
_Avoid_: transcript, application event, diagnostic data

**Inline Terminal Image**:
A bounded static PNG or raw-RGBA image carried as memory-only Terminal Payload
through a pinned Kitty graphics protocol subset and rendered on a browser canvas
owned by a direct Terminal Surface. It remains cell-anchored terminal output
rather than a file, clipboard transfer, application image viewer, remote
resource, or persisted attachment. OMXTerm claims only the pinned Pi- and
Chafa-compatible paths; multiplexer passthrough and other image protocols remain
unsupported.
_Avoid_: image upload, clipboard image, terminal attachment, image viewer

**Operational Event**:
Structured safe metadata about behavior owned by OMXTerm for human and
automated local diagnosis, such as lifecycle, configuration validation, IPC,
PTY control, resize, and application failures. Operational Events never include
Terminal Payload or private input contents.
_Avoid_: terminal output, command history, session transcript

**Application Network Boundary**:
OMXTerm itself makes no network requests in its first version: no telemetry,
analytics, crash reporting, update checks, or remote log delivery. Operational
Events remain in local JSONL logs. Processes running inside a Live Terminal
Session retain their ordinary network access, and an External Link may be
opened only after the user's explicit activation; neither is application
telemetry.
_Avoid_: offline shell, network sandbox, anonymous telemetry

**Clipboard Boundary**:
The explicit exchange between the Terminal Surface and the operating-system
clipboard. User copy and paste are deliberate actions; text selection alone
does not copy. Programs may request write-only clipboard access through OSC 52,
but cannot read or clear the host clipboard.
_Avoid_: selection clipboard, clipboard synchronization, clipboard history

**Protected Paste**:
A paste that requires confirmation because its contents could execute directly
as multiple commands or contain control characters. Bracketed paste is passed
through without this confirmation because the receiving process has explicitly
enabled paste-aware handling. Clipboard contents never become diagnostics.
_Avoid_: paste filtering, command validation, safe command

**Clipboard Image Input**:
An image attachment read from the operating-system clipboard by a local
terminal application after OMXTerm forwards that application's keyboard
shortcut. Image bytes do not pass through the PTY or become Terminal Payload.
_Avoid_: image paste payload, terminal image upload, OSC 52 image

**Scrollback Buffer**:
The in-memory lines retained above a Live Terminal Session's visible viewport.
User Configuration sets `scrollback.lines`; the default is 10,000, zero
disables retention, and values above 100,000 are rejected rather than silently
clamped. For Restty, positive values approximate physical history rows through
whole-page Ghostty eviction and remain independently capped at 10,000,000
bytes; zero uses the core's no-history path. The buffer is ephemeral and its
memory cost is paid independently by every Live Terminal Session.
_Avoid_: terminal history, persisted output, transcript

**Terminal Title**:
The single-line printable label of a Live Terminal Session, shown on its
Terminal Tab and mirrored by the Terminal Window while that tab is selected. A
local process may request it through OSC 0 or OSC 2, but OMXTerm sanitizes and
bounds the display value, never reports it back to the PTY, and never treats
it as an Operational Event or trustworthy application metadata.
_Avoid_: session name, shell identity, logged command

**External Link**:
An HTTP or HTTPS URL whose literal destination is visible in Terminal Payload.
It remains untrusted process output: activation requires an explicit platform
gesture and independent validation by the Electron main process before the
operating system may open it. OSC 8 metadata is not an External Link because it
can hide a different destination behind arbitrary visible text.
_Avoid_: trusted link, renderer navigation, arbitrary protocol URL

**Terminal Bell**:
A process request for the user's attention using BEL. OMXTerm keeps it silent,
prepends `🔔` to the ringing session's Terminal Title until the user focuses or
interacts with it, and requests Dock attention once only when that session's
window is unfocused.
_Avoid_: notification, alarm, terminal error

**Release Artifact**:
A ready-to-run native arm64 package published from an accepted version tag
alongside the public source code and a reproducible local build path. The
initial formats are DMG for macOS, AppImage for Linux, and NSIS for Windows.
Each exact artifact receives separate owner acceptance after native build and
verification, and any manual publication requires separate maintainer
authorization with its SHA-256 checksum. Initial artifacts carry no verified
publisher identity. The macOS application has a complete ad-hoc code seal for
bundle integrity but no Apple Developer ID
signature or notarization. macOS release documentation additionally explains
its Gatekeeper review and links to Apple's current instructions without asking
users to disable system-wide security protections. A provenance statement is
not an independent security audit, platform trust decision, or guarantee about
all code and dependencies.
_Avoid_: signed release, notarized release, compile-only distribution
