# Render bounded Kitty images in direct sessions

OMXTerm renders bounded static images carried as Terminal Payload through
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
Completion on the last data-bearing chunk also remains accepted.

Amended for [#1028](https://github.com/luizomf/omxterm/issues/1028): the claim
also covers the direct-transmission (`t=d`) output of kitten icat 0.47
`--transfer-mode=stream`, timg 1.6 `-pk`, yazi 26.9 and snacks.nvim: PNG, RGB
(`f=24`) and RGBA, optionally zlib-compressed (`o=z`), re-placement under
placement IDs (`a=p`, `p`), and Unicode placeholders (`U=1`). It covers these
producers inside tmux with `allow-passthrough on` when they wrap their output
for tmux. icat repeats `a=T,q=2` on every 128 KiB chunk and omits `m` on the
last, so an `a=T` that carries nothing but `q` and `m` continues the pending
image; any other `a=T` still replaces it. The PTY also reports the grid's pixel
size, without which icat refuses to run and tmux assumes a 16×32 cell. Other
Kitty paths, `screen` and other multiplexers, file, temporary-file and
shared-memory media, SIXEL, iTerm2 Inline Image Protocol, animation, and
persistence are not part of this decision.

On Windows, the PTY Adapter selects the ConPTY DLL already shipped with
`node-pty`. The operating-system ConPTY can consume Kitty APC sequences before
the renderer receives them. A real-PTY regression verifies that a complete image
sequence survives the Adapter; renderer-only image fixtures cannot prove this
transport boundary. This requires no user setting or additional dependency.

The portable Terminal Surface owns protocol parsing, browser/WebGL rendering,
cell anchoring, resize, font-rescaling behavior and cleanup. Restty implements
the claimed paths inside its pinned Ghostty core. Cell-size reports
remain enabled so `CSI 16 t` returns the dimensions image-producing applications
need, and each resize gives the PTY the grid's size in device pixels (columns ×
cell width, padding excluded), the same cell size. File, temporary-file and
shared-memory media stay refused, so main never reads local files or shared
memory on behalf of output that may come from SSH. Image rendering uses no JavaScript eval, remote fetch, object source,
renderer Node access or image-specific preload/IPC capability.
Image bytes stay opaque, memory-only Terminal Payload on the existing
PTY-to-Terminal-Surface path and never become Operational Events, clipboard
transport, files, or application network traffic.

OMXTerm carries checksum-guarded source patches in the reproducible
Restty build: direct input is limited to 33,554,432 decoded bytes, source area is
limited to 4,194,304 pixels before completed-image allocation, and exact Chafa
RGBA length is validated. The native one-pending-image-per-screen model replaces
unfinished state on new metadata and clears it on malformed, cancelled, failed,
reset, alternate-screen-exit and disposal paths. Completed decoded image data is
limited to 64,000,000 bytes per screen using Ghostty's native eviction policy.
Pi deletion and reset use the same core-owned image and placement state.

Restty's browser/WebGL rendering copies visible decoded RGBA outside core storage
accounting, while decode and Base64 operations may allocate transient data.
Tabs multiply these costs, so the limits are not a total process-memory bound.

Kitty rendering does not change the Terminal Capability Identity. OMXTerm keeps
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and its
installed version without branded terminfo, Shell Integration, Kitty or iTerm2
impersonation, or Pi-specific environment injection. For Pi versions that do not
recognize OMXTerm, select Kitty explicitly. Capability selection remains the
child application's decision.
