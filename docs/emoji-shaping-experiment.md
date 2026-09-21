# Apple emoji shaping-input comparison (#314)

## Conclusion

The compact-input hypothesis is supported on the measured macOS host. Removing
`sbix` from **shaping input**, not from the installed font, preserves the tested
pinned-parser results and real Terminal Surface pixels while reducing retained
renderer backing storage by about 182.3 MiB. Production now uses bounded
positional reads to assemble that input before parser validation and IPC. It
never reads the removed bitmap payload, persists a derivative, changes custom
font precedence, or adds a renderer capability.

This is not a promise of a fixed total application RSS reduction. It does not
fix the existing blank-emoji fallback when native Canvas is unavailable.

## Reproduction and identities

Run from an owned macOS worktree with an **unused** output directory:

```sh
npm ci
node scripts/emoji-experiment/run.mjs .scratch/emoji-reproduction
node scripts/emoji-experiment/summarize.mjs \
  .scratch/emoji-reproduction/results.json
npm run lint
npm run check:portable
```

The command is finite and starts/terminates its own Electron children. Each
observation uses a fresh userData/sessionData/config/state directory. It does
not launch a shell, read User Configuration, replace the installed app, or
install the derivative. Keep the entire output directory local: it contains an
Apple font derivative, generated bundles, and synthetic screenshots. Only the
source and reviewed aggregate evidence belong in Git.

The [aggregate record](evidence/issue-314-emoji.json) includes source-file and
lockfile SHA-256s, base commit, runtime identity, exact observations, byte
counts, branch counters, and differential outcomes. Source base was
`8f2a41ab65d992020bec1db7c40e41fb8bc28220`; recorded file hashes identify the
candidate modifications independently of the later documentation commit.

Measured environment: Apple M1 Max, 32 GiB RAM, arm64 macOS 27.0 build 26A428;
Electron 43.1.1, Chromium 150.0.7871.114, Electron Node 24.18.0, V8
15.0.245.15-electron.0. Build driver Node 24.15.0. Dependencies came from the
unchanged lockfile: Restty 0.3.0, text-shaper 0.1.28, and the corrected runtime
and Ghostty core documented in `restty-development.md`. The runtime probe checks
the corrected chunk SHA-256 before injecting counters and fails on seam drift.
The guard now includes the later [depth-only correction](webgl-depth-evidence.md).
Historical emoji observations below are unchanged; #317 did not rerun unrelated
emoji trials or change font inputs. The current guard also includes #338's
configured-style selection correction; its native font tests do not constitute
a rerun of this historical emoji comparison.

Installed Apple Color Emoji source:

- `/System/Library/Fonts/Apple Color Emoji.ttc`, 192,120,460 bytes;
- SHA-256 `12bc8221a908c5bcf05f0fce940d3c3f6e9d09d8d806ffe31a969b4ac9be8f9e`;
- two faces; shared `sbix` payload 191,134,508 bytes;
- compact TTC: 985,908 bytes, SHA-256
  `3f95b3fed4c26f5ab42559a21bae8af7483b00261e0fe949f03d1a946a9dd816`.

The original hash is checked again after the experiment. The independent
source-only offline constructor preserves shared non-`sbix` table contents and
both face directories, rebuilding their offsets/search fields. Both inputs
passed the actual pinned collection parser; face names, metrics, glyph counts,
and shaped results for all eight representative samples compared equal. The
production reader independently assembles the same-sized shaping input and
passes the existing exact-family/regular-face and required-table validation.
The input remains a TTC; selecting a single face alone would retain the shared
bitmap payload and is not the tested correction.

## Controlled comparison

All runs use the same built source, dependency identities, 1000×800 native
window, actual DPR 2, one real WebGL2 Restty Terminal Surface, default theme,
geometry and synthetic Adapter. The renderer is sandboxed/context-isolated,
without Node integration, under the production CSP. The fixture's bounded
font IPC calls the actual installed-font reader and `terminalFontInputs`; it
is not a standalone Canvas drawing test. It loads the complete bundled stack
and installed Hiragino Sans GB (23,510,656 bytes) and Apple Symbols (895,440
bytes) in both variants. The configured case supplies the bundled
JetBrainsMono face as explicit configured-family bytes and omits bundled bold
faces through production stack policy.

There are 18 fresh processes, serial original/compact pairs:

- three pairs load original versus independently precomputed compact files;
- one pair disables the color-Canvas result, reaching the existing constrained
  raster fallback;
- one pair also bypasses that fallback, reaching the existing generic atlas;
- one pair uses the explicit configured family, including synthetic bold;
- three pairs compare the whole-file reference reader with the production
  compact reader, both pointed at the **original installed file**.

The reference build disables only the new compact-read branch. It retains the
same bounded reader, validation, IPC, preload, exact-buffer snapshot and Surface
as the candidate. Construction/original buffers in the offline Node driver
never enter a compact Electron process. That driver's memory is not included
in application measurements. Its construction reads the whole original once;
this is explicitly **not** the production loading strategy.

## Actual memory and I/O

The following are ranges over the three production-reader pairs, in MiB
(2^20 bytes). Startup is after Surface readiness and ASCII paint; emoji use is
after the 16 px sample paint. Each point records ordinary GC state, then
explicitly requests **renderer** GC and records a second snapshot. Main GC is
not forced. Subsequent size tests therefore start after the preceding forced
renderer GC and page capture; these are not independent startup trials.

| Measurement                        | Original startup | Compact startup | Original emoji | Compact emoji |
| ---------------------------------- | ---------------: | --------------: | -------------: | ------------: |
| Renderer RSS, before explicit GC   |      857.8–858.5 |     310.3–313.3 |    451.1–458.3 |   268.9–270.2 |
| Renderer RSS, after explicit GC    |      402.8–403.9 |     221.0–222.2 |    439.2–446.2 |   257.1–257.8 |
| Renderer backing storage, after GC |            239.1 |            56.9 |          239.3 |          57.0 |
| Renderer JS used heap, after GC    |             24.9 |            24.9 |      28.1–28.2 |          28.2 |
| Browser/main RSS, ordinary GC      |      392.4–392.7 |     211.7–212.3 |    189.3–189.7 |   236.9–237.4 |
| GPU-process RSS                    |        70.8–70.9 |       70.8–71.1 |      94.7–94.8 |     94.4–94.8 |

Observed process lifetime peak RSS at startup: Browser 964.7–964.9 MiB versus
282.1–282.7 MiB; renderer 990.0–991.0 MiB versus 310.3–313.3 MiB. These are
per-process high-water observations, not simultaneous total peaks. The separate
precomputed-input pairs independently show the same retained backing-storage
delta; their Browser RSS is more variable (one original emoji observation was
477.6 MiB). All observations, including that variation, remain in the record.

`app.getAppMetrics()` reports process working-set/peak values in KiB; RSS
includes shared pages, so summing processes double-counts shared memory.
`Runtime.getHeapUsage` reports JS heap, embedder heap and backing storage in
bytes; backing storage is not only fonts. Main `process.memoryUsage()` is
recorded separately: Electron reports `arrayBuffers: 0`, which is unavailable
accounting here, **not** proof that it has no buffers. External allocation and
RSS also reflect different collection/reclamation timing. GPU-process RSS does
not measure GPU allocations, driver caches or IOSurfaces. Those costs and a
whole-application physical footprint remain unmeasured. No heap snapshots were
collected.

Deterministic input reduction is 191,134,552 bytes (182.3 MiB), including
removed directory/padding overhead. Total native font file reads:

- original reference: 216,526,556 bytes, largest read 192,120,460;
- precomputed compact input: 25,392,004 bytes;
- production compact reader: 25,392,019 bytes, largest read 23,510,656 (CJK).

Thus production reads 985,923 bytes from the Apple file, including headers and
directories, without reading `sbix`. Unit coverage forbids bitmap-range reads.
It allocates the output plus transient retained-table read buffers; parser
validation still copies the resulting input. IPC/preload and renderer snapshots
still copy it, and ordinary GC can retain those transient copies. CJK and other
fonts still use whole-file reads. The first renderer backing observation shows
several transient generations of native bytes; after explicit GC, the delta
tracks one retained compact source. This distinction is why removed file bytes
must not be reported directly as RSS savings.

## Rendering outcomes

Every paired full-page bitmap hash matched, at startup, 16/8/32/72 px and after
zoom-in/zoom-out restoration: **54 paired captures**, no compact-input pixel or
geometry regression. Samples include a smile, woman technologist ZWJ, family
ZWJ, skin-tone modifier, Brazilian flag, variation-selector heart, two CJK
characters, and snowman/math/arrow symbols. Every sample is between `A` and `B`;
a separate bold row exercises style priority. Inspection of the 32 px native
capture confirmed joined color emoji, visible CJK and symbols, and distinct
adjacent letters without overlap. Equality is a differential result for this
host, not a cross-platform pixel guarantee or exhaustive Unicode coverage.

Native runs execute the color-Canvas branch five times with no color-raster
fallback. Forced no-Canvas runs execute five constrained-raster fallbacks;
forced atlas runs execute the generic path instead (five additional atlas
calls). Both fallback variants produce identical original/compact pixels, but
Apple emoji are blank in **both**: the installed pinned fallback does not
recover these bitmap glyphs even from the original font. CJK, other symbols and
adjacent text remain rendered. The correction neither removes a working
fallback nor claims to repair that baseline limitation.

An exploratory per-row cursor-report probe disturbed the baseline rendering
and did not agree with displayed grapheme positions. It was removed from the
final workload rather than misreported as layout evidence; the final comparison
uses the uninterrupted synthetic rows, page pixels, and final cell-size/cursor
queries. The exploratory local directory remains distinguishable from final
evidence. Cursor-report behavior itself is not qualified by this experiment.

## Regression coverage, scope and remaining risk

The focused unit test first failed with an absent compact result, then passed
with the positional reader. Synthetic shared-table tests cover no bitmap read,
both faces, deduplication, unchanged non-collection/no-`sbix` input, malformed
counts/ranges/duplicate tags and short reads. A real-parser integration test
uses a redistributable FiraCode font plus synthetic TTC/bitmap bytes: it checks
compact selection/metrics, unchanged source, unrelated-family whole-file
behavior, exact-family rejection and existing byte limits. No Apple bytes are
in tests or Git.

Production changes are limited to main's font input; no dependency patch,
preload capability, cache, renderer algorithm, installed font or package version
changes. Spec and ADR 0025 record the pinned shaping-input decision. A stale
release test found by the full gate was corrected separately to check metadata
consistency and artifact naming without hard-coding the previous release.

Verification on this candidate: explicit `npm run lint` passed;
`npm run check:portable` passed formatting, lint, typecheck, 813 tests (81 files;
12 tests in three platform-specific suites skipped), and build. This includes
the existing native Electron rendering/host fixtures and the new reader tests.
The original gate's four stale-version failures and the later passing log are
retained locally; no test or lint rule was disabled.

This is a macOS native experiment, not exact-package acceptance. Linux/Windows
native packaging and other Apple font versions were not run. A non-collection
or no-`sbix` Apple font keeps the whole-file path. Future parser/renderer changes
must rerun this comparison before extending the omission assumption. The
fixture does not measure a shell, multi-window totals, user sessions, exhaustive
fonts/emoji, GPU/IOSurface memory, or a release artifact. Independent review,
PR, squash integration and issue closure remain coordinator-owned gates.
