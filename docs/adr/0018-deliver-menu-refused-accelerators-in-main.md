# Deliver menu-refused accelerators in the main process

Complements the keybind vocabulary of
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

The application menu stays the single registration and display point for the
keybind vocabulary, but macOS AppKit refuses to fire some registrable key
equivalents — `Control+Tab` is reserved for key-view loop navigation — so
0.3.0 shipped its two tab-cycling defaults inert while the menu displayed them
as active. The main process now watches each Terminal Window's
`before-input-event`, resolves the key event against the effective keybind map
with the same macOS modifier semantics duplicate detection uses, invokes the
same application action the menu item would, and consumes the event so a
delivered keybind never reaches the Terminal Surface or the PTY.
`before-input-event` fires before the page and before menu-shortcut dispatch,
and Electron documents that `preventDefault` suppresses both — that, not any
menu/interceptor complementarity, is what guarantees a keybind fires exactly
once. A key event the matcher does not recognize is left untouched and keeps
its previous path: menu shortcut first, then the terminal. The menu remains
the single registration and display point and the single behavior definition;
the interceptor derives its action table from the same menu actions.

Considered and not chosen: changing the tab-cycling defaults (`Ctrl+Tab` is
the convention terminals and browsers share and is ADR 0016's stated default);
handling the keys in the renderer (the effective keybind map lives in the main
process, and [ADR 0008](0008-make-the-terminal-surface-the-portable-module.md)
keeps application key policy out of the Terminal Surface); and rejecting
platform-undeliverable accelerators at configuration time. Otávio chose
delivery over rejection: any accelerator the configuration contract accepts
works, whether or not the platform menu can fire it.
