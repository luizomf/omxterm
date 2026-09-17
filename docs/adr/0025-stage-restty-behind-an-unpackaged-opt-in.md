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
installation: font-load errors reject readiness, and Restty's direct clipboard,
OSC 52 and link-opening callbacks are disabled. Dependency drift requires review.
The bundled TTF replaces the prototype's non-equivalent WOFF2 shaping input.

The appearance slice maps OMXTerm Terminal Themes into Restty, uses the bundled
font at the configured size and creation-time line height, applies per-side
padding, and preserves per-window zoom through runtime operations. Theme, size
and padding update existing Surfaces without replacing their core or PTY.
Existing Restty Surfaces keep their initial family and line height until OMXTerm
restarts; the next font slice owns the persistent notice and latest-setting
behavior for newly created Surfaces.

Candidate copy/paste, snippets/path injection, OSC 52, links, titles, bell,
installed configured-font loading, scrollback and images stay unavailable until
their owning migration tickets. These gates apply only to Restty. xterm's
existing behavior and security boundaries remain unchanged. Renderer isolation,
the production CSP, application network boundary and platform sandbox policy
also remain unchanged.

The temporary checksum-guarded dependency correction also removes Restty's
10–64 live font-size clamp and carries an independent creation-time line-height
factor into cell height while leaving glyph scale tied to font size. This keeps
OMXTerm's size and row-spacing contract without CSS scaling, clipping or a
custom renderer.

The cost is an intentionally incomplete development candidate and a temporary
pinned dependency correction. This is preferable to unsafe passthrough, invisible
shells, accidental packaged activation or speculative engine abstraction.
Linux and Windows candidate behavior is unverified in this slice; macOS ARM64
owns its native PTY evidence. Final default replacement remains a later decision.
