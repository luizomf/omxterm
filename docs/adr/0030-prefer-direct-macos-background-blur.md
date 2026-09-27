# Prefer direct macOS background blur with a bounded native adapter

Issue #415 explicitly reopens the macOS material-only/no-addon choice in
[ADR 0029](0029-compose-background-effects-with-explicit-cell-identity.md).
The owner preferred an isolated direct-blur prototype over material vibrancy:
wallpaper's pink/purple detail survived better at equal renderer opacity.
HUD remains the accepted fallback, not a new user-selectable preset.

## Decision

Keep `window.blur` boolean and `window.transparency` unchanged. Positive
transparency with blur enabled prefers a fixed native radius 20 and white
NSWindow background alpha 0.001. The renderer still paints exactly its configured
`1 - transparency` tint. The tiny native background preserves the selected
rounded outline; it is not whole-window opacity or tint compensation. Text,
explicit cell backgrounds, images and controls retain ADR 0029's opacity rules.
No renderer, Surface, PTY, configuration schema or Windows/Linux effect changes
are needed.

A small Objective-C++ Node-API v8 addon exposes only
`setBlur(ownedNSViewHandle, enabled)`. Radius and native background are internal
constants. Only main can load it or obtain a native handle. Each call requires
the AppKit main thread, an exact pointer-sized Node Buffer and a boolean. It
compares addresses against this process's live AppKit view trees, never
messaging a supplied pointer. Main acquires the handle from its live registered
BrowserWindow for each call and retains no handle. There is no renderer bridge,
window-title heuristic, scene enumeration, screenshot capability, observer,
network request or private global state.

The addon dynamically resolves `CGSDefaultConnectionForThread` and
`CGSSetWindowBackgroundBlurRadius` from loaded system libraries, following the
narrow ABI used by Ghostty v1.3.1. Missing symbols return unavailable without
attempting private mutation. A zero result means the native call returned
success, **not proof of visible blur**. Objective-C exceptions become bounded
failure results without exception details. Main treats module load, native and
material failures as optional effects, never launch errors.

## Ownership and fallback

The existing background-effects owner retains current/future-window and reload
ownership. Its `show(window)` calls Electron's existing native `show()` before
applying the effect. Registering a `show: false` window must not establish a
successful blur effect. Real Electron 43.1.1 tests observed missing `show` events
even when `show()` made the window visible, so relying exclusively on that event
was insufficient. A per-window `restore` hook reapplies after native restoration;
the addon also refuses enable while NSWindow is not visible. There are no timers,
polling, geometry mutations, fake native state or application-wide observers.

Before switching or disabling, main clears any possibly applied private radius
and the native background. Native reset clears the background even when private
symbol/reset work fails. Missing addon/symbols and recoverable enable failures
use HUD. If cleanup fails, main retains uncertainty and does **not** layer HUD or
another private enable over it. A later committed reload, explicit show or
restore can retry; no background retries are scheduled. Zero transparency and
blur disabled request cleanup. Disposal is idempotent, removes hooks and attempts
cleanup while the window is live. Once destroyed, the native window owns resource
release and no saved pointer is used.

This does not change fullscreen policy or solve Mission Control bounds behavior.
Native fullscreen, maximize/restore and controls remain OS/Electron operations.
No snapshots, opaque fullscreen override or geometry restoration are introduced.

## Build and maintenance cost

Build locally on macOS ARM64 with Apple clang and the macOS SDK. The small pinned
build-only `node-api-headers` dependency supplies portable C Node-API headers;
there is no V8/Electron internal ABI, addon framework, runtime download or
machine-specific header path. `npm run build` targets macOS 12.0, matching pinned
Electron's minimum, not the prototype's accidental macOS 27 target. Linux and
Windows neither compile nor package this addon and need no Apple tooling.

The generated addon lives beside the ESM main bundle, is explicitly unpacked
from ASAR, and participates in the existing complete ad-hoc code seal. Build
failures fail the macOS build; runtime load failures still preserve launch.
Generated binaries are ignored, not source-controlled. Packaging checks require
ARM64, the deployment floor, ASAR-relative loading in the packaged Electron
runtime and the complete code seal.

Private APIs are unsupported: ABI, availability, radius semantics or visible
composition may change without notice, including silent visual regressions.
Dynamic lookup and HUD reduce launch risk, not that maintenance or distribution
policy risk. Neither minimum deployment metadata nor Node-API stability proves
private-API support across all compatible OS versions. Current native evidence is
macOS 27 ARM64 only. Electron/macOS updates require renewed native and package
checks. [The integration evidence](../evidence/macos-direct-blur.md) separates
observed behavior from unverified compatibility and visual claims.

## Rejected alternatives

Retaining material-only blur did not produce the accepted wallpaper detail.
Shipping the prototype wholesale would introduce diagnostics, parameter arrays,
private paths and an incompatible deployment floor. Whole-window opacity fades
text; CSS filters cannot blur the desktop. A strength/material selector, window
recreation, polling or compositor-global workaround adds scope without solving
the bounded request.
