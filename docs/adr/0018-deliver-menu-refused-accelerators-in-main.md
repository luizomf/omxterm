# Deliver menu-refused accelerators in the main process

## Decision

The native application menu is the single registration, display and behavior
definition for application shortcuts. Each Terminal Window's main-owned
`before-input-event` matcher derives its actions from that menu and the effective
keybind map. Recognized keys invoke the same action and are consumed before
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
precedence. Bare `Ctrl+=` is not a Plus alias. These rules derive from the menu
map, not a second shortcut registry.

AltGr is distinct from Alt and Control+Alt. Main reads the pinned Chromium
`kAltGrKey` bit (`1 << 15`) from Electron's raw `_modifiers`, since the public
`Input.modifiers` does not expose that identity. It passes an explicit boolean
to the shared matcher rather than inferring AltGr from held keys or a layout.

## Maintenance boundary

Matcher and duplicate-detection tests cover effective native identity, logical
keypad fallback and untouched terminal keys. The opt-in Linux/Windows OS-input
fixture checks AltGr layouts, native-menu identity, unbound text/dead keys and
Alt-alone menu behavior. Synthetic input and unit tests do not establish every
keyboard layout or native menu's behavior. Electron upgrades need review of the
raw modifier and native accelerator assumptions; see
[development](../development.md).
