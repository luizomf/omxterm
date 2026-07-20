# Deliver menu-refused accelerators in the main process

Complements the keybind vocabulary of
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

The application menu stays the single registration and display point for the
keybind vocabulary, but macOS AppKit refuses to fire some registrable key
equivalents — `Control+Tab` is reserved for key-view loop navigation — so
0.3.0 shipped its two tab-cycling defaults inert while the menu displayed them
as active. The main process now also watches each Terminal Window's
`before-input-event`, resolves the key event against the effective keybind map
with the same macOS modifier semantics duplicate detection uses, invokes the
same application action the menu item would, and consumes the event so a
delivered keybind never reaches the Terminal Surface or the PTY. An event the
menu does handle never reaches `before-input-event`, so the two paths cannot
double-fire one keybind.

Considered and not chosen: changing the tab-cycling defaults (`Ctrl+Tab` is
the convention terminals and browsers share and is ADR 0016's stated default);
handling the keys in the renderer (the effective keybind map lives in the main
process, and [ADR 0008](0008-make-the-terminal-surface-the-portable-module.md)
keeps application key policy out of the Terminal Surface); and rejecting
platform-undeliverable accelerators at configuration time. Otávio chose
delivery over rejection: any accelerator the configuration contract accepts
works, whether or not the platform menu can fire it.
