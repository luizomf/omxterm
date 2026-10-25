# Use Restty as the sole Terminal Surface

OMXTerm uses pinned Restty and Ghostty behind the portable
[Terminal Surface seam](0008-make-the-terminal-surface-the-portable-module.md).
There is one implementation, not an engine registry, renderer selector or
fallback.

## Navigation

- [Sole Surface and initialization](#decision-and-initialization)
- [Dependency pins and corrections](#dependency-pins-and-corrections)
- [Font stack, appearance and lifetime](#font-stack-appearance-and-lifetime),
  including [creation-time settings](#creation-time-settings-and-restart-notices)
- [Clipboard, links, events and output](#clipboard-links-events-and-output-delivery)
- [Keyboard input and terminal controls](#keyboard-input-and-terminal-controls)
- [Scrollback and reflow](#scrollback-and-reflow)
- [Maintenance and qualification](#consequences-and-qualification)

The [product contract](../spec.md) describes current behavior; the
[Restty development guide](../restty-development.md) owns maintenance commands.

## Decision and initialization

Restty 0.3.0 is the Surface in ordinary development and packaged applications.
`TERM=xterm-256color` is protocol vocabulary, not a renderer choice.

Each Surface reuses the Electron host, typed configuration bridge, Terminal Tab,
session Adapter and owned local PTY. Bundled TTFs, Ghostty core and an actual
WebGL2 backend must be ready before PTY creation; on Linux that backend may be
Chromium's SwiftShader WebGL under
[ADR 0038](0038-allow-the-linux-software-webgl-fallback.md). Failed initialization releases
partial resources and starts no shell. Closing an initializing owner is
cancellation: late continuations do not start a shell or notify the removed tab.
An already accepted Adapter start is closed through that Adapter. Pending work
can settle before its partial resources and font lease are released.

Irrecoverable WebGL context loss fails only the owning Surface/session. It does
not recreate a core around a surviving PTY or switch engines. The validated
close route carries a fixed rendering-failure reason, not renderer-provided
dialog text. Main owns native failure acknowledgement and final window closure
under [ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

## Dependency pins and corrections

Restty 0.3.0 is pinned to `3db45b0e10dbe53c52a77131d366f519546e4f04`,
including Ghostty `0309af1b7f0724105a0805efa88bbee808a616ae`, with
`text-shaper` 0.1.28. OMXTerm prepares reviewed checksum-guarded JavaScript and
reproducible WASM build inputs after lockfile installation. Exact replacements
and final checksums reject dependency drift. Recognized input digests select
the remaining ordered preparation steps, not approximate patching.

Private typed runtime seams expose readiness, raw DOM-paste origin,
bracketed-paste mode, selection, parsed events and rendering controls. Direct
browser clipboard and link-opening callbacks stay disabled. These internals do
not enter the public Surface interface. The cost is maintaining a pinned
adaptation; dependency upgrades need source and behavioral review.

## Font stack, appearance and lifetime

The default stack uses bundled real FiraCode Nerd Font Mono regular/bold,
DejaVu Sans Mono regular/bold, retained JetBrainsMono Nerd Font Mono, then
available native emoji/CJK/symbol fallback faces. An explicitly configured exact
installed family precedes regular fallbacks. Bundled bold faces are omitted in
that case: Restty's style-first search would otherwise select a different family
for ordinary bold text.

Main resolves regular and available bold, italic and bold-italic faces in the
same family, validates metadata and exact collection-face indices, and returns
bounded bytes. Recorded legacy and typographic family names are accepted
case-sensitively, without fuzzy substitution. Windows uses installed WPF
GlyphTypefaces rather than GDI+ family-level style availability, which can accept
a bold file as regular and miss variable fonts. Non-default variable instances
are not materialized; unavailable styles use synthesis without rejecting an
otherwise usable regular family.

Restty owns ordered style selection and missing-glyph fallback. Synthesis does
not add an unrequested weight or slant. Synthetic bold adds cardinal-neighbour
monochrome masks, clipped to available cell space while retaining existing
italic overhang. It strengthens horizontal and vertical strokes without changing
real bold faces, ANSI colors, regular/italic-only text or color emoji. It is an
approximation, not native outline stroking or pixel parity. It costs up to five
glyph placements, not a second rasterizer or extra atlas variant.

Theme, configured size, ligatures, per-side padding and per-window zoom use the
existing runtime and host geometry. The alpha-enabled paint path preserves
explicit cell backgrounds under
[ADR 0029](0029-compose-background-effects-with-explicit-cell-identity.md).

### Native font snapshots and sharing

One renderer Terminal Window owns native-font generations. Compatible Surfaces
lease the same exact ArrayBuffer backing identities, enabling Restty's
identity-keyed source and parsed-resource sharing. Collection faces share a
backing source and style files are read once per load. Other windows have
independent owners; there is no global or persistent font cache.

Superseded renderer generations survive only for existing creation-time leases;
final release or window disposal drops the owner's references. Native font IPC
accepts only the active validated family and fixed fallback candidates, never a
renderer path or arbitrary historical-family lookup. Successful responses contain
bytes and validated face metadata, not filesystem paths. Font paths, names and
bytes stay out of Operational Events.

**Current error-boundary limitation:** `readInstalledFontFaceData` includes native
read-error detail, and the font IPC/preload route does not translate that
rejection into a fixed renderer-facing error. A failed on-demand read can expose
a native path to the renderer. Raw errors therefore need review before sharing.

For Apple Color Emoji, bounded positional reads assemble memory-only shaping
input without the unused `sbix` bitmap table, retaining all faces and other
tables. Native Canvas still uses the unchanged installed font. This reduces font
bytes, not total RSS/GPU memory. The pinned fallback already renders blank Apple
emoji if Canvas is unavailable. Upgrades must revalidate the assumption using
[the shaping diagnostics](../restty-development.md#optional-rendering-and-memory-diagnostics); it is not a general
policy for bitmap fonts or an on-disk derivative.

### Creation-time settings and restart notices

`font.family` and `font.lineHeight` are creation-time settings. Existing Surfaces
keep them; new Surfaces use the latest validated values. Theme, size, ligatures,
padding and scrollback update in place without replacing a core or PTY. A
persistent notice names deferred settings and asks for restart. A setting clears
from that notice only when the requested value is active in every surviving
Surface, including owners still initializing.

Main issues renderer-scoped font-configuration identities. The host captures one
with the Surface options, and its Adapter retains an independent Surface owner
before PTY start. Startup consumes it once; disposal releases it even before
startup. A renderer configuration-delivery acknowledgement permits main to drop
superseded delivery identities after preceding Surface registrations. Surviving
owners retain only their two creation-time values, avoiding unbounded reload
history. This bookkeeping is separate from tab ownership and native shutdown.

**Current acquisition limitation:** this retained identity does not authorize
completion of a pending native font-data request after a family reload. Main
increments its font-data generation and rejects an old-family completion as
superseded, even if its initializing Surface survives with a renderer lease.
That tab can fail initialization and close without starting a PTY. Already
acquired font bytes survive through their leases; line-height-only reload does
not invalidate the family-data generation. The integrated ownership fixture
holds runtime initialization after font acquisition; reproducing this race
requires a pending main font read
([#569](https://github.com/luizomf/omxterm/issues/569)).

Complete validation rejects invalid configured font inputs before application;
application-time exceptions are not an atomic rollback guarantee. See
[ADR 0003](0003-strict-non-mutating-user-configuration.md).

## Clipboard, links, events and output delivery

Explicit copy/paste, selection, context menus, snippets/path injection and OSC 52
use OMXTerm host policy. Restty's synchronous `beforeInput` diverts raw DOM paste
into the asynchronous semantic-delivery queue. Delivery rechecks current
bracketed mode and ownership, preserves request order without blocking ordinary
keyboard input, and stops later chunks and snippet Enter on disposal. Sent bytes
are not recalled or replayed. Parsed OSC 52 uses the shared canonical UTF-8
Base64 validator; reads, clears, malformed, cancelled and over-bound requests
have no clipboard or PTY side effect.

Visible destinations use cell snapshots joined only by core-proven soft wraps.
Cell text is copied before selection queries can allocate WASM memory. A known
mismatch between wide-wrap spacer cells and core selection text can prevent
visible URL recognition at some Unicode wrap boundaries
([#593](https://github.com/luizomf/omxterm/issues/593)). Hidden OSC 8 destinations
and uncertain viewport-edge continuations are ignored. A
stable valid modified primary click overrides application mouse reporting
without a duplicate PTY report. A narrow compatibility-mouse path completes an
existing primary selection press when a virtual input stack changes pointer
identity; it neither merges arbitrary IDs nor replaces touch/application mouse
routing. Interaction bindings are removed on disposal.

Ghostty's parsed OSC 0/2 title and BEL event queue feeds the existing per-session
host callbacks. It preserves over-limit title evidence, suppresses cancelled
controls, and never enables title reports; OSC BEL terminators produce no bell.
Kitty parsing, decode, placements and bounded storage remain core-owned under
[ADR 0022](0022-render-bounded-kitty-images-in-direct-sessions.md).

Main tags ordered output chunks with cumulative UTF-8 byte positions. Only the
owning renderer main frame/session can acknowledge forward progress. An ACK is
synchronous Surface submission, not rendered pixels or parser/resource release.
Main pauses at 65,536 pending bytes and resumes at or below 16,384. The crossing
native read can exceed the high water, so the bound includes that read. Disposal
or renderer/send loss resumes and terminates only the owned PTY. A guarded
node-pty 1.1.0 Unix correction defers its stuck-close socket timeout while paused
to preserve the readable tail; ConPTY is separate.

## Keyboard input and terminal controls

Application accelerators remain in main. Restty's encoder owns terminal keys
and mouse modes. Live Option Key Mode preserves native Unicode/composition for
unconfigured macOS Option keys and produces terminal Alt only for configured
physical sides. Native dead-key text, including X11 `insertText` without
composition events, stays on the browser text path. The completing Space does
not become substituted ASCII or a duplicate keyboard-protocol release. Ordinary
Space uses the existing key encoder, not a new shortcut system.

Restty's parsed output seam owns DA1, DA2, cursor-position and cell-size replies
once, including split controls. DA2 has its own response. **CPR is currently
inaccurate for some Unicode and resize sequences:** the prepared OutputFilter
tracks a UTF-16 cursor hint before writing filtered output to Ghostty. Its hint
can bypass the actual core position (for example after wide/combining text or
pending-wrap resize). Fixed-provider capability tests do not cover those
actual-core sequences;
[#568](https://github.com/luizomf/omxterm/issues/568) tracks the reproduced
examples.

Ghostty starts in grapheme-cluster mode so emoji-presentation and ZWJ clusters
occupy one two-column cell. The prepared OutputFilter bounds unfinished OSC/CSI
bodies to 10,000,000 UTF-16 code units, discards an over-bound control through
termination or CAN/SUB, and resumes ordinary text without partial side effects.
The short numeric OSC command prefix is outside the handler-body count, keeping
the established largest valid OSC 52 write. This is not a limit on ordinary
terminal text, copy or paste, nor a whole-process memory limit.

Prepared runtime sizing accepts OMXTerm's 8–72 px font range and an independent
creation-time line-height factor, without CSS scaling or a custom renderer.

## Scrollback and reflow

The reproducible core exposes live byte/physical-line limits and parsed events,
not a second application parser. Positive `scrollback.lines` is approximate:
Ghostty prunes whole historical pages, so one minimum boundary page can exceed
the target. Its independent 10,000,000-byte ceiling can retain fewer rows; no
byte-per-line estimate is used. Zero drops history and disables future retention
until a positive value returns. Live changes preserve the core and PTY.

Native scroll-host selection honors a fine pointer even on touch-capable
desktops. The runtime suppresses a queued browser scroll event only when its own
spacer-height write clamps `scrollTop`; it does not force the viewport to live
on output/focus or replace intentional DOM scrolling.

Prepared PageList reflow distinguishes historical continuations from active
trailing-row consumption. Blank non-cursor pins use the destination row start;
genuine continuation offsets remain. Pending-wrap resize reconciles the next
insertion position with the remapped last cell: at the new edge wrap remains
pending, otherwise the next column is selected. Actual-core regressions cover
these behaviors independently of the inaccurate CPR hint. No renderer coordinate
compensation, forced viewport scrolling or clipboard normalization is added.

## Consequences and qualification

The design accepts WebGL2 as a prerequisite and the maintenance cost of pinned
corrections rather than an invisible shell or permanent fallback renderer.
Pending IPC bytes, JavaScript heap, RSS, core storage, browser/WebGL resources
and GPU allocations are separate domains; none is a total memory bound and tabs
multiply costs.

Native ARM64 package evidence belongs to each exact artifact under
[ADR 0019](0019-support-native-arm64-releases-on-macos-linux-and-windows.md).
