# ADR 0044: Migrate Snippets without changing terminal input

Status: accepted migration design for [#741](https://github.com/luizomf/omxterm/issues/741).

## Current distribution status

**[Stable OMXTerm 0.25.0 is published and Latest](https://github.com/luizomf/omxterm/releases/tag/v0.25.0).**
Its bundled default is the immutable Snippets `0.1.0` archive on Linux ARM64/x64,
macOS ARM64 and Windows ARM64. The official catalog offers `0.1.1` for deliberate
installation or update; it does not change the bundle or automatically update it.
Positively new packaged profiles get the removable
one-time default described below; existing users still choose installation and
keep their YAML and disabled/removed choices. Activation remains deliberate.
Windows x64 and unchanged 0.23.0 hosts retain built-in Snippets. Catalog and
local/offline archive routes remain in the [migration guide](../snippets-migration.md).

The maintainer accepted Windows ARM64's unresolved public-install failures and
missing graphical suite [for 0.25.0 only](#stable-0250-release-risk-decision).
Its strict network-silence test also remains failed. #741 stays open, and the
terminal-input rules below are unchanged. Stable 0.25.0 excludes Files 0.8
insertion/drop and #818's later palette presentation. Historical 0.24.0 evidence
remains below.

## Historical preview checkpoints

The following records the earlier preview deliveries, not today's stable
publication status. Exact host/archive identities, original receipts and
qualification limits remain in the linked guides.

Linux ARM64 migration is available in the published OMXTerm `0.24.0-dev.11` /
Snippets `0.1.0` preview pair. The compatible package was published and download-verified
before the host; matching exact-package qualification and full Linux package
verification are recorded in the [migration guide](../snippets-migration.md#preview-coverage-and-remaining-platforms)
and linked release notes, with their input/rendering limits. Source includes
activation-scoped catalog paging, a declared own-view semantic-input capability,
separately buildable package/UI and the compatibility entry point described in
[the specification](../spec.md). The macOS ARM64 source transition selects that
same optional implementation and has passed bounded nine-scenario native
qualification. The subsequent exact-DMG nine-scenario campaign and separate FULL
macOS package verifier passed. The immutable, non-Latest macOS ARM64 host
`0.24.0-dev.16` is now published with the unchanged Snippets `0.1.0` archive
verified publicly before host publication. That catalog promotion offered the
same immutable Snippets entry on `darwin-arm64` and `linux-arm64`, preserving
Files/SSH metadata and the [local/offline archive route](../snippets-migration.md#macos-arm64-published-preview).
Complete candidate review, integration and exact public catalog readback are done;
a separate bounded macOS packaged public-HTTPS checkpoint passed. Its
[delivery evidence and limits](../snippets-migration.md#macos-arm64-catalog-delivery)
remain distinct from public byte verification and the earlier exact-DMG/FULL
passes, which were not rerun. No broader platform or new Files/SSH qualification
is implied.
At these preview publication checkpoints, stable `0.23.0` remained Latest.
The published Linux x64 `0.24.0-dev.30` preview
selects the optional tool. Its prepublication [exact-AppImage checkpoint](../snippets-migration.md#linux-x64-exact-appimage-checkpoint)
passed the shared ten checks and controlled visible-preview inspection, with
separate stock FULL modes and explicit evidence/diagnostic limits. Catalog
promotion and endpoint readback were followed by a separate bounded [public-HTTPS
checkpoint](../snippets-migration.md#linux-x64-public-catalog-checkpoint) on that
published pair. The separate [Windows ARM64 dev.36 preview](../snippets-migration.md#windows-arm64-published-preview-and-catalog-candidate)
is published after fresh full portable, exact staged ten-check and separate FULL
NSIS gates; its installed public-HTTPS checkpoint remains pending at this revision.
Older Windows hosts and Windows x64 retain built-in Snippets.
Remaining platform gates and #741 stay open; no stable extension SDK is established.

## Context

Files and SSH Connect now share the Auxiliary Panel. Snippets should become an
optional, separately installed tool using that same panel, preserving the YAML
v1 catalog, search, exact text, preview, Insert/Run intent, localization and
keyboard behavior. Merely moving the sidebar to a web page would lose the
captured-target and gesture guarantees currently owned by the terminal renderer.

There is also a platform prerequisite: application extension composition admits
Linux ARM64/x64, macOS ARM64 and Windows ARM64 source (`startApplicationExtensions`).
The bounded [Windows ARM64 source-composition checkpoint](../windows-arm64-extension-composition.md#evidence-boundary)
passed with built-in Snippets retained. A separate [unpacked-package inspection](../windows-arm64-extension-composition.md#packaged-runtime-checkpoint)
passed for runtime loading only; a later [packaged-GUI composition checkpoint](../windows-arm64-extension-composition.md#packaged-gui-composition-checkpoint)
exercised that retained package with a minimal local extension. A later separate
[exact-NSIS checkpoint](../windows-arm64-extension-composition.md#exact-nsis-installer-checkpoint)
passed on a new installer built from an independent copy. Windows ARM64 source
now selects optional Snippets; its separate bounded [ordinary source checkpoint](../snippets-migration.md#windows-arm64-source-transition)
passed on exact dev.33 source. Later dev.36 full portable and exact-package gates
passed separately; public-consumption qualification remains distinct and pending.
Earlier intermittent failures are not claimed fixed.
The delivered [macOS composition](../macos-extension-composition.md) prerequisite
did not select installed Snippets or change its starter kit. The subsequent source
transition reuses its ordinary production owners and the existing optional-Snippets
policy; its matching Snippets qualification passed separately. A Linux preview cannot replace the existing
feature on macOS or Windows. Published host and extension artifacts remain immutable.

## Decision

### Separate feature ownership from terminal authority

The Snippets package owns catalog loading/parsing, search, row rendering and
feature orchestration. Reuse the existing parser and behavioral tests rather
than create a new schema or a Commands tool. It is a trusted Node backend with
an isolated hosted page, installed through the existing package manager.

Core retains Surface lifetime, semantic input delivery, Protected Paste,
modal admission, focus handoff and held-gesture ownership. Do not expose a PTY
handle, terminal output, raw key injection or an arbitrary target selector to the
package. A single declared own-view semantic-input capability is sufficient:
request exact text for Insert, Run, or a read-only choice preview. Concrete wire
names are internal, not a stable SDK; the capability's behavior is fixed here.
The implemented `terminal.semanticInput.v1` request carries exact `text`, a
`title`, optional `description`, `intent` (`insert` or `run`) and a boolean
`preview`. It accepts no caller-supplied terminal target. A successful response
means the interaction finished while available, not that a preview was confirmed
or that Surface-owned paste completed.

The capability validates bounded text and intent, authenticates the current
sender/window/view/installation epoch and rejects stale or hidden views. Core
captures the selected live Surface before asynchronous admission or overlay work;
all later continuations retain that capture. If native-child delivery requires
an asynchronous bridge to the terminal renderer, carry a core-owned selection
revision and refuse a changed selection rather than capture its replacement.
A package cannot choose or reuse another view's capture. Harmless same-view
geometry refreshes preserve admission, while actual hiding or ownership loss
revokes it without hide/show revival. Registry reads for main/backend admission
share a read lease; they still refuse conflicting registry writers without retry. A request without a
live target does nothing and reports unavailability.

The preview uses a core-owned semantic-input dialog derived from the existing
preview, not a second extension modal system. Its title may describe the item;
its body is literal and read-only. Core supplies localized Insert, Run, Cancel
and unavailable-target controls. The extension chooses to request preview, not
when a confirmed payload is sent. Final Insert/Run intent overrides the row's
default exactly as today. Only one acceptance is possible. Target failure or
removal disables delivery permanently, even if a replacement pane appears.

Native child input must participate in the existing gesture owner: a row's Enter
activation, repeats and release cannot leak into the terminal after focus
handoff, including Kitty reporting. Modal overlay admission hides native child
content before showing the dialog. Cancel restores the initiating control if
still interactive, otherwise the visible panel search, otherwise the selected
terminal. Language changes do not rebuild controls, recapture targets or alter
text. Reuse the existing overlay/presentation owner rather than add a parallel
focus coordinator.

Retiring the extension revokes pending requests and cancels its unaccepted
preview. It does not end terminal sessions or roll back effects. Delivery already
accepted by a Surface remains Surface-owned, including Protected Paste; hiding,
disabling or uninstalling the tool does not redirect or replay it. Ending that
Surface stops remaining chunks and final Enter.

The independent Files terminal-drag source increment does not broaden this
semantic-input capability. It transports one main-owned captured row behind an
opaque single-use ticket, with synchronous core claim before asynchronous work.
The composed source consumer reuses #768's path quote/Protected Paste handoff
with the drop's synchronously captured pane/Surface and selection revision,
including the existing focus, native gesture and Mirror Typing owners. Core
consumes the original retained capture rather than capturing again when the
semantic command returns; stale or missing capture is unavailable, not permission
to retarget. Single-target tracked delivery adds no Enter. Source hide/retirement
revokes unaccepted work, while accepted Surface-owned input remains independent.
A transport ticket is never raw PTY authority. This source composition does not
qualify native input or a published host/archive pair. See the
[Files transport seam](../files-development-preview.md#terminal-drag-transport-source-increment).

### Catalog location and transport

Continue reading the user-owned `snippets.yaml` beside `config.json`, using the
same XDG/home resolution, bounded UTF-8 read, YAML 1.2 core rules, diagnostics and
exact-body validation. The trusted backend can read this file directly; a new
generic filesystem capability or a host-side Snippets catalog service would
retain unnecessary feature ownership in core. The backend environment must carry
the same configuration-root inputs as the host; verify this explicitly.

Read on every panel activation, not at application startup, not through a watcher
and not merely at first backend activation. A hidden or superseded activation
cannot publish late results. Keep query and scroll in memory through hiding;
replace old rows atomically after a successful, empty or failed read. Old rows
are inert while loading.

The existing catalog allows 512 entries, while backend protocol arrays permit
256 members and serialized messages have a separate byte budget. Do not lower
the catalog limit or pass the entire catalog through one backend response.
Transfer one immutable, activation-scoped snapshot in bounded pages, respecting
the protocol's conservative capture budget, actual encoded bytes and member
limits. Assemble the complete snapshot
before replacing rows; cancellation releases it and no page can mix snapshots.
Tests must include 512 entries, long bodies and JSON-escape expansion, not only
small examples. No truncation, normalization or automatic retry is permitted.

### Existing configuration and entry points

Keep `keybinds.toggleSnippets` and its current defaults as a compatibility entry
point. Do not invent an extension-shortcut framework. When the separately
installed tool is enabled, this command and its existing View menu/palette entry
activate or toggle the single Snippets companion view. They must not create a
second action or a second sidebar. Settings remains a no-op target, as today.
The companion panel's switcher, resize, focus, tab continuity and overlay rules
are shared with Files and SSH Connect.

After a platform's cutover, invoking this entry point without the package opens
Extensions management with a localized explanation that Snippets is optional;
it does not install, enable or execute package code automatically. A disabled
installation is shown as disabled rather than silently re-enabled. Failure to
load the extension remains visible without breaking terminal usability. Keep
configuration validation accepting existing bindings even when no package is
installed. Guidance must distinguish unavailable runtime from an absent package.

### Empty-panel access fallback

The accepted [#741 follow-up](https://github.com/luizomf/omxterm/issues/741#issuecomment-6613406531)
adds a narrow exception for the independent **Toggle Auxiliary Panel** action:
when genuinely empty and eligible, lazily open/reveal installed+enabled Snippets.
With opened tools, retain ordinary hide/reveal, even if Snippets is removed.
Windows x64 retains built-in compatibility, not an optional migration.

If unavailable, use the panel-local noninteractive status for about four seconds,
once per main application-process lifetime shared across its windows. No focus
theft, repeated notice/timer extension, Settings jump, native error modal or
implicit installation/enablement/network acquisition. Later deliberate
installation/enablement may make a new attempt succeed. Reuse generation/token
admission and revoke stale panel/tab/pane/modal/native-focus intent, including
native publication arriving after cancellation. Main uses the actual native
window blur and sends a fixed cancellation command to core, also fencing a
publication already in transit. A core DOM blur during owned child creation is
not native window focus loss. Close/dispose stays distinct from Hide/retain. The explicit Snippets entry point above and all action identities,
defaults and custom/null shortcuts are unchanged.

The access slice alone did not implement new-profile provisioning. The separate
accepted default below changes neither existing-user consent nor any platform
qualification gate/published artifact. Current observable details belong to
[the specification](../spec.md#window-and-session-behavior).

### Removable default for positively new packaged profiles

Use the simpler synchronous capture at the start of existing main, not a new
bootstrap/first-run framework. The bounded prior Linux source diagnostic supports
that seam but not a different import graph, packaged identity or other-platform
startup proof. Require absolute absent default userData/config/state roots before
readiness/profile getters, fail closed on ambiguous/linked/error/overridden paths,
then recheck actual identity before any kit/log/store work. Developer startup and
Windows x64 are excluded.

Consume one stable exclusive-created attempt witness outside the package store
before publication; partial/failed/uncertain attempts never silently replay. Install
only the exact pinned public Snippets0.1.0 bytes, enabled+dormant, through production
generation0 admission before the initial manager snapshot. Preserve all installed,
disabled and tombstoned entries; collection/uninstall cannot erase the attempt.
No startup catalog/download, backend/view activation, YAML creation or binding
reassignment. Manual installs/reinstalls retain ordinary explicit trust. This is
not upgrade consent, an automatic updater or another package store.

Bundle one exact external archive resource on existing optional targets, retain
other archive/receipt exclusions, reject missing/corrupt package inputs, and check
resource identity before package runtime probes. See [Default Snippets](../default-snippets.md)
for the fixed-input route, namespace/durability assumptions and remaining native,
modified-startup and exact-package gates. Source implementation does not waive
those gates or rewrite historical failures.

### Starter kit and user data

Keep existing catalogs untouched on install, upgrade, disable and uninstall.
There is no conversion, import copy, automatic rewrite or deletion. After a
platform's cutover, core stops creating a Snippets example in a fresh configuration
kit. The package distributes the same non-executing literal-block example and
explains how to create `snippets.yaml`; absence remains a clean empty state.
Do not change existing user files or silently create one just by opening the tool.
Unsupported platforms retain the current starter kit with their built-in feature.

### Transition and platform qualification

Deliver the capability and separately built Snippets package first, without
removing built-in access from any shipping platform. Development qualification
selects one implementation at a time; it must not register duplicate production
actions or compete for the panel. The package's separate action is withheld from production composition: the
existing `toggleSnippets` command is the sole Snippets menu/palette action.
Linux ARM64/x64 and macOS/Windows ARM64 source composition omit the built-in view and invoke the installed tool
through ordinary captured-target/token admission. Like Files and SSH Connect,
invocation closes the selected-visible companion; otherwise it opens or reveals
that tool. Close discards view state, while Hide/Escape and the independent panel
toggle retain it, as specified in ADR0039. Reopening a closed Snippets view rereads
the unchanged catalog with fresh query/scroll state. Missing or disabled
installations open the retained Settings Extensions page with localized guidance,
without execution. Runtime failures retain the management owner's distinct status.
Native qualification uses unchanged production composition, not source substitutions. Its archive still uses ordinary installation/trust.
Logical activity is transported separately from visibility: geometry updates and
overlay hiding do not reload the catalog or discard preview focus restoration.
The child receives committed language changes and explicit search/restore focus
intent through the existing native presentation owner.
The published Linux ARM64 preview does not complete #741; other-platform
migrations remain outstanding. The [migration guide](../snippets-migration.md)
identifies the exact public pair and explains explicit/local-archive installation,
unchanged user data and the remaining platform gates.

Cut over a platform only after the package is installable through the ordinary
extension-management path on that platform, the matching host/package pair is
qualified, and migration instructions are included. A catalog listing or an
archive build alone is insufficient. Existing profiles never gain implicit
installation consent from the presence or absence of an old catalog; the sole
one-time packaged-new-profile default is described above. Existing users choose
installation; until then their file remains intact and the old shortcut explains
how to regain the optional tool. Keep a local-archive installation path for
offline users and publish the compatible package before removing built-in access
in a distributed host.

Linux ARM64 is the first qualification target, not permission to drop Snippets
on other distributed platforms. Older Windows hosts and Windows x64 keep the
built-in experience. The published Windows ARM64 dev.36 preview selects the
optional package after its separate full portable, exact-stage and FULL NSIS
checkpoints; catalog promotion/readback and installed public consumption remain
separate pending milestones. The [migration guide](../snippets-migration.md#windows-arm64-published-preview-and-catalog-candidate)
is the current exact evidence boundary, not a claim about every admitted host.
Other targets retain the built-in experience until their extension infrastructure
and equivalent migration are qualified. This
transitional duplication must reuse parser/UI source where practical, not fork
behavior or establish two permanently maintained products. Full #741 completion
requires optional delivery on every supported host target; platform groundwork
and publication remain explicit prerequisites, not evidence inferred from Linux.

### Stable 0.24.0 release-risk decision

The maintainer selected stable 0.24.0 using the accepted exact-stage/local-archive
Windows ARM64 qualification and separately verified new stable NSIS bytes. The
additional installed public-HTTPS checkpoint remains unresolved after ordinary
failures and non-qualifying diagnostic observations. It is deferred as a host
publication blocker, not declared passed or removed from #741's completion work.
See the [migration disclosure](../snippets-migration.md#stable-0240-release-disposition).
No input invariant or failed observation is waived as successful; a catalog
listing remains distinct from demonstrated public consumption. Users depending
on the previous Windows ARM64 built-in experience may remain on 0.23.0.

### Stable 0.25.0 release-risk decision

On 2026-11-07 the maintainer lifted the previous hold and published the frozen
cut as immutable Latest after verifying all twelve draft/public assets. This
acceptance applies **only to 0.25.0**, including new-profile Snippets enrollment.

Windows ARM64's installer passed FULL verification and seven packaged profile
phases completed, but its graphical/default suite did not run. Earlier public-install
Snippets runs lost the controlled child, and one diagnostic saw an unexpected
prefix; application versus test cause remains unknown. The strict network-silence
test failed on system-proxy traffic also seen in an existing-empty control.
The maintainer accepted profile behavior separately from that failed oracle.

Linux behavior/package results and macOS package/profile/source graphical results
support the release. macOS exact-DMG/public-archive Insert, preview and acquisition
remain untested; that limit is accepted too. x64 stays build-only. The
[0.25.0 migration disclosure](../snippets-migration.md#stable-0250-release-disposition)
has the user-facing details. #741 remains open. Terminal-input rules and future
native-test isolation requirements are unchanged; the preceding 0.24.0 record
remains historical.

## Acceptance evidence

Use the current Snippets parser, panel, preview, target lifetime and Protected
Paste tests as the compatibility baseline. Exercise the production capability
seam with a test adapter, rather than bypassing admission to test helper methods.
Add coverage for:

- Exact literal text, Insert versus Run and preview override; no target,
  selection changes in transit, target failure/removal, no retargeting and
  exactly-once acceptance.
- Hidden/stale/foreign sender refusal, disable/update/uninstall and backend loss
  during loading or preview; accepted Surface-owned input and sessions survive.
- Native child Enter/repeat/release ownership, closing Escape, focus restoration,
  overlay exclusion and live en-US/pt-BR relabeling without changing drafts.
- Missing/invalid/maximum catalogs, bounded snapshot transfer, stale activation
  results and unchanged file bytes through management operations.
- Existing remapped shortcuts, absent/disabled package guidance, fresh starter
  kit behavior and exactly one panel/action implementation per selected mode.
- Real installation/activation/retirement on each cutover target, bound to exact
  host and archive identities, with native cleanup joined. Distinguish synthetic
  input and software rendering from physical-keyboard/default-GPU evidence.

Update the current-behavior specification, glossary and user guides when each
behavior actually ships. This ADR selects the migration architecture; it is not
a claim that the tests or platform prerequisites above have passed.

### macOS synthetic input observation

The macOS fixture uses Quartz session events and an independent, listen-only event
observer. Product-independent comparisons reproduced Electron keyUp omission after
prevented autorepeat. Release evidence therefore requires a tagged OS keyUp for the
actual application PID and observed session key state from held to released, not
`sendInputEvent`/`CGEventPost` return or a constant hardware-key-up query. Actual
child activation and prevented core repeat, exact PTY isolation and a fresh Enter
to the same session remain mandatory, parallel to Linux's XTest/XQueryKeymap route.
This explicitly adopts a synthetic observation contract, not a product input change
or a claim that Chromium consumed an event it omitted. Full ordinary
macOS nine-scenario source qualification passed on the exact host/archive pair
recorded in the [migration guide](../snippets-migration.md#macos-arm64-source-transition).
Minimal probes are not product qualification, and source qualification is not
published-host cutover.

## Consequences

A small core input capability and reusable semantic preview preserve terminal
safety without keeping the catalog or search feature in core. The main cost is
native-view gesture/selection coordination and cross-platform extension
qualification, not moving YAML files. Staged cutover avoids removing working
functionality from unsupported extension targets. It also makes the final
optional-feature outcome honest: a preparatory package is not a completed
migration.
