# Default WebGL depth attachment — issue 317

## Conclusion and scope

**Adopt `depth:false`**, based on observed removal of an unused default depth
attachment with preserved real rendering. **No measured RAM-saving claim.**
GPU-process working-set differences are small, order-dependent observations, not
an attribution of physical storage to the attachment. No arithmetic allocation
estimate is used to justify adoption.

Base: `b68e249f9fee3e558198382da4147ef8481522f5` (integrated #316).
The comparison reverses only the context option in a fixture-only bundle;
production CSP, sandbox policy, Surface/Adapter ownership, DPR and integrated
hidden rendering remain identical. Original runtime SHA-256:
`dafd11ff8e1dba44c5d9f1429b895c00cde2cdbe3d6c971db9938c046b18c0be`.
Adopted runtime SHA-256:
`950e2ae1d104fbaea82189c6d1353bb05d61dbcbfee90a36961ab1287978c78a`.
The Ghostty core and lockfile are unchanged. Preparation accepts the reviewed
prior digest, checks the exact replacement and final digest, and remains
byte-idempotent. The emoji experiment guard follows the new digest without
rerunning its unrelated trials. No spec, ADR or version change is warranted:
observable behavior and architecture are preserved.

## Reproduction and source identity

Run these finite commands **serially** from the candidate checkout:

```sh
npm ci
mkdir -p .scratch
OMXTERM_DEPTH_VARIANT=original \
  OMXTERM_DEPTH_EVIDENCE="$PWD/.scratch/depth-original.json" \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
OMXTERM_DEPTH_VARIANT=disabled \
  OMXTERM_DEPTH_EVIDENCE="$PWD/.scratch/depth-disabled.json" \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
npm run lint
npm run check:portable
npm run package:mac
npm run package:verify
```

Each integration execution builds into a fresh temporary directory and launches
its own Electron process with isolated home, config, state, userData and
sessionData. No installed app, private image, user configuration or user session
is inspected. Inputs are generated text, PNG and RGBA only. No shell is launched
by this rendering fixture; existing native host tests separately cover real PTYs.

[Original raw evidence](evidence/issue-317-depth-original.json) and
[disabled raw evidence](evidence/issue-317-depth-disabled.json) contain exact
fixture/lockfile/runtime hashes, actual variant-runtime digests, process versions,
GPU metadata, GL calls, memory samples and behavior results. Their fixture hashes
match; the only runtime difference is `depth:false`. `sourceBase` records HEAD
before the candidate commit; file hashes identify its uncommitted fixture bytes.
The evidence pair was recorded after probe validation. An initial probe wrongly
queried depth component size on an absent attachment and received
`INVALID_OPERATION`; the final probe records `null` for size when type is `NONE`.
Both final render and metadata GL error checks are zero. Earlier exploratory
runs and the regression's red/green logs remain local under `.scratch/`.

Environment: ARM64 macOS 27.0 (26A428), Apple M1 Max / ANGLE Metal, MacBookPro18,2,
build Node 24.15.0, Electron 43.1.1, Chromium 150.0.7871.114, Electron Node
24.18.0. The document is visible at DPR 2. The compatibility user-agent's Intel
macOS string is not the native architecture. Only this native GPU/platform was
measured; Linux and Windows GPU behavior remains unverified.

## Actual rendering and attachment observations

The existing scrollback/hidden fixture first exercises selection, viewport,
hidden output, resize/zoom, immediate reveal and images. A final production-tab
phase creates one Surface, grows to three, then closes back to the original one.
Every retained Surface is selected and receives 120 generated lines at each
phase. The final selected Surface continues rendering during memory settling;
other tabs use the identical integrated hidden policy. No pause, skipped render,
mock GL, lower DPR or alternate renderer is involved.

| Observation                                             | Original                      | `depth:false`                 |
| ------------------------------------------------------- | ----------------------------- | ----------------------------- |
| Actual attributes `depth / alpha / antialias / stencil` | true / false / false / false  | false / false / false / false |
| `DEPTH_BITS`                                            | 24                            | 0                             |
| Default depth attachment type                           | `FRAMEBUFFER_DEFAULT` (33304) | `NONE` (0)                    |
| Default depth component size                            | 24                            | not applicable (`null`)       |
| Depth test enabled                                      | false                         | false                         |
| Bound framebuffer                                       | default                       | default                       |
| Render / metadata GL errors                             | 0 / 0                         | 0 / 0                         |

All other returned attributes match, including `preserveDrawingBuffer:false`.
The context supplies no physical-byte count or attachment handle for the default
framebuffer; driver/Metal resource sizes, GPU-resident capacity, transient
allocations and reclamation timing are unmeasured. Texture/buffer API call counts
are resource activity, not allocated physical bytes.

The matched drawing buffers are 1040 × 816 at one Surface, 1040 × 773 for each
of three tabs, then 1040 × 816 again (the tab strip accounts for the height
change). All five readbacks have identical cross-variant SHA-256 hashes.
Foreground counts are 50,336 / 48,260 per tab / 50,336. Cumulative real
`drawArraysInstanced` and `bufferSubData` counts both equal 12 initially,
84 / 10 / 10 at three tabs, and 96 on the surviving tab. Each canvas records
one `texImage2D`; each records five `bufferData` calls. These calls execute the
original WebGL functions; no mocked or blank output establishes the result.

## Memory observations, separate domains

Values below are Electron `app.getAppMetrics()` process `memory.workingSetSize`,
in KB, sampled immediately after phase completion and after 500 ms. Raw evidence
also retains `peakWorkingSetSize`. This is the API's process working-set metric,
**not** macOS physical footprint, Metal/driver allocation, per-context bytes or a
sum of independent memory domains. GPU and renderer (`Tab`) remain separate.

| Variant / live Surfaces | GPU immediate | GPU +500 ms | Renderer immediate | Renderer +500 ms |
| ----------------------- | ------------: | ----------: | -----------------: | ---------------: |
| Original / 1            |        117088 |      117264 |             269024 |           283568 |
| Disabled / 1            |        116768 |      116848 |             299056 |           270864 |
| Original / 3            |        132096 |      132144 |             300272 |           301424 |
| Disabled / 3            |        131312 |      131328 |             291232 |           291648 |
| Original / 1 again      |        132768 |      132848 |             305952 |           307440 |
| Disabled / 1 again      |        132048 |      132160 |             295440 |           295968 |

One final matched pair is sufficient to establish the attachment and rendering
observations, not a stable memory effect. Original ran first. Both processes
had already exercised the same scrollback/hidden/image workload, so these are
not cold-start measurements. GC was neither forced nor observed; fixture
references, prior disposed resources, browser caches and asynchronous driver
reclamation can remain. The 500 ms sample is a separate settling observation,
not proof of completed GC or reclamation. Neither process returns to its earlier
working set after tab closure. No renderer change is attributed to depth, no
incompatible categories are added, and width × height × depth arithmetic is not
reported as RAM savings. CPU samples in the reused hidden fixture are incidental;
#316's mixed CPU result is not revised here.

## Preserved behavior and verification

Both variants pass the complete existing native fixture:

- Same text readback hashes and 1,026,105 selection-colored screenshot pixels.
- Hidden clears/draws/render uploads remain zero while selected output draws.
- After hidden output, native resize and Window Font Zoom, the switching task
  reads the current background, 1,713 foreground pixels and 578 cursor pixels;
  the grid is 56 × 22 and backing width 960. Hidden resize calls remain empty,
  and canvas identity is preserved. Readback-inclusive durations were 9.5 and
  9.6 ms, with **no intervening timer/frame**. This establishes pre-presentation
  buffer correctness, not physical scanout latency; no one-second render delay
  was introduced.
- Generated static PNG/RGBA retain 9,600 red / 3,200 green pixels across hiding.
  Image deletion, reset, alternate exit and disposal still release cached
  textures without hidden clears. Synchronized output retains the previous
  pixels until completion. Ordered ingestion, ACKs, replies, title/BEL, rapid
  switching and hidden/pending disposal remain covered.
- Hidden-grid protection (#275/#276) and historic scroll-anchoring/input behavior
  (#290/#291) pass unchanged; this experiment does not infer a common cause.
- The 1 → 3 → 1 phase confirms both extra sessions close and the original remains
  usable with nonblank current output. It does not promise synchronous OS memory
  reclamation.

The production regression was first run against the unchanged runtime and
failed on actual depth attributes/bits/attachment presence, then passed after
preparation applied the single-option correction. Fresh installation and two
subsequent preparations produced identical corrected bytes.

Final candidate checks on this host passed:

- `npm run lint` and `npm run check:portable`: formatting, type-aware lint,
  typecheck, 81 test files passed / 3 skipped, 813 tests passed / 12 skipped,
  and build. Native Electron fixtures ran serially.
- Fresh `npm ci`, followed by two preparation runs: the corrected runtime digest
  above was unchanged. Existing dependency audit: two moderate and two high
  vulnerabilities; dependency upgrades are outside this correction.
- `npm run package:mac`: development ARM64 DMG built in the candidate's
  `release/`, with ad-hoc signing and no notarization. No existing artifact was
  overwritten.
- `npm run package:verify`: `FULL` generated-app ARM64 startup verification
  against `release/mac-arm64/OMXTerm.app` (four operational events). This is not
  mounted-DMG verification, owner acceptance, publication or Linux/Windows
  native qualification.

Logs are retained in `.scratch/`: `lint-final.log`, `check-portable.log`,
`npm-ci-final.log`, `idempotence-first.log`, `idempotence-second.log`,
`package-mac.log`, `package-verify.log`, `issue-317-original.log`,
`issue-317-disabled.log`, `depth-red.log` and `depth-green.log`. The coordinator
owns artifact collection, independent review, delivery and cleanup.
