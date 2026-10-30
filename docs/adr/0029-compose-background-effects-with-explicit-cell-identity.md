# Compose background effects without losing explicit cell identity

## Decision

`window.transparency` is a finite fraction from 0 through 1, default 0;
`window.blur` is boolean, default false. Reload applies these preferences to
current and new windows without replacing windows, Surfaces or PTYs.
Validation rejection retains prior settings; application-time exceptions have
no rollback guarantee under
[ADR 0003](0003-strict-non-mutating-user-configuration.md).

Main constructs alpha-capable macOS/Linux windows once. Positive transparency
with blur prefers direct macOS blur and HUD fallback under
[ADR 0030](0030-prefer-direct-macos-background-blur.md). Linux uses X11/XWayland
and requests `_KDE_NET_WM_BLUR_BEHIND_REGION` only on its owned XID through
`xprop`. Native effects are best effort, never startup requirements or proof of
visible composition. There is no global compositor/accessibility change,
material selector, blur strength or whole-window opacity.

Linux helper calls use literal arguments, no shell, a 500 ms timeout with
SIGKILL, discarded output and a 1 KiB buffer bound. They do not run for the
default-off state or native Wayland. Synchronous bounded calls avoid outstanding
work targeting a closed/recycled XID, at the cost of briefly delaying main per
window. Transitions and explicit reload/lifecycle retries perform native work;
there is no background retry timer. Disable/disposal attempts cleanup while the
window exists; destruction owns release after it disappears.

### Windows native-control fallback

Windows uses normal nontransparent construction (`transparent: false`) to keep
native resize, maximize/restore, fullscreen, corners and shadow. Plain alpha
without blur is accepted but renders the opaque theme. With blur and positive
transparency, main requests Acrylic only at the Windows 11 22H2 API floor
(build 22621) or later. Unknown/unsupported versions and failed material calls
retain opaque paint. Even a successful call can remain visually opaque under
OS policy.

The native effect owner publishes effective per-window transparency in the
renderer snapshot without mutating the requested configuration. This keeps
fallback chrome and theme updates coherent. A failed transition can retry on
reload or cleanup. There is no Windows addon, fabricated native state or
geometry emulation.

## Paint ownership

The renderer body paints the theme background once at `1 - transparency`.
Root, tab strip, tab containers, Surfaces and canvas default backgrounds do not
add another tint. Chrome neutral overlays scale with the same amount; foreground
controls and selected-tab underline stay visible. Settings page layers are also
clear, retaining their layout and readable controls. About and Command Palette
use theme-derived alpha on their overlay backgrounds, not whole-element opacity
or an opaque dimming scrim. Their local overlay tint can composite over content;
it is distinct from the single window base tint and does not implement desktop
blur. Local Image Preview and error
surfaces retain readable opaque treatment. Windows opaque fallback uses the same
theme in native and renderer paint.

The portable Surface accepts optional host-owned background at mount. Without
it, the Surface paints its own opaque background; Electron/blur concepts do not
enter the Surface. The window host selects host ownership for every tab.
[ADR 0025](0025-use-restty-as-the-terminal-surface.md) owns rendering lifetime.

The prepared WebGL2 buffer enables alpha, clears transparent and preserves
foreground blending. Ghostty's `Style.bg` distinguishes implicit default from
explicit ANSI/RGB backgrounds, including background-color erase. The WASM
bridge writes alpha 0 for implicit backgrounds and 255 for explicit ones in the
cell RGBA buffer. It reads DECSCNM reverse-screen mode to keep the swapped default
background opaque; SGR 49 returns to implicit default. Inverse text restores
opaque foreground ink and opaque exchanged background. Selection, cursor,
ANSI/faint text and Kitty image alpha retain their meanings.

Explicit backgrounds stay opaque even when their RGB equals the theme. This
preserves application intent: a TUI filling its screen can remain opaque.
Themes are exact `#RRGGBB`; transparency is a window preference, not a theme field.

## Rationale and verification

Whole-window opacity fades text, CSS backdrop filters do not blur the desktop,
and comparing RGB with theme colors loses explicit cell identity. Single tint
ownership avoids stacking translucency while preserving application colors.

Checksum-guarded runtime preparation and a reproducible core provide the cell
alpha boundary. Real WebGL readback tests alpha/foreground rendering;
`capturePage` tests page tint, not native desktop blur. Native API success is
not visual qualification. See
[Restty development](../restty-development.md#background-composition) and
[release verification](../release.md) for procedures and evidence boundaries.
