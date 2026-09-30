# Historical xterm.js WebGL experiment

This record describes the xterm.js renderer experiment before the Restty
cutover. At that time, OMXTerm kept the DOM renderer as its default and left
`@xterm/addon-webgl` out of scope. The current Terminal Surface uses Restty with
WebGL2, as recorded in
[ADR 0025](../docs/adr/0025-stage-restty-behind-an-unpackaged-opt-in.md).

## Findings from the historical experiment

A same-build benchmark showed that WebGL is dramatically faster for emoji and
moderately faster for some attribute-heavy output, but it is not a generally
safer or faster replacement. Workloads that continually vary glyph colors
(`sgr` and `thrash`) were about three times slower under WebGL.

More importantly, sustained style and color churn caused retained atlas and GPU
memory to grow into multiple gigabytes and eventually delayed or stalled DSR
responses. Instrumentation bounded the parser and animation-frame queues to one
frame (about 261 KiB) with one pending xterm write while GPU-helper memory kept
growing. The growth therefore occurs after parsing in renderer or GPU atlas
retention, not in OMXTerm's PTY, IPC, or write queues. The tested xterm.js WebGL
addon provides no eviction or shrink behavior that gives OMXTerm a defensible
memory bound for untrusted terminal output.

A context-loss fallback does not address this failure mode: the context remains
valid while retained memory grows. Loading WebGL conditionally also does not
make unsafe output safe, and supported graphics paths vary across macOS,
Windows, and Linux/XWayland as recorded in ADR 0020.

Reconsidering the xterm.js addon would require bounded atlas eviction or another
enforceable memory strategy, sustained color-churn regression tests, a memory
budget, context-loss verification, and coverage of hardware and software rendering
paths on the Supported Platforms. The DOM emoji performance work belonged to
that earlier renderer.

## Prior requests

- #153 — “Renderer: adopt @xterm/addon-webgl — a measured tradeoff, not a clean win”
