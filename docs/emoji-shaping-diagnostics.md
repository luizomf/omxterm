# Apple emoji shaping-input diagnostics

## Purpose

Compare original Apple Color Emoji collection input with input that omits the
`sbix` bitmap table. Production uses bounded positional reads to preserve all
faces and other tables before validation and IPC; native Canvas uses the
unchanged installed font. The experiment checks parser/shaping equivalence,
Surface pixels, geometry, read counts and separate memory domains when font or
parser/renderer inputs change.

## Run

Use macOS with the [native prerequisites](development.md#platform-prerequisites)
and an installed `/System/Library/Fonts/Apple Color Emoji.ttc`. From the repository
root, run serially with other native graphics fixtures:

```sh
npm ci
node scripts/emoji-experiment/run.mjs .scratch/emoji-comparison
node scripts/emoji-experiment/summarize.mjs \
  .scratch/emoji-comparison/results.json
```

The output directory must not already exist. The driver launches finite Electron
children with isolated profiles and synthetic Surface input, not a shell or
installed application. It writes an offline font derivative, fixture bundles,
synthetic captures and results into that directory. Keep the derivative and
unreviewed diagnostic output local; production does not persist a derivative or
modify the installed font.

## Interpret results

The driver compares precomputed original/compact inputs, forced no-Canvas and
atlas paths, an explicit configured-family case, and whole-file versus production
readers. It rejects parser or paired rendering/geometry differences, missing
probe execution, dependency seam drift and changes to the original font.
`results.json` records source-file/lockfile hashes, source base, runtime digest,
font identities and observations. A commit SHA alone does not identify
uncommitted inputs.

The summary reports paired equality and startup/emoji memory samples. Source-byte
reduction, renderer backing storage, JavaScript heap, main RSS and GPU-process
working sets are different domains. Shared pages and reclamation timing prevent
interpreting their sum as a physical footprint or removed font bytes as guaranteed
RSS savings. Driver-side offline construction is outside application measurements.

Apple bitmap emoji can remain blank when native Canvas rasterization is
unavailable; compact shaping input does not supply a replacement bitmap renderer.
The fixture does not establish exhaustive Unicode/font coverage, cross-platform
pixel parity, GPU allocation bounds or exact-package qualification.

## Source boundaries

- [Driver](../scripts/emoji-experiment/run.mjs) and
  [summary](../scripts/emoji-experiment/summarize.mjs).
- [Offline collection constructor](../scripts/emoji-experiment/compact.mjs).
- [Production compact reader](../src/main/apple-emoji-shaping-input.ts) and
  [installed-font boundary](../src/main/installed-font-family.ts).
- [Runtime preparation and font ownership](restty-development.md#font-memory-ownership).
