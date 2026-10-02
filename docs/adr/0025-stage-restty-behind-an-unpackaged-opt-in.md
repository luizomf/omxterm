# Use Restty as the sole Terminal Surface

[ADR 0029](0029-compose-background-effects-with-explicit-cell-identity.md) amends
background painting with an alpha-enabled buffer and explicit-cell identity.

Amends [ADR 0008](0008-make-the-terminal-surface-the-portable-module.md) and
records the completed bounded migration tracked by issue 252. The portable
Terminal Surface seam remains authoritative; this decision does not introduce a
renderer registry or promise two permanent engines.

OMXTerm uses pinned Restty 0.3.0 in ordinary development and every packaged
application. The temporary `OMXTERM_TERMINAL_SURFACE` selector and the former
xterm renderer were removed at final cutover. Restty is the single Surface
implementation: initialization must succeed before a shell starts, and failure
does not switch to another renderer. Standard xterm protocol vocabulary such as
`TERM=xterm-256color` remains part of terminal compatibility under ADR 0012 and
is unrelated to the removed renderer.

The first slice reuses the existing Electron host, typed configuration bridge,
Terminal Tabs, session Adapter and owned local PTYs. Each Restty Surface uses
embedded, reproducibly licensed Terminal Font Stack TTFs and a WebGL2 backend.
Font, Ghostty core and backend readiness precede PTY creation. Partial
initialization is disposed without starting a shell. Irrecoverable WebGL context
loss produces a visible failure and disposes that Surface and its Adapter; it
does not recreate a core around a surviving PTY or affect another tab. The
existing sender/session-validated close route carries only a fixed rendering
failure reason, never renderer-supplied dialog text. Main retains its actionable
native failure dialog through last-session cleanup until acknowledgement.

Restty 0.3.0 is pinned to
`3db45b0e10dbe53c52a77131d366f519546e4f04`, including Ghostty
`0309af1b7f0724105a0805efa88bbee808a616ae`, with `text-shaper` 0.1.28.
OMXTerm applies one checksum-guarded build-input correction after lockfile
installation. Font-load errors reject readiness; direct browser clipboard and
link-opening callbacks stay disabled. Narrow reviewed runtime seams expose raw
DOM-paste origin, current bracketed-paste mode, selection/Select All and parsed
OSC commands so the OMXTerm host can own asynchronous Protected Paste and
write-only clipboard policy. OSC cancellation resumes later ordinary output.
Dependency drift requires review. The correction script recognizes each reviewed
historical input digest and applies its remaining transformations as one explicit
ordered suffix. Exact replacement and output checksum guards reject drift. The
patched constructor, pane, services, runtime view, and input origins are typed in
one private Surface module; callers and the public Terminal Surface Interface see
none of these dependency internals. This maintenance structure changes neither
the accepted dependency inputs nor final runtime behavior.

The bundled TTF inputs replace the prototype's non-equivalent WOFF2 shaping
input.

The later font-coverage correction keeps that boundary but replaces the
regular-only default with real FiraCode Nerd Font Mono regular and bold faces.
The prior stack could not select a real bold face, and representative missing
private-use and extended-script glyphs reproduced through pinned Restty despite
the regular JetBrains face loading successfully. Bundled DejaVu Sans Mono adds
redistributable coverage, while the prior JetBrains Nerd face and native
emoji/CJK/symbol candidates remain later fallbacks. Restty's existing
style-aware ordered picker owns face selection; this adds no second shaper,
renderer filesystem access, network source, or ANSI bold-to-bright color
mapping. When a family is explicitly configured, OMXTerm omits the bundled
bold faces: Restty otherwise searches all bold-labelled faces before the
configured regular face, silently changing families for ordinary bold text.
The later configured-style correction resolves available real bold, italic and
bold-italic faces in the same native family, validates their font metadata,
and sends bounded bytes plus exact collection-face indices through the existing
active-family route. Missing styles retain synthetic rendering, but a fallback
must not introduce an unrequested weight or slant. This expands the typed font
response, not renderer filesystem access or the set of requestable families.

Files shared by several style faces are read once per load and retain one
backing identity through the window generation. The pinned Restty correction
selects a validated collection-face index without making it part of the source
or parsed-cache key; a collection is not copied and parsed separately for each
style. The existing bundled stack and regular missing-glyph coverage remain.
The cost is additional bytes and glyph/atlas work when styles live in separate
files, not a second renderer or persistent native font cache.

For missing bold, a checksum-guarded correction approximates contour expansion
with up to four cardinal neighbours of the existing monochrome glyph mask.
Stroke radius scales with cell width rather than individual glyph width or line
height. Additional masks are horizontally clipped with matching texture
coordinates, accounting for the complete synthetic-italic shear; vertical
placements stay inside the row. Empty or collapsed placements are omitted.
The original draw and any pre-existing italic overhang remain unchanged. This strengthens
horizontal as well as vertical strokes, including on real italic faces, without
changing real-bold selection, ANSI colors, color emoji or regular rendering.
It is not native outline stroking or a promise of Ghostty pixel parity. The
tradeoff is at most five glyph placements instead of two for synthetic bold;
source, parsed-face and atlas resources remain shared and unchanged. This small
render-time correction avoids a second rasterizer, extra atlas variants or a
new shader/vertex interface.

The appearance and font slices map OMXTerm Terminal Themes into Restty, use the
configured size and creation-time line height, apply per-side padding, and
preserve per-window zoom through runtime operations. Main resolves exact
installed regular and available style faces through conventional native platform facilities, bounds
and validates the read, and exposes only bytes for the active validated family
and fixed local fallback candidates through sender-validated IPC. On Windows,
regular-face discovery uses installed WPF GlyphTypefaces, as style discovery
already does, rather than scanning registry files with GDI+ family-level style
availability. That GDI+ check can accept a bold file as regular and cannot
resolve some installed variable fonts. WPF enumeration never interprets user
family text as a font URI or fallback list. Native selection is still followed
by bounded file and exact metadata validation, including recorded legacy and
typographic family names; it does not permit simulated regular faces or loosen
style checks. One renderer
Terminal Window owns an isolated native-font snapshot for each active validated
family generation. Compatible live Surfaces in that window lease the same exact
ArrayBuffer backing identities, allowing Restty's existing identity-keyed source
and parsed resource store to share them. Superseded generations remain alive
only for their creation-time Surface leases; final release or window disposal
relinquishes the renderer owner's references. Other windows have independent
owners. This is a focused lifetime seam, not a global or persistent font cache.
Restty orders the configured face before bundled FiraCode Nerd Font Mono
regular/bold, DejaVu Sans Mono regular/bold, the retained JetBrainsMono Nerd
Font Mono face, and available local OS emoji/CJK/symbol fallbacks. The renderer
cannot provide a path or enumerate files; there is no remote fallback,
Operational Event font data, or persistent byte cache.

For Apple Color Emoji collections, main now assembles memory-only shaping
input with every face and non-`sbix` table preserved, sharing duplicate table
ranges. Bounded positional reads skip the bitmap payload before validation and
IPC; other families and collections without `sbix` keep the whole-file path.
The installed font is never modified or replaced. This is specific to the
pinned Restty behavior: native Canvas uses the original installed font for color
emoji, and its existing raster/atlas fallback paths produce equivalent results
without the bitmap table. The measured fallback limitation (blank Apple emoji
when Canvas is unavailable) already exists with the original input. Dependency
upgrades must revalidate this assumption using the source-only experiment in
`docs/emoji-shaping-experiment.md`; do not generalize it to other bitmap fonts.
There is no derivative on disk in production, new cache, renderer capability,
or alternate font renderer.

Theme, size and padding update existing Surfaces without replacing their core
or PTY. `font.family` and `font.lineHeight` are the complete restart-only set:
existing Restty Surfaces keep their creation-time values, while new Surfaces use
the latest fully validated values. A persistent notice names changed deferred
settings and requests restart; a deferred setting clears only when its requested
value is already active in every existing Surface. Failed lookup, bounded read or font decoding starts no
invisible shell and an invalid reload commits nothing.

Creation-time font bookkeeping is owned before the PTY starts. Main issues a
renderer-scoped identity for each accepted restart-only font snapshot; the host
captures it with the Surface options and its Electron Adapter retains an
independent Surface owner immediately. Startup consumes that owner once, and
Adapter disposal releases it even when initialization was cancelled before
startup. IPC validates both the owning renderer main frame and the issued
identity; no claimed font values or new filesystem/font-read authority are
accepted. A configuration-delivery acknowledgement follows renderer callbacks,
so preceding Surface registrations retain their old snapshots before main drops
superseded delivery identities. Surviving Surface owners keep only their two
creation-time values. This avoids an unbounded history of manual reloads and
keeps pending Surfaces visible to restart-notice calculation without starting a
shell early. This font-only registry does not replace the renderer's tab/last-tab
ownership or native session shutdown authority (ADRs 0016 and 0028).

Candidate explicit copy/paste, selection, context-menu actions,
snippets/path injection and OSC 52 are enabled through OMXTerm's existing host
capabilities. Restty's synchronous `beforeInput` only tags and diverts raw DOM
paste into the application-owned asynchronous semantic-delivery queue; it never
runs confirmation policy or requests browser clipboard permission. Delivery
rechecks current bracketed mode and ownership, preserves semantic request order
without blocking ordinary key input, and stops future chunks and snippet Enter
after disposal without rollback. OSC 52 passes the parsed handler payload to the
shared canonical UTF-8 Base64 validator and its dependency-equivalent
10,000,000-code-unit bound; reads, clears, malformed, cancelled and over-bound
requests have no host or PTY side effect. Candidate External Links use the
existing exact-URL host route and retained lowercase provider expression over
visible cell snapshots joined only by Ghostty selection-text proof of a soft
wrap. Cell text is copied before selection queries can allocate WASM memory.
A desktop selection press may arrive with a different pointer identity from
subsequent motion in a virtual input stack (#331: mouse press/release, pen
motion). The pinned runtime uses the browser's compatibility mouse movement
only to complete an existing pending primary-button selection press. It keeps
the original press identity for capture, ignores touch-generated compatibility
moves and released/other buttons, and does nothing once ordinary pointer
movement has already started the drag. It does not globally merge pointer IDs
or replace touch and application mouse reporting. The listener is removed with
the canvas interaction bindings.

Modified primary click overrides application mouse reporting only for a stable
valid destination and produces no duplicate PTY report; changed targets return
to ordinary routing, while cancellation and focus loss produce no spurious
input. Viewport-edge destinations that may continue into concealed rows are
refused, and OSC 8 link IDs are never considered. Parsed Ghostty OSC 0/2 title
and BEL events now leave the pinned WASM core through a bounded event queue and
Restty runtime event API, then use the existing per-session Surface callbacks
and host controller. The core preserves raw over-limit evidence before
Ghostty's internal title bound, suppresses cancelled title requests, and never
enables title reports; OSC BEL terminators do not become bell events. The later
image slice keeps Kitty parsing, decode, placement and bounded storage in the
pinned Ghostty core under ADR 0022; it adds no application parser or privilege
seam. The output-safety slice keeps the shared Adapter but makes its IPC delivery
ordered and acknowledged. Main tags each output chunk with a cumulative UTF-8
byte position, accepts progress only from the owning renderer main frame and
session, pauses an owned PTY at 65,536 pending bytes, and resumes at or below
16,384. An ACK means synchronous submission to the Surface, not rendering or
parser/resource release. The crossing native read can put measured pending
bytes above the high water, so the bound is the high water plus that read, not
a whole-process memory claim. Disposal and renderer/send loss resume and
terminate only the owned PTY. A checksum-guarded pinned node-pty 1.1.0 Unix
runtime correction defers its 200 ms stuck-close socket destruction while the
stream is paused, preserving the readable exit tail; it does not alter the
Windows ConPTY path.

The interaction slice keeps application accelerators in Electron main and adds
no renderer shortcut system. Restty receives the live Option Key Mode through
its existing runtime configuration: on macOS, unconfigured physical Option keys
are left to the browser's native Unicode and composition path, while configured
left, right or both keys produce terminal Alt input. Bare DOM dead keys also
remain on the native text path under legacy, modifyOtherKeys and negotiated
Kitty keyboard reporting instead of being encoded before the native
commit. X11 can commit dead-key text through `insertText` without any composition
events. The keyboard controller therefore retains a focused native dead key
until text commit, cancellation, or focus loss. Its completing Space press,
repeats and release stay on the native path, avoiding both a substituted ASCII
space and an orphan Kitty release. No accent is inferred from a physical key.
Otherwise non-composing Space uses the same existing key encoder as held repeat
and control keys rather than waiting for native text insertion: macOS can
continue delivering Space press/release events while omitting subsequent text
events. Composition and native Option text still retain their native path;
keyboard reporting remains owned by the encoder, with no timer, second shortcut
system or global protocol change. The dependency runtime tracks the physical
Option side without recording key contents. DA1, DA2,
cursor-position and cell-size replies remain owned once by Restty's parsed
output seam, including split controls; DA2 no longer falls through the generic
DA1 response. Mouse button, motion and wheel reports remain in Restty's existing
mouse controller in normal and alternate screens, with selection, explicit copy
and validated modified-link activation retaining their overrides.

The pinned Ghostty core now starts with its standard grapheme-cluster mode as a
reset default. This makes emoji-presentation and ZWJ sequences one two-column
cell for rendering and selection instead of layering neighboring component
cells. The core build change is checksum-guarded beside the existing image,
scrollback and parsed-event corrections; it does not add an OMXTerm parser or
text-layout engine.

The same slice changes Restty's existing OutputFilter rather than adding an
OMXTerm parser. Its unfinished OSC and CSI bodies have a
10,000,000-UTF-16-code-unit budget aligned with the pinned dependency's OSC
safety boundary. Exceeding it enters a bounded discard state through control
termination or CAN/SUB cancellation, rejects the complete control without
clipboard, title, reply or mode side effects, and resumes later ordinary text.
A short numeric OSC command prefix is outside the handler body count, preserving
the established largest valid OSC 52 request. Plain text and complete input,
copy and paste remain unlimited by this scanner rule.

These scanner gates apply to the sole Restty Surface. Renderer isolation, the
production CSP, application network boundary and platform sandbox policy remain
unchanged.

The temporary checksum-guarded dependency correction also removes Restty's
10–64 live font-size clamp and carries an independent creation-time line-height
factor into cell height while leaving glyph scale tied to font size. This keeps
OMXTerm's size and row-spacing contract without CSS scaling, clipping or a
custom renderer.

The scrollback and parsed-event slices extend that correction with a
reproducible pinned WASM artifact. The artifact exposes a narrow runtime setter
over Ghostty's existing byte and physical line limits plus parsed title/BEL
events; it does not introduce an application-owned parser. Positive `scrollback.lines` values are approximate because Ghostty
prunes only complete historical pages: one minimum boundary page can exceed the
target. The independent 10,000,000-byte limit remains active and can retain
fewer rows; no byte-per-line conversion is used. Zero invokes Ghostty's byte-zero
no-history path, immediately erases history and keeps future scrolling out of
history until a positive setting restores the byte ceiling and permits new
retention. Valid reloads mutate the same core and PTY while preserving coherent
reflow, alternate-screen, selection and viewport state. Invalid values remain
outside this seam because complete User Configuration validation precedes
application. Hybrid desktop input must not suppress the existing native scroll
host merely because Chromium also reports touch capability. The pinned selector
therefore honors an available fine pointer; devices with touch but no fine
pointer keep the existing touch path. This changes host selection, not scrolling
mechanics, core state, hardware configuration or platform security.

The native host also suppresses the browser scroll event caused by its own
spacer-height write when that write actually clamps `scrollTop`. Such trusted
browser events are not necessarily user intent. Without suppression, a queued
clamp event can arrive after the next refit and translate the previous mapping
into a one-row core scroll away from live. The checksum-guarded correction arms
Restty's existing programmatic-scroll guard only when the owned spacer write
changes position; explicit top assignments retain their original guard. It adds
no timer, unconditional bottom snap, event-trust heuristic or Ghostty change.
Native coverage crosses actual cell-height boundaries and retains intentional
DOM scrolling, output/focus preservation and accepted-input return to live.
This preserves the existing viewport contract rather than widening the Surface API.

The later PageList reflow correction keeps those source pins and core ownership.
It tracks the original active boundary for preserved-cursor wrap accounting,
excluding newly exposed historical continuations from active trailing-row
consumption. Blank non-cursor pins use the destination row's starting column,
including deferred hard rows and pending wraps, while retaining genuine
continuation offsets and clipping. Actual-core regressions distinguish both
seams from legitimate text reflow. No image-coordinate compensation, forced
viewport scroll or history deletion is added to the renderer.

The decision carries the maintenance cost of a pinned dependency correction and
the runtime cost of requiring WebGL2. In return, OMXTerm avoids unsafe
passthrough, invisible shells, a permanent fallback renderer, and a speculative
engine abstraction. Queue pending bytes, JavaScript heap, and process RSS are
reported separately. Core, browser/WebGL, and GPU allocations remain distinct
costs, so none of these measurements is a total application-memory bound. Native
ARM64 package checks on macOS, Linux, and Windows own final qualification.
