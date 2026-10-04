# Restty Terminal Surface

OMXTerm uses pinned Restty 0.3.0 and its Ghostty WASM core in development and
packaged applications. There is no Surface selector or fallback renderer. This
page covers integration maintenance; [spec.md](spec.md) describes the product and
[ADR 0025](adr/0025-use-restty-as-the-terminal-surface.md) explains the architecture.
Use [native development](development.md) for platform setup and fixture ownership.

## Runtime contract

The portable Surface receives an Adapter and imports neither Electron nor
node-pty. Electron main owns local PTYs and privileged capabilities; preload
exposes typed, sender-validated routes. Fonts, Ghostty core and WebGL2 readiness
precede PTY startup. Initialization failure starts no invisible shell. Context
loss reports a visible failure and disposes the affected tab/session without
recreating its core or affecting siblings.

Once a tab-close command reaches the host, cancellation makes late callbacks
inert, waits for pending acquisitions to settle and releases partial resources.
An already accepted session start is closed once through the Adapter. Main retains
a native failure dialog until acknowledgement for genuine failures, including
when the failed session was the last one. Cleanup uncertainty is not success.

### Configuration and Surface lifetime

Theme, font size, programming ligatures, padding, scrollback and Option Key Mode
apply live in the same Surface/core/PTY. Existing Surfaces keep creation-time
font family and line height; restart to change those everywhere. New Surfaces use
the current validated settings. Main-issued renderer-scoped identities retain
creation-time font bookkeeping before PTY startup and release it on disposal.
Restart notices account for surviving initializing Surfaces, not just live PTYs.

Reload validation precedes application. Runtime application is sequential, not a
rollback transaction; see [current runtime limitations](#current-runtime-limitations).

### Current runtime limitations

- **CPR:** the OutputFilter answers cursor-position queries before core write
  using a persistent UTF-16 cursor hint. Wide/combining text, pending wrap and
  resize can make the reply disagree with Ghostty's actual cursor. A single reply
  path does not establish correct coordinates.
- **Reload exceptions:** `user-configuration-reloader.ts` assigns the new active
  snapshot and log level before applying consumers. A runtime exception can leave
  new or partially applied settings despite the retained-configuration notice.
  Ordinary validation rejection retains the previous settings.
- **Pending fonts:** main accepts requests only for its active family/generation.
  A family change while an old native font read is pending rejects that read's
  completion as superseded; the old initializing Surface can fail even though its
  renderer lease still exists. Already acquired stacks remain leased.
- **Font errors:** successful font responses contain bounded bytes and face
  metadata, not paths or a filesystem API. An on-demand read failure can carry a
  native filesystem path in the IPC rejection. Review raw errors before sharing;
  this is renderer disclosure, not demonstrated network exfiltration or logging.
- **First-tab commands:** `terminal-window-host.ts` subscribes to tab commands
  only after `tabs.ready`. Close Tab sent before the first Surface is ready can
  be dropped. Close Window and Quit have separate main-owned routes.

These constraints are supported by the current source and the module-level
findings in [#566](https://github.com/luizomf/omxterm/issues/566), not universal
native GUI reproduction. The font-ownership fixture holds runtime readiness
**after** font acquisition; it does not qualify an outstanding main font read
across a family change.

### Scrollback and viewport

Positive `scrollback.lines` is an approximate physical history-row target:
Ghostty evicts whole pages, so retention can exceed it by one minimum boundary
page. The independent 10,000,000-byte core ceiling can retain fewer rows. Zero
uses the core's no-history path and drops existing history; restoring a positive
value retains only new output. Each Surface has independent history.

Accepted input returns the viewport to live; output, focus and selection do not.
Fine-pointer desktops use Restty's native scroll host even with touch capability;
touch-only devices retain its touch path. Browser scroll anchoring is disabled,
and spacer-height clamping uses programmatic-scroll suppression so queued browser
events do not become terminal scroll input. `isTrusted` alone is not user intent.

### Input and host-owned policy

Explicit copy/paste, Protected Paste, snippets, file-path insertion, local-image
activation and write-only OSC 52 use OMXTerm host routes. DOM paste enters the
ordered asynchronous confirmation/delivery path; ordinary keyboard input stays
direct. Closing the owner stops future chunks and optional Enter, without
recalling bytes already sent. Restty's direct browser clipboard and opening
callbacks are disabled.

Visible destination recognition uses cell snapshots and Ghostty selection proof
of fully visible soft wraps. Hard breaks remain separate, uncertain clipped
continuations are refused, and OSC 8 destinations are ignored. Modified primary
click overrides application mouse reporting only for a valid destination without
a duplicate PTY report. Pointer cancellation and blur end pending gestures.

Parsed OSC 0/2 and BEL flow through existing title/silent-bell controllers rather
than an OMXTerm payload scanner. Cancelled/malformed controls and OSC BEL
terminators have no extra title/bell effect; title reports receive no reply.

Option Key Mode applies live. On macOS, `none` keeps native layout Unicode and
composition; configured physical Option sides generate terminal Alt input.
Native dead-key completion retains layout text, including Space completion that
arrives as `insertText` without composition events. Ordinary non-composing Space
uses the existing key encoder. Main owns application accelerators exactly once.
Synthetic DOM keyboard tests do not qualify every OS layout or hardware sequence.

### Graphics and resource limits

The pinned core owns Kitty parsing, decode, placement, deletion and reset for the
claimed direct Pi PNG and anonymous metadata-first Chafa RGBA paths. Decoded
transport input is limited to 33,554,432 bytes, dimensions to 4,194,304 source
pixels and completed image storage to 64,000,000 bytes per screen. There is at
most one unfinished image per screen. Pi's default 2,000-by-2,000 autoresized
output is the compatibility target; other protocol/multiplexer paths are unclaimed.

Images remain cell-anchored through refit, zoom, tab selection and theme reload.
`CSI 16 t` reports current device-pixel cell metrics. Core storage does not include
JavaScript/WebGL copies or transient decoder allocations, and tabs multiply costs.
Flow-control, heap, RSS, core storage and GPU measurements are separate domains;
none is a whole-application memory bound.

### Output flow control

Main pauses an owned PTY at 65,536 unacknowledged UTF-8 bytes and resumes at or
below 16,384. ACKs are cumulative and sender/session validated. They mean
synchronous submission to the Surface, not rendering or parser/GPU resource
release. The crossing native read can raise pending bytes above the high-water
threshold. Owner loss resumes and terminates only that PTY. The prepared Unix
node-pty exit guard preserves a deliberately paused readable tail; ConPTY is a
separate implementation.

Restty's OutputFilter bounds one unfinished OSC/CSI body to 10,000,000 UTF-16 code
units. Over-bound controls are discarded whole through termination or CAN/SUB,
without partial clipboard, title, mode or reply effects. Later text can continue.
This is not a general output, copy, paste or keyboard-input limit.

### Hidden Surface rendering

Hiding suppresses frame clears, draws and render uploads, not synchronous
output ingestion, protocol replies or Adapter ACKs. Hidden font changes retain
the last real grid. Selection refits and refreshes in the switching task without
waiting for a background render budget or replacing Surface/core/session.

Hidden output discards disposable renderer image copies and pending decodes.
Valid core images and placements survive; deletion, reset and alternate-screen
exit still execute. Reveal rebuilds needed renderer copies. This lifetime policy
does not promise reduced total RAM or GPU allocation.

### Background composition

The WebGL2 context requests `alpha:true`, `depth:false` and `antialias:false`.
It clears to transparent, and the host paints the theme tint once. Surfaces use
`background: "host"`; standalone Surfaces retain their own opaque background.
Explicit core cell backgrounds use RGBA alpha 255, implicit defaults alpha 0.
Explicit equal-RGB fills remain opaque; SGR 49 restores the implicit background.
Inverse text and reverse-screen mode retain opaque explicit background behavior.

Transparency changes host tint rather than Surface/core/session identity.
Windows uses nontransparent native construction: Acrylic can reveal the requested
tint, while plain-alpha or failed/unavailable material requests use effective
transparency zero. The requested configuration remains unchanged. Native blur is
best effort; neither API success nor a page capture proves visible compositor
blur. See [ADR 0029](adr/0029-compose-background-effects-with-explicit-cell-identity.md)
and [ADR 0030](adr/0030-prefer-direct-macos-background-blur.md).

Focused checks:

```sh
npx vitest run test/integration/restty-background-core.test.ts test/integration/restty-background-rendering.test.ts test/integration/window-chrome.test.ts
```

For optional compositor observation, place the app over a separately owned
synthetic pattern window. Compare opaque, positive transparency without blur,
blur enabled and blur removed at a fixed theme; exercise resize, maximize/restore
and fullscreen while checking native state and unchanged Surface/session identity.
Capture only owned synthetic scenes. Windows should use the opaque fallback when
blur is absent; unsupported Linux composition may ignore blur. Record the actual
OS/compositor and observation limits in the task issue/PR, not a repository report.

### Font memory ownership

Each renderer window owns validated font-family generations. Compatible Surface
leases share exact-range native byte snapshots and Restty's identity-keyed parsed
resources. Collections share backing bytes while selecting exact face indices.
Missing styles synthesize the requested trait; bundled bold faces are omitted
for configured families so style selection cannot override the chosen family.

New-family generations serve new Surfaces; old acquired stacks remain with their
creation-time owners. Rejected loads publish nothing, and cancellation of one
lease does not cancel another. Final release/window disposal drops owner references;
Restty's bounded released-resource cache is separate. Live fonts may exceed that
cache budget. There is no persistent main byte cache or cross-window owner.

Borrowed ArrayBuffers are mutable. The pinned parser/shaper reads source bytes
and writes separate caches/raster buffers. Font-resource tests and the
[native host integration fixture](../test/integration/restty-host-integration.test.ts)
check source preservation. The host fixture's byte-comparison probe retains extra
copies, so its memory observations are not uninstrumented measurements.
Dependency upgrades must revalidate source preservation.
Apple Color Emoji shaping input omits the unused `sbix` bitmap payload using
bounded main-process reads, while Canvas uses the unchanged installed font.
Other families retain whole-file inputs. IPC, snapshots, shaping, browser and GPU
resources still have transient costs.

```sh
npx vitest run test/integration/restty-font-resources.test.ts test/integration/restty-font-styles-rendering.test.ts test/integration/apple-emoji-shaping-input.test.ts
npx vitest run test/integration/restty-host-integration.test.ts
```

The separate style fixture checks rendering, style selection, resource sharing
and leases. It can retain aggregate measurements with
`OMXTERM_FONT_STYLES_EVIDENCE_PATH`. Diagnostic forced GC and test-only counters
do not ship.

## Pinned inputs and restoration

`npm ci` installs the lockfile and automatically runs checksum-guarded node-pty
and Restty preparation. For an already installed lockfile with changed preparation
inputs, use `npm run postinstall`. Do not edit `node_modules` manually or change a
digest to bypass drift. Review upgrades against source/license identity, required
behavior, regressions and affected native package checks.

Current inputs are recorded in `assets/restty-sources.json`:

- Restty `0.3.0`: `3db45b0e10dbe53c52a77131d366f519546e4f04`;
- Ghostty: `0309af1b7f0724105a0805efa88bbee808a616ae`;
- installed text-shaper `0.1.28`: `a23058f475f2b0655b93a89bfce426eecafb9439`;
- tracked core and patches: `assets/restty/omxterm-restty-core.wasm`,
  `assets/restty/omxterm-core.patch` and `assets/restty/ghostty-title-events.patch`.

The manifest records package integrity, source trees/submodules, patch digests
and build inputs. `assets/fonts/README.md` owns font provenance;
`THIRD_PARTY_NOTICES.md` identifies the packaged licenses. Runtime fonts/core load
from bundled bytes under `connect-src 'none'`, without a source build or remote
fetch during installation.

Current prepared SHA-256 values:

| Input                         | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| Restty JavaScript runtime     | `a5a31366381972750bf98651ac028e6bbe370e89d5ca5cc3855c141cd1002638` |
| Embedded-core chunk           | `1fb03cc8360942c613ca98973658de362852a60d88942c482de4b0dc429660fa` |
| Event declarations            | `428304b91fffa494abcda7e2ac96fc4d305db9906b1436f07650969840a2fa34` |
| Tracked WASM core             | `92aa781340d4bd87f8028c17534fe720bd47e87dd34786d149811923e4e389ec` |
| Unix node-pty runtime         | `e1cd61e52f681871c401ca54a21382173281532e8eaa9f679bfe549be9a427b1` |
| Windows node-pty argv runtime | `3f4cf11eaa6cc07bacb34e3693857e123e3e55edfb446d7657d80cf95f9ce244` |

The private types in `src/terminal-surface/restty-runtime-contract.ts` describe
only the corrected dependency seam. Keep dependency-only methods there rather
than widening the public Surface interface or exposing upstream internals.

### Rebuild the tracked core

Use an owned disposable checkout of the pinned Restty source and submodules,
Zig 0.16.0 and Bun. Substitute this checkout's absolute patch paths:

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

The target is `wasm32-freestanding`, `baseline+simd128`. Compare the output digest
with the manifest before replacing a tracked artifact. The patches keep parsing,
grapheme cells, image/resource limits, title/BEL events, scrollback, reflow,
pending-wrap cursor reconciliation and negotiated geometry replies core-owned.

```sh
npx vitest run test/integration/restty-reflow-core.test.ts test/integration/restty-resize-core.test.ts test/integration/restty-scrollback-core.test.ts test/integration/restty-images-core.test.ts test/integration/restty-events-core.test.ts
```

These tests execute the tracked WASM directly. Native Surface/host checks are
still needed for rendering and IPC behavior; use the
[focused test commands](development.md#focused-checks) and
[release procedures](release.md) for affected package inputs.
