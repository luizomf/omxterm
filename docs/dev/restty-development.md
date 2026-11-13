# Restty Terminal Surface

OMXTerm uses pinned Restty 0.3.0 and its Ghostty WASM core in development and packaged builds. There is no renderer selector or fallback Surface.

For product behavior, see [`spec.md`](../spec.md); for architectural rationale, see [ADR 0025](../adr/0025-use-restty-as-the-terminal-surface.md). Use [native development](../development.md) for platform setup and test suites.

## Runtime architecture

The portable Terminal Surface (`src/terminal-surface/`) receives a session Adapter and imports neither Electron nor `node-pty`. Electron `main` owns local PTYs and privileged capabilities; `preload` exposes typed, sender-validated IPC routes.

- **Initialization:** Fonts, the Ghostty WASM core, and a WebGL2 context initialize before the PTY starts. If initialization fails, no shell is spawned. WebGL context loss reports a visible error and disposes the affected pane/session without affecting siblings.
- **Pane cancellation:** Closing an initializing pane (directly or through its tab) marks late callbacks inert, waits for pending acquisitions to settle, and releases partial resources. An already accepted session start is closed once through the Adapter.
- **Commands during first mount:** The window host registers tab commands and related actions during synchronous setup, not after Surface readiness. Close Tab cancels the pending first tab normally. Zoom/tab-bar state and Snippets are available immediately; terminal clipboard, Find and other actions requiring an unavailable Surface do nothing without delayed replay. Modal guards and teardown still apply; host `ready` remains mount settlement.

### Configuration and Surface lifetime

- **Live-safe settings:** Theme colors, font size, programming ligatures, padding, terminal context-menu eligibility, scrollback lines, and macOS Option Key Mode apply in place to existing panes and sessions; the latest labels also replay after a pending pane mount.
- **Creation-time settings:** `font.family` and `font.lineHeight` are fixed when a Surface is created. New panes use the latest validated values; existing panes keep their creation-time values until OMXTerm restarts.
- **Native font acquisition across reload:** A started read completes for its surviving creation-time consumers across family changes. Controller disposal still invalidates completion. Admission requires the current family, and obsolete queued generations are rejected before starting; there is no historical-family lookup.

### Current runtime limitations

- **Reload application errors:** `user-configuration-reloader.ts` updates the active configuration snapshot before applying consumers sequentially. While validation errors cleanly retain the previous configuration, an unexpected runtime exception during consumer application has no automatic rollback.

### Scrollback and viewport

- `scrollback.lines` (0 to 100,000, default 10,000) sets an approximate history-row target per pane. Ghostty evicts whole pages and enforces a 10,000,000-byte core ceiling. Setting `0` clears and disables history immediately.
- Accepted user input (typing, paste, snippets, or dropped paths) returns the viewport to the live bottom; background output, focus, and selection do not jump the scroll position.
- Desktops with a fine pointer use native scrolling even if touch hardware is present.

### Read-only export snapshots

The prepared runtime reads retained scrollback and screen through the selection-text
query without changing selection, hover, cursor or render state. The alternate
screen reads only its active contents. The host owns explicit saving and its
inclusive 16 MiB UTF-8 limit; the core storage ceiling is not an export-size guarantee.

### Pending-wrap resize coverage

The bundled-core reflow tests preserve exact pending-wrap insertion/copy across
width changes, history, hard breaks and alternate/wrap-disabled modes. A separate
real-Surface check covers a short primary-screen resize continuation with a
controlled Adapter, not native PTY or OS clipboard qualification.

See [resize and continued-text coverage](../development.md#resize-and-continued-text-coverage)
for the test command, fixture invariants and evidence boundaries. The retired
combined native prefix/refit/continuation scenario's Windows timeouts remain
unexplained; separate checks do not qualify that combined ordering.

### Input, links, and titles

- Copy/paste, Protected Paste, snippets, file-path insertion, local image previews, and write-only OSC 52 use OMXTerm host routes. Restty's built-in browser clipboard and URL-opening callbacks are disabled.
- Visible HTTP(S) URLs and local image paths are recognized from cell snapshots and Ghostty selection proofs across soft wraps (OSC 8 hyperlinks are ignored). Link-only proof endpoints exclude a terminal wide-wrap spacer so selection expansion does not borrow the next grapheme; copy/selection semantics stay unchanged. Unknown viewport-edge continuity remains refused.
- Parsed OSC 0/2 titles and silent BEL events flow from the Ghostty core to OMXTerm's per-session host controllers.
- The output filter hands raw OSC 9 and OSC 777 payloads to the host's OSC route (`scripts/restty-attention-osc-corrections.mjs`); `src/terminal-surface/attention-osc.ts` tells OSC 9;4 progress from notifications ([ADR 0053](../adr/0053-mark-program-progress-and-attention.md)).

### Application-cursor keyboard coverage

The prepared encoder reads DECCKM from a narrow Ghostty WASM getter, not a
JavaScript mode mirror. Unmodified legacy arrows select CSI or SS3 from current
parser state; modified arrows, negotiated Kitty events and non-arrow keys retain
their existing encoding. Headless coverage executes actual PTY output ingestion,
core state providers, keyboard press/repeat/release binding and final PTY mapping,
including local and claimed routing. It covers split mode controls, save/restore,
hard reset and the pinned core's soft-reset behavior without waiting for a frame.

```sh
npx vitest run test/integration/restty-keyboard-core.test.ts test/unit/restty-input-routing.test.ts test/unit/restty-dependency-contract.test.ts
```

A bounded local-PTY diagnosis with htop 3.5.3 linked CSI arrows in application
mode to synthetic-target nice increases; SS3 Down navigated correctly. This is
not owner-desktop/native-event qualification. A separate macOS ARM64 source
fixture exercised Electron-injected native key events through the production
Surface and a controlled Adapter into a real PTY: all four arrows produced CSI,
SS3 and CSI across normal/application/reset phases, and htop 3.5.3 Up/Down changed
the selected synthetic process without changing its nice value. Explicit bracket
actions identified the selected process; only disposable targets were used.

A fresh btop 1.4.8 fixture stayed alive after all four arrows and exited normally
only after explicit `q`. This is bounded non-reproduction, not a fix for the
reported closure. These fixtures do not qualify physical keyboards, the complete
application shortcut/IPC composition, packaged artifacts or navigation through
tmux. Keep those checks separate from the demonstrated direct-input correction.

### Terminal context-menu policy checks

`terminal.contextMenuEnabled` defaults to true without changing existing
application-mouse/default-cancellation eligibility. The portable Surface cancels
the DOM default, notifies host pane focus and conditionally requests the popup;
false excludes content/padding for every modifier and event origin, not the
Scrollback Search query. Clipboard, OSC 52, Restty mouse routing and native
callback target guards remain independent.

Headless regressions use the production Surface with a controlled Restty
rendering adapter and the installed pinned `bindPointerEvents`,
`createPointerUpHandler`, `createPointerAuxHandlers` and real `createInputHandler`
encoder. They compare exact right-button SGR down/up bytes separately from menu
request counts, including an already-cancelled enabled control and mode-off/
Shift controls. Pane focus, hidden/live reload, pending-mount replay, query
clipboard and Settings persistence use existing test seams:

```sh
npm test -- test/unit/restty-terminal-surface-clipboard.test.ts test/unit/restty-terminal-surface-search.test.ts test/unit/renderer-terminal-panes.test.ts test/unit/renderer-terminal-tabs.test.ts test/unit/renderer-terminal-window-host.test.ts test/unit/settings-dialog-persistence.test.ts
```

Controlled DOM events and transport bytes do not establish native popup
visibility, physical gesture ordering or a child's actual receipt. The original
tmux/fzf incident remains unreproduced. Native follow-up should reuse the
existing supervised popup/raw-child fixture with one assigned desktop,
distinguishing received mouse bytes, real popup visibility and focused pane,
plus a positive enabled-menu control; do not substitute its container-only
`contextmenu` helper for an actual canvas right-button gesture.

### Inline Kitty images

The pinned Ghostty core handles Kitty graphics parsing, decoding, placement, and eviction for Pi (`f=100` PNG), Chafa (`-f kitty`, `f=32` RGBA), kitten icat, timg, yazi and snacks.nvim (`f=24`/`f=32`/`f=100`, optionally `o=z`, placement IDs and `U=1` placeholders):

- Max transmission input and decoded pixels: 64,000,000 bytes (PNG decode: 128,010,000 bytes per allocation).
- Max image dimensions: 16,000,000 source pixels and 10,000 pixels per side.
- Max completed image storage: 128,000,000 bytes per screen (at most one unfinished image per screen).
- All panes in a window share one WASM memory, which never shrinks, ratchets by power-of-two size class and tops out at 4 GiB. The prepared runtime reads every address an export returns as unsigned, so memory past 2 GiB keeps working. See [ADR 0022](../adr/0022-render-bounded-kitty-images-in-direct-sessions.md) for the measured high-water marks and worst cases.
- Images stay cell-anchored across resize, font zoom, tab switching, and theme reload, and `CSI 16 t` reports current device-pixel cell metrics.
- `ghostty-title-events.patch` continues a pending image on an `a=T` that carries only `q` and `m`, the shape of kitten icat's later chunks; any other `a=T` replaces it.
- Each PTY resize carries `pixelWidth`/`pixelHeight` (columns × cell width, rows × cell height, device pixels, no padding) from `surface-transport.ts` to `node-pty`, so `TIOCGWINSZ` agrees with `CSI 16 t`. The post-start replay reuses the last cell size. The transport starts the session at the grid Restty reported when it connected, if the pane was laid out then (a hidden tab only has a placeholder grid), so `node-pty` spawns at that grid. `node-pty` spawns with 0×0 pixels, so main sets them in the same tick, right after the spawn returns.

```sh
npx vitest run test/integration/restty-images-core.test.ts test/unit/terminal-pixel-size.test.ts
```

### Terminal capability replies

Ghostty answers `CSI 6 n` from its parser cursor at the query position, including
Unicode, pending-wrap resize and origin-mode margins. At the existing completed
CSI seam, the prepared `OutputFilter` synchronously submits the filtered prefix
including CPR through the ordinary runtime controller, which drains core replies
before filtering later DA1/DA2/`CSI 16 t` queries. No render frame or JavaScript
cursor hint answers CPR. DA1 remains `CSI ? 1 ; 2 c`, DA2 `CSI > 0 ; 0 ; 0 c`,
XTVERSION `DCS > | ghostty 1.0 ST`, and cell-size reports retain their metrics
provider.

Every other filter-owned reply (DA1, DA2, XTVERSION, `CSI 14/16/18 t` and OSC
color queries) goes through the same consumer in
`scripts/restty-reply-order-corrections.mjs`: before replying, the filter
commits the prefix it has filtered so far, without the query, so the core
answers earlier queries first. Image tools probe with a Kitty `a=q` followed by
DA1 and stop reading at DA1; yazi also mixes DECRQM and DECRQSS into the same
probe.

The private `filterOutput(output, onCoreOutput?)` consumer is synchronous. Each
committed prefix is excluded from the returned suffix; one-argument consumers
receive CPR as ordinary core-bound output, not a fabricated reply. This changes
neither the public Surface interface nor Adapter ACK/lifetime ownership, and
requires no WASM rebuild.

Headless regressions execute production PTY ingestion and runtime-controller
functions with the real pinned core, controlled transport/geometry and no frame
loop. They include every two-chunk boundary of mixed queries, original Unicode
and resize failures, and cancellation/budget checks:

```sh
npx vitest run test/integration/restty-cpr-core.test.ts test/unit/restty-terminal-capabilities.test.ts
```

The same file covers a Kitty query followed by DA1, DA2, XTVERSION and
`CSI 16 t` at every two-chunk split, and yazi's startup probe order.

These are not DOM Surface, native PTY or graphical qualification.

### Output flow control

- `main` pauses an owned PTY at 65,536 unacknowledged UTF-8 bytes and resumes at or below 16,384 bytes.
- Cumulative ACKs confirm synchronous submission to the Surface.
- Restty's `OutputFilter` caps any single unfinished OSC or CSI control body at 10,000,000 UTF-16 code units, discarding over-budget controls whole without partial side effects.

### Hidden Surface rendering

Panes in hidden tabs continue synchronous output ingestion, protocol replies, and Adapter ACKs while suppressing WebGL frame clears, draws, and texture uploads. Disposable renderer image copies are released while hidden and rebuilt from core storage when the tab is selected again.

### Idle rendering

The pinned loop requested a display frame on every vsync, even for an unchanged
screen. `scripts/restty-idle-render-corrections.mjs` keeps the loop on
`requestAnimationFrame` only while there is pending work: a render request,
resize settling, a changed Kitty animation frame or a deferred presentation
(synchronized output, hidden-document budget). After 500 ms without work, it
sleeps on a timer until the next blink phase, at most 250 ms.

Every `needsRender` write in the runtime goes through one wake path, so output,
input, resize, focus and configuration changes resume vsync on the next frame.
The timer is the fallback for state that changes without an invalidation:
reveal without a refit, unpause, and Kitty animation deadlines, which the core
ABI does not report. Those may present up to one poll late.

A blink phase draws only when the last presented frame depends on it
(`scripts/restty-idle-blink-corrections.mjs`). Both renderers record that while
drawing: the cursor blinks and either its resolved style differs between phases
or a visible cell carries SGR 5. The pinned renderers show SGR 5 cells steadily
unless the cursor blinks, so a steady, hidden or unfocused cursor over plain
text draws nothing at idle. Output, scrolling, preedit and focus moves (the
canvas, the IME input and `focus()`/`blur()`) invalidate, so the answer is
recomputed before it can go stale. Time-based custom shader stages and the
Restty resize overlay, which OMXTerm does not use, no longer get blink-phase
redraws.

The production loop, its lifecycle cancellation, blink phases and the blink
decision run headless:

```sh
npx vitest run test/unit/restty-blink-scheduling.test.ts
```

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

| Diagnostic               | Command                                                                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hidden Surface rendering | `OMXTERM_HIDDEN_EVIDENCE="$PWD/.scratch/hidden-rendering.json" npx vitest run test/integration/restty-scrollback-rendering.test.ts`                                                                             |
| WebGL depth attachment   | `OMXTERM_DEPTH_VARIANT=disabled OMXTERM_DEPTH_EVIDENCE="$PWD/.scratch/depth-disabled.json" npx vitest run test/integration/restty-scrollback-rendering.test.ts` (compare with `OMXTERM_DEPTH_VARIANT=original`) |

## Pinned inputs and WASM core rebuild

`npm ci` (and `npm run postinstall`) runs checksum-guarded `node-pty` preparation
(see the [native runtime contract](../development.md#pinned-pty-runtime)) and Restty
runtime preparation against `assets/restty-sources.json`:

- **`node-pty` `1.2.0-beta.18`:** exact official npm archive/integrity in `package-lock.json`; JavaScript/native source guards in `scripts/prepare-node-pty-{runtime,exec-status}.mjs`
- **Restty `0.3.0`:** `3db45b0e10dbe53c52a77131d366f519546e4f04`
- **Ghostty:** `0309af1b7f0724105a0805efa88bbee808a616ae`
- **`text-shaper` `0.1.28`:** `a23058f475f2b0655b93a89bfce426eecafb9439`
- **Tracked WASM & patches:** `assets/restty/omxterm-restty-core.wasm`, `assets/restty/omxterm-core.patch`, and `assets/restty/ghostty-title-events.patch`

Prepared SHA-256 digests:

| Input                     | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Restty JavaScript runtime | `db5dc2e02fc4529f9f01b2444557619914c87b0c6fdd3a49fc15bccdad110b3c` |
| Embedded-core chunk       | `9a8b8cc33d845e94ca0c957ab38edc0d7b7b1c82a0be6f1f5c1046f2536d32e9` |
| Event declarations        | `428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34` |
| Tracked WASM core         | `0654237ed3f3df0d89b37e944850d884e9583aa5865de9f979efdfeed8ab6caf` |
| Unix `node-pty` runtime   | `a8ee8107e9d1a26c133e6d450149d2712facce0e97db12b57500e869bbab6578` |
| Windows argv agent        | `6042a70008684243efbc865d2615c22a16a910c7a65475bc1a33e49447bcd815` |
| Windows terminal          | `4ceeb76ee0c99ec013678828a3fdf309a612c4613190e5ce16840f5096f7e162` |
| Shared exit forwarding    | `61698286a777b0c76826e138a9d07424e10db77a28b91ca62a9f96f06f76ff3c` |

The additional application-cursor wrapper, export and input declarations are
checksum-guarded in `scripts/restty-application-cursor-corrections.mjs`; unknown
input bytes fail preparation rather than being approximately patched.

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
