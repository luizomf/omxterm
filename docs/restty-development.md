# Restty development candidate

OMXTerm has a temporary, unpackaged Restty 0.3.0 Terminal Surface candidate. The
normal development launch and every packaged launch still use xterm. This is a
migration aid, not User Configuration and not a second supported renderer.

After `npm ci`, opt in explicitly:

```sh
OMXTERM_TERMINAL_SURFACE=restty npm run dev
```

`OMXTERM_TERMINAL_SURFACE` accepts exactly `xterm` or `restty`. Any other value
fails startup. A packaged process refuses `restty` rather than activating the
candidate or falling back automatically.

## Current slice

The candidate uses the existing tabs, Electron Adapter and owned local PTYs. It
supports ordinary Unicode shell input/output, grid resize, focus, independent
tabs, Default Shell and `-e` command startup, shell exit, explicit close and
renderer-loss cleanup. It requires the bundled TTF, Ghostty WASM core and a real
WebGL2 backend before starting a PTY. Initialization failure starts no shell;
WebGL context loss reports a visible failure and disposes only the owning tab.

The candidate applies the selected Terminal Theme, configured font family,
size, independent line height, per-side padding, Window Font Zoom and
scrollback. Theme, size, padding and scrollback reload live without replacing
the Surface, core or PTY. A Restty Surface keeps the font family and line height
it was created with; restart OMXTerm to apply either changed setting to every
existing Restty Surface. New Surfaces use the latest validated values. Native
glyph rasterization can differ from xterm and is not claimed to be
pixel-identical.

Positive `scrollback.lines` values are approximate physical history-row targets
because Ghostty evicts whole historical pages. Retention can exceed the target
by one minimum boundary page, while the independent 10,000,000-byte core ceiling
can retain fewer rows. OMXTerm does not estimate bytes per line. Zero selects
Ghostty's no-history path: it drops existing history, retains none through
continued output or resize, and a later positive value retains only new output.
Live changes preserve reflow, alternate-screen state, selection and viewport
coherence in the same Surface and remain isolated per Surface.

Explicit copy/paste, selection, native context actions, Protected Paste,
snippets, file-path injection and write-only OSC 52 use the existing OMXTerm
host routes. DOM paste enters the same asynchronous confirmation and ordered
delivery path without browser clipboard permission; ordinary key input remains
direct. OSC 52 reads, clears, malformed, cancelled and over-bound requests have
no clipboard or PTY side effect. Modified primary click activates literal
lowercase visible HTTP(S) text through the existing host route, including during
TUI mouse reporting without a duplicate PTY report. Restty joins rows only when
Ghostty selection text proves a visible soft wrap; hard breaks remain separate,
OSC 8 destinations are ignored, and a destination that may continue into a
concealed row is refused. Parsed OSC 0/2 titles and BEL use the existing
per-session title and silent-bell host controller, including raw title bounds,
sanitization and fallback, tab/window ownership, focus/interaction reset and
platform attention. The candidate sends no title reports; cancelled/malformed
controls and OSC BEL terminators have no extra title or bell effect.

The candidate renders the same bounded direct Pi PNG and anonymous
metadata-first Chafa RGBA Kitty paths as xterm, but parsing, decode, placement,
deletion and reset remain in the pinned Ghostty core. Decoded transport input is
limited to 33,554,432 bytes, source dimensions to 4,194,304 pixels, and completed
decoded image storage to 64,000,000 bytes per screen. Ghostty retains at most one
unfinished image per screen and uses its native completed-image eviction policy.
The JavaScript/WebGL rendering copies and transient decoder allocations are not
included in that storage total, and tabs multiply memory. Images remain
cell-anchored through resize, Window Font Zoom, tab selection and live theme
reload; `CSI 16 t` reports the current cell size. Pi's default 2,000-by-2,000
autoresized output is the compatibility target. Unsupported protocol paths and
Linux/Windows candidate rendering remain unclaimed.

Output uses the shared ordered Adapter/IPC path. Main pauses an owned PTY at
65,536 unacknowledged UTF-8 bytes and resumes at or below 16,384. Renderer ACKs
are cumulative, sender/session validated, and mean only that output was
submitted synchronously to the Surface—not rendered or released by Restty,
Ghostty, WebGL, Chromium or the GPU. The crossing native read may raise measured
pending bytes above 65,536. Owner loss resumes and terminates only that PTY; the
pinned node-pty Unix correction prevents its 200 ms exit guard from destroying
a deliberately paused readable tail. Windows ConPTY is not modified by that
correction.

Restty's existing OutputFilter retains at most 10,000,000 UTF-16 code units for
one unfinished OSC or CSI body. An oversized control is discarded whole through
termination or CAN/SUB cancellation, has no partial clipboard, title, reply or
mode side effect, and does not block later ordinary text. The established valid
large OSC 52 request remains accepted. This scanner rule is not a general text,
copy, paste or input limit.

Restty honors live Option Key Mode changes. On macOS, `none` preserves native
layout Unicode and composition input; `left`, `right`, and `both` produce
terminal Alt input only from the configured physical Option key. Application
keybinds still route through Electron main exactly once. Restty keeps selection,
copy, wide/combining/emoji graphemes, mouse buttons and wheel input coherent in
normal and alternate screens; Shift selection and valid modified-link activation
override application mouse reporting without duplicate PTY input. DA1, DA2,
cursor-position and cell-size queries have one deterministic parsed-runtime
reply path, including controls split across output messages.

The xterm Surface retains its existing observable behavior. Queue bytes,
JavaScript heap and RSS are separate metrics from Ghostty
core, browser/WebGL and GPU allocations; no whole-application memory bound is
claimed. There is no automatic xterm fallback.

## Pinned inputs and restoration

- Restty npm package `0.3.0`, source commit
  `3db45b0e10dbe53c52a77131d366f519546e4f04`;
- Ghostty submodule commit
  `0309af1b7f0724105a0805efa88bbee808a616ae`;
- `text-shaper` `0.1.28`, source commit
  `a23058f475f2b0655b93a89bfce426eecafb9439` (Restty's source submodule at
  `94db4fba9186b99b868b401ce404a9930b93fcbf` is upstream prior art, not the
  installed npm artifact identity);
- Nerd Fonts `v3.4.0` `JetBrainsMono.zip`, archive SHA-256
  `76f05ff3ace48a464a6ca57977998784ff7bdbb65a6d915d7e401cd3927c493c`;
- bundled `JetBrainsMonoNerdFontMono-Regular.ttf`, SHA-256
  `f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c`.

`assets/restty-sources.json` records the npm registry's package-to-commit
`gitHead`, tarball integrity and SHA-1 metadata together with Restty's source
tree and exact submodule entries. To audit the mapping independently, compare
`npm view restty@0.3.0 gitHead dist repository --json` and
`npm view text-shaper@0.1.28 gitHead dist repository --json` with that tracked
manifest, then inspect the exact Restty tree with:

```sh
git clone https://github.com/wiedymi/restty.git
cd restty
git checkout 3db45b0e10dbe53c52a77131d366f519546e4f04
git submodule update --init --recursive
git rev-parse HEAD^{tree}
git ls-tree HEAD reference/ghostty reference/text-shaper
```

The lockfile restores the npm tarballs identified by that manifest. `npm ci`
then runs `scripts/prepare-restty-runtime.mjs`, which accepts only the reviewed
Restty runtime, declarations and embedded-core SHA-256 values and produces
corrected runtime SHA-256
`1cda40a3b3e5dfbda54a2dd5616277e3d337e6f964639f8edc6e3c0c892011c3`,
embedded-core chunk SHA-256
`3b3f4ef21e2fe5d5bfc7d5ad47b2557c1e12cca33619dbd5f15df9572e038f4d`,
and event declarations SHA-256
`428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34`.
The narrow correction makes font-load failure reject initialization, disables
Restty's direct browser clipboard and link-opening callbacks, preserves native
Option Unicode/composition versus configured physical-side Alt input, gives DA2
its own deterministic response, bounds unfinished OSC/CSI control bodies with
whole-control recovery, and exposes raw paste
origin, current bracketed mode, selection/Select All, parsed OSC and OSC
cancellation, visible cell/soft-wrap lookup, and parsed Ghostty title/BEL runtime
events to OMXTerm's existing host policy. Borrowed render cells are snapshotted
before selection-text queries can allocate WASM memory. It also removes Restty's 10–64
live-size clamp in favor of OMXTerm's existing minimum of 1 for Window Font
Zoom, carries the creation-time line-height factor into cell metrics without
scaling glyphs, keeps bold ANSI 0–7 colors unchanged, and exposes Ghostty's
existing line and byte limit setters through one live Restty operation. Unknown
dependency or artifact bytes fail instead of receiving a best-effort patch.
The same install step accepts node-pty 1.1.0 Unix runtime SHA-256
`a62e3a60c3bc1b0e7261f58284856df748dcee6761a2bc7a5a5ba98b22660473`
and produces
`238f993db4aa83d57885832eabe9c1de1ce05b96c84d3270574f26f71f9afcb8`;
Windows skips that Unix-only correction. Reinstall with `npm ci` to restore and
reapply the reviewed bytes; do not edit `node_modules` manually.

`assets/restty/omxterm-restty-core.wasm` is built from the pinned Restty and
Ghostty commits above with tracked Restty patch
`assets/restty/omxterm-core.patch` and Ghostty patch
`assets/restty/ghostty-title-events.patch`. Their SHA-256 values are recorded in
`assets/restty-sources.json`. The artifact SHA-256 is
`1dff2cd4dbd1b0b32bdf88bf75e40d10ad4ec2a0843040495dc479f4d1d8a2a0`.
The Restty patch also enables Ghostty's standard grapheme-cluster mode as a
reset default so emoji-presentation and ZWJ clusters retain one two-column cell.
To reproduce it in an owned disposable checkout, check out the pinned Restty
commit and submodules, apply the Restty patch at repository root and the
Ghostty patch inside `reference/ghostty`, use Zig 0.16.0, and run:

```sh
git apply --unidiff-zero /path/to/assets/restty/omxterm-core.patch
git -C reference/ghostty apply --unidiff-zero /path/to/assets/restty/ghostty-title-events.patch
RESTTY_WASM_OPTIMIZE=ReleaseSafe bun run scripts/build-wasm.ts
shasum -a 256 wasm/zig-out/bin/restty.wasm
```

The build target is `wasm32-freestanding` with `baseline+simd128` as declared by
the pinned Restty build. `assets/restty-sources.json` records both patches,
artifact and build-input checksums. The tracked core is used at runtime; no
network access or source build occurs during `npm ci`.

The TTF is tracked because Restty/text-shaper consumes font bytes and the prior
WOFF2 path did not provide equivalent shaping. `assets/fonts/README.md` records
font provenance and checksums. Runtime loading is memory-only and works under the
production `connect-src 'none'` CSP without local fonts, user dotfiles or remote
fetches. Packaged license texts are listed in `THIRD_PARTY_NOTICES.md`.

`test/integration/restty-host-integration.test.ts` runs the real main IPC
router, preload bridge, Electron Adapter, Restty Surface and owned macOS PTYs in
one fixture under the production CSP. It covers Unicode and bare-control-key
input, large chunked DOM paste through a real owned PTY, explicit host
copy/paste, Select All, context menu and OSC 52, parsed title/BEL ownership,
title-query silence, disposal, resize, focus return, two isolated tabs, Default
Shell and explicit-command startup, owned session
termination, explicit close, renderer-process loss, a numbered 2 MiB producer
through production IPC during a 350 ms renderer stall and resize, cumulative
flow control, clean producer exit, direct Pi and Chafa Terminal Payload through
the PTY, rendered image content and placement, live image geometry, and
remaining candidate-route refusal without using a user session or real
clipboard. Its result contains only synthetic outcome and queue/heap/RSS
metadata, not captured Terminal Payload.

Native runtime evidence through the current parsed-event slice is macOS ARM64.
Linux and Windows Restty behavior remains unverified; their xterm package
contract is unchanged.
