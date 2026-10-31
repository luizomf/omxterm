# Deliver menu-refused accelerators in the main process

## Decision

One internal Action Catalog defines core action IDs, localized labels, effective
accelerators and invocation callbacks. Native-menu layout, Command Palette
results and each Terminal Window's main-owned `before-input-event` matcher
project that same catalog snapshot. The native menu registers and displays
accelerators but no longer owns a separate behavior definition. Recognized keys invoke the same action and are consumed before
Terminal Surface/PTY input. `preventDefault` suppresses page input and menu
shortcut dispatch, preventing duplicate invocation. Unrecognized keys retain
native menu and terminal routing.

This handles valid accelerators that a native menu refuses, notably macOS
`Control+Tab`, without putting application policy inside the portable Surface or
changing conventional tab-cycling defaults. Tab commands are described in
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

## Native identity and delivery

Validation and delivery share Electron's native key/modifier identity, including
intrinsic Shift. `Control+Plus`, `Control+Shift+Plus` and `Control+Shift+=`
collide and cannot name different actions. Shifted-character delivery requires
the logical character and native physical code to agree; it does not translate
arbitrary keyboard layouts.

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
The defaults are canonically conflict-free; explicit remaps and `null` remain
unchanged. Existing custom mappings can conflict with the new default and use
the ordinary actionable collision rejection: remap either action or disable its
shortcut. No silent reassignment, automatic rewrite or migration is introduced.

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
`toggleSshConnect`, unbound by default. The catalog reuses their recognized,
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

## Maintenance boundary

Matcher and duplicate-detection tests cover effective native identity, logical
keypad fallback and untouched terminal keys. The opt-in Linux/Windows OS-input
fixture checks AltGr layouts, native-menu identity, unbound text/dead keys and
Alt-alone menu behavior. Synthetic input and unit tests do not establish every
keyboard layout or native menu's behavior. Electron upgrades need review of the
raw modifier and native accelerator assumptions; see
[development](../development.md).
