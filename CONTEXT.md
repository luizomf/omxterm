# OMXTerm terminology

OMXTerm (`luizomf/omxterm`) is an open-source personal desktop terminal: a local
terminal environment its user can shape over time. **OMXTerm Web**
(`luizomf/omxterm-web`) is a separate browser-based SSH broker.

This glossary explains terms used in the code and documentation. The
[specification](docs/spec.md) describes behavior and limitations;
[ADRs](docs/adr) explain the architecture.

## Platform and architecture

**Supported Platform** — An operating-system/architecture target with maintained
native packages and tests: macOS ARM64, Linux ARM64/x64 and Windows ARM64/x64.
Linux uses X11/XWayland. Linux and Windows x64 packages have build-only
qualification: native CI and headless integrity checks, with desktop, GPU,
installer and ordinary-user integration unverified and not release gates
([ADR 0036](docs/adr/0036-distribute-build-only-x64-ci-artifacts.md)).

**Application Cut** — One reviewed frozen source commit and application version
shared by independently published target releases. Actual build SHAs can differ
only with proven non-artifact differences; product or build-input corrections
after shipment require a new application version and cut.

**Target Release** — A stable release for one Supported Platform, identified by
an immutable OS/architecture-prefixed tag and its own verified assets. Its
availability is indexed in the README independently of GitHub's global Latest.

**Terminal Surface** — The portable DOM module that renders and operates the
terminal using Restty and its Ghostty core. It receives a session Adapter rather
than importing Electron or `node-pty`.

**PTY Adapter** — OMXTerm's local transport between the Terminal Surface and a
pseudo-terminal (PTY), through the typed preload bridge and Electron main.

## Windows and sessions

See [window and session behavior](docs/spec.md#window-and-session-behavior).

**Terminal Window** — An independent native window containing one or more
Application Tabs, with exactly one selected. It starts with a Terminal Tab.

**Application Tab** — A terminal, graphical Settings or internal hosted-content entry in one window's
single ordered tab collection. Reordering and literal/next/previous navigation
include all kinds. Separately installed Files and SSH Connect preview tools use
the companion Auxiliary Panel through their explicit shared actions, rather than
adding Application Tabs.
Removing the last Application Tab follows the window-close
lifecycle, including pending failure acknowledgement.

**Terminal Tab** — An Application Tab owning one or more Terminal Panes,
with exactly one focused. Pending initialization and failure acknowledgement also
retain window ownership. Its state is temporary; closing its last pane removes
that Terminal Tab, not any surviving Settings tab.

**Terminal Pane** — One Terminal Surface and, after initialization succeeds, one
Live Terminal Session inside a tab's split layout. Removing a tab's last pane
removes the tab. A split pane may start in its source pane's folder (its last
local OSC 7 report or, on macOS and Linux, its shell's working directory);
otherwise in the home directory.

**Live Terminal Session** — A running shell or explicitly launched program and
its terminal state. Closing its pane or tab ends its processes; application quit waits
for owned native sessions to exit. Session persistence belongs to tools such as
tmux.

**Default Shell** — The shell used for a new session unless an explicit command
was requested. macOS and Linux use the OS-configured shell. Windows uses
`windowsShell` when configured, otherwise PowerShell with a ComSpec fallback.

**Launch Request** — `-e <program> [arguments...]` on a launch, consumed by
the first tab of that launch's window. The program and literal argument list go
directly to the PTY. A launch while OMXTerm runs on the same profile hands its
request to the running process, which opens it in a new window.

**Initial Working Directory** — The operating-system account's home directory,
where new tabs and an explicit Launch Request start. Split panes instead use
their source pane's still-existing folder, with home as fallback.

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

**About Dialog** — A temporary window-owned modal showing project metadata and
collective contributor links. While modal, it blurs application underlays,
including Settings and chrome outside its bounds, with a fixed CSS filter on
non-dialog body children. The body tint, About foreground and focus remain
unfiltered. This treatment is separate from main-owned native desktop blur.

**Command Palette** — A temporary window-owned dialog for searching and invoking
core application actions from the native View menu or configurable
`commandPalette` shortcut. It shares About's application-underlay blur while
modal, leaving foreground and body tint unfiltered; this is not native desktop
blur. It uses the Action Catalog and validates its captured
tab/pane rather than retargeting a replacement. See
[window and session behavior](docs/spec.md#window-and-session-behavior) for
bindings, matching, excluded actions, modal ownership and appearance.

**Action Catalog** — The internal core action definitions shared by native-menu
presentation, Command Palette results and main-process key delivery. It owns
localized labels, effective bindings and callbacks into existing guarded actions;
it is neither a public registration API nor an Extension SDK. The core palette
does not complete the broader planned Extension work.

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

**Settings** — One lazy, retained graphical Application Tab per window for editing
`config.json`, without a pane, Surface, Adapter or PTY. Only deliberate changes
write configuration; opening the editor does not. Appearance includes a live
background-transparency slider and native desktop-blur checkbox beside themes;
these save through the ordinary validated reload path, without fading content
or changing modal application-underlay blur. Valid configuration symlinks
are preserved while their regular target is replaced; relative theme paths use
the logical configuration directory. See
[window and session behavior](docs/spec.md#window-and-session-behavior) for tab
lifetime and appearance, and [configuration and local state](docs/spec.md#configuration-and-local-state)
for save/reload, retained drafts, clipboard, recording and language contracts.

**User Configuration Reload** — A manual, serialized load and validation
followed by sequential application. Validation rejection keeps active settings;
application-time exceptions can leave partial updates. See
[configuration and local state](docs/spec.md#configuration-and-local-state) for
live-safe versus creation-time settings and native font-read lifetime rules.
Pending-restart information is derived from surviving Surface owners and clears
as outdated owners retire, without hiding current actionable diagnostics or
requiring another reload.

**Interface Language** — The language of OMXTerm's own menus, dialogs and
controls, chosen only by the User Configuration `language` key (`en-US` default
or `pt-BR`). Diagnostics, logs and Terminal Payload stay untranslated.

**Terminal Theme** — The terminal palette (foreground, background, cursor,
selection and ANSI colors), plus optional independent hex/null appearance choices
for pane dividers, the Auxiliary Panel divider and the active pane's inset top
highlight. Omission retains defaults; null hides decorative paint, not separator
keyboard-focus feedback or resizing. The bundled default is `omtheme`. Settings
can discover and select validated local themes beside the logical configuration
directory; the advanced custom path remains available. Development-source
Settings also authors complete themes in one inline Appearance editor: a
memory-only palette preview with readable names and grouped normal/Bright text
samples and swatches, guarded local Save, new-file Save copy/import/export,
and explicit Use saved theme through configuration reload. Optional appearance
values are preserved even without controls; draft preview never changes sessions.
Theme-file saving and configuration/application outcomes are separate.

**Terminal Font Stack** — The ordered fonts used to render terminal text. An
explicitly configured installed family takes precedence; otherwise FiraCode Nerd
Font Mono is the default, with bundled and OS fallback faces for coverage.

**Option Key Mode** — The macOS `keyboard.optionAsAlt` choice: preserve native
layout input (`none`), or use `left`, `right` or `both` Option keys as terminal
Alt. It does not change application shortcut recording or matching.

**Auxiliary Panel** — One window-owned, nonmodal host (right by default) shared by
Snippets and explicitly opened companion tools, with one visible view at a time.
Its header shows the tool name when alone, or an in-header selector when several
are open. It does not suppress extension-owned content; older immutable Files/SSH
archives can retain their own headings. It owns independent tool closure,
retained panel hiding, focus and pointer/keyboard resizing; width and visibility
are memory-only. Settings → Window
persists `window.auxiliaryPanelSide` (`left`/`right`) and applies it live across
windows without replacing views or changing their focus/state. **View → Move
Auxiliary Panel to Other Side** (Cmd+Shift+Option+P on macOS, Ctrl+Shift+Alt+P
on Linux and Windows) keeps a temporary per-window side until that saved
preference changes, and does not rewrite it. One press applies once, including
from Settings or a hosted tab, without revealing a suspended panel. Close disposes
the selected tool view, not its extension backend or previously created terminal
sessions. Hide/Escape preserves open tools; panel reveal restores an open tool.
An eligible empty-panel toggle instead opens available Snippets lazily, with a
single nonmodal four-second notice per application process when unavailable.
It does not install or enable tools; closing still discards view state. Terminal-tab changes preserve it; Settings/general hosted tabs
suspend it. It is independent of the opening terminal's lifetime. See
[window and session behavior](docs/spec.md#window-and-session-behavior) for
geometry, view retention and retirement rules.

**Snippets Sidebar** — The Auxiliary Panel view for browsing and searching the user's
`snippets.yaml` catalog. Insert and Run send exact text through core-owned
Protected Paste to a captured live Terminal Surface; preview shows the text
without sending it. Most hosts use an optional extension, while Windows x64
keeps the built-in sidebar. See [Snippets availability](docs/snippets-availability.md)
and the [extension guide](docs/dev/snippets-migration.md).

**Default Snippets Attempt** — The host's one-time installation of bundled
Snippets for a new packaged profile on an optional-extension target. It leaves
the package enabled but inactive until opened, without fetching it or creating
`snippets.yaml`. Existing profiles and removed or disabled packages keep the
user's choices. See [Default Snippets](docs/dev/default-snippets.md).

## Terminal data and interaction

See [terminal behavior](docs/spec.md#terminal-behavior) and
[clipboard behavior](docs/spec.md#clipboard).

**Terminal Payload** — Private input and output exchanged with terminal
processes. OMXTerm does not automatically record it as application history or
persisted state, and excludes it from operational logs. Explicit user-requested
operations such as copying, local search and Explicit Export follow their
feature contracts; they do not authorize automatic recording or network transmission.

**Explicit Export** — A user-requested save of the selected text, or of the
source pane's retained Scrollback Buffer and screen, to a file picked in a native
dialog. It is never automatic or continuous recording.

**Scrollback Buffer** — In-memory output retained above a session's visible
screen. Each session has its own buffer, with an approximate configured line
target and an independent core byte limit; zero lines disables retention.

**Scrollback Search** — An explicitly opened find bar over one Surface's
Scrollback Buffer and visible screen. It takes keys and clipboard actions only
while its query field holds focus. Its query and matches live only in that
Surface's memory; they are never persisted, logged or shared with other panes.

**Terminal Capability Identity** — The environment advertised to programs:
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm` and the
running version in `TERM_PROGRAM_VERSION`. Ghostty answers cursor-position
queries from its parser cursor at each query's stream position, with core and
filter-owned DA/cell-size replies kept in order without waiting for a render
frame. This identity is not a guarantee of every xterm extension.

**Shell Integration** — Terminal-specific shell startup hooks. OMXTerm leaves
shell initialization to the user and injects no hooks.

**Clipboard Boundary** — Explicit text copy/paste between the terminal and OS
clipboard. Selection alone does not copy. Programs can request bounded OSC 52
writes, but cannot read or clear the clipboard.

**Terminal Context Menu** — The native host popup over terminal content and
padding. `terminal.contextMenuEnabled` is a live boolean, true by default;
false suppresses pointer- and keyboard-originated popup requests without
changing application mouse input, DOM-default cancellation or clicked-pane
focus. The Scrollback Search query and unrelated application menus are excluded;
existing Edit actions and configured keybindings remain available.

**Protected Paste** — Confirmation for multiline or control-character paste when
the receiving process has not enabled bracketed paste. In bracketed mode, text
containing the literal closing paste marker is refused without rewriting or
partial delivery. It is not command validation; clipboard contents remain private.

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
destinations are not used. Wide-wrap spacers contribute no text; only exact
core-proven, fully visible soft wraps join a destination. Uncertain viewport
continuations remain refused; see the [terminal contract](docs/spec.md#terminal-behavior).

## Extensions

**Mirror Typing** — An optional extension that copies the source pane's encoded
keyboard input to a fixed group of live panes in one Terminal Tab. Core owns input delivery and the
visible Stop control; extension code receives no keyboard payloads. Paste,
snippets and drops stop mirroring before delivery to their original target.
See [Mirror Typing](docs/mirror-typing.md) for setup and limits.

**Saved Layout** — A terminal arrangement saved by an optional extension,
including tab order, splits, focused panes and local starting folders. Opening
it creates fresh Default Shells in a new window; it does not restore running
processes or replay commands. Saved data survives uninstall. While the
extension is enabled, OMXTerm also remembers every window's arrangement and
reopens it at startup. See [Saved Layout](docs/saved-layout.md).

**SSH Connect** — An optional extension that lists OpenSSH aliases in the
Auxiliary Panel and opens a selected alias or quick-connect target in a new
Terminal Tab. Core launches the system `ssh` and owns the PTY and session;
OpenSSH handles authentication and networking. See the
[user guide](docs/ssh-connect.md) and [development guide](docs/dev/ssh-connect-development.md).

**Ended-readable Surface** — A Terminal Surface retained after an SSH Connect
session exits with a nonzero code. It remains available for copy and search
until the pane is removed, but has no live session, accepts no input and is not
Busy. See [core-owned SSH tabs](docs/dev/ssh-connect-development.md#core-owned-ssh-tabs).

**Extension** — An optional, separately installed and user-enabled addition that
keeps nonessential features outside the mandatory terminal core, including
terminal-data and session workflows rather than only graphical tools. Enabling
third-party code is a trust choice, not a promise of sandboxing or protection
from its effects.
_Avoid_: Plugin (historical name).

**Official Extension** — An Extension maintained by the OMXTerm project.
Official status identifies its maintainer; installing it still requires the
ordinary extension trust decision. See
[extension distribution](docs/extension-distribution.md#trust).

**Official Catalog** — The project-controlled HTTPS index of official extension
releases, loaded when the user chooses Browse or Refresh. Settings shows
compatible offers, and main verifies the selected archive against its catalog
identity before asking for installation approval. Browsing does not install or
update extensions automatically. See [extension distribution](docs/extension-distribution.md).

**Third-party Extension** — An Extension maintained by its author rather than
by the OMXTerm project. Compatibility with OMXTerm does not imply project
review, support or a safety guarantee.

**Installed Packages** — The internal module for validating extension archives,
tracking installed versions and retaining immutable package files while they are
in use. Settings uses it for installation and management; the Backend Runtime
uses it to open installed backends. It does not run code or provide UI. See
[extension installation](docs/dev/extension-installation-foundation.md).

**Backend Runtime** — The internal module that starts an installed extension's
backend in an app-owned Node child process. It binds requests to a captured
package version and activation lifetime, and tracks the child until it exits.
It does not sandbox extension code or its descendants. See the
[runtime guide](docs/dev/extension-backend-runtime.md).

**Version Use Lease** — A native shared lease that keeps one immutable installed
package version available while an owner reads its files. Cleanup waits for
these leases to end; a lease does not prove extension code has stopped. See
[extension installation](docs/dev/extension-installation-foundation.md).

**Pending Cleanup** — Installed package files that remain on disk because an
owner still holds them or collection has not removed them yet. Disabling or
uninstalling an extension can take effect before its files disappear. See
[extension installation](docs/dev/extension-installation-foundation.md).

## Diagnostics and distribution

**Operational Event** — Safe structured metadata about OMXTerm lifecycle,
validation, IPC, PTY control or failures. Local logs exclude Terminal Payload,
clipboard, configuration and environment contents, commands and titles.

**Files Development Preview** — An optional extension for browsing and managing
local files in the Auxiliary Panel. It can create, rename, move, trash and delete
entries, and ask core to insert a selected path through Protected Paste. Paths
refer to the OMXTerm host, including when terminal output comes from SSH.
See [Files availability](docs/files-availability.md) and the
[development guide](docs/dev/files-development-preview.md) for supported targets,
operations and limits.

**Files Terminal Drag Ticket** — A one-use identity issued by main for a path
drag from an installed Files view. Core claims it to bind an eligible terminal
drop to the captured pane and Protected Paste flow; the ticket alone grants no
terminal input access. See
[path insertion](docs/dev/files-development-preview.md#inserting-paths-into-the-terminal).

**Extension View Host** — The internal owner of an extension's packaged-content
views and their resources for one view lifetime, called an epoch. It retains the
package version while in use and coordinates presentation in tabs or the
Auxiliary Panel; retiring a view does not end core terminal sessions. See
[ADR 0039](docs/adr/0039-own-packaged-web-content-by-epoch.md) and the
[hosted-content contract](docs/spec.md#configuration-and-local-state).

**Extension Link** — An exact HTTPS URL an extension declares under an id in its
manifest (`links.open.v1`). Its view opens it by id, never by URL; main checks
the installed manifest and opens it through the External Link route. See
[ADR 0045](docs/adr/0045-open-declared-extension-links-by-id.md).

**Application Network Boundary** — The rules for network requests made by
OMXTerm itself. Main fetches catalogs and extension archives only after explicit
user actions, with no telemetry, startup catalog fetches or background updates.
Terminal programs and extension backends retain their own network access;
activated terminal links and Extension Links open through the OS. See
[extension distribution](docs/extension-distribution.md) and the
[installation guide](docs/dev/extension-installation-foundation.md).

**Release Artifact** — An exact native package (ARM64, or x64 on Linux/Windows)
(DMG, AppImage or NSIS) published with its source tag, checksum and verification
evidence: native by default, explicitly approved Windows x64 emulation under
[ADR 0034](docs/adr/0034-support-native-windows-x64-packages.md), or native x64
build-only CI under [ADR 0036](docs/adr/0036-distribute-build-only-x64-ci-artifacts.md),
with limitations recorded.
Artifacts have no verified publisher identity; the macOS app is sealed with
OMXTerm's stable self-signed certificate (ad-hoc without the release key), not
Developer ID signing or notarization. See the
[release procedure](docs/release.md).
