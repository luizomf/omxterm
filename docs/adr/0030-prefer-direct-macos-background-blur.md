# Prefer direct macOS background blur with a bounded native adapter

## Decision

Positive transparency with `window.blur: true` prefers fixed native radius 20
and white NSWindow background alpha 0.001. Direct blur preserves desktop detail
without applying opacity to text or a material's stronger tint. HUD is the
fallback, not a user-selectable preset. Renderer tint remains exactly
`1 - transparency`; explicit backgrounds, glyphs, images and controls follow
[ADR 0029](0029-compose-background-effects-with-explicit-cell-identity.md).

A small Objective-C++ Node-API v8 addon exposes only
`setBlur(ownedNSViewHandle, enabled)`. Constants stay internal. Main obtains a
fresh handle from its live registered BrowserWindow and retains no pointer.
Each call requires the AppKit main thread, a pointer-sized Node Buffer and a
boolean. The addon compares addresses against this process's live AppKit view
trees rather than messaging a supplied pointer. There is no renderer bridge,
scene/window-title lookup, screenshot capability or network access.

The addon dynamically resolves `CGSDefaultConnectionForThread` and
`CGSSetWindowBackgroundBlurRadius`. Missing symbols return unavailable without
private mutation. Zero means API success, not proof of visible blur.
Objective-C exceptions become bounded failure results without native details.
Module/native/material failures are optional-effect failures, not launch errors.

## Ownership and fallback

The main background-effects owner calls native `show()` before applying blur;
a registered `show: false` window is not treated as successfully blurred. The
addon refuses enable on an invisible NSWindow. Explicit show and a per-window
restore hook apply effects without relying solely on Electron's show event.
There is no timer, polling, geometry mutation or application-wide observer.

Before switching or disabling, main resets any possibly applied private radius
and native background. Native reset clears background even if symbol/reset work
fails. Missing addon/symbols and recoverable enable failures use HUD. Uncertain
cleanup prevents stacking HUD or another private enable over an unknown effect.
Reload, explicit show or restore can retry; there is no background retry.
Zero transparency and disabled blur request cleanup. Disposal removes hooks and
attempts cleanup while live; window destruction owns native resource release.

Fullscreen, maximize/restore and Mission Control remain OS/Electron behavior;
this adapter does not implement snapshot or geometry restoration.

## Build and maintenance cost

The macOS ARM64 build uses Apple clang, the SDK and locked `node-api-headers`,
with no V8/Electron internal ABI or addon framework. `npm run build` targets
macOS 12.0. Linux/Windows neither compile nor package the addon.

The generated addon sits beside the ESM main bundle, is unpacked from ASAR and
included in the ad-hoc code seal. Build failure fails the macOS build; runtime
load failure preserves launch. Package checks inspect ARM64 architecture,
deployment floor, ASAR-relative loading and the complete code seal.

Private APIs are unsupported: availability, ABI, radius semantics and visible
composition can change silently. Dynamic lookup and HUD limit launch risk, not
that maintenance risk. Deployment metadata and Node-API stability do not prove
private API support across OS versions. Use [development](../development.md)
and [release](../release.md) for native/package verification; visual blur needs
native observation rather than API success or renderer capture alone.

## Rationale

Direct native blur plus a narrow fallback preserves text opacity and one tint
owner. Whole-window opacity fades text; CSS filters cannot blur the desktop.
A strength/material selector, window recreation or compositor-global workaround
would add policy outside this bounded adapter.
