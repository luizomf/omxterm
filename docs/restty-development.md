# Restty Terminal Surface

OMXTerm uses pinned Restty 0.3.0 and its Ghostty WASM core in development and packaged builds. There is no renderer selector or fallback Surface.

For product behavior, see [`spec.md`](spec.md); for architectural rationale, see [ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md). Use [native development](development.md) for platform setup and test suites.

## Runtime architecture

The portable Terminal Surface (`src/terminal-surface/`) receives a session Adapter and imports neither Electron nor `node-pty`. Electron `main` owns local PTYs and privileged capabilities; `preload` exposes typed, sender-validated IPC routes.

- **Initialization:** Fonts, the Ghostty WASM core, and a WebGL2 context initialize before the PTY starts. If initialization fails, no shell is spawned. WebGL context loss reports a visible error and disposes the affected tab/session without affecting other tabs.
- **Tab cancellation:** Closing an initializing tab marks late callbacks inert, waits for pending acquisitions to settle, and releases partial resources. An already accepted session start is closed once through the Adapter.

### Configuration and Surface lifetime

- **Live-safe settings:** Theme colors, font size, programming ligatures, padding, scrollback lines, and macOS Option Key Mode apply in place to existing tabs and sessions.
- **Creation-time settings:** `font.family` and `font.lineHeight` are fixed when a Surface is created. New tabs use the latest validated values; existing tabs keep their creation-time values until OMXTerm restarts.

### Current runtime limitations

- **Cursor Position Reports (`CSI 6 n`):** The `OutputFilter` answers CPR queries using a retained UTF-16 cursor hint before core write. Wide/combining characters, pending wrap, and resize can cause the reply to differ from Ghostty's actual cursor ([#568](https://github.com/luizomf/omxterm/issues/568)).
- **Reload application errors:** `user-configuration-reloader.ts` updates the active configuration snapshot before applying consumers sequentially. While validation errors cleanly retain the previous configuration, an unexpected runtime exception during consumer application has no automatic rollback.
- **Pending font acquisition across reload:** Changing `font.family` while a tab is still reading native font bytes rejects the in-flight request as superseded ([#569](https://github.com/luizomf/omxterm/issues/569)).
- **First-tab startup commands:** `terminal-window-host.ts` subscribes to tab-level actions after `tabs.ready`; an early `Close Tab` before the first tab finishes initializing can be dropped ([#571](https://github.com/luizomf/omxterm/issues/571)). `Close Window` and `Quit` remain active on separate main-process routes.
- **Wide-wrap URL recognition:** A mismatch between wide-wrap spacer cells and core selection text can prevent visible URL recognition when a wide glyph wraps across rows ([#593](https://github.com/luizomf/omxterm/issues/593)).

### Scrollback and viewport

- `scrollback.lines` (0 to 100,000, default 10,000) sets an approximate history-row target per tab. Ghostty evicts whole pages and enforces a 10,000,000-byte core ceiling. Setting `0` clears and disables history immediately.
- Accepted user input (typing, paste, snippets, or dropped paths) returns the viewport to the live bottom; background output, focus, and selection do not jump the scroll position.
- Desktops with a fine pointer use native scrolling even if touch hardware is present.
- The prepared runtime adds `interaction.getBufferText()`, which reads the same retained rows as Select All (scrollback plus the current screen, or only the alternate screen) through the core's selection-text query, without changing the selection, link hover, cursor, or rendering state. Explicit export uses it.

### Input, links, and titles

- Copy/paste, Protected Paste, snippets, file-path insertion, local image previews, and write-only OSC 52 use OMXTerm host routes. Restty's built-in browser clipboard and URL-opening callbacks are disabled.
- Visible HTTP(S) URLs and local image paths are recognized from cell snapshots and Ghostty selection proofs across soft wraps (OSC 8 hyperlinks are ignored).
- Parsed OSC 0/2 titles and silent BEL events flow from the Ghostty core to OMXTerm's per-session host controllers.

### Inline Kitty images

The pinned Ghostty core handles Kitty graphics parsing, decoding, placement, and eviction for direct Pi (`f=100` PNG) and Chafa (`-f kitty`, `f=32` RGBA) sessions:

- Max decoded transmission input: 33,554,432 bytes.
- Max image dimensions: 4,194,304 source pixels (Chafa RGBA max: 16,777,216 bytes).
- Max completed image storage: 64,000,000 bytes per screen (at most one unfinished image per screen).
- Images stay cell-anchored across resize, font zoom, tab switching, and theme reload, and `CSI 16 t` reports current device-pixel cell metrics.

### Output flow control

- `main` pauses an owned PTY at 65,536 unacknowledged UTF-8 bytes and resumes at or below 16,384 bytes.
- Cumulative ACKs confirm synchronous submission to the Surface.
- Restty's `OutputFilter` caps any single unfinished OSC or CSI control body at 10,000,000 UTF-16 code units, discarding over-budget controls whole without partial side effects.

### Hidden Surface rendering

Hidden tabs continue synchronous output ingestion, protocol replies, and Adapter ACKs while suppressing WebGL frame clears, draws, and texture uploads. Disposable renderer image copies are released while hidden and rebuilt from core storage when the tab is selected again.

### Background composition

The WebGL2 context uses `alpha: true, depth: false, antialias: false`. The host paints the theme background tint once behind the Surface:

- Implicit default cell backgrounds (`SGR 49`) use alpha `0` to reveal the host tint and any active platform blur.
- Explicit cell backgrounds (including explicit RGB matching the theme background and inverse video) use alpha `255` and remain opaque.

Focused background checks:

```sh
npx vitest run test/integration/restty-background-core.test.ts test/integration/restty-background-rendering.test.ts test/integration/window-chrome.test.ts
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

`npm ci` (and `npm run postinstall`) runs checksum-guarded `node-pty` and Restty runtime preparation against `assets/restty-sources.json`:

- **Restty `0.3.0`:** `3db45b0e10dbe53c52a77131d366f519546e4f04`
- **Ghostty:** `0309af1b7f0724105a0805efa88bbee808a616ae`
- **`text-shaper` `0.1.28`:** `a23058f475f2b0655b93a89bfce426eecafb9439`
- **Tracked WASM & patches:** `assets/restty/omxterm-restty-core.wasm`, `assets/restty/omxterm-core.patch`, and `assets/restty/ghostty-title-events.patch`

Prepared SHA-256 digests:

| Input                      | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| Restty JavaScript runtime  | `3b1076d32880f0f28b8cbb465687825c4bb980d34d1af67862e23b5eda2871e3` |
| Embedded-core chunk        | `1fb03cc8360942c613ca98973658de362852a60d88942c482de4b0dc429660fa` |
| Event declarations         | `428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34` |
| Tracked WASM core          | `92aa781340d4bd87f8028c17534fe720bd47e87dd34786d149811923e4e389ec` |
| Unix `node-pty` runtime    | `e1cd61e52f681871c401ca54a21382173281532e8eaa9f679bfe549be9a427b1` |
| Windows `node-pty` runtime | `3f4cf11eaa6cc07bacb34e3693857e123e3e55edfb446d7657d80cf95f9ce244` |

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
npx vitest run test/integration/restty-reflow-core.test.ts test/integration/restty-resize-core.test.ts test/integration/restty-scrollback-core.test.ts test/integration/restty-images-core.test.ts test/integration/restty-events-core.test.ts
```
