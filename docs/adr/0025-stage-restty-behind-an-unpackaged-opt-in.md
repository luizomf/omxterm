# Stage Restty behind an unpackaged development opt-in

Amends [ADR 0008](0008-make-the-terminal-surface-the-portable-module.md) during
the bounded migration tracked by issue 252. The portable Terminal Surface seam
remains authoritative; this decision does not introduce a renderer registry or
promise two permanent engines.

OMXTerm will integrate pinned Restty 0.3.0 incrementally behind the validated
unpackaged `OMXTERM_TERMINAL_SURFACE=restty` launch selection. xterm remains the
normal development and packaged default. Packaged processes refuse the Restty
selection, invalid values fail startup, and candidate failure never falls back
automatically to xterm.

The first slice reuses the existing Electron host, typed configuration bridge,
Terminal Tabs, session Adapter and owned local PTYs. Each Restty Surface uses one
embedded, reproducibly licensed JetBrainsMono Nerd Font Mono TTF and a WebGL2
backend. Font, Ghostty core and backend readiness precede PTY creation. Partial
initialization is disposed without starting a shell. Irrecoverable WebGL context
loss produces a visible failure and disposes that Surface and its Adapter; it
does not recreate a core around a surviving PTY or affect another tab.

Restty 0.3.0 is pinned to
`3db45b0e10dbe53c52a77131d366f519546e4f04`, including Ghostty
`0309af1b7f0724105a0805efa88bbee808a616ae`, with `text-shaper` 0.1.28.
OMXTerm applies one checksum-guarded build-input correction after lockfile
installation. Font-load errors reject readiness; direct browser clipboard and
link-opening callbacks stay disabled. Narrow reviewed runtime seams expose raw
DOM-paste origin, current bracketed-paste mode, selection/Select All and parsed
OSC commands so the OMXTerm host can own asynchronous Protected Paste and
write-only clipboard policy. OSC cancellation resumes later ordinary output.
Dependency drift requires review.
The bundled TTF replaces the prototype's non-equivalent WOFF2 shaping input.

The appearance and font slices map OMXTerm Terminal Themes into Restty, use the
configured size and creation-time line height, apply per-side padding, and
preserve per-window zoom through runtime operations. Main resolves an exact
installed regular face through conventional native platform facilities, bounds
and validates the read, and exposes only bytes for the active validated family
and fixed local fallback candidates through sender-validated IPC. Restty orders
the configured face before licensed bundled JetBrainsMono and available local
OS emoji/CJK/symbol fallbacks. The renderer cannot provide a path or enumerate
files; there is no remote fallback, Operational Event font data, or persistent
byte cache.

Theme, size and padding update existing Surfaces without replacing their core
or PTY. `font.family` and `font.lineHeight` are the complete restart-only set:
existing Restty Surfaces keep their creation-time values, while new Surfaces use
the latest fully validated values. A persistent notice names changed deferred
settings and requests restart; a deferred setting clears only when its requested
value is already active in every existing Surface. Failed lookup, bounded read or font decoding starts no
invisible shell and an invalid reload commits nothing.

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
existing exact-URL host route and lowercase xterm-provider expression over
visible cell snapshots joined only by Ghostty selection-text proof of a soft
wrap. Cell text is copied before selection queries can allocate WASM memory.
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
seam. These gates apply only to Restty. xterm's existing behavior and security
boundaries remain unchanged. Renderer isolation, the production CSP,
application network boundary and platform sandbox policy
also remain unchanged.

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
application.

The cost is an intentionally incomplete development candidate and a temporary
pinned dependency correction. This is preferable to unsafe passthrough, invisible
shells, accidental packaged activation or speculative engine abstraction.
Linux and Windows candidate behavior is unverified in this slice; macOS ARM64
owns its native PTY evidence. Final default replacement remains a later decision.
