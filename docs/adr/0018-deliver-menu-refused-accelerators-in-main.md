# Deliver menu-refused accelerators in the main process

## Decision

One internal Action Catalog defines core action IDs, localized labels, effective
accelerators and invocation callbacks. Native-menu layout, Command Palette
results and each Terminal Window's main-owned `before-input-event` matcher
project that same catalog snapshot. The native menu registers and displays
accelerators but no longer owns a separate behavior definition. Recognized keys invoke the same action and are consumed before
Terminal Surface/PTY input. `preventDefault` suppresses page input and menu
shortcut dispatch, preventing duplicate invocation. Unrecognized keys retain
native menu and terminal routing. New events reported as composing are not
claimed by shortcut recording or the main matcher, although native-menu routing
and composition states not exposed by Electron remain outside that guarantee.

This handles valid accelerators that a native menu refuses, notably macOS
`Control+Tab`, without putting application policy inside the portable Surface or
changing conventional tab-cycling defaults. Tab commands are described in
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

## Native identity and delivery

Validation and delivery share Electron's native key/modifier identity, including
intrinsic Shift. `Control+Plus`, `Control+Shift+Plus` and `Control+Shift+=`
collide and cannot name different actions. Shifted-character delivery requires
the logical character and native physical code to agree; it does not translate
arbitrary keyboard layouts. On macOS, an optional main-only synchronous AppKit
provider supplies a narrower Option-only identity to recording and both core and
hosted-child delivery. It correlates a fresh `before-input-event` keydown with
the current owned key window, native code, characters and exact Option-only
flags, checks the current input source is the current keyboard layout and
rejects composition, AltGr, dead/unknown keys and missing data. It is neither a
menu invocation nor a shortcut registry. Digits come from ten validated top-row
native codes; letters come only from a single ASCII character with Option
removed using the current layout. Only the ordinary `KeyA`–`KeyZ` and
`Digit0`–`Digit9` code domain is considered: e.g. French physical Semicolon's
logical `m` is deliberately outside it. No source/event result is cached. The
original event retains gesture and action-callback ownership, and failure leaves
the former routing unchanged. The Option Key Mode affects terminal input, not
this decision.

A native macOS menu control observed `Alt+9` and `Alt+num9` alias regardless of
registration order. Duplicate validation conservatively treats every Option-only
top-row/keypad digit pair as one identity on macOS, without changing matching
priority or other modifier/platform policies. Files that relied on the two
identities being distinct now follow the collision rule below, without
rewriting. Only 9 was directly observed, not all ten keypad pairs.

## Explicit entries win over defaults

Duplicates are judged on the effective map. Defaults are canonically
conflict-free, so every collision involves at least one explicit entry. An
explicit entry wins over another action's default: that default is dropped and
the action is unbound (`null`) in the effective map. Two explicit entries on one
key keep the actionable resilient rejection. OMXTerm never moves an action to
another key and never rewrites the file.

This replaces the earlier rule that a remap colliding with a remaining default
was an error. Each new default (Command Palette, Mirror Typing, Saved Layout,
the macOS companion-tool slots) turned someone's working custom binding into a
whole-file fallback to defaults. The cost of the new rule is that the dropped
default is silent: the action simply has no shortcut until the user binds it.

Logical Plus delivery is an additional convenience: without explicit Shift it
accepts unshifted `+`, including keypad input. Logical keypad delivery follows
the configured character and explicit Shift; explicit keypad identities take
precedence. Bare `Ctrl+=` is not a Plus alias. These rules use the catalog's effective keybind
map, not a second shortcut registry.

AltGr is distinct from Alt and Control+Alt. Main reads the pinned Chromium
`kAltGrKey` bit (`1 << 15`) from Electron's raw `_modifiers`, since the public
`Input.modifiers` does not expose that identity. It passes an explicit boolean
to the shared matcher rather than inferring AltGr from held keys or a layout.

## Core Command Palette

The native View menu exposes Command Palette on every Supported Platform.
`commandPalette` is part of the ordinary remappable Settings/keybind vocabulary,
with `CommandOrControl+Shift+P` on macOS and `Control+Shift+P` on Linux/Windows.
This maintainer-selected convention supersedes the initial unbound default.
Explicit remaps and `null` remain unchanged. An existing custom mapping on the
new default keeps its key, and Command Palette is then unbound
([above](#explicit-entries-win-over-defaults)). No automatic rewrite or
migration is introduced.

The catalog is rebuilt for effective binding/language changes. The palette reads
one localized snapshot per opening, shows current accelerator labels, and uses
simple case-insensitive substring matching (en-US/pt-BR). It adds no fuzzy
ranking, history, persistent toolbar or public registration SDK. Native
role-only items remain native; Copy/Paste/Select All, positional tab selection,
self-opening and Find are excluded from palette results. Find remains a direct
menu/shortcut action because formerly focused Surface targeting across palette
input has not been established.

The renderer captures selected content before the asynchronous snapshot. Main
admits only the selected trusted main frame, consumes a one-shot token, rejects
stale catalog identity and invokes the catalog's existing callback. Tagged
renderer-bound deliveries recheck that captured tab/pane before the original
validated subscription runs. Selection generations prevent away-and-back reuse;
ended/removed targets cannot become replacements. Existing action guards and
Busy Session decisions remain in their owners, not a parallel palette dispatcher.
The dialog dismisses before invoking; keyboard acceptance retains repeats and
release and invokes only after release, cancelling on blur/lost release.
Settings remains retained application content, temporarily inert beneath the
palette; it is not reclassified as a competing modal.

This is the bounded core palette contribution to
[#669](https://github.com/luizomf/omxterm/issues/669), not completion of its broader
contributions or the planned Extension architecture.

## Fixed companion-tool bindings

Files and SSH Connect have two core-owned configurable slots, `toggleFiles` and
`toggleSshConnect`. They default to `CommandOrControl+Alt+F` and
`CommandOrControl+Alt+O` on macOS and are unbound on Linux and Windows, where
`Ctrl+Alt` is AltGr (Snippets likewise moved to `CommandOrControl+Alt+S` on
macOS and keeps `Control+Shift+S` elsewhere). The catalog reuses their recognized,
captured installed-action callbacks and preserves a single existing menu/palette
entry. This is not an extension manifest accelerator or public registration API;
generic contributed actions remain unbound.

Unavailable tools retain editable configuration but have no active runtime
binding or launch entry. Configuration collision validation remains independent
of installation state. Invocation still crosses the existing target, generation
and modal-admission boundaries, without automatic installation or enablement.

These tool toggles invoke once per physical press. A window-owned gesture retains
repeats/release across native-child closure and core focus handoff, rather than
allowing repeated close/reopen or terminal input. Shortcut recording retains
priority; unrelated repeatable actions are unchanged. Native qualification must
exercise this route, not infer it from Escape or semantic Enter evidence.

Mirror Typing gets a third slot, `toggleMirrorTyping`, on the same terms: it
reuses the extension's single entry, follows the same availability, collision
and once-per-press rules, and defaults to `CommandOrControl+Shift+M`
(`Control+Shift+M` on Linux/Windows). Its entry toggles the window's group
([ADR 0043](0043-revoke-visible-mirror-typing-routes.md)).

Saved Layout gets a fourth slot, `saveLayout`, on the same terms, defaulting to
`CommandOrControl+Shift+L` (`Control+Shift+L` on Linux/Windows). Unlike the
others it doesn't take over the extension's entry: core adds a second entry,
**Save Layout**, beside the page's, and leaves it out of the context menu
([ADR 0042](0042-save-layouts-without-restoring-sessions.md)).

## Maintenance boundary

Matcher and duplicate-detection tests cover effective native identity, logical
keypad fallback and untouched terminal keys. The opt-in Linux/Windows OS-input
fixture checks AltGr layouts, native-menu identity, unbound text/dead keys and
Alt-alone menu behavior. Synthetic input and unit tests do not establish every
keyboard layout or native menu's behavior. The bounded Brazilian-Pro/French
fixture matched 132 observable Option-only alphanumeric gestures to competing
native menu actions; missing dead-key downs, source/event races, correlation of
identical events, unreported composition and physical devices remain outside
that evidence. Electron upgrades need review of the raw modifier, AppKit
current-event correlation and native accelerator assumptions; see
[development](../development.md).
