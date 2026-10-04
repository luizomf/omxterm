# WebGL depth-attachment diagnostics

## Purpose

Compare the prepared Restty WebGL2 context with and without its `depth:false`
request. Production uses `antialias:false, alpha:true, depth:false`; the 2D
rendering path does not enable depth testing. Alpha supports background
composition and stays enabled in both diagnostic variants. See
[background composition](restty-development.md#background-composition).

## Run

With dependencies prepared and the
[native prerequisites](development.md#platform-prerequisites) satisfied, run from
the repository root. Run the two variants serially with other native fixtures:

```sh
mkdir -p .scratch
OMXTERM_DEPTH_VARIANT=original \
  OMXTERM_DEPTH_EVIDENCE="$PWD/.scratch/depth-original.json" \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
OMXTERM_DEPTH_VARIANT=disabled \
  OMXTERM_DEPTH_EVIDENCE="$PWD/.scratch/depth-disabled.json" \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
```

In PowerShell, set `$env:OMXTERM_DEPTH_VARIANT` and
`$env:OMXTERM_DEPTH_EVIDENCE` for each run, invoke the same `npx vitest` command,
then remove those environment variables afterwards. Choose new output filenames
for separate comparisons.

`original` removes only `depth:false` from the fixture bundle, requesting the
WebGL default depth attachment. `disabled` retains the production options. The
fixture rejects unexpected prepared-runtime digests or replacement seams; it
never changes installed dependency or production source bytes. Each execution
owns an isolated Electron fixture with generated text/images and no shell.

## Interpret results

The fixture exercises rendering and hidden reveal before a one/three/one-Surface
phase. Assertions require actual context attributes, nonblank rendering, GL
error checks and closed extra Surfaces. The disabled variant must report zero
depth bits, no default depth attachment and a null attachment size. The original
variant must have positive depth bits. Inspect both complete test outcomes and
compare returned pixels, geometry, GL activity and memory observations.

JSON includes source base, file/lockfile/runtime hashes, variant-runtime digest,
process versions and observations. Retain native environment details with the
results; browser compatibility user-agent text is not native OS identity.

Process working sets and lifetime peaks are not per-context physical bytes or
GPU allocation accounting. Samples after tab closure do not promise immediate
GC or native/driver reclamation. Attachment removal alone establishes no fixed
RAM-saving figure, cross-platform pixel parity or exact-package qualification.

## Source boundaries

- [Variant transform, evidence fields and assertions](../test/fixtures/restty-depth-evidence.ts).
- [Rendering and memory probes](../test/fixtures/restty-depth-renderer.ts).
- [Shared integration fixture](../test/integration/restty-scrollback-rendering.test.ts).
- [Runtime preparation](../scripts/prepare-restty-runtime.mjs).
