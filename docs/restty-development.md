# Restty Terminal Surface

OMXTerm uses pinned Restty 0.3.0 and its Ghostty WASM core as the Terminal
Surface in both development and packaged applications. The application starts a
PTY only after fonts, the core, and WebGL2 are ready, so a rendering failure
cannot leave an invisible shell running.

This guide is for contributors changing that integration. Start with the
[runtime contract](#runtime-contract) to understand host behavior, then use
[pinned inputs and restoration](#pinned-inputs-and-restoration) when auditing or
repairing the installed dependency. The product behavior remains normative in
[`spec.md`](spec.md), while [ADR 0025](adr/0025-stage-restty-behind-an-unpackaged-opt-in.md)
records why Restty is the sole Surface. Restty is not a User Configuration
choice, and there is no fallback renderer.

## Runtime contract

The Surface uses the existing tabs, Electron Adapter and owned local PTYs. It
supports ordinary Unicode shell input/output, grid resize, focus, independent
tabs, Default Shell and `-e` command startup, shell exit, explicit close and
renderer-loss cleanup. It requires the bundled TTF, Ghostty WASM core and a real
WebGL2 backend before starting a PTY. Initialization failure starts no shell;
WebGL context loss reports a visible failure and disposes only the owning tab.
A native failure dialog explains recovery and remains until acknowledged, even
when cleanup ended the window's last session. No terminal state is recreated.

### Configuration and Surface lifetime

The Surface applies the selected Terminal Theme, configured font family,
size, independent line height, programming-ligature setting, per-side padding,
Window Font Zoom and scrollback. Theme, size, programming ligatures, padding and
scrollback reload live without replacing the Surface, core, fonts or PTY. A Restty Surface keeps the font family and line height it was created with;
restart OMXTerm to apply either changed setting to every existing Restty
Surface. Programming ligatures default to enabled and use Restty's existing
boolean configuration and `setLigatures` operation. New Surfaces use every
latest validated value. Native glyph rasterization can differ across operating systems and GPUs; pixel-identical output is not claimed.

Positive `scrollback.lines` values are approximate physical history-row targets
because Ghostty evicts whole historical pages. Retention can exceed the target
by one minimum boundary page, while the independent 10,000,000-byte core ceiling
can retain fewer rows. OMXTerm does not estimate bytes per line. Zero selects
Ghostty's no-history path: it drops existing history, retains none through
continued output or resize, and a later positive value retains only new output.
Live changes preserve reflow, alternate-screen state, selection and viewport
coherence in the same Surface and remain isolated per Surface. The native scroll
host disables browser scroll anchoring: Restty owns the terminal viewport, so a
notice/layout or font-size change must not turn Chromium's anchor adjustment
into terminal scroll input. Native rendering coverage verifies that shrinking
and restoring the host with a font-size change preserves the live bottom while
ordinary output still leaves a deliberately scrolled viewport alone.

### Input and host-owned policy

Explicit copy/paste, selection, native context actions, Protected Paste,
snippets, file-path injection and write-only OSC 52 use the existing OMXTerm
host routes. DOM paste enters the same asynchronous confirmation and ordered
delivery path without browser clipboard permission; ordinary key input remains
direct. OSC 52 reads, clears, malformed, cancelled and over-bound requests have
no clipboard or PTY side effect. Holding the platform activation modifier
underlines the existing exact visible-destination resolver span under the
pointer without activation or host I/O. Modified primary click activates
literal lowercase visible HTTP(S) text through the existing host route,
including during TUI mouse reporting without a duplicate PTY report. Restty
joins rows only when
Ghostty selection text proves a visible soft wrap; hard breaks remain separate,
OSC 8 destinations are ignored, and a destination that may continue into a
concealed row is refused. Parsed OSC 0/2 titles and BEL use the existing
per-session title and silent-bell host controller, including raw title bounds,
sanitization and fallback, tab/window ownership, focus/interaction reset and
platform attention. The Surface sends no title reports; cancelled/malformed
controls and OSC BEL terminators have no extra title or bell effect.

### Graphics and resource limits

The Surface renders the bounded direct Pi PNG and anonymous metadata-first
Chafa RGBA Kitty paths. Parsing, decode, placement, deletion and reset remain in
the pinned Ghostty core. Decoded transport input is
limited to 33,554,432 bytes, source dimensions to 4,194,304 pixels, and completed
decoded image storage to 64,000,000 bytes per screen. Ghostty retains at most one
unfinished image per screen and uses its native completed-image eviction policy.
The JavaScript/WebGL rendering copies and transient decoder allocations are not
included in that storage total, and tabs multiply memory. Images remain
cell-anchored through resize, Window Font Zoom, tab selection and live theme
reload; `CSI 16 t` reports the current cell size. Pi's default 2,000-by-2,000
autoresized output is the compatibility target. Unsupported protocol paths remain unclaimed.

### Output flow control

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
keybinds still route through Electron main exactly once. Restty keeps programming-ligature changes independent from underlying text,
selection, copy, cells, cursor positions, wide/combining/emoji graphemes and
fallback or bold face selection. It keeps mouse buttons and wheel input coherent in
normal and alternate screens; Shift selection and valid modified-link activation
override application mouse reporting without duplicate PTY input. DA1, DA2,
cursor-position and cell-size queries have one deterministic parsed-runtime
reply path, including controls split across output messages.

Queue bytes, JavaScript heap and RSS are separate metrics from Ghostty core,
browser/WebGL and GPU allocations; no whole-application memory bound is claimed.
There is no fallback renderer.

### Hidden Surface rendering

Tab hiding suppresses frame clears, draws and render uploads, not synchronous
output ingestion or Adapter ACKs. The runtime consults its Surface-owned
visibility callback before frame work; RAF scheduling remains unchanged. Hidden
font changes retain the last real grid until visible refitting. Selection's
existing focus operation refits and refreshes in the same task, before Chromium
can present the revealed canvas, without waiting for the background render budget.
A mount completing while hidden uses the same visibility rule.

Hidden frames and hidden output discard disposable renderer image copies and
pending decodes. The core retains valid images, placements and scrollback;
deletions, reset and alternate-screen exit still execute during ingestion.
Reveal reconstructs only the needed renderer copies. This deliberately favors
simple lifetime correctness over retaining hidden image textures and does not
promise reduced total RAM or GPU capacity. No Surface/core/session is replaced.
See [native regression and measurement evidence](hidden-rendering-evidence.md)
for the exact workload, baseline, CPU domains and limitations.

### WebGL depth attachment

The checksum-guarded runtime requests `depth:false` alongside
`antialias:false, alpha:true`. Alpha is now required for background composition
below; the original depth-only comparison used `alpha:false`. Restty's 2D path does not enable depth testing.
The [depth-only native comparison](webgl-depth-evidence.md) confirms removal of
the default depth attachment with preserved text, cursor, selection, images and
hidden reveal behavior. It does not establish OS-level RAM savings. This changes
no Surface ownership, context sharing, DPR, image limits or hidden-rendering rule.

### Background composition

The real WebGL2 context is alpha-enabled and clears to transparent. The window
host paints the default theme tint once on body; Surfaces use `background:
"host"` so neither their padding nor their canvas repeats it. A standalone
Surface retains its own opaque theme background unless its host takes ownership.
Transparency reload updates the host tint, not a Surface/core/PTY instance.
Windows keeps nontransparent native construction for working native controls:
Acrylic allows tint transparency, while plain-alpha, unavailable API and failed
material requests use effective renderer transparency zero and the opaque theme.
The existing per-window configuration snapshot carries that effective value;
the complete requested configuration remains unchanged.
Chrome overlays do not repeat the theme background, and foreground content is
not globally faded. [ADR 0029](adr/0029-compose-background-effects-with-explicit-cell-identity.md)
records native effects and ownership.

In pinned Ghostty `src/terminal/style.zig`, `Style.bg` returns an optional color:
`null` for implicit default, a color for explicit palette/RGB or background-only
erased cells. The Restty bridge in `wasm/src/restty.zig` formerly discarded that
identity. The tracked patch now exports it through the existing cell-background
RGBA alpha (0 implicit, 255 explicit or screen-reversed), while retaining RGB for inverse text.
Runtime inverse swaps restore opaque foreground alpha, and text contrast
correction uses that RGB without painting implicit cells. Explicit equal-RGB
backgrounds therefore stay opaque; SGR 49 returns to the implicit default.
Theme changes, background-color erase and alternate screens preserve that rule.
DECSCNM reverse-screen mode swaps core default colors without setting per-cell
inverse; its reversed background remains opaque until the mode is disabled or
reset. The bridge reads that core mode directly, not an RGB comparison.
No RGB equality heuristic, second parser or new privileged route is involved.

Focused native checks on each ARM64 desktop:

```sh
npx vitest run test/integration/restty-background-core.test.ts test/integration/restty-background-rendering.test.ts test/integration/window-chrome.test.ts
```

The core test covers identity, erased cells, reset, alternate screens and changed
default RGB. The rendering fixture mounts the real host and Surface under the
production CSP, reads the actual WebGL buffer, and checks implicit alpha,
explicit equal/different RGB, inverse ink, ANSI glyphs, cursor, selection, Kitty
images, live changes and tab continuity. `capturePage` verifies page tint alpha
255/about 128/0 on macOS/Linux (one-byte native rounding tolerance), with opaque
Windows plain-alpha fallback and exact fallback theme RGB, including that sidebar
overlays do not paint the theme a second time.
The Window Chrome fixture uses actual main/preload/PTY routes and verifies live
and future-window effects alongside native controls and existing session
continuity. Linux fixtures explicitly use X11 and the existing no-sandbox policy.

These tests request native effects but do not prove visible behind-window blur.
For compositor verification on each target desktop:

1. Place the candidate's real host/Surface window above a separately owned window
   showing synthetic stripes and a checkerboard. Use only synthetic terminal data.
2. Keep the theme fixed and compare opaque, positive transparency without blur,
   the same transparency with blur, then blur removed. Capture the actual desktop
   compositor and retain only the owned scene, not unrelated windows or payloads.
3. Check reversible pattern softening on macOS/Windows/KDE where supported.
   Windows must return to the opaque theme without blur, including after a theme
   reload. GNOME may retain sharp plain transparency throughout. A successful
   material call or `capturePage` alone proves neither visible blur nor its removal.
4. Exercise native maximize/restore, resize and fullscreen; inspect actual native
   state and custom controls while checking unchanged Surface/session identity.
   In particular, larger Windows bounds alone do not establish maximized state.

Report native desktop results separately from renderer tests, with the source
revision, OS/compositor and limitations. One platform's GPU results or a standalone
material probe do not qualify another platform's integrated Surface.
No screen capture, diagnostic bridge or synthetic fixture ships in production.

### Font memory ownership

Each renderer Terminal Window owns one active validated font-family generation.
The configured family includes its real regular and available bold/italic/
bold-italic faces. Exact validated face indices select collection members while
sharing the collection's bytes and Restty parsed resource. Missing styles use
synthesis without introducing an unrequested trait. Native style file reads
share a per-load source map; there is no persistent main cache.

The first Surface lease in a generation loads native configured and fallback
bytes through the existing preload/main route, snapshots each external
`Uint8Array` once into an exact-range owned `ArrayBuffer`, and publishes the
complete ordered stack only after isolation. Concurrent and later compatible
live Surfaces borrow the same backing identities. Restty's existing
identity-keyed source and parsed resource store can therefore share one native
source and parsed key per face in that window rather than creating both per
Surface. Bundled inputs remain stable shared views.

A rejected load publishes nothing and a later acquisition retries. One pending
lease may be cancelled without invalidating another. A validated configured-
family change selects a new generation for newly created Surfaces; old live
Surfaces keep their creation-time generation. Pending old results cannot publish
into the new generation, and disposal makes late results inert. Closing one tab
releases only its lease. Final generation release drops the renderer owner's
font references, and Terminal Window disposal releases every remaining lease and
the owner; Restty's separately bounded released-resource cache semantics remain
unchanged. Owners are never shared across Terminal Windows, and there is no
persistent byte cache, content hashing, lazy coverage or global store.

`ArrayBuffer` is mutable, so ownership alone is not the read-only guarantee. In
the pinned Restty runtime, buffer sources pass through `toSourceBuffer` without a
write and `parseFontFacesFromBuffer` passes that same buffer to text-shaper.
The text-shaper implementation embedded in that exact Restty chunk parses
TTF/OTF and TTC faces through a `DataView` reader. Its `bytes()` method also
returns mutable zero-copy views: getter-only scalar parsing is not sufficient
proof. Inspection follows those views into glyph hint instructions, CFF
charstrings, bitmap tables and SVG decoding. These consumers read source bytes;
mutation is confined to separate parser caches, hint state, shaped glyphs and
raster buffers. Restty's color-emoji rendering uses Canvas text rasterization,
not in-place decoding of the borrowed native bitmap table.

The installed-store test compares a bundled TTF before and after parsing,
glyph lookup and release. The native host fixture additionally snapshots every
borrowed native source before parsing and compares every byte after its real
configured/native glyph rendering, concurrent tabs, configuration changes and
tab cleanup. Test-only counters establish execution of embedded TTC collection
parsing, zero-copy reader views, shaping, outline rasterization and, on macOS,
color-canvas rasterization. The probe retains extra byte copies until comparison
and therefore is deliberately excluded from memory measurements. It exports only
numeric results and never ships. Dependency checksums make drift fail preparation
instead of silently extending this borrowing assumption.

The native host fixture starts with one ready Surface, creates four tabs
concurrently, verifies that the live window generation causes zero additional
renderer font requests or native load batches, then checks real Surface
readiness and cleanup without a false error. Sharing reduces retained native
source identities and duplicate parsing; it does not
remove transient IPC/snapshot costs, Restty's bounded released cache, native
shaping allocations, browser/WebGL resources or GPU memory. Native fonts still contribute to the first generation in each window. Apple
Color Emoji collections now omit `sbix` from the shaping input: main reads the
directories and retained table ranges without reading the bitmap payload. It
preserves all faces and shared tables, then uses the existing exact-family and
pinned-parser validation. Canvas rasterizes against the unchanged installed
font. Other families, including CJK, still use whole-file inputs. Validation,
IPC, preload and renderer snapshots still have transient costs. See the
[reproducible comparison and limitations](emoji-shaping-experiment.md).

The pinned font-resource correction reserves each source before asynchronous
load/parse, so budget eviction cannot leave parsed faces without their source
entry. Successful leases preserve live fonts even above the cache budget;
release and failed acquisition release reservations and prune source/parsed
resources together. Concurrent acquisitions share loads without releasing each
other's ownership. Runtime destruction or replacement invalidates pending font
loads and releases late leases instead of resurrecting disposed resources. The
source-cache budget is not a total memory limit or a limit on live fonts.

`test/integration/restty-font-resources.test.ts` exercises the installed resource
store with a small bundled font and controlled cache pressure, including
concurrent acquisition and required-font failure. A bounded child process with
explicit GC proves released parsed resources are collectible while a live font
remains usable. A runtime test covers destruction during loading. No heap dump,
font contents or runtime diagnostic API is needed.

## Pinned inputs and restoration

Use `npm ci` for normal restoration. It installs the locked packages and runs
the checksum-guarded preparation scripts automatically. If preparation rejects
an input, compare the installed package, lockfile, and tracked source manifest
before changing any digest. A dependency upgrade is review work: establish the
new source and license identity, reapply the required behavior deliberately,
refresh regression fixtures, and run the native package checks. Treat a rejected
input as dependency drift until that review establishes otherwise.

- Restty npm package `0.3.0`, source commit
  `3db45b0e10dbe53c52a77131d366f519546e4f04`;
- Ghostty submodule commit
  `0309af1b7f0724105a0805efa88bbee808a616ae`;
- `text-shaper` `0.1.28`, source commit
  `a23058f475f2b0655b93a89bfce426eecafb9439` (Restty's source submodule at
  `94db4fba9186b99b868b401ce404a9930b93fcbf` is upstream prior art, not the
  installed npm artifact identity);
- Nerd Fonts `v3.5.1` FiraCode distribution, with bundled regular SHA-256
  `53eebbaaa09c483ebb27fdd5cf21073cc4b760308e5d666728e9db2f41616c00`
  and bold SHA-256
  `7435c06ecc46dc975d2c356bf9bf1d8bc2226fdb1a877e6e9580193aae429519`;
- DejaVu Fonts `2.37`, with bundled DejaVu Sans Mono regular SHA-256
  `b4a6c3e4faab8773f4ff761d56451646409f29abedd68f05d38c2df667d3c582`
  and bold SHA-256
  `bce60f1b4421acd9ea51ba6623d7024ecbe6817a953e3654df62a5e6bdf8f769`;
- retained Nerd Fonts `v3.4.0` `JetBrainsMono.zip`, archive SHA-256
  `76f05ff3ace48a464a6ca57977998784ff7bdbb65a6d915d7e401cd3927c493c`,
  and bundled regular-face SHA-256
  `f01031f40e48dc29e1112e6b0b0450a2c6cd097f3f35cfff05c55cb311f8034c`.

The retained lowercase visible-link expression derives from
`@xterm/addon-web-links` 0.12.0 at xterm.js commit
`f447274f430fd22513f6adbf9862d19524471c04`; its primary
`addons/addon-web-links/src/WebLinkProvider.ts` SHA-256 is
`5cf83214d2bd19dd06a2492eefe7686d1bd66cbe61fea490513335f630bb8b8a`,
and the packaged source-repository MIT notice SHA-256 is
`b569f629d00f2626a8100df2a1798210535621e42164dfd426a6fe5aac7b0ccd`.
The exact `text-shaper` 0.1.28 source/npm license SHA-256 is
`bc88ce083d2187e9577451f5d38a36227c05e3069f9320320c3d2282249a8f87`;
it includes the FreeType-derived rasterizer copyright. The bundled Nerd Fonts
release archives, extracted faces and glyph-license sources are recorded in
`assets/fonts/README.md`. Packaging preserves all three notice groups and the
package verifier compares their bytes with the tracked sources.

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
then runs `scripts/prepare-restty-runtime.mjs`. The preparation script recognizes
only reviewed input hashes, applies the complete correction, verifies the final
bytes, and is safe to run again. Historical accepted inputs are regression-tested
through `test/fixtures/restty-runtime-history.json`; unknown or modified bytes
fail without being rewritten.

OMXTerm describes the corrected dependency through the private types in
`src/terminal-surface/restty-runtime-contract.ts`. Keep dependency-only methods
there rather than widening the public Terminal Surface interface or asserting
the full upstream internal runtime. This private contract is the single typed
boundary used by the host integration; it is not a public API or renderer
registry.

After preparation, the corrected runtime has SHA-256
`19ce5c33221a7c77bea9eb83c49d9afb3ccda2a70636598492654db18226d0f2`,
embedded-core chunk SHA-256
`baa7dd9600c034a77e73ed03864c3e15e02ccdc591d2044479652fef1d9c0900`,
and event declarations SHA-256
`428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34`.
The narrow correction preserves font acquisition/lease cleanup under cache
pressure and late completion, makes font-load failure reject initialization, disables
Restty's direct browser clipboard and link-opening callbacks, preserves native
Option Unicode/composition versus configured physical-side Alt input, defers
bare DOM dead keys to native text (including composition) even when extended
keyboard reporting is active, delivers ordinary non-composing Space through the
existing key encoder unless it completes a pending native dead key, leaves all renderer-received
Ctrl+C/Ctrl+V events as PTY input, gives DA2 its own
deterministic response, bounds unfinished OSC/CSI control bodies with
whole-control recovery, and exposes raw paste
origin, current bracketed mode, selection/Select All, parsed OSC and OSC
cancellation, visible cell/soft-wrap lookup and transient visible-cell underline
decoration, and parsed Ghostty title/BEL runtime
events to OMXTerm's existing host policy. Borrowed render cells are snapshotted
before selection-text queries can allocate WASM memory. Pending desktop drags
can also start through compatibility mouse movement when a virtual input stack
changes pointer identity; touch-generated moves and moves without a primary
press remain excluded. It also removes Restty's 10–64
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
`55696bf85e65a4602348679b0ee78d1724c805e0422eeebc925822865538d0ac`.
The background-identity correction changes only the existing cell background
alpha export; it keeps the original Restty and Ghostty commits pinned.
The Restty patch also enables Ghostty's standard grapheme-cluster mode as a
reset default so emoji-presentation and ZWJ clusters retain one two-column cell.
It supplies Ghostty's existing size-report effect and stream-handler resize
operation so negotiated mode 2048 reports current geometry on enable and resize.
Restty forwards those replies immediately after PTY resize, without waiting for
application output. Pixel geometry covers complete terminal cells, excluding
unused canvas remainder; zoom and configuration reload preserve the same client
and terminal state.
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

The TTFs are tracked because Restty/text-shaper consumes font bytes and the
prior WOFF2 path did not provide equivalent shaping. `assets/fonts/README.md`
records font provenance and checksums. Runtime loading is memory-only and works
under the production `connect-src 'none'` CSP without local fonts, user dotfiles
or remote fetches. Packaged license texts are listed in
`THIRD_PARTY_NOTICES.md`. The real regular/bold Electron fixture exercises
Restty's style-aware face picker plus representative Fira-only and DejaVu-only
glyphs. A differential configured-family case compares regular and synthetic-bold
pixels against the regular-only reference stack through the same Surface and
Restty renderer. Bundled bold faces are omitted for configured families so a
style match cannot silently override the chosen family. The native
`restty-font-styles-rendering.test.ts` additionally compares regular-only,
complete and incomplete configured-style inputs through main discovery, a
sandboxed preload transport, the production font-generation owner and the real
Surface. It checks unchanged regular pixels and geometry, distinct real-style
pixels, missing-style synthesis, and one shared source/parsed set with one,
three and one live Surface. Final disposal releases every lease; bounded Restty
cache retention is not a leak claim. Test-only picker/store instrumentation and
diagnostic forced GC do not ship. Optional `OMXTERM_FONT_STYLES_EVIDENCE_PATH`
retains aggregate measurements; process memory, backing storage and source
bytes remain distinct domains. Pixel-identical native rasterization remains
unclaimed.

`test/integration/restty-host-integration.test.ts` runs the real main IPC
router, preload bridge, Electron Adapter, Restty Surface and owned native PTYs
under the production CSP. It covers Unicode and bare-control-key
input, large chunked DOM paste through a real owned PTY, explicit host
copy/paste, Select All, context menu and OSC 52, parsed title/BEL ownership,
title-query silence, disposal, resize, renderer-event focus restoration, two isolated tabs, Default
Shell and explicit-command startup, owned session
termination, explicit close, renderer-process loss, a numbered 2 MiB producer
through production IPC during a 350 ms renderer stall and resize, cumulative
flow control, clean producer exit, direct Pi and Chafa Terminal Payload through
the PTY, rendered image content and placement, live image geometry, and
privileged-route refusal without using a user session or real
clipboard. Its result contains only synthetic outcome and queue/heap/RSS
metadata, not captured Terminal Payload. The stress fixture waits for native
producer readiness and holds only its synthetic session's output ACKs until the
real high-water pause is observed, then releases them and asserts native resume,
complete ordered content and zero pending bytes. This avoids depending on
platform throughput during the fixed renderer-stall interval.

Native Electron fixtures run serially and show painting windows without native
activation. The focus-restoration fixture first moves DOM focus outside the
selected Surface, then dispatches a renderer focus event and verifies return to
that Surface. This does not verify native application/window activation. The
keyboard regression similarly uses synthetic DOM dead-key/composition events
through installed Restty and captures Surface Adapter writes under legacy,
modifyOtherKeys and Kitty flags 1, 2, 4 and 1|2|4; it does not establish an
untested native keyboard layout's event sequence.

The Space regression replays a captured macOS failure: five separate Space
press/release pairs reached the DOM, but only the first generated `beforeinput`.
The original runtime delivered one space; the corrected runtime delivers all
five through the existing key encoder. The test respects browser cancellation
and covers normal text events without duplicates, held repeat, composition,
modifiers, other editable controls, keyboard reporting and reset transitions.
Synthetic reset tests did not reproduce the native event loss itself: reported
`modifyOtherKeys` and `pipes.sh`/RIS triggers remain unisolated. The correction
removes the dependency on that missing text event, not a claimed repair of an
identified macOS substitution mechanism. It changes no user preference or
protocol negotiation and adds no timer or text-replacement filtering.

The dead-key Space regression additionally replays Fedora 44 KDE/XWayland's
native sequence: `Dead` down/up, Space down with `isComposing=false`, and
`beforeinput` carrying the layout's committed text, with no composition events.
An isolated Electron 43.1.1 Surface and a plain textarea, driven by a temporary
native keyboard, established the difference: before correction the Surface sent
ASCII space instead of apostrophe, double quote, grave or tilde; afterwards each
matched the textarea exactly once. Dead acute + e and ordinary text also passed.
The controller now retains native dead-key completion through Space release,
without changing ordinary direct-Space reporting. Mounted regressions cover
legacy, modifyOtherKeys, Kitty 1|2|4 and report-all, repeat, modifiers,
cancellation, text completion and focus loss. Hidden macOS fixture windows
explicitly dispatch textarea blur because changing DOM focus there does not
produce a native focus event. The owner reported Ubuntu unaffected; attempted
native automation there did not establish equivalent dead-key event delivery,
so it is not claimed as a second native layout verification.

The complete native package commands run this host/runtime coverage on macOS,
Linux and Windows ARM64. Native glyph rasterization and platform security UI
remain automation-resistant risks rather than pixel-identical claims.
