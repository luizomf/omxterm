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

The portable Terminal Surface owns protocol parsing, browser/WebGL rendering,
cell anchoring, resize, font-rescaling behavior and cleanup. Restty implements
the claimed Pi and Chafa paths inside its pinned Ghostty core. Cell-size reports
remain enabled so `CSI 16 t` returns the dimensions image-producing applications
need. Image rendering uses no JavaScript eval, remote fetch, object source,
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
accounting, while decode and Base64 operations may allocate transient data. Tabs multiply memory, the limits do not claim a total process-memory
boundary, and unsupported protocol paths remain unclaimed. The Restty path adds
no application parser, IPC, filesystem, clipboard, logging, or network seam.

Kitty rendering does not change the Terminal Capability Identity. OMXTerm keeps
`TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=OMXTerm`, and its
installed version without branded terminfo, Shell Integration, Kitty or iTerm2
impersonation, or Pi-specific environment injection. Until Pi recognizes
OMXTerm, users may explicitly select Kitty in Pi. Capability selection remains
the child application's decision.
