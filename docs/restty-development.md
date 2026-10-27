# Restty Terminal Surface

OMXTerm uses pinned Restty 0.3.0 and its Ghostty WASM core in development and packaged builds. There is no renderer selector or fallback Surface.

For product behavior, see [`spec.md`](spec.md); for architectural rationale, see [ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md). Use [native development](development.md) for platform setup and test suites.

## Runtime architecture

The portable Terminal Surface (`src/terminal-surface/`) receives a session Adapter and imports neither Electron nor `node-pty`. Electron `main` owns local PTYs and privileged capabilities; `preload` exposes typed, sender-validated IPC routes.

- **Initialization:** Fonts, the Ghostty WASM core, and a WebGL2 context initialize before the PTY starts. If initialization fails, no shell is spawned. WebGL context loss reports a visible error and disposes the affected pane/session without affecting siblings.
- **Pane cancellation:** Closing an initializing pane (directly or through its tab) marks late callbacks inert, waits for pending acquisitions to settle, and releases partial resources. An already accepted session start is closed once through the Adapter.
- **Commands during first mount:** The window host registers tab commands and related actions during synchronous setup, not after Surface readiness. Close Tab cancels the pending first tab normally. Zoom/tab-bar state and Snippets are available immediately; terminal clipboard, Find and other actions requiring an unavailable Surface do nothing without delayed replay. Modal guards and teardown still apply; host `ready` remains mount settlement.

### Configuration and Surface lifetime

- **Live-safe settings:** Theme colors, font size, programming ligatures, padding, scrollback lines, and macOS Option Key Mode apply in place to existing panes and sessions; the latest labels also replay after a pending pane mount.
- **Creation-time settings:** `font.family` and `font.lineHeight` are fixed when a Surface is created. New panes use the latest validated values; existing panes keep their creation-time values until OMXTerm restarts.
- **Native font acquisition across reload:** A started read completes for its surviving creation-time consumers across family changes. Controller disposal still invalidates completion. Admission requires the current family, and obsolete queued generations are rejected before starting; there is no historical-family lookup.

### Current runtime limitations

- **Reload application errors:** `user-configuration-reloader.ts` updates the active configuration snapshot before applying consumers sequentially. While validation errors cleanly retain the previous configuration, an unexpected runtime exception during consumer application has no automatic rollback.

### Scrollback and viewport

- `scrollback.lines` (0 to 100,000, default 10,000) sets an approximate history-row target per pane. Ghostty evicts whole pages and enforces a 10,000,000-byte core ceiling. Setting `0` clears and disables history immediately.
- Accepted user input (typing, paste, snippets, or dropped paths) returns the viewport to the live bottom; background output, focus, and selection do not jump the scroll position.
- Desktops with a fine pointer use native scrolling even if touch hardware is present.

### Pending-wrap resize coverage

The bundled-core reflow tests preserve exact pending-wrap insertion/copy across
width changes, history, hard breaks and alternate/wrap-disabled modes. The
existing appearance fixture separately checks primary-screen output of exactly
one current row, one owned DOM width reduction, short continuation and exact
Select All/Copy while retaining the same Surface/canvas and one Adapter start.
Its current narrower grid must be valid and have a different edge; it does not
replay a calibrated target or normalize copied text.

Run the real-Surface check on an idle unlocked desktop, one graphical suite at a
time:

```sh
npm test -- test/integration/restty-appearance-rendering.test.ts -t "renders theme colors and preserves configured geometry through live updates"
```

This controlled Adapter check is not native PTY or OS clipboard qualification.
The separate native output oracle keeps its sixteen copies, transport ACK,
pause/resume, resize and real-exit requirements. Retiring the oversized combined
native prefix/refit/continuation scenario does not explain its Windows timeout;
the combined native progress risk remains explicitly unresolved. See
[the coverage boundaries](development.md#resize-and-continued-text-coverage).

### Input, links, and titles

- Copy/paste, Protected Paste, snippets, file-path insertion, local image previews, and write-only OSC 52 use OMXTerm host routes. Restty's built-in browser clipboard and URL-opening callbacks are disabled.
- Visible HTTP(S) URLs and local image paths are recognized from cell snapshots and Ghostty selection proofs across soft wraps (OSC 8 hyperlinks are ignored). Link-only proof endpoints exclude a terminal wide-wrap spacer so selection expansion does not borrow the next grapheme; copy/selection semantics stay unchanged. Unknown viewport-edge continuity remains refused.
- Parsed OSC 0/2 titles and silent BEL events flow from the Ghostty core to OMXTerm's per-session host controllers.

### Inline Kitty images

The pinned Ghostty core handles Kitty graphics parsing, decoding, placement, and eviction for direct Pi (`f=100` PNG) and Chafa (`-f kitty`, `f=32` RGBA) sessions:

- Max decoded transmission input: 33,554,432 bytes.
- Max image dimensions: 4,194,304 source pixels (Chafa RGBA max: 16,777,216 bytes).
- Max completed image storage: 64,000,000 bytes per screen (at most one unfinished image per screen).
- Images stay cell-anchored across resize, font zoom, tab switching, and theme reload, and `CSI 16 t` reports current device-pixel cell metrics.

### Terminal capability replies

Ghostty answers `CSI 6 n` from its parser cursor at the query position, including
Unicode, pending-wrap resize and origin-mode margins. At the existing completed
CSI seam, the prepared `OutputFilter` synchronously submits the filtered prefix
including CPR through the ordinary runtime controller, which drains core replies
before filtering later DA1/DA2/`CSI 16 t` queries. No render frame or JavaScript
cursor hint answers CPR. DA1 remains `CSI ? 1 ; 2 c`, DA2 `CSI > 0 ; 0 ; 0 c`,
and cell-size reports retain their metrics provider.

The private `filterOutput(output, onCoreOutput?)` consumer is synchronous. Each
committed prefix is excluded from the returned suffix; one-argument consumers
receive CPR as ordinary core-bound output, not a fabricated reply. This changes
neither the public Surface interface nor Adapter ACK/lifetime ownership, and
requires no WASM rebuild.

Headless regressions execute production PTY ingestion and runtime-controller
functions with the real pinned core, controlled transport/geometry and no frame
loop. They include every two-chunk boundary of mixed queries, original Unicode
and resize failures, cancellation/budget checks, and deliberate old-interception
and pass-through-only negative controls:

```sh
npx vitest run test/integration/restty-cpr-core.test.ts test/unit/restty-terminal-capabilities.test.ts test/integration/restty-runtime-history.test.ts
```

These are not DOM Surface, native PTY or graphical qualification.

### Output flow control

- `main` pauses an owned PTY at 65,536 unacknowledged UTF-8 bytes and resumes at or below 16,384 bytes.
- Cumulative ACKs confirm synchronous submission to the Surface.
- Restty's `OutputFilter` caps any single unfinished OSC or CSI control body at 10,000,000 UTF-16 code units, discarding over-budget controls whole without partial side effects.

### Hidden Surface rendering

Panes in hidden tabs continue synchronous output ingestion, protocol replies, and Adapter ACKs while suppressing WebGL frame clears, draws, and texture uploads. Disposable renderer image copies are released while hidden and rebuilt from core storage when the tab is selected again.

### Background composition

The WebGL2 context uses `alpha: true, depth: false, antialias: false`. The host paints the theme background tint once behind the Surface:

- Implicit default cell backgrounds (`SGR 49`) use alpha `0` to reveal the host tint and any active platform blur.
- Explicit cell backgrounds (including explicit RGB matching the theme background and inverse video) use alpha `255` and remain opaque.

Focused background checks:

```sh
npx vitest run test/integration/restty-background-core.test.ts test/integration/restty-background-rendering.test.ts test/integration/window-chrome.test.ts
```

### Configured ANSI palette resets

The core palette setter installs the supplied prefix as allocator-owned reset
defaults, starting from the previous baseline rather than current OSC 4 overrides.
It replaces overrides only in that prefix, preserving existing live-theme policy
and unsupplied extended overrides. Ghostty continues to own OSC 104 parsing and
indexed/full reset selection; there is no Surface escape interception. RIS and
DECSTR preserve palette state. Allocation failure returns the existing internal
ABI error without changing palette state.

Headless behavior and preparation guards:

```sh
npx vitest run test/integration/restty-palette-core.test.ts test/unit/restty-dependency-contract.test.ts
```

The narrow actual-Surface pixel regression requires a separately scheduled idle
desktop (do not mistake the headless core test for graphical qualification):

```sh
npx vitest run test/integration/restty-appearance-rendering.test.ts -t "preserves the configured palette"
```

### Font memory ownership

Each renderer window manages validated font-family generations. Compatible tabs share native font byte snapshots and parsed Restty font resources:

- When a custom `font.family` is configured, bundled bold fallback faces are omitted so Restty uses the configured family's real styles or synthesizes missing traits from it.
- On macOS, `Apple Color Emoji.ttc` shaping input strips the unused `sbix` bitmap table via bounded positional reads in `main`, while native Canvas continues using the system font for glyph rendering.

Focused font checks:

```sh
npx vitest run test/integration/restty-font-resources.test.ts test/integration/restty-font-styles-rendering.test.ts test/integration/apple-emoji-shaping-input.test.ts
npx vitest run test/integration/restty-host-integration.test.ts
```

### Optional rendering and memory diagnostics

These opt-in diagnostic runs inspect specific rendering and memory boundaries in isolated fixtures:

| Diagnostic                   | Command                                                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple emoji `sbix` stripping | `node scripts/emoji-experiment/run.mjs .scratch/emoji-comparison && node scripts/emoji-experiment/summarize.mjs .scratch/emoji-comparison/results.json`                                                         |
| Hidden Surface rendering     | `OMXTERM_HIDDEN_EVIDENCE="$PWD/.scratch/hidden-rendering.json" npx vitest run test/integration/restty-scrollback-rendering.test.ts`                                                                             |
| WebGL depth attachment       | `OMXTERM_DEPTH_VARIANT=disabled OMXTERM_DEPTH_EVIDENCE="$PWD/.scratch/depth-disabled.json" npx vitest run test/integration/restty-scrollback-rendering.test.ts` (compare with `OMXTERM_DEPTH_VARIANT=original`) |

## Pinned inputs and WASM core rebuild

`npm ci` (and `npm run postinstall`) runs checksum-guarded `node-pty` preparation
(see the [native runtime contract](development.md#pinned-pty-runtime)) and Restty
runtime preparation against `assets/restty-sources.json`:

- **`node-pty` `1.2.0-beta.18`:** exact official npm archive/integrity in `package-lock.json`; JavaScript/native source guards in `scripts/prepare-node-pty-{runtime,exec-status}.mjs`
- **Restty `0.3.0`:** `3db45b0e10dbe53c52a77131d366f519546e4f04`
- **Ghostty:** `0309af1b7f0724105a0805efa88bbee808a616ae`
- **`text-shaper` `0.1.28`:** `a23058f475f2b0655b93a89bfce426eecafb9439`
- **Tracked WASM & patches:** `assets/restty/omxterm-restty-core.wasm`, `assets/restty/omxterm-core.patch`, and `assets/restty/ghostty-title-events.patch`

Prepared SHA-256 digests:

| Input                     | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Restty JavaScript runtime | `f15c6c25cb2efb879b5a00b09640fcdb2d364c8d566237ff5d0ae63975bb3e44` |
| Embedded-core chunk       | `03d79d4c745e3c74dd90082a100cbf85e5060e23ff9d16fba338b11d2db1e6be` |
| Event declarations        | `428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34` |
| Tracked WASM core         | `a52f314c2e91e87394e67307d6b0067c8ba28f6b1e31e7587872b9c41ce88c41` |
| Unix `node-pty` runtime   | `a8ee8107e9d1a26c133e6d450149d2712facce0e97db12b57500e869bbab6578` |
| Windows argv agent        | `6042a70008684243efbc865d2615c22a16a910c7a65475bc1a33e49447bcd815` |
| Windows terminal          | `4ceeb76ee0c99ec013678828a3fdf309a612c4613190e5ce16840f5096f7e162` |
| Shared exit forwarding    | `61698286a777b0c76826e138a9d07424e10db77a28b91ca62a9f96f06f76ff3c` |

### Rebuilding the WASM core

Requires a disposable checkout of Restty at the pinned commit, Zig `0.16.0`, and Bun:

```sh
git clone https://github.com/wiedymi/restty.git
cd restty
git checkout 3db45b0e10dbe53c52a77131d366f519546e4f04
git submodule update --init --recursive
git apply --unidiff-zero /path/to/omxterm/assets/restty/omxterm-core.patch
git -C reference/ghostty apply --unidiff-zero /path/to/omxterm/assets/restty/ghostty-title-events.patch
RESTTY_WASM_OPTIMIZE=ReleaseSafe bun run scripts/build-wasm.ts
shasum -a 256 wasm/zig-out/bin/restty.wasm
```

Verify core behavior after rebuilding:

```sh
npx vitest run test/integration/restty-palette-core.test.ts test/integration/restty-background-core.test.ts test/integration/restty-reflow-core.test.ts test/integration/restty-resize-core.test.ts test/integration/restty-scrollback-core.test.ts test/integration/restty-images-core.test.ts test/integration/restty-events-core.test.ts
```
