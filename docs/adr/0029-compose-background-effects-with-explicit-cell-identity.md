# Compose background effects without losing explicit cell identity

Issue #412 replaces the former prohibition of transparency and blur. It amends
[ADR 0025](0025-stage-restty-behind-an-unpackaged-opt-in.md)'s paint path and
[ADR 0027](0027-hide-window-chrome-without-replacing-sessions.md)'s window
construction, not their Surface, session, input or chrome ownership. Configuration
remains strict, version 1 and non-mutating under ADR 0003.

## Decision

`window.transparency` is a finite fraction from 0 through 1, default 0;
`window.blur` is a boolean, default false. Manual reload commits the whole
validated snapshot to current and future windows. Invalid reload commits
nothing. There is no menu, material selector or strength control.

Create alpha-capable native windows once on macOS/Linux, but retain normal
nontransparent native construction on Windows. Electron main requests under-window
vibrancy on macOS and Acrylic on Windows only when blur is enabled and
transparency is positive. Linux retains X11/XWayland and may set
`_KDE_NET_WM_BLUR_BEHIND_REGION` on its own native XID through an existing `xprop`.
The helper uses literal arguments, no shell, a 500 ms timeout with SIGKILL,
discarded stdout/stderr and a 1 KiB buffer bound. It never runs for the default
off state or native Wayland. Calls are synchronous and bounded so pending work
cannot outlive closure, overwrite a newer reload, or target a recycled XID.
Only effect transitions invoke native work; a later manual reload may retry a
failed transition, never a background timer. Disable removes the hint/material;
disposal removes it if the native window still exists, otherwise window
destruction owns native resource release. No timer, detached helper or renderer
capability is introduced. A slow helper can briefly delay main (at most the
per-call timeout per affected window); that bounded cost is preferable here to
an asynchronous XID-lifetime state machine.

API/helper errors are quiet. They do not invalidate otherwise valid
configuration, stop terminal startup or assert visible support. Composition may
remain transparent without blur or opaque on unsupported systems. macOS and
Windows native materials may retain their own tint. We neither modify global
compositor/extension/accessibility settings nor add a new launch dependency.

### Windows native-control fallback

Production integration found a structural Electron tradeoff, not a terminal
resize failure. With `transparent: true`, the Windows test window visibly grew
but `isMaximized()` remained false, so the custom control never changed to
Restore. A fullscreen request also left `isFullScreen()` false. No crash,
Surface recreation or PTY loss occurred. Explicit `thickFrame`, `maximizable`
and `resizable` options did not correct the native state. The observed desktop
scale was 250%; a specific DPI-rounding cause is not established.

Pinned [Electron source](https://github.com/electron/electron/blob/v43.1.1/shell/browser/native_window_views.cc#L722-L884)
uses geometry-only maximize and exact bounds comparison for transparent windows,
and bypasses the widget fullscreen state without a thick frame. Construction
forces that frame off for transparent windows. The
[documented limitations](https://github.com/electron/electron/blob/v43.1.1/docs/tutorial/custom-window-styles.md#limitations)
and [API-only maximize workaround](https://github.com/electron/electron/pull/28207)
do not promise normal native controls. Material `none`/`auto` provides no supported
plain-alpha mode with the normal frame. No maintainable recipe satisfying both
contracts was established within the pinned Electron interface.

The owner accepted the smallest fallback: Windows uses `transparent: false`.
Acrylic can provide translucency when blur and positive transparency are requested;
otherwise the theme remains opaque. Main checks only Electron's Windows 11 22H2
API floor (build 22621), not whether the compositor visibly honors Acrylic.
Unsupported/unknown versions and throwing material calls keep opaque paint.
The per-window native owner supplies effective transparency to the existing typed
renderer snapshot after native application; it does not mutate the requested
configuration. This also keeps fallback chrome and live theme changes coherent.
A failed transition is retried only by a later committed reload or cleanup.
There is no new renderer capability, GPU/DPI switch, native addon, window
recreation, fabricated native state or geometry emulation.

## Paint ownership

Electron's background stays transparent where effects are supported. Windows
fallbacks retain the opaque theme in native construction and effective renderer
paint; equal opaque colors do not accumulate translucent tint. The renderer body
paints the theme's background once at `1 - transparency`. Root, tab strip, tab containers, Surfaces
and canvas default backgrounds add no copy of that tint. Chrome draws only its
neutral/foreground overlays, scaled by the same amount. Nested overlays account
for their existing parent overlay to preserve the default opaque appearance.
A foreground underline keeps the selected tab identifiable as its fill fades.
Local Image Preview and error surfaces retain their readable opaque treatment.

The portable Surface accepts an optional host-owned background at mount. Without
it, the Surface paints its own opaque theme background; no Electron or blur
concept enters the Surface. The window host selects host ownership for every
tab. Thus live transparency changes need no Surface method, core recreation or
PTY operation: only the shared tint and the main-owned material change.

The pinned WebGL2 buffer enables alpha, clears to transparent and preserves
ordinary foreground blending. Ghostty already distinguishes implicit backgrounds
from explicit ANSI/RGB colors, including background-only erased cells, through
`Style.bg`. Restty's WASM bridge previously flattened that optional value into
opaque RGB. The narrow source correction retains its RGB and writes alpha 0
for an implicit default or 255 for an explicit background in the existing cell
RGBA buffer. DECSCNM reverse-screen mode also keeps the swapped default background
opaque: Ghostty swaps render-state defaults without marking cells inverse. The
bridge reads the core mode directly and restores implicit alpha when it ends.
There is no RGB-match heuristic, new parser or extra ABI array.
SGR 49 returns to implicit default. Inverse exchanges colors but explicitly
restores opaque foreground alpha: background ownership must not make inverse
ink invisible. Text contrast correction still uses the unmodified background
RGB. Selection, cursor, ANSI/faint text and Kitty image alpha keep their meanings.

An explicit background stays opaque even when it equals the current theme RGB.
A TUI that paints its whole screen can therefore remain opaque. This deliberate
policy preserves application color intent rather than making opacity depend on
a coincidental palette match. Themes remain exact `#RRGGBB`; transparency lives
in User Configuration, not a second theme schema.

## Alternatives and verification

Whole-window opacity fades text; CSS backdrop filters blur only document content;
Mica is not the selected live behind-window material. Recreating windows for
configuration changes threatens Live Terminal Sessions. Comparing cell RGB with
theme RGB loses explicit application intent. Those alternatives are rejected.

The correction remains a checksum-guarded ordered install transformation with exact
input/output digests and a reproducible Zig 0.16.0 core artifact. See
[Restty development](../restty-development.md#background-composition) for source
provenance, checks and native commands. Real WebGL readback establishes alpha and
foreground rendering; Chromium `capturePage` establishes single page tint, not
native desktop blur. Native API success and prior standalone VM probes are not
qualification of the integrated candidate on another desktop.
