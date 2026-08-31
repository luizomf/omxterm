# Render bounded Kitty images in direct sessions

OMXTerm will render static PNG images carried as Terminal Payload through the
Kitty graphics protocol in a direct Live Terminal Session. The supported
interoperability target is the direct-transmission subset emitted by Pi 0.84.4
at commit `b79e4cc834970cca69daebffab7df1da7d1e52c4`: transmit-and-display,
4,096-character Base64 chunks, optional cell geometry, image IDs and cursor
movement, plus Pi's delete-by-image-ID, delete-all, and
delete-all-placements commands. Terminal multiplexers, placement IDs, SIXEL,
iTerm2 Inline Image Protocol, animation, remote image sources, and persistence
are not part of this decision.

The portable Terminal Surface owns protocol parsing, browser decoding, canvas
rendering, cell anchoring, resize and font-rescaling behavior, and cleanup. It
loads the mutually compatible exact beta pair `@xterm/xterm`
`6.1.0-beta.304` and `@xterm/addon-image` `0.10.0-beta.301`, both built from
xterm.js commit `c58ea3637f3968e0e6e79cd92cf9aace7ef89ee2`. Only the addon's
Kitty handler is enabled; SIXEL and iTerm2 IIP are disabled. Cell-size reports
are enabled so `CSI 16 t` returns the dimensions image-producing applications
need.

Every Terminal Surface configures `pixelLimit: 4_194_304`,
`kittySizeLimit: 33_554_432`, and `storageLimit: 64`. These values have narrow,
source-defined meanings: the transport target enforces an aggregate
44,739,243-character Base64 threshold and therefore accepts at most 44,739,240
characters / 33,554,430 decoded bytes from Pi's padded Base64; the pixel limit
is a post-decode placement-canvas area; and storage is approximately 64,000,000
bytes of canvas-only FIFO accounting. Evicted images may become placeholders.
They are compatibility and retention controls, not a complete renderer-memory
boundary.

The accepted beta has known gaps: compressed `o=z` output is not bounded after
decompression, PNG natural dimensions are decoded before placement-area
validation, raw-pixel and other unclaimed Kitty paths remain present upstream,
payload Blobs are outside storage accounting, and each distinct unfinished
`m=1` image ID can retain an approximately 4 MiB decoder in an aggregate-uncapped
pending-transmission map until completion, reset, or Surface disposal. Font
rescaling can allocate outside eviction, and Chromium codec/canvas allocations
and concurrent tabs multiply memory. Pi's default 2,000-by-2,000 pipeline is the compatibility
target; no finite OMXTerm limit promises every image when Pi image autoresize
is disabled. These gaps remain explicit dogfood risks rather than unsupported
claims of hardening.

The addon's WebAssembly Base64 decoder requires CSP `script-src
'wasm-unsafe-eval'`. OMXTerm adds only that token: JavaScript eval, remote
scripts or images, object sources, connections, renderer Node access, and new
preload or IPC capabilities remain forbidden. Image bytes stay opaque,
memory-only Terminal Payload on the existing PTY-to-Terminal-Surface path and
never become Operational Events, clipboard transport, files, or application
network traffic.

Kitty rendering does not change the Terminal Capability Identity. OMXTerm keeps
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and its
installed version without branded terminfo, Shell Integration, Kitty or iTerm2
impersonation, or Pi-specific environment injection. Until Pi recognizes
OMXTerm, users may explicitly select Kitty in Pi. Capability selection remains
the child application's decision.
