# Render bounded Kitty images in direct sessions

OMXTerm will render bounded static images carried as Terminal Payload through
two pinned Kitty graphics protocol paths in a direct Live Terminal Session. The
first is the direct PNG subset emitted by Pi 0.84.4 at commit
`b79e4cc834970cca69daebffab7df1da7d1e52c4`: transmit-and-display,
4,096-character Base64 chunks, optional cell geometry, image IDs and cursor
movement, plus Pi's delete-by-image-ID, delete-all, and
delete-all-placements commands. The second is Chafa 1.18.2's anonymous,
metadata-first `-f kitty` output: direct static `f=32` transmit-and-display with
positive source and cell dimensions, `q=2`, one no-payload `m=1` prelude, and
following anonymous `m=1` Base64 chunks containing exact uncompressed
RGBA bytes, then a standalone `m=0` APC with no semicolon or payload.
Completion on the last data-bearing chunk also remains accepted. Raw RGB,
compressed raw pixels, other Chafa or Kitty paths, terminal multiplexers,
placement IDs, SIXEL, iTerm2 Inline Image Protocol, animation,
remote or filesystem image sources, and persistence are not part of this
decision.

On Windows, the PTY Adapter selects the ConPTY DLL already shipped with
`node-pty`. The operating-system ConPTY can consume Kitty APC sequences before
the renderer receives them. A real-PTY regression verifies that a complete image
sequence survives the Adapter; renderer-only image fixtures cannot prove this
transport boundary. This requires no user setting or additional dependency.

The portable Terminal Surface owns protocol parsing, browser decoding, canvas
rendering, cell anchoring, resize and font-rescaling behavior, and cleanup. It
loads the mutually compatible exact beta pair `@xterm/xterm`
`6.1.0-beta.304` and `@xterm/addon-image` `0.10.0-beta.301`, both built from
xterm.js commit `c58ea3637f3968e0e6e79cd92cf9aace7ef89ee2`. Only the addon's
Kitty handler is enabled; SIXEL and iTerm2 IIP are disabled. Cell-size reports
are enabled so `CSI 16 t` returns the dimensions image-producing applications
need.

That pinned handler discards Chafa's semicolon-less metadata prelude. A narrow
Terminal Surface transport addon therefore retains one valid anonymous prelude,
validates its following chunks, and reconstructs one metadata-bearing
transmission inline at the original stream position before the existing Kitty
handler receives it. Consumed APCs retain a payload-free string terminator so
removing image commands does not leave xterm inside an earlier control sequence;
unrelated Pi commands pass through even when transport splits them. It rejects
missing or non-positive dimensions, more
than 4,194,304 source pixels, invalid Base64, and any decoded length other than
`s * v * 4` before browser image allocation. A new prelude replaces the pending
one; completion, terminal reset, alternate-buffer exit, and Surface disposal
release it. This adapter is local to the portable Terminal Surface and adds no
main-process, preload, IPC, filesystem, clipboard, logging, or network seam.

Every Terminal Surface configures `pixelLimit: 4_194_304`,
`kittySizeLimit: 33_554_432`, and `storageLimit: 64`. These values have narrow,
source-defined meanings: the transport target enforces an aggregate
44,739,243-character Base64 threshold and therefore accepts at most 44,739,240
characters / 33,554,430 decoded bytes from Pi's padded Base64; the pixel limit
is a post-decode placement-canvas area; and storage is approximately 64,000,000
bytes of canvas-only FIFO accounting. Evicted images may become placeholders.
They are compatibility and retention controls, not a complete renderer-memory
boundary.

Chafa source area is capped at 4,194,304 pixels, so exact RGBA data is at most
16,777,216 decoded bytes or 22,369,624 padded Base64 characters, below the
existing Kitty transport target. The adapter temporarily retains those encoded
chunks before replay. Placement remains independently subject to the same
4,194,304-pixel canvas limit and approximately 64,000,000-byte FIFO storage
accounting.

The accepted beta still has known gaps: compressed `o=z` output is not bounded
after decompression, PNG natural dimensions are decoded before placement-area
validation, raw-pixel paths outside the accepted Chafa subset remain present
upstream, payload Blobs are outside storage accounting, and each distinct
unfinished `m=1` image ID can retain an approximately 4 MiB decoder in an
aggregate-uncapped pending-transmission map until completion, reset, or Surface
disposal. Font rescaling can allocate outside eviction, and Chromium
codec/canvas allocations and concurrent tabs multiply memory. Pi's default
2,000-by-2,000 pipeline is the compatibility target; no finite OMXTerm limit
promises every image when Pi image autoresize is disabled. These gaps remain
explicit dogfood risks rather than unsupported claims of hardening.

The addon's WebAssembly Base64 decoder requires CSP `script-src
'wasm-unsafe-eval'`. OMXTerm adds only that token: JavaScript eval, remote
scripts or images, object sources, connections, renderer Node access, and new
preload or IPC capabilities remain forbidden. Image bytes stay opaque,
memory-only Terminal Payload on the existing PTY-to-Terminal-Surface path and
never become Operational Events, clipboard transport, files, or application
network traffic.

The development-only Restty candidate implements the same claimed Pi and Chafa
paths inside its pinned Ghostty core rather than through the xterm transport
adapter. OMXTerm carries checksum-guarded source patches in the reproducible
Restty build: direct input is limited to 33,554,432 decoded bytes, source area is
limited to 4,194,304 pixels before completed-image allocation, and exact Chafa
RGBA length is validated. The native one-pending-image-per-screen model replaces
unfinished state on new metadata and clears it on malformed, cancelled, failed,
reset, alternate-screen-exit and disposal paths. Completed decoded image data is
limited to 64,000,000 bytes per screen using Ghostty's native eviction policy.
Pi deletion and reset use the same core-owned image and placement state.

Restty's browser/WebGL rendering copies visible decoded RGBA outside core storage
accounting, while decode and Base64 operations may allocate transient data. As
with xterm, tabs multiply memory, the limits do not claim a total process-memory
boundary, and unsupported protocol paths remain unclaimed. The Restty path adds
no application parser, IPC, filesystem, clipboard, logging, or network seam.

Kitty rendering does not change the Terminal Capability Identity. OMXTerm keeps
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and its
installed version without branded terminfo, Shell Integration, Kitty or iTerm2
impersonation, or Pi-specific environment injection. Until Pi recognizes
OMXTerm, users may explicitly select Kitty in Pi. Capability selection remains
the child application's decision.
