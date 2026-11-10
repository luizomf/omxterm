# Save layouts without restoring sessions

Status: Accepted for the optional Linux ARM64 Saved Layout preview (#673).

## Decision

One separately installed extension owns manual Save/Replace/Open/Forget policy
and one explicitly saved current-window layout with local-directory provenance.
The [development record](../saved-layout-development.md) owns observable bounds, exclusions and
retention disclosure. This narrows the old workspace proposal: no startup
or distributed multi-window snapshot coordinator, autosave or command replay.

Core exposes declared `terminal.captureLayout.v1` and `terminal.openLayout.v1`
operations to the actual owned extension view. Optional `view.context: "window"`
captures the original window/renderer lifetime, independent of the original
pane's exit; omission preserves Files/SSH's session context. Capture uses one
request ID and trusted renderer reply, clones terminal order/tree/focus, then
maps only that window's issued session references to main-owned provenance.
Ended references become home slots; unknown references refuse. Directory paths
reach the trusted extension for deliberate saving, never the terminal renderer.

The shared flat indexed tree preserves current n-ary split semantics and valid
16-pane alternating depth within existing extension transport budgets. Reject
cycles, duplicates, unreachable nodes, missing pane coverage, invalid weights,
focus/selection, unknown keys and resource overages without truncating. No
executable, arguments, environment or SSH fields enter this contract.

Open snapshots its input, resolves cwd asynchronously with two bounded I/O
admissions and deadlines, and revalidates installation/local lifetime before
core transfer. A timed-out operation retains its admission until actual I/O
settlement. The new window receives complete initial ownership, not repeated
Split commands or a temporary default tab. Window-bound single-use tokens carry
cwd only in main; starts explicitly select Default Shell, independently of a
pending original `-e`. All owners exist before at most two concurrent ordinary
Surface mounts. First selected-pane settlement remains host readiness; the core
status separately tracks layout mount settlement and fallbacks/partial failure.

Pretransfer revocation has no window/shell effect. After transfer, extension
retirement cannot stop core terminals; ordinary pane/window/Quit lifetimes own
cancellation and actual native-exit barriers. No rollback kills healthy panes,
automatic retry recreates a closed pane, or extension pin follows core work.
Keyboard Open dispatches only after Enter release. Captured native/view focus
intent prevents delayed completion from raising a window over newer activity.

Main tracks reported-local, launch-local and home provenance. Invalidating OSC7
removes both a previous report and eligibility for launch fallback. Known SSH
and explicit commands are always home slots. No process probing or shell hooks
are added. Directory validation does not prove locality or exclude OS mounts.

## State adapter

A declaration-gated bootstrap `state.v1` adapter exposes `read()` and
`replace(expectedRevision, valueOrNull)` for one bounded JSON document per
validated extension ID, in a profile-owned sibling `extension-state` directory.
It reuses native leases, not installation transactions or stale-PID locks.
Private complete temp bytes are flushed/closed and renamed under the stable
exclusive lease, comparing revisions while locked. Each successful mutation
gets a fresh opaque revision; Forget writes an empty tombstone so A→B→A and
stale destructive requests remain detectable. Busy is a refusal, not a spin.

No lock spans renderer capture, dialogs or shell startup. Unknown publication
requires Refresh, never automatic replay. Reads reject unsafe files and never
repair or migrate data. Disable/update/uninstall preserve user state. Forget
removes only the active snapshot; interrupted-write temp copies may remain.
No sweeper or forensic-erasure guarantee is introduced.

## Compatibility and verification

Host0.24.0-dev.1 explicitly admits unchanged immutable Files0.1.0 metadata in
addition to the previous exact dev.0 admission, not a wildcard prerelease
exception. SSH's existing declared range admits dev.1. Published assets stay
immutable; the new extension requires the newer host. API0.1.x remains preview.

Controlled tests cover codecs/wire envelopes, provenance, correlated capture,
single-use transfer, revoked admission, bounded unresolved I/O, CAS/tombstones,
invalid storage and release-before-dispatch. The focused native fixture must
save, destroy page/backend memory, freshly read through production bootstrap,
open fresh usable shells without `clear`, preserve original identities, retire
the extension and join Quit. Native and portable verification are separate
from preparation tests; no platform or publication result follows from source.
