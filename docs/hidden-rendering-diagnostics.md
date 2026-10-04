# Hidden Terminal Surface diagnostics

## Purpose

Exercise production Terminal Tabs and Restty Surfaces with a synthetic Adapter
to check hidden frame suppression, ordered ingestion and immediate reveal.
Hidden Surfaces keep output, ACKs, replies, titles, bells and scrollback active
while retaining their last real grid. Selection refits and refreshes the same
Surface; synchronized output retains its batching behavior. See
[hidden rendering](restty-development.md#hidden-surface-rendering) for
the implementation boundary.

## Run

With dependencies prepared and the
[native prerequisites](development.md#platform-prerequisites) satisfied, run from
the repository root, serially with other native fixtures:

```sh
mkdir -p .scratch
OMXTERM_HIDDEN_EVIDENCE="$PWD/.scratch/hidden-rendering.json" \
  npx vitest run test/integration/restty-scrollback-rendering.test.ts
```

In PowerShell, set `$env:OMXTERM_HIDDEN_EVIDENCE` to the output filename before
running `npx vitest run test/integration/restty-scrollback-rendering.test.ts`,
then remove that environment variable afterwards. Choose a new filename to keep
separate diagnostic runs distinguishable.

The supervised integration fixture creates temporary isolated profiles and uses
generated text, PNG and RGBA inputs. It does not inspect an installed app or user
session. The JSON contains the hidden-rendering subsection, not the full suite
result or standalone source/runtime hashes. Record the tested source, prepared
runtime and native environment alongside it; inspect the test outcome and cleanup
as well as the file.

## Interpret results

Assertions cover zero hidden frame clears/draws/uploads, continued ingestion,
retained geometry, same-task current pixels on reveal, synchronized reveal after
pending refits, hidden mounting/disposal, and image deletion/reset/cleanup.
Initial WebGL backend buffer allocation is distinct from recurring frame uploads.
Valid core images survive hiding; disposable renderer copies may be released
and reconstructed on reveal.

RAF counts describe scheduling, not CPU usage. Renderer CPU samples include the
visible Surface, ingestion, shaping and fixture work, not just hidden rendering.
Drawing-buffer readback is not compositor latency or physical scanout evidence.
The fixture supplies no total RSS/GPU-memory saving or fixed performance target.
A counted CPR reply proves delivery, not cursor-coordinate accuracy; see
[current Restty limitations](restty-development.md#current-runtime-limitations).

## Source boundaries

- [Integration assertions and JSON output](../test/integration/restty-scrollback-rendering.test.ts).
- [Hidden workload](../test/fixtures/restty-hidden-renderer.ts),
  [presentation probes](../test/fixtures/restty-hidden-presentation.ts) and
  [image lifecycle](../test/fixtures/restty-hidden-images.ts).
- [Production Surface](../src/terminal-surface/restty-terminal-surface.ts).
- [Focused native checks](development.md#focused-checks)
  and the separate real-PTY host fixture described in the development guide.
