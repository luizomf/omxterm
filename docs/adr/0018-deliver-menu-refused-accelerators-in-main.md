# Deliver menu-refused accelerators in the main process

Complements the keybind vocabulary of
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

The application menu remains the single registration and display point for the
keybind vocabulary. macOS AppKit, however, refuses to fire some valid key
equivalents because it reserves `Control+Tab` for key-view loop navigation. As a
result, 0.3.0 displayed its two tab-cycling defaults as active while leaving them
inert. The main process now watches each Terminal Window's `before-input-event`,
resolves the event against the effective keybind map using the same macOS
modifier semantics as duplicate detection, and invokes the corresponding menu
action. It consumes a delivered keybind before it reaches the Terminal Surface
or PTY.
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
shifted-comma pair. A later intrinsic-Shift correction (#485) resolves both
accelerators and these events to Electron's native key/modifier identity rather
than accumulating punctuation aliases. Shifted character matching requires the
logical character and native physical code to agree; it does not infer arbitrary
keyboard layouts from physical positions. Electron's pinned character table is
an accelerator identity table, not a claim that every layout uses those positions.

`Control+Plus` and `Control+Shift+Plus` register the same native accelerator,
so validation rejects them together (also `Control+Shift+=`). The older
application-level precedence allowance was not a distinct native identity.
Separately, Plus without explicit Shift retains its logical unshifted `+`
convenience, including keypad input. Explicit keypad identities remain distinct
and take precedence over that convenience. This policy is derived from the
installed menu map, not an additional registration system.
Ordinary `Ctrl+=` is not added as an alias for Plus, and unrelated modifiers and
terminal control keys remain untouched. These are corrections to the existing
delivery contract, not a new shortcut vocabulary or renderer-side key policy.

Changing the tab-cycling defaults would abandon the `Ctrl+Tab` convention shared
by terminals and browsers and recorded in ADR 0016. Renderer handling would put
application key policy outside the main-owned effective map and inside the
portable Surface boundary from ADR 0008. Rejecting accelerators merely because a
platform menu cannot fire them would also make the configuration contract depend
on that menu limitation. The decision is therefore to deliver every accelerator
the configuration contract accepts, using the main-process path when the native
menu refuses it.
