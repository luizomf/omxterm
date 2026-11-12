# Save layouts without restoring sessions

Status: Accepted (#673). Since #962 the extension needs host 0.27.0 or later and
runs on every platform that runs extensions.
[ADR 0047](0047-reopen-the-last-windows-at-startup.md) amends it: core now
reopens the last windows at startup and remembers them as they change, while
the extension declares it.

## Decision

One separately installed extension owns manual Save/Replace/Open/Forget policy
and one explicitly saved current-window layout with local-directory provenance.
The [developer notes](../saved-layout-development.md) describe observable bounds,
exclusions and retention. This narrows the old workspace proposal: no startup
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
Surface mounts. First selected-pane settlement remains host readiness; core
separately tracks layout mount settlement and, only when some panes couldn't
open, leaves one State Marks notice
([ADR 0050](0050-show-ongoing-states-as-quiet-state-marks.md)).

Pretransfer revocation has no window/shell effect. After transfer, extension
retirement cannot stop core terminals; ordinary pane/window/Quit lifetimes own
cancellation and actual native-exit barriers. No rollback kills healthy panes,
automatic retry recreates a closed pane, or extension pin follows core work.
Keyboard Open dispatches only after Enter release. Captured native/view focus
intent prevents delayed completion from raising a window over newer activity.

Main tracks reported-local, launch-local and home provenance. Invalidating OSC7
removes both a previous report and eligibility for launch fallback. Known SSH
and explicit commands are always home slots. No shell hooks are added; since
#972, macOS and Linux also read the shell process's cwd when a pane has no
usable report ([ADR 0013](0013-do-not-inject-shell-integration.md)). Directory validation does not prove locality or exclude OS mounts.

## Save layout from core

Saving also has a core entry, **Save Layout** (`saveLayout`, #1008), so a
window can be saved without opening the page. It's a fourth core-owned slot
([ADR 0018](0018-deliver-menu-refused-accelerators-in-main.md)), not a generic
extension action: the disposition in #669 still holds.

- **Target and capture point:** the focused terminal window when the entry
  runs. Main captures it with the same core capture the page uses.
- **Write:** main calls the extension's own backend, with no view, using the
  page's protocol: `read`, then `replace` at the revision it just read. The
  extension keeps validating and writing its one document, so this needs no
  extension change and works with every published Saved Layout.
- **Visibility:** File menu and Command Palette, not the context menu, only
  while the extension is installed and enabled and declares
  `terminal.captureLayout.v1` and `state.v1`. The page entry stays.
- **Collisions:** the standard checks; a custom binding already on the default
  combination keeps its key and `saveLayout` is unbound
  ([ADR 0018](0018-deliver-menu-refused-accelerators-in-main.md#explicit-entries-win-over-defaults)).
- **Disable, update, uninstall, owner loss:** the entry carries the issued
  generation, so any of these revokes a held entry before it reaches the
  backend, and every call is admitted against the enabled, selected version.
  A window closed mid-save cancels the capture and gets no result.
- **Unknown outcome:** never retried and never reported as saved. Success
  flashes one sentence, a refusal leaves a notice, and an uncertain write says
  it couldn't confirm the save
  ([ADR 0050](0050-show-ongoing-states-as-quiet-state-marks.md)).

## State adapter

A declaration-gated bootstrap `state.v1` adapter exposes `read()` and
`replace(expectedRevision, valueOrNull)` for one bounded JSON document per
validated extension ID, in a profile-owned sibling `extension-state` directory.
It reuses native leases, not installation transactions or stale-PID locks.
Private complete temp bytes are flushed/closed and renamed under the stable
exclusive lease, comparing revisions while locked. Each successful mutation
gets a fresh opaque revision; Forget writes an empty tombstone so A→B→A and
stale destructive requests remain detectable. Busy is a refusal, not a spin.

No lock spans renderer capture, dialogs or shell startup. An unknown
publication is never replayed; the page reads the saved state again and shows
it. Reads reject unsafe files and never repair or migrate data. Disable/update/uninstall preserve user state. Forget
removes only the active snapshot; interrupted-write temp copies may remain.
No sweeper or forensic-erasure guarantee is introduced.

## Verification

Controlled tests cover codecs/wire envelopes, provenance, correlated capture,
single-use transfer, revoked admission, bounded unresolved I/O, CAS/tombstones,
invalid storage and release-before-dispatch. A packaged smoke installs the
archive on a published host, saves a window with a reported folder, restarts the
app, opens the layout and checks where the restored shell started.
