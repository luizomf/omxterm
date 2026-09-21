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

Native Windows and Linux probes for #332 also showed why the interceptor must
recognize the defaults before the renderer handles the key. Electron reports
main-keyboard Plus with Shift and shifted comma as `<` with code `Comma`.
Native menu fallback did not deliver these synthetic inputs on Windows; on
Linux it worked only while the renderer left the event unconsumed. The matcher
therefore accepts the implicit Shift needed to type Plus and the observed
shifted-comma pair. Exact key/modifier matches retain precedence over these
fallbacks. The comma fallback requires both the logical character and physical
code; it does not infer arbitrary keyboard layouts from physical positions.
Ordinary `Ctrl+=` is not added as an alias for Plus, and unrelated modifiers and
terminal control keys remain untouched. These are corrections to the existing
delivery contract, not a new shortcut vocabulary or renderer-side key policy.

Considered and not chosen: changing the tab-cycling defaults (`Ctrl+Tab` is
the convention terminals and browsers share and is ADR 0016's stated default);
handling the keys in the renderer (the effective keybind map lives in the main
process, and [ADR 0008](0008-make-the-terminal-surface-the-portable-module.md)
keeps application key policy out of the Terminal Surface); and rejecting
platform-undeliverable accelerators at configuration time. The maintainer chose
delivery over rejection: any accelerator the configuration contract accepts
works, whether or not the platform menu can fire it.
