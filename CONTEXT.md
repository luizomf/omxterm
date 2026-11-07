# OMXTerm terminology

OMXTerm (`luizomf/omxterm`) is an open-source personal desktop terminal: a local
terminal environment its user can shape over time. **OMXTerm Web**
(`luizomf/omxterm-web`) is a separate browser-based SSH broker.

This glossary explains terms used in the code and documentation. The
[specification](docs/spec.md) describes behavior and limitations;
[ADRs](docs/adr/) explain the architecture.

## Platform and architecture

**Supported Platform** — An operating-system/architecture target with maintained
native packages and tests: macOS ARM64, Linux ARM64/x64 and Windows ARM64/x64.
Linux uses X11/XWayland. Linux and Windows x64 packages have build-only
qualification: native CI and headless integrity checks, with desktop, GPU,
installer and ordinary-user integration unverified and not release gates
([ADR 0036](docs/adr/0036-distribute-build-only-x64-ci-artifacts.md)).

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
removes the tab. A split pane may start in its source pane's last OSC 7-reported
local directory; otherwise in the home directory.

**Live Terminal Session** — A running shell or explicitly launched program and
its terminal state. Closing its pane or tab ends its processes; application quit waits
for owned native sessions to exit. Session persistence belongs to tools such as
tmux.

**Default Shell** — The shell used for a new session unless an explicit command
was requested. macOS and Linux use the OS-configured shell. Windows uses
`windowsShell` when configured, otherwise PowerShell with a ComSpec fallback.

**Launch Request** — Startup `-e <program> [arguments...]`, consumed by the
first tab. The program and literal argument list go directly to the PTY.

**Initial Working Directory** — The operating-system account's home directory,
where new tabs and an explicit Launch Request start. Split panes instead use
an available, still-existing local OSC 7-reported directory, with home as fallback.

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
memory-only palette specimen, guarded local Save, new-file Save copy/import/export,
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

**Snippets Sidebar** — The Auxiliary Panel view of the user's
`snippets.yaml` catalog, reread on activation with retained search/scroll.
Insert, Run and read-only preview deliver exact text through Protected Paste to
a captured live Surface, never a replacement target. See
[interaction behavior](docs/spec.md#window-and-session-behavior) and
[catalog configuration](docs/spec.md#configuration-and-local-state).
Published stable `0.24.0` and current source use optional, separately installed
Snippets `0.1.0` on Linux ARM64/x64, macOS ARM64 and Windows ARM64. Windows x64
and unchanged `0.23.0` hosts retain built-in Snippets. Stable `0.24.0` offers
deliberate official-catalog or verified local/offline installation. The Windows
ARM64 installed-public checkpoint remains unresolved under the
[release-risk decision](docs/snippets-migration.md#stable-0240-release-disposition).
Historical preview receipts retain their exact host/archive scopes; see the
[delivery evidence and limits](docs/snippets-migration.md). The
[new-profile default](docs/default-snippets.md) is source-only, not published
`0.24.0` behavior. Published artifacts and original receipts remain immutable.
Each remaining cutover requires matching host/package qualification,
migration guidance and compatible package publication/verification before distributed removal
([ADR 0044](docs/adr/0044-migrate-snippets-without-changing-terminal-input.md)).

**Default Snippets Attempt** — The host-owned one-time grant for positively new
packaged optional-target profiles, independent of configuration-kit creation.
Early default/config/state absence and later identity matching precede a permanent,
version-independent consumed witness. Exact pinned public bytes enter Installed
Packages enabled+dormant with generation0, without startup network, YAML or code
activation. Existing profiles, disabled entries and tombstones never enroll;
uninstall/collection cannot restore the default. Developer startup and Windows x64
are excluded. This is a source behavior, not matching platform/package qualification;
see [Default Snippets](docs/default-snippets.md).

## Terminal data and interaction

See [terminal behavior](docs/spec.md#terminal-behavior) and
[clipboard behavior](docs/spec.md#clipboard).

**Terminal Payload** — Private input and output exchanged with terminal
processes. It is transported without becoming application history, logs or
persisted state.

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

**Mirror Typing** — Optional separately installed Linux ARM64 preview that copies
final genuine keyboard bytes, in source mode, to an inspected fixed group of 2–16
live panes in one tab. The originally focused live pane is required. Core owns
visible Stop, native/renderer generation fencing and revocable memory-only
authority; extension code receives no keyboard payloads. Paste, snippets and
drops stop mirroring before ordinary single-target delivery. No persistence,
autostart, semantic per-target encoding or atomic multi-PTY transaction is implied.
See [Mirror Typing](docs/mirror-typing.md).

**Saved Layout** — One explicitly saved current-window terminal arrangement:
terminal order, weighted splits, focused panes and local-folder provenance.
The separately installed Linux ARM64 preview opens fresh Default Shells in a new
window, preserving current work. It is not a saved running session, command
replay or startup restoration. Its revisioned state survives uninstall; Forget
removes the active snapshot, not possible interrupted-write remnants. See
[the guide](docs/saved-layout.md).

**SSH Connect** — A separately installed Linux and macOS ARM64 preview
companion-panel page with an incomplete bounded OpenSSH alias index and distinct
quick-connect field. The same published SSH0.3.1 archive is offered on both; the
[macOS public-catalog checkpoint](docs/ssh-connect.md#macos-arm64-public-catalog-checkpoint)
is bounded to the exact stable0.24.0 host and controlled inputs.
Its declared `terminal.openSsh.v1` capability transfers a typed target to a new
core Terminal Tab while preserving the panel and existing sessions. Core
owns literal system-ssh launch, PTY, Busy/close/Quit and retained nonzero
exit output independently of extension lifetime. Separately published 0.3.0 follows
the host Interface Language while preserving literal aliases, drafts and pending
launches; its host range is `>=0.24.0-dev.8`, with exact native qualification on
Linux ARM64 dev.11. Catalog promotion and bounded public packaged consumption
passed on that exact pair.
Historical 0.1.0 bytes remain immutable; upgrading the host does not install the
new extension. It is not an SSH broker,
credential vault or reconnect service. See [the guide](docs/ssh-connect.md).

**Ended-readable Surface** — Terminal rendering/font resources retained after
an ordinary nonzero SSH Connect exit for local copy/search/refit until pane
removal. It owns no live native session or input authority and is not Busy.

These terms cover the internal modules, Linux ARM64 Files development preview
and broader product direction; they do not define a stable extension SDK.

**Extension** — An optional, separately installed and user-enabled addition that
keeps nonessential features outside the mandatory terminal core, including
terminal-data and session workflows rather than only graphical tools. Enabling
third-party code is a trust choice, not a promise of sandboxing or protection
from its effects.
_Avoid_: Plugin (historical name).

**Official Extension** — An Extension maintained by the OMXTerm project, which
may also serve as a practical example for extension authors. Catalog identity
binds an exact release ID/version/digest, never a namespace or filename. It is
not a sandbox or independently signed publisher assertion.

**Official Catalog** — A bounded project-controlled HTTPS release index loaded
only by explicit Browse/Refresh. Main retains immutable selections; exact bytes
and manifest identity must match before ordinary one-shot trust. Its in-memory
last-successful snapshot may be stale. Hosts select one complete schema1 endpoint
by target. At the earlier checkpoint macOS ARM64 offered Files0.5 and the legacy
endpoint offered Linux Files0.4; the published catalogs select Files0.6 for each
ARM64 target and the same SSH0.3.1 archive for Linux and macOS ARM64. Its separate
bounded macOS public-consumption checkpoint has passed.
Common SSH/Snippets entries match; no merging or fallback occurs. Cards show the
selected offer's platforms and distinguish target from host/API incompatibility.
Target and shared host/API compatibility govern catalog selection, while local/link
archive admission does not enforce catalog targets. The bounded development-family
exceptions are described in the
[installation contract](docs/extension-installation-foundation.md#archive-contract).
Admission is not runtime or platform qualification. It is not a marketplace or
update daemon.

**Third-party Extension** — An Extension maintained by its author rather than
by the OMXTerm project. Compatibility with OMXTerm does not imply project
review, support or a safety guarantee.

**Installed Packages** — The internal module that owns local archive validation,
immutable installed versions, aggregate registry transactions, installation
generations and deferred cleanup. It is consumed by the Linux ARM64/x64 and
macOS ARM64 application composition and admitted by Windows ARM64 source, but
does not itself own management UI or execution. The bounded
[Windows ARM64 source-composition checkpoint](docs/windows-arm64-extension-composition.md#evidence-boundary)
is distinct from the bounded [unpacked-package inspection](docs/windows-arm64-extension-composition.md#packaged-runtime-checkpoint)
and a later [packaged-GUI checkpoint](docs/windows-arm64-extension-composition.md#packaged-gui-composition-checkpoint)
on that retained package. A separate [exact-NSIS checkpoint](docs/windows-arm64-extension-composition.md#exact-nsis-installer-checkpoint)
verified a new installer built from an independent copy of that package. See the
[foundation contract](docs/extension-installation-foundation.md).

**Backend Runtime** — An internal app-owned authority that lazily activates an
installed prebuilt backend in a directly owned bundled-Node child, binds requests
to a captured version/epoch and distinguishes actual process exit from channel
or stream settlement. It is not a public SDK or a descendant sandbox. See the
[runtime contract](docs/extension-backend-runtime.md).

**Version Use Lease** — An independently held native shared lease retaining one
immutable installed version while its owner may read package files. It does not
prove code stopped, serialize external side effects or contain descendants.

**Pending Cleanup** — Managed bytes remain because they are pinned, busy or not
yet collected. Admission can already be disabled/tombstoned; unrelated extension
management need not stop.

## Diagnostics and distribution

**Operational Event** — Safe structured metadata about OMXTerm lifecycle,
validation, IPC, PTY control or failures. Local logs exclude Terminal Payload,
clipboard, configuration and environment contents, commands and titles.

**Files Development Preview** — Separately installed, precompiled Linux and macOS ARM64
extension consumed through Settings captured-byte trust and shared namespaced
actions. It browses expandable local folders with contextual and
keyboard-accessible actions, captured operation targets and automatic refresh
after successful mutations; manual refresh handles external changes without
watchers. Current source additionally offers a view-local checked Actions item
for dot-prefixed names, hidden by default relative to the browsing root; it does
not classify other platform hidden metadata. Its scoped child shortcut leaves
editing and core shortcut ownership intact. Current source also provides a
focused loaded-entry filter and keyboard-selectable tree; filtering is not a
recursive search and does not retarget an open operation. Current source also
supports a confirmed internal entry-to-folder drag and a keyboard-accessible
Move to folder action. Their fixed source and folder are rechecked before a
no-replace move; external drags, same-directory, self/descendant and final
symlink destinations are refused. Cross-volume moves do not copy/delete and
symlink sources move as links. Files-to-terminal drag remains separate. These
source UI changes are included in the published Files0.7 Linux ARM64 link-first
preview with host dev.19. Its bounded [actual public Settings-link checkpoint](docs/files-development-preview.md#files07-linux-public-link-checkpoint)
passed using fresh anonymous downloads. Published Files0.6 and both official
catalog offers are unchanged; macOS Files0.7 and broader qualification remain
unestablished. Hide/reveal retains the dotfile choice;
Close/new view resets it. Published archives are unchanged. Host-language
updates relabel retained controls and notices without changing drafts, captured
paths or pending operations. In current host source, the explicit Use terminal
directory action captures the selected live pane's last local OSC7 report when
requested, not the retained view's initial context. Main confirms the selection
with the core renderer before opening a fixed reported path locally without a modal;
no usable report is explained without navigating. Reports can be stale or produced
by arbitrary output, and ordinary shell-launched SSH may be indistinguishable.
Current Files source labels the action as the last reported path and explains those
limits in an inline hint, tooltip and accessible description. There is no automatic follow or
retargeting of started operations. Compatible installed archives use this host
behavior without modification; the renamed action, inline hint, tooltip and
relocalizable host-coded notices are included in the Files0.7 preview and its
separate Linux packaged/public-link checkpoints, not published
Files0.6. The host/archive build and public release tags bind source
`0cb89accd61f1f5d5263c60773454882793e2e99`; public qualification used test/docs
source `ed84ce729e03656018eb2e1b971dd8f458123df3`. macOS Files0.7 and broader
qualification remain unestablished.
Current source also inserts one selected file/folder/link path through the core's
lexical quoting and Protected Paste into the action-time captured Surface; its
visible menu action and Shift+Enter row shortcut add no Enter. Focus returns
only while the captured target remains selected. Incomplete or unknown delivery
is not automatically retried. This needs a future archive and a host supporting
`terminal.insertPath.v1`; published Files0.6/0.7 remain unchanged. Its composed
terminal drop offers copy only over the selected tab's focused live terminal area,
with a bounded localized candidate. One path-free, single-use main ticket binds
the authenticated Files gesture to the exact drop-turn pane/Surface and selection
revision. Shared Protected Paste stops Mirror Typing and adds no Enter; stale,
mixed/native/tab and blocked input is refused. Source hide/retirement revokes
unaccepted authority; dragend alone cannot revoke a claimed drop. Local notices
and successful still-current captured-input focus use the existing owners, not
a second PTY/focus route. Native/product/package qualification remains separate.
Its application owner composes independent
backend/view version pins, per-invocation context for other extension requests,
local management and bounded Quit retirement.
Its separately built archive/checksum/receipt are not bundled into the host;
a build receipt identifies bytes and inputs, not completed qualification or shipment.
macOS host source provides no-clobber move and optional Foundation trash in its
owned Node-child service. Bounded exact-package trash semantics passed on macOS
ARM64. A separate Files0.5.0/dev.21 exact-pair consumer checkpoint passed real
operations, retained companion state, management and active-backend normal Quit.
Host dev.21 and Files0.5.0 are published as separate immutable, non-Latest
prereleases; a separate actual Settings HTTPS-link installation checkpoint passed.
This is [macOS link-first distribution](docs/files-development-preview.md#macos-link-first-distribution),
not macOS catalog discovery or broader platform qualification. Current source
adds a separate macOS catalog endpoint; existing dev.21 binaries still use the
legacy URL. Published dev.26 passed its separate exact-package
[public catalog checkpoint](docs/files-development-preview.md#macos-catalog-distribution),
including three Official consents and normal joined Quit; prior link evidence
is not relabeled.
The corrected archive requires host dev.21; its neutral ARM64 preview name is
display metadata, not a manifest platform fence or blanket native qualification.
The earlier Linux catalog selected Files0.4.0; the promoted catalogs select
Files0.6.0 on both ARM64 endpoints after separate publication and qualification.
A separate [macOS public-catalog checkpoint](docs/files-development-preview.md#files-060-macos-public-catalog-checkpoint)
passed with a retained locally built 0.24.0 DMG, not a downloaded-public host.
The host's optional `toggleFiles` shortcut is unbound
by default and reuses the existing tool entry point; unavailable tools do not
consume it. No startup code activation, default shortcut or stable SDK is implied;
see [the preview contract](docs/files-development-preview.md) for qualification limits.

**Files Terminal Drag Ticket** — A path-free, single-gesture transport identity
owned by main for one installed Files view/epoch/window, not a path or terminal
input capability. Core claims it synchronously once before asynchronous handoff;
dragend revokes only unclaimed tickets, while view/window/epoch loss and the
ten-second deadline revoke both phases. Without a protected consumer the source
stays move-only. Current source composes the shared captured-pane Protected Paste
owner for one eligible terminal-area drop; see the [transport seam](docs/files-development-preview.md#terminal-drag-transport-source-increment).

**Extension View Host** — Internal owner of lazy native packaged-content views
and their reads in a nonpersistent epoch, retaining an immutable package-version
pin. Shared window presentation composes tab/panel slots, focus and overlays;
retirement does not terminate core PTYs. Presentation rejection racing retirement
is reconciled only by exact main-issued retirement notifications plus an
acknowledged native hide; unrelated or failed retirement cannot restore usability.
It is not a public SDK or activation UI,
and main-death disk-read exclusion remains unqualified. See
[ADR 0039](docs/adr/0039-own-packaged-web-content-by-epoch.md) for resource and
presentation ownership, and the
[hosted-content contract](docs/spec.md#configuration-and-local-state) for
appearance, language and declared own-view semantic input. Semantic input
transfers exact text to a core-captured Surface, not a PTY handle or raw key route;
retirement revokes unaccepted interactions, not accepted Surface-owned delivery.

**Application Network Boundary** — OMXTerm requests remote bytes only for explicit
official-catalog browsing and HTTPS extension archive installation on Linux ARM64/x64
and macOS/Windows ARM64, through bounded main-owned acquisition and
captured-byte trust. The published Windows ARM64 dev.36 capability is separate
from its pending [installed public-consumption checkpoint](docs/snippets-migration.md#windows-arm64-published-preview-and-catalog-candidate). No startup/reopen catalog, telemetry or background update
requests are made. macOS composition alone does not broaden published catalog
targets or qualify Files. The published Snippets dev.16 preview now offers the
same immutable archive through the official catalog on `darwin-arm64`, alongside
`linux-arm64`, while retaining local/offline installation. Exact public catalog
readback and a separate bounded macOS packaged public-HTTPS checkpoint passed;
see [the delivery scope](docs/snippets-migration.md#macos-arm64-catalog-delivery).
This does not add Files/SSH qualification.
Internal hosted content remains
restricted to its owned epoch-local packaged-resource protocol. Child processes
retain normal network access; explicitly activated terminal web links open through the OS.

**Release Artifact** — An exact native package (ARM64, or x64 on Linux/Windows)
(DMG, AppImage or NSIS) published with its source tag, checksum and verification
evidence: native by default, explicitly approved Windows x64 emulation under
[ADR 0034](docs/adr/0034-support-native-windows-x64-packages.md), or native x64
build-only CI under [ADR 0036](docs/adr/0036-distribute-build-only-x64-ci-artifacts.md),
with limitations recorded.
Artifacts have no verified publisher identity; the macOS app has an ad-hoc
integrity seal, not Developer ID signing or notarization. See the
[release procedure](docs/release.md).
