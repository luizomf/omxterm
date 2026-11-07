# Files development preview implementation

Files is a separately installed Linux and macOS ARM64 development preview
([#723](https://github.com/luizomf/omxterm/issues/723),
[#728](https://github.com/luizomf/omxterm/issues/728)), not a stable extension SDK.
The official catalogs select Files0.6.0 for Linux ARM64 (host `>=0.24.0-dev.21`)
and Files0.7.0 for macOS ARM64 (host `>=0.25.0-dev.10`), both API `0.1.x`.
The bounded [Files0.7 macOS public-catalog checkpoint](#files07-macos-public-catalog-checkpoint)
passed separately from its local filesystem checkpoint. The earlier bounded
[Linux](#files-060-linux-public-catalog-checkpoint) and
[macOS](#files-060-macos-public-catalog-checkpoint) public-catalog checkpoints
passed with locally built hosts; they do not establish public stable-host download.
A separate [Linux ARM64 Files0.7 link-first preview](#files07-linux-public-link-checkpoint)
now pairs the published dev.19 host with Files0.7; its actual public Settings-link
checkpoint passed with fresh anonymous downloads. A separate [macOS exact-pair
local checkpoint](#files07-macos-stable-local-checkpoint) passed with the published
stable0.25.0 DMG and Files0.7 archive. Current source prepares **Files0.8.0**, requiring host
`>=0.25.0-dev.20` / API `0.1.x` for the integrated protected path-insertion/drop
consumer. This is archive preparation only, not an exact shipping-pair
qualification or publication; see [the current archive contract](#concrete-consumer).

The earlier Linux catalog offered
[Files 0.4.0](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.4.0),
requiring host `>=0.24.0-dev.8`. Its exact controlled-qualified pair uses the already-public
[host 0.24.0-dev.11](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11)
AppImage, not a new host build. The archive and both original sidecars were
published and anonymously byte-verified on 2026-10-30. The separate actual
public-HTTPS consumption checkpoint after catalog integration also passed;
it is distinct from controlled transport and release downloads. See
[historical qualification](#files-040-distribution-and-controlled-qualification).

The historical published [Files 0.1.0 archive](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.1.0)
works with the separately published [host dev.9](https://github.com/luizomf/omxterm/releases/tag/v0.23.0-dev.9)
and [stable host 0.23.0](https://github.com/luizomf/omxterm/releases/tag/v0.23.0).
Public catalog/archive installation passed on both exact extracted AppImages,
including Files operations/conflicts, reinstall/management, same-PTY continuity
and joined Quit. Input and consent were fixture-controlled; extraction does not
qualify FUSE/helper installation. See the stable release notes for its separate
package checks and [below](#build-and-evidence-boundary) for other evidence limits.

The [foundation's exact-host exception](extension-installation-foundation.md#archive-contract)
admits unchanged Files 0.1.0 on hosts 0.24.0-dev.0 through dev.5 without
broadening its manifest range or replacing published bytes. The
[Saved Layout delivery](https://github.com/luizomf/omxterm/issues/673#issuecomment-6495927726)
records the unchanged archive's lifecycle check on dev.1. Admission alone is not package or Files lifecycle qualification; earlier host evidence does
not qualify every admitted version.

## Files 0.5.0 macOS controlled qualification

The separately published **Files 0.5.0 — ARM64 preview** requires host
`>=0.24.0-dev.21` and API `0.1.x`. It includes the corrected raw-path forwarding
for optional host trash. It is a separate archive identity, not a replacement or
new qualification of immutable Files0.4.0. At that checkpoint the legacy catalog
remained Linux-only0.4.0; macOS published dev.21 used the separately published
link-first pair described below. Published dev.26 selected a separate macOS0.5
catalog; its
[public-catalog checkpoint](#macos-catalog-distribution) passed separately.

The opt-in [exact-DMG Files fixture](../test/fixtures/files-dmg.md) passed the
bounded consumer checkpoint against the retained compatible dev.21 host.
Current source's dev.22 metadata does not relabel or require rebuilding those
host bytes. The fixture uses local captured-byte trust, actual installed Files
operations, one-entry Trash recovery, retained companion state, source-terminal
closure with a distinct surviving PTY, management and an active Files backend
at normal Quit. It reuses existing package identity and process ownership tools;
there is no new product service or native-cancellation promise.

On 2026-10-31, ordinary-user macOS27.0.1 ARM64 qualification passed all eleven
scenario checks using source `a343704c0794cb913fba9ad312e90e5f6daa4bb1`, the
retained dev.21 DMG SHA-256
`2d5767510034a8059996762ab72d821c1e139cd0968859e9b15d5d74d79378c1`
(129,721,647 bytes), and new Files0.5 archive SHA-256
`82bd4bfe6f5a3ae7c22642741718dea94543f92b636a50b357c13d3c4be6aa18`
(13,200 bytes). Original archive sidecars retain their supplied-source identity,
intended dev.22 host and `qualification.status: not-run`; this is separate evidence.

The installed page performed real create/move/conflict, cancel/fresh-confirm
permanent deletion and native trash. One owned trashed entry was verified by
exact directory/device/inode/content and no-clobber restored, with destination
absence confirmed. The isolated-HOME lookup preflight resolved the same accessible
user Trash directory as ordinary HOME, on the fixture device. Companion state,
editor draft/caret and backend survived hiding and source-terminal closure while
a distinct terminal remained usable. Reinstall, Disable, dormant Enable and
Uninstall passed. A third explicit consent/activation left Files active at normal
Quit; all three backend exit/close events, main streams and shell exits joined.

Both WebContents captures were inspected: Files operation completion and the
final surviving terminal's actual painted shell text/prompt. These are not full
OS-compositor captures. A separate read-only audit verified 1,233 source entries,
630 copied-bundle entries, the complete ad-hoc seal, dependency/artifact identities,
restored entry, absent owned mounts and no current scope processes. Test-only
transient controller/supervisor bundles are bound by source/toolchain inputs,
not separately retained executed-output hashes. Current absence is not a
historical escaped-descendant census.

One complete independent review found two fixture/test defects, both corrected:
hidden cancelled confirmation text could satisfy a fresh-confirmation gate, and
new tests assumed POSIX-only APIs/modes on Windows. Final full formatting, lint,
typecheck and 4,450 headless tests passed (66 skipped). This checkpoint uses
synthetic Chromium input and controlled native consent, not physical dialogs,
Finder/Gatekeeper/notarization, macOS12, blocked native-I/O cancellation,
read-only/trash-unavailable volumes, unexpected backend crash or surviving-browser
main-death exclusion. It does not repeat the primitive matrix or establish public
installation. The later public checkpoint below is separate; Linux0.4 stays
unchanged. Link-first delivery is not a catalog promotion.

### macOS link-first distribution

On 2026-10-31, [host dev.21](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.21)
and [Files0.5](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.5.0)
were published as separate immutable, non-Latest prereleases. All five original
assets passed draft and anonymous public size/SHA-256 readback; Files was
published and anonymously verified before the host. Stable0.23.0 remains Latest.
The pair uses the unchanged DMG and archive identified above, not a rebuild for
current dev.22 metadata. Host tag `cd01e9cf775aab46df58dd41da8398b2058e2e4e`
differs from actual build `8b9eab97a82d6ea01982fb79062b5642a10e2b7a` only in
six factual documentation files; the Files tag retains original source `a343704`.
Original notes and build-time receipts remain unchanged, not retrofitted with
the subsequent public checkpoint.

On 2026-10-31, that exact retained DMG separately passed `hdiutil verify` and the
unchanged ordinary **FULL** package verifier using matching source `8b9eab9`
(dev.21). A fresh readonly-mounted copy matched all 630 staged/mounted/copied
bundle entries and was detached before execution. One FULL run on the sealed copy
established four startup events, real PTY/Terminal Surface cell-size response and
launch-data non-disclosure; staged byte equality replaced a duplicate same-byte
FULL launch. Actual main exit/stream close and process-group absence passed.
Independent read-only audit verified all 18 stage joins, 1,224 source entries,
unchanged dependencies/build/artifact/bundle, complete ad-hoc seal, absent image
and startup profile, and current observed-process absence. The verifier's bounded
termination is distinct from the prior Files normal-Quit checkpoint; neither is a
historical escaped-descendant census. Earlier inspection-only receipts remain
inspection-only. No rebuild or public acquisition occurred in this FULL run.

The separate [public-link checkpoint](../test/fixtures/files-dmg.md#public-link-mode)
then passed all six checks on ordinary-user macOS27.0.1 ARM64 using fixture source
`ad6adc01dfe7cc4337f59e253e1b72c3c77d303b` and five fresh anonymous downloads.
The exact DMG-derived detached app performed three real Settings HTTPS-link
installations with exact manifest/digest consent, dormant install, create/move/
conflict, reinstall retirement, Disable/Enable/Uninstall, same-PTY/Surface
continuity and third-activation normal Quit. Destination bytes and exact source
`ENOENT` established the successful move. All three backend exit/close outcomes
and main exit/close were `0`/null; shell exit and all 17 direct stages joined.
No fixture CA, transport interception or local-file installation substituted for
production HTTPS. Earlier Trash recovery, source-terminal closure, retained draft
and primitive matrices were reused, not replayed.

Independent read-only audit verified 1,235 source entries, 630 bundle entries,
source/toolchain/dependency/public-byte identities, complete ad-hoc seal, and
current absence of owned images/processes. Transient fixture output is bound by
source/toolchain inputs, not a separately retained executed-output hash; this is
not a historical escaped-descendant census. The inspected terminal capture shows
actual before/after shell text and prompt. **The Files capture is stale**, showing
an earlier operation-in-progress state, and is excluded as final-move visual
proof; independent filesystem assertions passed. Capture follow-up is queued in
[#670](https://github.com/luizomf/omxterm/issues/670#issuecomment-6536963599).
Synthetic Chromium input, controlled native consent and WebContents captures do
not qualify physical input, Finder/Gatekeeper/notarization, macOS12, blocked
native-I/O cancellation or surviving-browser main-death exclusion.

At that link-first checkpoint the legacy v1 catalog remained unchanged, preserving
Linux0.4/dev.11 and the then-current SSH/Snippets offers. Its one-release-per-ID
format cannot independently select Linux0.4
and macOS0.5 within the same document. On host dev.21, macOS users can paste the
[Files0.5 archive URL](https://github.com/luizomf/omxterm/releases/download/ext-files-v0.5.0/files-0.5.0-a343704c0794.omxext)
into Settings → Extensions → **HTTPS archive link**, choose **Install from link**
and compare the displayed digest to the release checksum. Local downloaded archive
installation is also available; Browse still shows an incompatible Linux Files
offer. Direct-link trust shows captured bytes/digest but is not catalog-bound
Official selection. No macOS catalog discovery, automatic update, new host build
or qualification of other platforms is implied.

## Concrete consumer

`extensions/files` is separately built, not imported into application main or the
terminal renderer. Maintainers run `node scripts/build-files-extension.mjs` to
produce `dist/extensions/files-0.8.0.omxext`. This build needs Python 3's ZIP
writer and the locked esbuild tool; users receive the precompiled archive and do
not run Python/npm or compilation to install it. An existing destination is not
overwritten. The archive includes its MIT license. Version and compatibility come from
`extensions/files/extension.json`. Current Files0.8.0 declares
`>=0.25.0-dev.20` / API `0.1.x` and `terminal.insertPath.v1`. The integrated
dev.20 host owns the shared protected handoff for Insert path/Shift+Enter and
eligible focused-pane terminal drop. Dev.19 and earlier hosts are refused by
archive admission; ordinary semver admits dev.20 and later dev.N in the same
0.25.0 family, plus stable0.25.0. Existing development bridges do not bypass
this minimum or admit other prerelease families. Local/link admission checks
host/API and capability grammar, not target/platform qualification.

This preparation reuses the existing builder and consumer, without new input or
focus routes. Headless archive admission/content checks do not qualify a shipping
host/archive pair. Prior bounded Linux native UI evidence exercised production
Files/core/Surface modules with inert session/backend/package dependencies, not
a real PTY, receiving program or package store. Its observed timeout was the
Surface receipt timeout, not the ten-second transport deadline (covered
headlessly). Exact Files0.8 host/archive qualification and publication remain
separate; historical failed or restricted native work is not relabeled or replayed.

Published Files0.7.0 declares
`>=0.25.0-dev.10` / API `0.1.x` as a conservative compatibility floor.
It packages reported-directory guidance, loaded-entry filtering/keyboard focus,
composing-Escape draft preservation and confirmed directory-to-directory moves,
not Files-to-terminal insertion/drop. Its bounded
[Linux exact-package checkpoint](#files07-linux-packaged-checkpoint) passed,
followed by separate [Linux publication and actual public-link consumption](#files07-linux-public-link-checkpoint).
A bounded macOS Files0.7 local exact-pair checkpoint is recorded separately;
broader qualification remains separate.

Files0.8 is a new archive identity, not permission to replace published Files0.7
or relabel its dev.19 qualification. Dev.10 does not support insertion. Existing
host focus-intent, action-time reported-directory, no-clobber move and trash
services remain required. Published Files0.6.0 retains minimum host
0.24.0-dev.21 and its original archive and receipts. Historical0.4.0 requires
`0.24.0-dev.8` or later for the hosted-language subscription. Earlier public
catalog checkpoints used the original Linux0.4.0 and macOS0.5.0 archives.
The Linux Files0.6 catalog entry binds its immutable bytes; the macOS catalog
selects the separately published Files0.7 bytes. Building source alone does not update the public catalog.
Current source removes the Files page's redundant visible identity in favor of
the host's panel header, while retaining a named child region. Published
Files0.4.0/0.5.0 archives keep their original heading, including on a newer host.
The local macOS and Linux ARM64 host0.24.0/Files0.6 exact-pair checkpoints
passed with controlled consent and synthetic input. The original Files0.6 archive,
checksum and receipt were separately published and byte-verified; the receipt
remains `not-run`. The separately passed [Linux](#files-060-linux-public-catalog-checkpoint)
and [macOS](#files-060-macos-public-catalog-checkpoint) public-catalog checkpoints
are not consequences of local pairing or asset publication. The hosted-view diagnostic
in [#746](https://github.com/luizomf/omxterm/issues/746) remains unexplained.
Never replace or republish existing versioned bytes.

Files 0.4.0 retains compact shared controls and a read-only host appearance
subscription. Its base surface reveals the parent window's theme tint; text,
focus and control borders remain visible. Live theme/opacity updates do not
recreate the listing or discard operation drafts. Native blur remains a host
and compositor effect, not child CSS. The separately bundled stylesheet embeds
its shared tokens and requires no remote resources.
Files follows the host's explicit `en-US` / `pt-BR` interface language. Live
changes relabel retained controls, tree descriptions, menus, operation editors,
confirmation text and visible notices without listing again, replaying a mutation
or replacing an editor. Focus, caret, drafts, selected paths and confirmation tokens
remain unchanged. File names, paths and technical backend error codes remain
literal; the package name stays Files. This reuses the hosted-language subscription,
not a new localization SDK. Existing #622 attribution and third-party notices
elsewhere in the application remain unchanged.

The current Files page presents expandable folders and nested file rows. Click
an entry to select it; use its disclosure arrow, double-click a folder, or use
Right/Left to expand/collapse. Up/Down and Home/End move through visible rows;
Enter/Space toggles a folder. Symbolic links remain labeled, not implicitly
expanded. **Open directory** changes the browsing root. The source toolbar uses
quiet icons for Home, Up, Refresh, New folder and Actions; the address field has
an adjacent Go icon. Each has a localized accessible name and a visible,
explanatory tooltip on hover or focus. Tooltip areas over other interactive
controls do not intercept pointer input; unobstructed areas remain hoverable.
Tooltips follow notice and language changes, and hide while their control is
scrolled out of view. Go also works by pressing Enter in the
address field; the other toolbar buttons have no assigned shortcuts. Up is
disabled but remains focusable at the filesystem root, so reaching root does not
drop focus. Controls requiring a browsing root are disabled until one is
available. New folder is also disabled during a mutation; Refresh remains
available while listings load. Older immutable Files archives do not acquire
these changes from a host update.

Current source offers **Filter loaded entries** before the tree. The host's
explicit focus intent puts focus there when opening Files; Tab enters the tree,
Shift+Tab returns through the address and toolbar. Typing filters names already
loaded in expanded folders; it is not a recursive filesystem search and does not
read collapsed folders. Matching descendants retain their ancestor rows, and
loading, error and truncation rows remain visible. Dotfile visibility still
applies first. The query survives navigation and Hide/reveal in the same view;
Close/new view resets it. Filtering does not discard expansions or an address
draft. Changing the query does not issue a read or mutate files; filtering away
a selection clears it without silently selecting a replacement. A no-match
message refers only to visible loaded entries and also notes hidden dotfiles
when applicable. Empty trees remain in the Tab order; if rows arrive while the
tree itself has focus, Down/Up moves explicitly to the first/last row. Listing
completion does not move focus out of the filter. An unsubmitted address draft
survives listing updates and initial Home loading; an explicit new navigation
replaces an earlier draft unless it was edited during the request.

Focusing a tree row selects that row, so its subsequent Actions and keyboard
operations share an explicit target. Composing and other modified tree gestures
are left to their normal owners, apart from Shift+F10. The Rename / move menu
item identifies F2. Cancel returns focus to the control or row that opened an
editor when still available,
otherwise Actions; a delayed permanent-delete confirmation does not take focus
from a user who has moved elsewhere. If a filtered-away selection leaves focus
on an unselected fallback row, invoking F2 or its context menu first selects
that row as the explicit target. Host Escape ownership and retained drafts
remain as described below. These UI changes are included in the published Linux
ARM64 Files0.7 preview; they do not modify immutable Files0.6.

Current source offers **Insert path into terminal** in the selection menu,
with its `Shift+Enter` shortcut shown and exposed to assistive technology. The
shortcut acts on the focused row, does not intercept editing or composition,
and suppresses repeats. The single selected file, folder or link is sent
immediately as a lexical path; no backend lookup or added Enter occurs. The
app-owned child preload privately stamps its current selection observation and
visible-admission generation when the request is invoked. Main checks those
stamps at receipt and commit, and core independently refuses a changed selection
before capturing the Surface. Missing or stale observations fail closed; this
does not imply global cross-process event ordering. The host uses the same
quoting and Protected Paste as dropped paths. The captured Surface owns accepted
delivery even if the panel retires. Completion means every chunk was passed by
the captured live local session to node-pty without synchronous error, not that
the OS or receiving program consumed it. Once delivery completes, focus returns
only if that Surface is still the current target and the request remains active.
Unavailable, busy, invalid, incomplete and unknown outcomes are explained; a
partial or unknown result should be inspected before retrying. An approved
unbracketed path containing control characters can affect the receiving program.
Paths containing a bracketed-paste terminator are refused, not rewritten. A
successful handoff targets terminal input rather than an open search field; a
newer companion selection or pending overlay suppresses the focus return.
This uses the new `terminal.insertPath.v1` capability: older hosts reject it,
and published Files0.6/0.7 archives do not acquire this source behavior.

In current source, **Actions… → Show dotfiles (names starting with .)** is a
checked menu item, off by default. On both Linux and macOS, it hides dot-prefixed
entry names and their descendants relative to the current browsing root. It does
not interpret macOS `UF_HIDDEN` or other Finder visibility metadata, or the
`.hidden` name lists supported by some Linux desktops. A directly entered root
inside a dot-prefixed path remains usable, with the same filter applied to its
children. Open Actions with Tab and Enter, then use the menu's arrow keys (or
End) and Enter to change the setting. In short views, keyboard navigation
scrolls within the menu to reveal the focused item with room for its focus
outline. Child viewport resizing rechecks the still-focused item without moving
focus. An item taller than the menu starts at its top and leaves Page Up/Down
available for scrolling. The menu also shows the view-local shortcut: `Ctrl+H`
on Linux or `Cmd+Shift+.` on macOS. It works when the visible Files browsing page
or menu has focus and a root is available; it does not claim
text inputs, textareas, selects, editable content, IME composition, operation
editors, pending confirmations or mutations. Key repeats do not toggle again.
Core-owned/remappable shortcuts get first refusal and may take precedence. The
macOS gesture requires the physical `Period` key reporting `.` or `>` with the
exact modifiers; other layouts or native menu routing may need the menu fallback.
Native physical-keyboard behavior is not established by headless tests. Hiding
and revealing the panel and navigating retain the choice in the view; Close and
a new view reset it. This is not a persisted preference or a filesystem
security boundary.

Filtering is a view projection; toggling it does not mutate files, start a new
read, or replace an unsubmitted address draft. It preserves expanded subtrees and
pending listing work. A hidden selection is cleared; keyboard focus falls back to
the nearest visible ancestor or an available row/tree, without selecting a new
operation target. An existing editor keeps its
captured target. Counts describe visible rows, while loading, errors and the
5,000-entry per-folder snapshot/truncation limits still apply to the underlying
listing. Entries beyond that limit remain unavailable even when many of the
captured entries are filtered. A quiet in-flow hint says when loaded dotfiles
are actually concealed; an empty visible result says **No visible entries**,
not that the folder is empty. Folder hints and the underlying truncation/error
report remain separate. Existing released Files archives do not acquire this behavior from a host update.

**Actions…** exposes operations for the selection; right-click an item or blank
listing space for actions at that location. Shift+F10/the context-menu key opens
the same menu from a focused row, and F2 opens Rename / move. Menus support arrow
navigation; Tab or clicking outside dismisses a menu. In the companion panel,
a fresh non-composing Escape is owned by the host and hides the entire panel,
closing transient menus but retaining operation drafts. A composing Escape, and
an unowned Escape repeat, stay with the focused control. Current source does
not close an operation editor or menu for that event, so an unsubmitted draft
remains. This does not establish that a particular OS or IME emits a composing
Escape. The published Linux ARM64 Files0.7 archive includes this editor/menu
handling; immutable Files0.6 retains its earlier behavior. Source inclusion and
the bounded Linux packaged/public-link checkpoints do not establish
physical-keyboard or native IME delivery, or broad macOS/Windows/x64 Files0.7
qualification. Use **Cancel** to discard an editor without hiding Files. New
file/folder uses the targeted folder (or a targeted file's parent); background
actions use the browsing root. Permanent deletion
still requires explicit confirmation. Editors keep captured paths even if the
selection or browsing root changes.

Current source also lets one drag a single Files row onto another directory row.
The highlighted destination and an in-view message distinguish valid and invalid
locations; a native/external file drag is not accepted as an internal entry. No
local path is placed in the drag payload. Keyboard users can select the source,
open its context menu (Shift+F10), choose **Move to folder…** and enter an
absolute destination folder. Both routes show the fixed source and folder and
require an explicit **Move**; Cancel is initially focused when appropriate.
Changing the selection or navigation cannot retarget that confirmation.

Same-directory drops and moving a directory into itself or its descendants are
refused. A final symbolic-link row is not a destination folder; a symbolic-link
source is moved as the link, not its referent. Ancestor paths are resolved before
checking the relationship. At preparation, the backend records the source and
folder identities; a one-shot confirmation rechecks them before using the existing
no-replace move. This prevents ordinary stale-confirmation retargeting, not
hostile same-user filesystem races between checking and the native rename.
Destination collisions never overwrite; cross-volume moves fail without copying
or deleting. Permission, missing, unsupported and uncertain outcomes are reported;
a failed or uncertain move is not retried automatically. Refresh to inspect an
unknown outcome. This workflow is included in the published Linux ARM64 Files0.7
preview; it does not insert a path into the terminal or change immutable Files0.6.

Successful creation, move, trash and deletion automatically refresh the current
root and surviving expanded folders, preserving selection where possible. A late
mutation result never navigates back to its old root. Collapsing drops collapsed
descendants; refresh errors remain visible rather than implying rollback or retrying
the mutation. Manual Refresh remains available for external changes. Listings
are read sequentially, including pagination, and obsolete cursors are closed;
there are no filesystem watchers or polling. Source 0.4.0 is a new archive
identity, not a replacement of retained 0.2.0/0.3.0 or published 0.1.0 bytes.

The builder also writes `<archive>.sha256` and `<archive>.json`, refusing to
replace any of the three outputs. The JSON binds the final archive size/digest,
manifest, source commit, lockfile digest and Node/esbuild/Python versions. From a
Git checkout, commit changes first: the builder requires a clean source tree.
For an exported source tree, supply the original full commit as the second
argument after the output filename; the receipt labels it `supplied-commit`,
not a locally verified Git identity. Maintainers must verify that transport
against the commit. The optional third builder argument selects the intended qualification target
(`linux-arm64`, the preserved default, or explicit `darwin-arm64`); it is never
inferred from the builder OS or used as a manifest platform declaration.
A build receipt records the source host version/intended target with
`qualification.status: not-run`; it is not native or packaged qualification.
Keep actual test evidence separately, bound to these exact artifact hashes.

Application packaging excludes separate archives and their default output
folder, including when Files was built before packaging. The packaged Linux
ARM64 verifier checks required runtime/preload/dependency resources, compares
built resource bytes and exercises actual packaged Node-mode store/lease/move
loading plus bootstrap missing-IPC refusal. This headless check does not activate
Files or establish its GUI/lifecycle behavior. See the
[preview preparation procedure](release.md#files-preview-preparation).

The backend lists directories using `opendir` and sequential `lstat`, with a
5,000-entry visit limit and explicit truncation. Replies contain at most100 rows,
with at most eight active backend invocations; snapshots/cursors are ephemeral,
not filesystem watchers. At most eight completed snapshots and eight deletion
confirmations and eight directory-move confirmations are retained. At capacity,
a new request expires the oldest retained token of that kind rather than allowing
abandoned views to reserve capacity forever. In-flight
reads still count toward the limit and are never evicted. Expired cursors require
an explicit refresh; expired confirmations require fresh confirmation and can never
be rebound to a new entry. No timers, polling or automatic mutation retry are added.
Links are labeled as links. Home and explicit absolute
local paths are supported. Exclusive file creation and nonrecursive folder
creation never overwrite an existing entry. Rename/move uses the host-provided
async no-replace primitive, not a check-then-rename or copy/delete fallback.

Permanent deletion requires a separately issued, one-shot confirmation token
bound to the captured entry path/device/inode. This is protection against ordinary
UI retargeting, not a hostile same-user filesystem race sandbox. Symlink entries
are removed/moved without following their targets. Recursive deletion may fail
after partial effects and is then outcome-unknown. Linux trash invokes the OS
`/usr/bin/gio trash -- <literal-path>` facility asynchronously with no shell, an
eight-second timeout and bounded output; unavailable or failed trash never falls
back to permanent deletion. macOS ARM64 host source now supplies the optional
`files.trash` service through Foundation `NSFileManager` in the existing owned
Node child's native worker pool. The OS chooses the Trash destination; there is
no Finder automation, main-process RPC or manually managed Trash directory.
Dispatched trash failure is conservatively unknown on both platforms. No failed
or uncertain mutation is retried automatically.

The macOS service rejects root, trailing separators, empty and dot path components
instead of resolving final symlink referents. It passes a literal filesystem URL
to the OS, never shell/script text. Pre-aborted calls refuse before dispatch;
after dispatch the promise retains actual worker completion. Foundation offers
no cancellation/timeout parameter: the existing runtime's ten-second request
deadline and owned child retirement apply, not the Linux command's eight-second
timeout or a rollback promise. Fixed errors exclude native text and private paths;
the host wrapper discards the native resulting Trash path. Implementation alone
does not establish symlink/volume semantics, native or package qualification,
macOS Files lifecycle, archive/catalog admission or distribution. Current backend
source preserves the original request spelling for the optional host hook so
normalization cannot bypass its rejection. Historical Files0.4 archive bytes
retain their earlier normalization behavior; a future macOS-capable archive must
include this correction, not inherit a qualification claim from the host alone.

## Terminal drag transport source increment

Current source composes #774's path-free transport with #768's protected path
handoff. This is **source behavior, not native qualification or publication**.
Published Files0.6/0.7 bytes remain unchanged; new source needs
a new archive version and a host supporting `terminal.insertPath.v1`.

Drag one Files row over the visible terminal area of the selected tab's focused,
live pane. Only there, a localized, bounded **Drop to insert path (not run)**
candidate and copy cursor appear. Chrome, tabs, other panes, panels, search
controls, Settings, overlays and unavailable native presentations are inert.
Candidate feedback checks MIME/area only, not authorization. Native files,
tab/text/URI mixtures and forged, expired or replayed tickets never fall through
to ordinary native-file insertion. The keyboard Insert path/Shift+Enter action
remains available; confirmed internal directory moves remain separate.

`createFilesTerminalDrag` owns one ten-second gesture/claim per actual window.
The app-owned child preload registers synchronously at row `dragstart`; main
authenticates the actual child main frame, selected visible view, installation
epoch and focused owner. Registration is available only for installed Files
companion composition with the declared path capability and protected consumer.
No backend, filesystem or store work runs inside synchronous IPC. Main retains
the literal bounded absolute path/kind; DataTransfer contains only the internal
move token and distinct opaque terminal ticket. The source offers copyMove after
registration; an eligible internal directory target still selects move and
requires the existing fixed-source/folder confirmation and no-clobber backend.
Spaces and quotes are preserved. C0/C1 controls, including line breaks and paste
delimiters, are refused with a localized Files notice, not rewritten.

Core captures the exact pane, Surface, selection revision and current DOM focus
synchronously at drop, then claims the ticket plus matching internal token before
any await. Canceled/internal-move dragend revokes only an unclaimed gesture.
A completed native copy leaves the original ticket within its existing deadline
for the core claim, because that message can reach main after child dragend.
It never extends the deadline or authorizes input by itself. Hide,
retirement, epoch/package loss, window blur/hide/minimize/loss and timeout revoke
both phases without hide/reveal revival. The shared main path formatter and
installation admission use the captured owner/revision; a private ticket binds
the returning semantic request to the original renderer capture. Missing,
consumed or stale captures cannot select a successor Surface. Changed selection,
DOM focus, overlays or blocked presentation before admission refuse delivery.

The Surface's tracked Protected Paste stops Mirror Typing before single-target
delivery, uses current bracketed mode and adds no Enter. The same native gesture
owner preserves keyboard Insert's held repeats/release. Accepted Surface-owned
work may finish after source retirement; ending the Surface stops its remaining
chunks. Files receives localized accepted/refused/incomplete/unknown notices
while still visible. A successful still-current capture returns focus to that
pane's terminal input through the existing native presentation owner; failure or
a newer pane, tool, field or overlay never focuses a replacement. Acceptance
means the captured live local session acknowledged the chunks, not OS or
receiving-program consumption. Unknown/partial outcomes require inspection,
never automatic replay. Transport returns no path or native error text.

Headless tests exercise production page/preload/host/router/consumer seams with
fake native/PTY adapters, including synchronous capture/claim, delayed handoff,
source and target races, protected receipts, focus and preserved directory
confirmation. They do not qualify actual Electron native drag/input/focus,
physical input, other platforms, archives or packages. Earlier guest transport
observations inform the design but do not qualify this composition.

## Owned composition modules

`createExtensionManager` owns consent/store/runtime/view composition. It reopens
an independent UI pin for the exact backend generation/digest, then revalidates
before creating views. Invocation context is copied before asynchronous
activation. Issued actions retain the installation generation/digest and local
revocation revision; runtime acquisition checks that exact selection before spawning
or importing code. Retained old actions never acquire a replacement installation.
Management revokes local callbacks and pending admissions, publishes
through the existing short store transaction and joins known views/backend;
status distinguishes installed metadata from local dormant/starting/active/
stopping/failed/unknown and other-instance uncertainty. Disposal latches admission
and reports actual known settlement rather than treating a kill request as exit.
Local backend state is read from its actual owned lifetime, including exit and stream
settlement. A request-local refusal does not change an active backend to unknown;
view/management cleanup uncertainty is still reported separately.
`startApplicationExtensions` connects the production startup, Settings, shared
action catalog and Quit. Startup opens infrastructure but never imports installed
code. Settings → Extensions offers local selection or an explicit HTTPS archive link, explicit native trust,
Refresh, enable/disable and uninstall. Selecting another archive for the same ID
is an explicit replacement/reinstall with the observed generation. Its captured
bytes, identity, version and digest are shown before approval; third-party authors
remain responsible for trusted code, including its filesystem/program/network
access. Core-owned Settings controls/statuses and native trust/error dialogs use the
configured en-US/pt-BR language; retained controls relabel without replaying requests
or changing their captured generation. This does not add an extension localization
SDK. Missing runtime/store infrastructure leaves terminals usable.

Files appears in the shared palette, File menu and terminal context menu with no
default shortcut. Host source supports an optional `toggleFiles` binding in
Settings → Shortcuts, reusing that same entry point; it does not add a general
extension shortcut API. Missing/disabled/unsupported tools do not consume their
configured key. This host capability does not change published preview binaries.
Terminal-popup actions must claim the same live,
one-shot popup/window target as core actions. All explicit openings pass through
core renderer modal admission before activation. Files and SSH Connect use one
retained companion view per tool/window. Concurrent opens coalesce. Later entry-point
invocations revalidate the captured package generation: hidden/nonselected views
are revealed without allocating another epoch, while selected-visible views are
closed. Reopening a closed tool creates a fresh view and discards old drafts. The main-owned presentation policy recognizes their
captured package ID and matching open-action metadata; this selects layout, not
publisher trust or additional capabilities. General extensions retain Application
Tab presentation and independent per-invocation context/view pins.

Companion view lifetime follows the window rather than the terminal that opened
it. In current host source, Files' explicit directory request captures the
selected live pane's last local OSC7 report at request time, rather than the
retained view's initial invocation. Main accepts it only from the visible Files
panel in its focused window, without a caller-supplied target. It asks the core
renderer to confirm the captured session and selection revision before offering
the fixed path; reordered, missing or changed selection is refused instead of
retargeted. A pending or ended pane, known SSH Connect pane, remote/invalid
report, or missing local report gives an explicit unavailable result without
navigating. After the full OSC7 introducer is recognized, an incomplete new
report does not expose the earlier one. The page starts at Home; Home and
explicit paths remain available. There is no continuous following, and a later
selection does not retarget a request or mutation already started. Other extension
invocation contexts remain captured at invocation.

This is the last completed report accepted as local, not authenticated shell
identity or current process inspection: any program may emit OSC7, an ordinary
shell-launched SSH session may not be recognized, and a shell that stops reporting
can leave a stale value. The explicit action opens the captured path locally without
a confirmation dialog. Current Files source labels it as the last reported path;
its inline hint, tooltip and accessible description state that it is unverified
and may be stale or remote. The host
never configures the shell. Compatible installed Files archives use the host
behavior without changing their published bytes; their original action label,
missing inline hint and tooltip, and already-displayed literal error text
do not change. Current
Files source also relabels host-coded unavailable notices. These changes are
included in Files0.7 and its bounded Linux packaged/public-link checkpoints
below; the later macOS local checkpoint and broader qualification are separate, and published
Files0.6 is unchanged.
The host's narrow [development bridges](extension-installation-foundation.md#archive-contract)
admit unchanged Files0.6 on recognized `0.24.1-dev.N`, `0.25.0-dev.N` and
`0.26.0-dev.N` hosts. Admission is not native runtime or package qualification.
Closing the source terminal preserves the panel; window loss, backend loss and
package management still retire it. Hiding retains state and does not cancel or
replay accepted filesystem mutations. Views reserve a 34-DIP core-owned recovery
strip, further intersected with the real renderer slot.

Management shows registry generations and tombstones separately from local state,
other-instance uncertainty and Pending Cleanup. Normal Quit revokes admission,
joins known extension retirement for at most 15 seconds and records an unsettled
outcome without vetoing Quit. Native PTY exit joining remains independent.

The view router now multiplexes epochs by actual owner WebContents, with issued
ID-to-host mappings and one monotonic presentation revision per window. A new
selection must acknowledge hiding every other epoch. The child preload exposes
bounded own-view requests; main validates the actual sender/main frame and live
view, captures bounded JSON and binds cancellation to view destruction. A payload
cannot choose a backend/window/epoch. The terminal renderer has no Files request
route. Late replies after retirement cannot regain view authority.

## HTTPS archive installation

In Settings → Extensions, paste an HTTPS archive link and choose **Install from
link**. Acquisition/validation shows a pending notice and Cancel; after validation,
the same native trust dialog shows the exact archive identity, version, SHA-256
and observed replacement generation used by local installation. A digest identifies
bytes, not a verified publisher. Downloading never activates code. Cancelling before
approval leaves the installation unchanged; after approval, publication may already
be underway and cannot be recalled. Conflict/unknown publication is never retried.
Refresh inspects current installed state before a new deliberate attempt.

Main uses Node HTTPS with ordinary certificate/hostname verification, no browser
cookies/session, authentication prompts, inherited authorization headers, proxy
discovery or HTTP content decoding. Signed query URLs are supported; credentials
in userinfo, fragments, whitespace/control characters, backslashes and URLs over
8,192 characters are rejected. Only status 200 supplies an archive. Up to five
relative or cross-origin redirects are followed, revalidating HTTPS and URL policy
at every hop; downgrade is refused. Each requested host receives its URL/query and
the usual network metadata. Deliberate private-network HTTPS hosts are allowed;
this is a user-directed desktop download, not a public-server URL fetch service.
TLS trust follows the bundled Node runtime, not the browser login/proxy session.

A 60-second total acquisition deadline includes redirects/body reads. Headers are
limited to 16 KiB; declared and actual input are limited to 64 MiB, including
chunked responses. Empty/truncated bodies and nonidentity HTTP content encodings
fail. Existing ZIP expanded-byte, entry, path, CRC, compatibility and manifest
limits still apply to captured bytes before trust. At most four acquisitions run
across windows, one management operation per window. Cancellation is bound to a
one-shot request identity and actual sender; closing Settings cancels its pending
link operation, while renderer loss/navigation, window closure and application
retirement revoke its authority. Switching tabs retains the pending operation.
The link installer owns one cancellation lifetime across acquisition and native
consent; the shared dialog does not add a second destruction listener for those
captured bytes. Standalone local-file selection retains its own destruction
listener through chooser and consent. Both paths discard pending trust on exit.
Network errors expose fixed localized categories, never native error text, URL,
query or archive content in logs. No download history, background updater,
remote extension views or stable SDK is added.

## macOS catalog distribution

On 2026-10-31, [host dev.26](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.26)
was published as an immutable, non-Latest macOS ARM64 preview at exact build/tag
`4018e7d0c19234d2a675836972368657ee12c5a1`. Its DMG is 129,722,755 bytes,
SHA-256 `f7bbe77b8dee9ca1cf15254f5a47b4a40902b46886920243171cf7bb6165f16d`.
Both draft and anonymous public DMG/checksum downloads matched the qualified
bytes. Stable0.23.0 remains Latest; original Files0.5 and all sealed releases
remain unchanged.

Use **Settings → Extensions → Browse official extensions → Files → Install**.
The new complete macOS endpoint read back as SHA-256
`3392b90da19bb004afefb7cd7d4a1640eb6614bf5a215191b16b4039ae518ca8`.
The legacy endpoint remained byte-identical at
`315c7208328b401a31944c97f8c259d8b449ab6c7185a1ded00c691d997c26f9`, preserving
Linux Files0.4; SSH/Snippets entries are equal across both documents. Published
dev.21 still uses its original link/local route, not the new endpoint.

Complete independent source review found no supported findings. Format, lint,
types and 4,740 headless tests passed (66 skipped). Fresh locked native build,
DMG image verification, staged/mounted/detached-copy equality, ordinary **FULL**
startup/PTY/privacy verification and ad-hoc seal passed. A separate read-only
audit verified 1,264 source entries, 630 bundle entries and all 24 stage joins.

The subsequent exact public-DMG six-check fixture passed with fresh anonymous
host/archive downloads and real production HTTPS, without transport interception
or local archive substitution. All three Files-card actions (Install, Reinstall,
Install) required exact Files0.5 manifest/digest and Official catalog consent.
Dormant installation/reinstallation, create/move/conflict with destination bytes
and exact old-source absence, Disable/dormant Enable/Uninstall, the same PTY and
Surface, and third activation alive before normal Quit passed. All three backends
exited zero and closed; shell exit, normal main exit/streams and supervisor
settlement joined. A separate read-only audit confirmed unchanged inputs/bundle,
seal, absent owned mounts and no current scope processes.

The first private invocation failed before tests/app launch because it duplicated
Vitest's `--maxWorkers` option. Removing only the duplicate runner argument allowed
the unchanged source/package checkpoint to pass; the failure remains recorded.
Catalog Install/Reinstall and terminal captures were visually inspected. The Files
capture was stale (still showing the old source name) and is **not final-move
visual proof**; filesystem assertions passed independently. Synthetic Chromium
input, controlled consent, configured endpoint rather than passive network trace,
physical/Gatekeeper/notarization, deployment-floor, native-I/O cancellation and
main-death limits remain. Earlier primitive/local lifecycle campaigns were not
replayed or relabeled. Original release notes retain their publication-time status.

## Files0.7 macOS stable local checkpoint

On 2026-11-07 an ordinary-user macOS 27.0.1 ARM64 disposable guest used the
publicly downloaded **stable OMXTerm0.25.0 DMG** (129,841,467 bytes, SHA-256
`eab799c16150ddb0852299a669df53cf7eb098cf223978cc30aa34ea8a20f32c`)
and the separate published **Files0.7.0** archive (23,285 bytes, SHA-256
`611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef`).
The app was copied from the read-only mounted DMG; it was not installed through
Finder. The archive's original Linux-targeted build receipt remains `not-run`;
this macOS observation is separate from that receipt and the Linux preview.

A Files-only adaptation of the exact-DMG controller, based on source
`9c5492e37b23fb80e96bb71e550d34c65d0083ca`, passed captured-byte local trust,
dormant install and explicit activation; loaded filtering and keyboard/focus;
confirmation cancellation without effects; conflict preserving both directories;
and a confirmed directory move preserving device/inode and contents with the
old source absent. The refreshed hosted view showed the completed move. One
active backend exited 0 and closed at normal Quit; main exit and owned process
settlement joined without cleanup assistance. The copied bundle and input hashes
matched after the run. The actual Files capture was inspected separately from the
core-window capture. The filter assertion is DOM/input evidence, not a separate
paint capture. No terminal input, terminal-directory, path insertion or drag
was exercised.

The temporary executed adapter and its raw receipts retain their own identities;
the [durable fixture](../test/fixtures/files-dmg.md#files07-macos-files-only-mode)
is a subsequent source adaptation, not the controller executed in that run.
An initial headless adapter check failed four existing-mode controls; those failures
remain distinct from the corrected adapter's 38 passing controls and native run.
Stderr retained a BrowserWindow 11-listener warning. Closed [#742](https://github.com/luizomf/omxterm/issues/742)
already records the same bounded macOS diagnostic; neither observation establishes
its cause, a new regression or an accumulating leak.

Synthetic Chromium input and controlled consent do not qualify physical input,
Finder/Gatekeeper, default GPU, compositor behavior, all filesystems, public
Settings-link/catalog consumption or surviving-browser main-death exclusion.
The later public-catalog checkpoint below is separate; it does not relabel this
local observation.

## Files0.7 macOS public-catalog checkpoint

On 2026-11-07 an ordinary-user macOS27.0.1 ARM64 disposable guest ran the
committed controller `c5e7c436ec67e27c5ef155e22cfbcea1f640452c` against the
same published stable0.25.0 DMG and Files0.7 archive identities above. The app
was copied from the read-only DMG; the independently downloaded archive was
only the controller-side digest oracle, not a chooser or app input. An independent
preflight readback of the fixed macOS catalog had SHA-256
`2771ab9af0972b9438927b9e34c683ffb64c946dfda6009e2731472827e40751`.
The production Settings flow then used actual Browse and the Files0.7 Install
card, public HTTPS and one controlled Official consent asserting the exact
manifest ID/version/digest and generation 0. Installation remained dormant;
explicit activation opened a real hosted Files view and backend. The backend was
observed active before `app.quit()`, then exited 0 and closed; main exit, streams
and supervisor settlement joined without cleanup assistance. The recorded
endpoint and Install action are fixture receipts, **not a passive network trace**;
the separately read-back catalog digest is not a direct capture of the app's
response bytes. No catalog/archive interceptor, fixture CA, local chooser or
link fallback supplied the installation.

The actual catalog WebContents capture was inspected: it shows the Files0.7
macOS ARM64 offer and Install control. It is not a Files-view or compositor
capture. Source export file bytes and link targets (1,511 entries), input hashes
and copied bundle identity matched before/after; source comparison is not a full
metadata or untracked-file inventory. The transient bundled driver was built
from that source but its executed output was not separately retained or hashed.
A later snapshot found all 15 recorded controller/supervisor process identities
absent, not arbitrary escaped descendants. The profile and copied application
were retained through evidence review.
Stderr retained the same 11-listener BrowserWindow warning covered by closed
[#742](https://github.com/luizomf/omxterm/issues/742); its cause is unestablished.
The DMG helper also emitted hdiutil deprecation warnings.

This short public checkpoint did not repeat filtering, directory moves, other
management operations or the filesystem matrix; the earlier exact-pair local
result remains separate. There was no terminal input, terminal-directory request,
insertion or drag. Synthetic input and controlled consent do not establish
physical input/dialogs or Quit-menu interaction, Finder installation, Gatekeeper/notarization, default GPU,
compositor, every filesystem, full portable checks or surviving-browser main-death
exclusion. The original Files0.7 Linux-targeted build receipt remains `not-run`.
The initial four failed temporary-adapter controls remain failed. A later broad
unit run timed out at 240 seconds after reporting two failures: the Snippets
catalog test's obsolete macOS Files compatibility expectation and the 0.7
consumer test's missing `filesOnly` binding. Those mechanisms are reconstructed
from the intermediate and corrected sources; the original final stacks were not
retained. Both #745 installer-related unit files reported passes in that run,
but there was no final suite summary or established timeout cause. Focused
corrected checks passed; neither failed/incomplete run becomes a full-unit pass.

## Files 0.6.0 Linux public-catalog checkpoint

🤖 AI-assisted.

On 2026-11-02, an ordinary-user Ubuntu26.04 ARM64 guest used the retained,
**locally built**, extracted OMXTerm0.24.0 AppImage (128,175,114 bytes, SHA-256
`0dd3ff2c0ad9dc069c5c22daf735acb84633dce48e484532882f9a375b53c913`)
with the separately published Files0.6.0 archive (17,331 bytes, SHA-256
`50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143`).
The host was built from `8717d47327eeab14f522b1b2a448216860d0923d`, the archive
from `cfc9073010df586eec321641ba5013862734f8fe`, and the fixture used
`b5ca2aea6087531e523d026424ae0be35a040be3`. The fixture's
`scripts/linux-packaged-process.mjs` stderr-truncation addition is verifier/test
infrastructure, not host runtime; host build inputs must be compared separately
to the final tag. The stable host was not downloaded from a public release.

The independently read-back legacy catalog SHA-256 was
`2ab4f15d697559a261a19dc014297200a277e60289e67bf788303d6fbc0eacda`.
The application used production HTTPS without controlled transport or local/link
fallback. Passive observations bound the actual catalog bytes, selected snapshot
and archive responses to three controlled Official consents at installation
generations 0, 1 and 5. Six checks passed, covering Install/Reinstall/Install,
dormant installation and activation, create/move/conflict, management, the same PTY/Surface and
normal joined Quit. All three backends closed with exit 0; the main exited 0 and
owned processes settled. Separately inspected WebContents captures showed the
catalog actions, completed Files operation and surviving terminal.

The passing run's stderr retained two Chromium negative-frame-latency diagnostics;
no user-facing failure was demonstrated in that occurrence, but their cause and
impact remain unknown. It did not show the earlier [#746](https://github.com/luizomf/omxterm/issues/746)
diagnostic, which remains unexplained. Synthetic input and controlled consent,
extracted-AppImage execution, and separate WebContents captures do not qualify
physical input, native dialog interaction, FUSE/helper installation, compositor
behavior, a downloaded public stable host or the full portable suite. The earlier
local toolbar/dotfile matrix was not replayed; the original archive receipt remains
`not-run`.

## Files 0.6.0 macOS public-catalog checkpoint

On 2026-11-02, an ordinary-user macOS27.0.1 ARM64 guest used the exact retained
**locally built**, not downloaded-public, OMXTerm0.24.0 ARM64 DMG (129,751,297 bytes, SHA-256
`88e66b764cc9fc4fa3a6cfb2c0e081dce5089631a8f8b8640ad875214e8bc34f`)
passed the bounded [public-catalog fixture](../test/fixtures/files-dmg.md#prepared-files06-public-catalog-checkpoint)
with separately published Files0.6.0 (17,331 bytes, SHA-256
`50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143`).
The host was built from `8717d47327eeab14f522b1b2a448216860d0923d`; the
archive was built from `cfc9073010df586eec321641ba5013862734f8fe`.
Fixture/source was `cf13992ccc730947fed7046cc27ce422920d78b1`. The guest OS
version was rechecked after cleanup on the same boot. The stable host was not
publicly released at this checkpoint.

The fixed macOS catalog was independently read back at SHA-256
`0943623c3907516cc3c2affdc73e5cc7247b040845da5de022fa9f3a7058e870`;
the guest also fetched and compared the catalog and archive before launch.
The application then used production HTTPS, without transport interception or
local/link fallback. Six checks passed: actual Install/Reinstall/Install, three
controlled Official consents bound to the exact identity/digest and generations
0, 1 and 5, dormant installation, create/move/conflict, management, the same
PTY/Surface and normal joined Quit. All three backend processes exited 0 and
closed. Catalog Install/Reinstall, the completed Files move and the surviving
terminal were separately inspected in WebContents captures. They are not
compositor or physical-input evidence. The catalog receipt records the configured
endpoint, not a passive network trace. Earlier local-pair toolbar/dotfile and
Trash matrices were not replayed; original build receipts remain `not-run`.

The guest preference domain changed despite isolated paths; its exact bytes,
metadata and daemon-visible state were restored and verified, including after
owned-scratch removal. Input/display matched the fresh baseline. Fourteen recorded
process identities and the owned image/mount were absent at audit. This bounded
snapshot is not a historical escaped-descendant census. This run did not show the
[#746](https://github.com/luizomf/omxterm/issues/746) diagnostic; earlier occurrences
remain unexplained. The checkpoint does not qualify a downloaded public stable host,
Gatekeeper/notarization, physical keyboard/native-popup input, macOS12, blocked
native-I/O cancellation or the full portable suite.

## Official catalog

Settings → Extensions offers **Browse official extensions** and explicit Refresh.
No request is made on startup or reopening Settings. Failed refresh retains the
last successful in-memory snapshot with a stale warning; cold offline failure is
unavailable, not an empty catalog. Local-file installation and installed management
remain usable. en-US/pt-BR controls relabel without repeating requests.

Main owns the fixed project HTTPS endpoints and captured release selections.
Current source chooses the complete `official-extensions-darwin-arm64-v1.json`
for macOS ARM64; every other target retains `official-extensions-v1.json`.
Only one endpoint is fetched, with no merge or fallback. The catalogs select
Files0.6 on Linux ARM64 and Files0.7 on macOS ARM64, keeping SSH/Snippets
identical between them. The separate bounded [Files0.7 public checkpoint](#files07-macos-public-catalog-checkpoint)
passed. Published dev.21 still embeds the legacy URL; its Linux-only Files entry
does not offer macOS discovery. The earlier dev.26/Files0.5
[public-catalog checkpoint](#macos-catalog-distribution) establishes that exact
historical route; it does not qualify Files0.6. Before
trust, downloaded length/SHA-256 and manifest ID/version/engine strings must match
exactly; there is no fallback to unchecked link installation. The same native
trusted-code warning applies. Official means project-maintained, not harmless,
sandboxed or independently signed. Update offers a newer compatible release;
Reinstall requires identical installed bytes. Downgrades or same-version different
bytes carry explicit replacement warnings, including in the native consent dialog.
Installation/replacement remains dormant. Cancel or owner loss before approval
revokes consent; publication already dispatched cannot be recalled or retried
implicitly. Refresh cannot retarget a captured installation.

Linux Files0.6 requires at least dev.21. The macOS Files0.7 offer requires
`>=0.25.0-dev.10`; macOS 0.24.0 and earlier compatible hosts lose the prior catalog
offer and can deliberately install the unchanged Files0.6 archive by local file or
HTTPS link, or upgrade. Compatibility is separate from endpoint and qualification.
Historical Files0.1.0 remains available for local/link installation from
0.23.0-dev.8; catalog-capable host source started at 0.23.0-dev.9. Its engine
range excludes host 0.24.0. The catalog is not an index of every historical
release. Declared compatibility is not qualification of every version.

After Files0.6 promotion on both endpoints, Linux hosts 0.24.0-dev.11 through
dev.20 no longer have a compatible Files catalog offer: the schema contains only one
version per ID and Files0.6 requires dev.21 or newer. Those hosts can still
install the unchanged [Files0.4.0 archive](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.4.0)
from a downloaded local file or its direct HTTPS archive link, or upgrade the host.
Existing installed packages and historical release bytes remain unchanged.
See [distribution](extension-distribution.md) and the
[publication procedure](release.md#files-catalog-publication). An empty source
catalog does not mean a usable public preview has shipped.

## Files 0.4.0 distribution and controlled qualification

The immutable `ext-files-v0.4.0` prerelease was published at
2026-10-30T22:40:06Z, targeting original source
`b6044d65d14345adb8d7ae59340fbca978512107`. Its archive is
`omxterm-files-language-b6044d6.omxext`, 13,188 bytes, SHA-256
`384de7da4cc2fafe7e42cd4ccf19a455a2e634036069160c75e15b7371d2eb6e`.
Draft and anonymous public readback verified all three original assets. The
original checksum and build receipt remain unchanged, including the intended
host dev.12 and `qualification.status: not-run`; actual qualification is separate.
Current-source comparison produced identical archive bytes.

Controlled exact-pair qualification used public host0.24.0-dev.11 ARM64 AppImage
SHA-256 `04344920a6229baf695d01e03fedcf5396c897f6805d6ed2ed4b9f4104f67c86`
and fixture source `fa8983ff1163377faf384698266bb862ef09fa6f` (integrated in
`b091fd1247e8bbc0b00851457978c7f586c9bbb4`). Seven scenario checks and two
captured-byte consents passed: dormant installation, catalog failure/retry/stale
snapshot/wrong-byte refusal, companion/focus transitions, real file creation and
no-clobber move/conflict, reinstall retirement, fresh activation, disable/uninstall,
same terminal/PTY and joined normal Quit. Both backend generations exited normally.
The synthetic newer offer tested Update presentation only and was never installed.
Earlier exact-pair language evidence covers live relabeling with retained editor
focus/draft/caret, menus, captured confirmation and expansion.

This is extracted-AppImage, nested-X11 qualification with synthetic input and
controlled native-dialog responses. GPU fallback diagnostics remain. It does not
qualify default GPU, physical input/dialogs, FUSE/helper installation, the complete
trash/deletion-edge matrix, dev.20 execution, macOS, Linux x64 or surviving-browser
main-death file-read exclusion. Original failures remain failed. A corrected
plural-only listing-readiness fixture defect does not erase failed campaigns.
Historical 0.1.0 public-consumption evidence above remains scoped to its original
pairs, not this controlled campaign.

### Public Files 0.4.0 checkpoint

The separately executed public-HTTPS checkpoint passed on 2026-10-30 after
catalog integration at `fd7691a972f8e364bd3b3b2ba9ec1d90fcccf8b5` (tree-identical
to independently reviewed `29f4c165b7733031802ab62d2a6a81af88284435`). Fixed raw
catalog readback matched SHA-256
`315c7208328b401a31944c97f8c259d8b449ab6c7185a1ded00c691d997c26f9`.
SSH and Snippets metadata remained unchanged.

Using the same exact dev.11 AppImage and Files0.4 archive identities above, a
fresh isolated profile acquired the catalog and archive through production
public HTTPS, without a fixture CA, controlled catalog file or interceptor.
Seven scenario checks and two exact-digest consents passed: dormant install,
companion/focus/terminal transitions, captured directory, actual file creation
and no-clobber move/conflict, reinstall with normal backend retirement, fresh
activation/disable/uninstall, and the same live PTY/Surface. Normal Quit joined
main exit0, both backend exits0 and the PTY's kernel exit. Independent settlement
confirmed process/profile/lane cleanup and unchanged artifact/helper hashes.

The Install/Reinstall cards and Files operation capture were visually inspected.
The final capture named `terminal-after.png` retained Settings pixels, so it is
not terminal-paint evidence; terminal continuity is established by the same-shell
command receipts and retained Surface identity instead. Nested-X11/GPU fallback,
synthetic input/controlled consent and all other scope limits above still apply.
No controlled negative-catalog or language campaign was repeated. Sealed release
notes and original build receipts were not rewritten with this later outcome.

## Build and evidence boundary

Normal Linux and macOS ARM64 application builds include the bootstrap, independent
native lease addon and Files no-replace addon. The tiny Node-API8 worker-pool
adapter uses Linux `renameat2(RENAME_NOREPLACE)` or macOS
`renameatx_np(RENAME_EXCL)`, at most32 pending calls and fixed error categories.
The macOS API is available since 10.12, below the application's macOS12 deployment
floor; API availability is not execution qualification on that floor.
Destination conflicts, permissions, unsupported filesystems and cross-device moves
fail explicitly. Other platforms have no overwrite fallback. Explicit runtime
builds remain available. No fuse or Electron version change is required.
The macOS move primitive and subsequent source trash implementation are bounded
prerequisites, not complete Files support. No Files archive/catalog/publication
change follows. The same addon now links Foundation on macOS and shares its
32-operation native bound between move and trash. Linux's native move and gio
trash implementations remain unchanged.

**macOS ARM64 trash prerequisite evidence — 2026-10-30.**

Source `8b9eab97a82d6ea01982fb79062b5642a10e2b7a` (host 0.24.0-dev.21)
passed nine native check groups on macOS 27.0.1 ARM64 / Electron 43.8.1,
using the bundled Electron and signed addon from an exact DMG-derived app copy:

- literal punctuation/Unicode names; empty/nonempty directories;
- links to files/directories and dangling links, preserving referents;
- ambiguous-path refusal, distinct recoverable entries after name collisions;
- fixed missing-source and ordinary-user permission failures, without deletion fallback;
- shared 32-operation admission/release and recoverable trash on a distinct APFS volume.

All nine trashed entries were verified by device/inode and contents or link text,
then restored through no-clobber moves before owned scratch removal. This is
recoverability evidence, not merely source disappearance. Fresh locked install,
ordinary build, DMG packaging, staged inspection and inspection of the exact
copied app passed. Full copied-bundle bytes/modes/symlinks matched before the
readonly DMG was detached; native semantics ran afterward. Independent read-only
audit confirmed 1,224 source entries, 629 bundle entries, complete ad-hoc seal,
unchanged artifact/image hashes, absent owned mounts/scratch and no current
scope processes. Bounded group joins/current snapshots are not a historical
escaped-descendant census.

The retained DMG is 129,721,647 bytes, SHA-256
`2d5767510034a8059996762ab72d821c1e139cd0968859e9b15d5d74d79378c1`.
The signed Files addon is
`2e78bff78a7f01ae1bea71658be805266f7459888f956c6bb12df677a6b0ee83`;
its prepared pre-signing bytes differ as expected. Complete independent review
covered 21 paths; both findings were corrected (raw-path validation composition
and shell documentation continuations). Full formatting/lint/typecheck passed;
4,422 headless tests passed, 66 skipped. The earlier private source-export attempt
failed before install/build/native execution because archive modes differed from
Git modes; it remains failed. An explicit archive-mode correction passed full
source identity verification before the successful campaign.

This is a native prerequisite, not full Files UI/backend lifecycle, native-I/O
cancellation, read-only/trash-unavailable-volume, macOS 12 execution,
Finder/Gatekeeper/notarization or public distribution qualification. Existing
runtime ownership evidence is separate; no blocked Foundation call was proved
cancellable. Published archives, receipts and catalog targets are unchanged.

The package probe itself checks only the macOS trash export and root-path
refusal, not a recoverable Trash operation. Follow the [macOS preference precautions](development.md#macos-preferences-and-native-verification)
before packaged Electron probes. An assigned ordinary-user macOS ARM64
environment can run the prepared fixture with the bundled Electron:

```sh
ELECTRON_RUN_AS_NODE=1 /absolute/Electron \
  test/fixtures/files-trash-native.mjs /absolute/files-move.node \
  /absolute/new-private-evidence-directory /absolute/writable-fixture-parent \
  /absolute/optional-other-device-parent
```

Omit the final argument for the local-volume checks only. The evidence directory
must not already exist. Both supplied parents must already exist and be writable;
the optional parent must be on a distinct device, with OS Trash support selected
by the qualification owner. The fixture creates only its own private scratch
children. It verifies returned Trash entries by device/inode and contents or link
text, including literal names, directories, final symlinks, dangling links and
same-name collisions. It also checks ambiguous-path refusal, missing-source and
ordinary-user permission failures, plus the shared native admission bound.
Successful qualification restores only those verified entries through no-clobber
move before removing owned scratch. No unrelated Trash enumeration occurs.

The private mode-0600 receipt records source identity before dispatch and exact
returned destinations; it is not a public artifact. Unknown/failing operations
preserve the scratch and any Trash entries for deliberate recovery, with no retry
or automatic deletion. Partial cleanup failure remains failed. Do not delete a
failed evidence directory before inspecting its recovery identities. Read-only
or trash-unavailable volumes, macOS12 execution, actual runtime retirement,
full Files lifecycle and exact-package/public-consumption evidence remain separate
requirements. Never treat source disappearance alone as recoverable trash proof.

`test/fixtures/files-move-native.mjs <absolute-addon> [absolute-other-device-directory]`
must run under the bundled Electron executable with `ELECTRON_RUN_AS_NODE=1`, as
an ordinary Linux or macOS ARM64 user, inside an assigned disposable environment.
The other-device directory defaults to `/dev/shm` on Linux and must be supplied
explicitly on macOS. It must be writable and have a different device identity
from the temporary source directory; the fixture owns only its newly created
scratch children, not that parent or its mount. It checks actual file/directory/
symlink moves, destination races, permissions and cross-device refusal. Source
inspection and controlled adapter tests are not native qualification.

**macOS ARM64 move prerequisite evidence.**

On macOS27.0.1 ARM64, source `660c911bc00923abb42d853b36140396bfa26737`
(host `0.24.0-dev.18`) passed a fresh locked install, ordinary build and all ten
native fixture checks under Electron43.8.1 / bundled Node24.22.0 as an ordinary
user. Local APFS checks covered existing files, empty/nonempty directories,
symlinks and dangling destinations, competing writers, successful moves and
permission refusal. A separate mounted APFS image established distinct-device
`EXDEV` refusal with both source preservation and destination absence.

The ordinary DMG build and inspection of both the staged application and the
exact DMG-derived copy passed: native ARM64/macOS12 targets, unpacked addons,
complete ad-hoc seal, packaged store/lease/move loading and bootstrap refusal.
DMG SHA-256 is `6cbe9b76aa4c8bc8707069f1f3ddcf28d4cd3a20d9d4cfb2c9f4aefacaee7382`
(129,718,868 bytes). Mounted/copied bundle file bytes, modes and symlinks matched;
the image was detached before the copied application was inspected. Root separately
verified unchanged source/artifact/bundle identities, the seal, absent task mounts,
fixture scratch cleanup and no current processes naming the owned scope. Bounded
process-group joins and that snapshot are not a historical escaped-descendant census.

One complete independent review found two issues, both corrected: test tuple
inference and stale runtime documentation. A subsequent test-mock typing fix
changed no application or package input. Full formatting, typecheck, lint,
4,291 headless tests (66 skips) and build passed on `2dae2c8`; earlier typecheck
and lint failures remain distinct from the corrected results. Package inspection
is not GUI/Files lifecycle, trash, macOS12 execution, Finder/Gatekeeper,
notarization, full portable-suite or public-distribution qualification. No release,
archive, original receipt or catalog entry was changed.

The opt-in `test/integration/files-production.test.ts` runs the already-built
production entry point when `OMXTERM_FILES_PRODUCTION_SOURCE` names its exact
source directory on an assigned Linux ARM64 guest. Its current-source scenario
checks one retained Files companion across menu/palette reopen and Settings
suspension, real operations, backend-loss view retirement, explicit fresh
activation, management settlement and the original terminal/PTY. It does not
exercise independent renderer-crash retirement; historical two-view evidence
below belongs to the earlier Application Tab implementation. Build the app and separate
archive first. `OMXTERM_FILES_PRODUCTION_EVIDENCE` optionally captures fixture-only
screenshots and the native supervisor receipt. Native chooser/consent answers are
fixture-controlled, not physical-dialog-widget qualification; terminal input is
synthetic Chromium input. Native input-lane admission is verified separately.
The bounded Files0.7 consumer requires a separate exact-host/archive receipt;
preparation alone does not establish native qualification.
On an assigned disposable Linux ARM64 guest, after the
[desktop-service prerequisites](development.md#linux-desktop-services-and-native-verification),
install locked dependencies and build the selected source with `npm ci` and
`npm run build`. From that source directory, using its normal test-user desktop,
bus, authentication and runtime environment:

```sh
OMXTERM_FILES_PRODUCTION_SOURCE="$PWD" \
OMXTERM_FILES_CONSUMER_070=1 \
OMXTERM_FILES_PRODUCTION_ARCHIVE="/absolute/retained/files-0.7.0.omxext" \
OMXTERM_FILES_PRODUCTION_EVIDENCE="/absolute/new/private/evidence" \
OMXTERM_FILES_HTTPS=0 \
npm test -- test/integration/files-production.test.ts
```

The built-host fixture recognizes these historical preparation identities; this
list does not promise that private files or their receipts remain available:

- Original source `1791af0`, 23,256 bytes, SHA-256
  `63c6567774ba297ef3a0a30f3895d76ca9157e7283551de8bd6c5dbbad8e79ce`.
- Composing-Escape correction at source `af0ac4b`, 23,285 bytes, SHA-256
  `611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef`.
  Integrated dev.13 source preserves its build inputs; reuse, when the original
  trio is actually available, does not rewrite its source/dev.12 receipt.

The Ubuntu built-host checkpoint integrated at `424d9f9f` and the Fedora
built-host checkpoint integrated at `899979fb` passed nine bounded checks on
their recorded inputs. Neither establishes an exact packaged or public-host
checkpoint. Neither archive was published at those checkpoints. The historical
corrected archive was unavailable during the later Linux delivery preparation;
a fresh clean-commit build produced the same 23,285 bytes/digest, with a **new**
receipt bound to source `0cb89accd61f1f5d5263c60773454882793e2e99` and its actual
toolchain. Equal bytes do not recover the historical receipt or relabel earlier
native results. If retained inputs are missing, build from verified committed
inputs with fresh provenance and compare the actual digest; never reconstruct
an old receipt or chase deleted archives. Do not overwrite original outputs. The scenario verifies the selected size and digest
before installation, then checks loaded filtering, Chromium keyboard/focus
routing, one confirmed directory move with a no-clobber conflict control,
Close/reset from a nonempty query, Disable/Uninstall and joined Quit. It reuses
production installation and lifecycle setup rather than repeating the full
mutation/crash matrix. The consumer explicitly selects X11 at bootstrap to avoid
a detached Wayland-to-X11 relaunch; it does not qualify default backend selection.
Temporary profiles do not isolate per-user services. The fixture does not provision
or validate a safe guest session; record service preservation separately.

A passing run is built-host evidence, not packaged-host,
public-catalog, physical-keyboard, native-drag or all-platform qualification.
Do not combine it with the HTTPS lane. `consumer-files.png` is ordered after
completed-move readiness and two child animation frames with a readiness recheck;
this does not prove fresh compositor pixels. Inspect the actual capture before
accepting it as visual evidence. `consumer-window.png` captures core host content,
not the separate Files view or final terminal paint. Existing primitive evidence
retains its original input scope.

Set `OMXTERM_FILES_HTTPS=1` on that same opt-in fixture for the bounded HTTPS
installation lane instead of the full Files operations scenario. It requires
`openssl`, creates a one-day localhost test certificate and supplies it only to
the child via `NODE_EXTRA_CA_CERTS`; production TLS verification is not disabled.
It exercises a real stalled HTTPS stream/cancellation, malformed archive rejection,
relative redirect, captured-byte native consent/dormant installation, explicit
local replacement, retained real terminal/PTY and joined Quit. Its loopback TLS
server is fixture-owned and closed before Quit. Consent answers and clicks remain
controlled; it does not qualify public hosting, physical dialogs or other platforms.

### Exact Linux ARM64 Files0.7 packaged consumer

For the corrected Files0.7 bytes above, the separate exact-AppImage fixture can
reuse the bounded filtering/keyboard/confirmed directory-move consumer:

```sh
OMXTERM_FILES_PACKAGED_APPIMAGE=/absolute/host.AppImage \
OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256=EXPECTED_HOST_SHA256 \
OMXTERM_FILES_PACKAGED_VERSION=0.25.0-dev.19 \
OMXTERM_FILES_PACKAGED_ARCHIVE=/absolute/files-0.7.0.omxext \
OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256=611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef \
OMXTERM_FILES_PACKAGED_EXTENSION_VERSION=0.7.0 \
OMXTERM_FILES_PACKAGED_EXTENSION_NAME='Files — ARM64 preview' \
OMXTERM_FILES_PACKAGED_CONSUMER_070=1 \
OMXTERM_FILES_PACKAGED_EVIDENCE=/absolute/new/private/evidence \
npm test -- test/integration/files-packaged.test.ts
```

Follow the Linux service/session prerequisites before launch. This local-file
lane is separate from catalog/public HTTPS and diagnostic modes. It verifies
captured-byte trust/dormancy, loaded filtering, synthetic keyboard/focus,
confirmed directory conflict/move with inode/content/source-absence oracles,
Close/reset, Disable/Uninstall, deliberate reinstall retirement, the retained
PTY/Surface and a third consent/active backend at normal joined Quit. The observer
runs in the unchanged extracted package; only fixture helpers come from source.
No primitive matrix is replayed. Inspect `consumer-files.png` and
`terminal-after.png`; filenames and DOM readiness are not pixel evidence.
The separate [public-link checkpoint](#files07-linux-public-link-checkpoint)
below passed after publication; local execution alone does not establish it.
At that checkpoint both Files0.6 catalogs remained unchanged.

<a id="files07-linux-public-link-consumer-preparation"></a>

### Files0.7 Linux public-link checkpoint

On 2026-11-06, [host0.25.0-dev.19](https://github.com/luizomf/omxterm/releases/tag/v0.25.0-dev.19)
and [Files0.7.0](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.7.0)
were published as separate immutable, non-Latest Linux ARM64 previews. Both tags
identify actual host/archive build source `0cb89accd61f1f5d5263c60773454882793e2e99`.
All seven original assets matched draft and anonymous public readback; Files was
published and anonymously verified before the host. Stable0.24.0 remains Latest,
and at that checkpoint both official catalogs still selected Files0.6.

A separate ordinary-user Fedora44 ARM64 checkpoint passed all seven bounded
groups using **fresh anonymous downloads**, not the old local copies. The exact
AppImage was 128,279,459 bytes, SHA-256
`ac18dc2e08cbebed6a8b5ce08976eab2e0f043d407bd8b0f24113c1e87534f62`;
Files was 23,285 bytes, SHA-256
`611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef`.
The clean qualification fixture was `ed84ce729e03656018eb2e1b971dd8f458123df3`,
not the build/tag source. Those later test/docs inputs do not rebuild or relabel
the published bytes. Original archive sidecars, including the fresh receipt's
`qualification.status: not-run`, remain unchanged.

The real Settings HTTPS-link route performed three installations, including
reinstall, with exact captured-manifest/digest consents at generations 0, 3 and 4.
Installation/reinstallation remained dormant until explicit Files activation.
Loaded filtering/keyboard focus, confirmed directory conflict/move, Close/reset,
Disable/Uninstall, retained PTY/Surface and third-consent active Files at normal
Quit passed. The move preserved device/inode/content and exact source absence.
All three backends exited 0/no signal and closed; shell kernel exit, actual main
exit 0/streams and owned process settlement joined. No test CA, transport
interception, catalog offer or local archive substitution was used.

Actual Files and terminal WebContents captures were inspected: the completed
project appears under its destination, and the terminal shows the marker and
prompt. The core-window capture does not include the separate native child.
Original portal/service/bus identities, mount/FUSE/API scope and consumers matched
before launch, after settlement and after owned-scratch removal; no held input or
current task actors remained. This is not a historical escaped-descendant census.
Complete stderr retained one VSync-query diagnostic, two portal atom-cache
diagnostics and four SharedImage mailbox errors. Operations/captures passed;
their causes and broader GPU implications remain unestablished.

The unchanged prior FULL verifier and Files primitive evidence were reused, not
replayed. This checkpoint is extracted-AppImage/X11, synthetic Chromium input,
controlled native consent and separate WebContents captures, not physical
keyboard/drag/dialog, compositor/default-GPU, every filesystem/volume,
macOS/Windows/x64 Files0.7, stable SDK or surviving-browser main-death qualification.

#### Run the bounded public-link fixture

Use fresh anonymous downloads matching the published pair above; publication or
byte readback alone does not imply app consumption. Reuse
`test/integration/files-packaged.test.ts` with all exact-pair
inputs from the local command above, set the host SHA-256 to
`ac18dc2e08cbebed6a8b5ce08976eab2e0f043d407bd8b0f24113c1e87534f62`,
and additionally set:

```sh
OMXTERM_FILES_PACKAGED_PUBLIC_LINK=https://github.com/luizomf/omxterm/releases/download/ext-files-v0.7.0/files-0.7.0.omxext
```

Export that variable for the test invocation or add it as another inline
assignment. This is the published immutable Files0.7 archive URL.
`APPIMAGE` and `ARCHIVE` must be the anonymously downloaded dev.19 host and
Files0.7 archive, with readback provenance recorded separately. After successfully
verifying the downloaded AppImage's size and SHA-256 against the qualified pair,
restore its owner-executable bit **before running the fixture**:

```sh
chmod u+x /absolute/public-downloads/OMXTerm-0.25.0-dev.19-arm64.AppImage
```

Downloads do not preserve executable mode. This changes file metadata, not bytes;
it requires no rebuild or helper installation. The fixture directly executes the
AppImage with `--appimage-extract`. The archive is only a controller-side digest
oracle: it is not copied into the app profile or returned by a chooser. The lane
pins this exact host/version/archive/URL and refuses catalog, controlled-catalog
and diagnostic combinations.

The existing macOS public-link mechanism fills the real Settings HTTPS field
and clicks **Install from link** for initial install and both subsequent installs,
including reinstall. Production HTTPS/validation is unchanged; no test CA,
transport interception, local-file fallback or catalog offer is used. Three
controlled native consents verify the Files name/version/ID, captured digest and
generations 0, 3 and 4. A direct link is not an Official catalog selection.

The existing bounded Linux0.7 consumer supplies operations/conflict, management,
retained terminal and active-backend normal Quit; no primitive, Trash, crash or
platform matrix is added. Scenario and Quit receipts require the same public URL
and all three Settings-link submissions. Each run creates a fresh `run-*` child
under `EVIDENCE`, preserving previous receipts. Inspect the actual Files and
terminal captures there, all process joins, complete stderr and Linux shared-service
preservation separately. Submitted-URL receipts describe the exercised UI route,
not an independent passive network trace. The actual public checkpoint passed
as recorded above; physical input/compositor and other-platform qualification
remain unestablished. At that checkpoint the Files0.6 catalogs remained unchanged.

### Files0.7 Linux packaged checkpoint

On 2026-11-06, an ordinary-user Fedora44 ARM64 guest passed seven bounded
scenario groups using fresh, locally built **OMXTerm0.25.0-dev.19** and
**Files0.7.0**. Host and archive were built from clean committed source
`0cb89accd61f1f5d5263c60773454882793e2e99`; the observer used
`cec0011a9e30089dc4341dcf3a457c0378d07325`, which changes tests/docs only.

- Host AppImage: 128,279,459 bytes, SHA-256
  `ac18dc2e08cbebed6a8b5ce08976eab2e0f043d407bd8b0f24113c1e87534f62`.
- Separate Files archive: 23,285 bytes, SHA-256
  `611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef`.
  Its fresh receipt retains `qualification.status: not-run`; actual qualification
  is recorded separately, not retrofitted into build provenance.

The untouched extracted package passed exact captured-byte consent and dormant
installation, filtering, Chromium keyboard/focus, confirmed directory conflict
without clobbering, a confirmed same-inode/content move with exact source absence,
Close/reset, Disable/Uninstall, reinstall retirement/dormancy, the same PTY/Surface
and third-consent active Files at normal Quit. All three backends exited zero
and closed; shell kernel exit, main exit/streams and owned process settlement
joined. The actual Files capture shows the completed move under its destination;
the final terminal capture shows the shell marker and prompt. The core-window
capture does not include the separate native child and is not Files paint proof.

Locked install/build, package inspection and the separate unchanged **FULL**
package verifier passed (eight startup events, direct/extract-and-run startup
and scoped helper checks). Formatting, lint, types, 6,409 headless unit tests
(10 skips), 39 focused builder/fixture checks and two GC-enabled cancellation
checks passed. No full portable/default-native suite or repeated Files primitive
matrix is claimed. Original document/desktop service identities, bus owners,
mount/FUSE scope, API/root enumeration and original consumer state matched before
launch, after settlement and after owned-scratch removal; no injected keys remained.

The passing Files run retained one Chromium negative-frame-latency diagnostic
and two portal atom-cache diagnostics; no user-facing failure was demonstrated,
and their cause is not established here. Synthetic input, controlled native
consent, X11 and WebContents captures are not physical-keyboard/drag/dialog or
compositor qualification. This is **local packaged-pair qualification, not
publication or public HTTPS consumption**. Local preparation and its review
corrections were integrated at `14a813bbf07f84195981592a2eef5319e7ae488d`.
The separately reviewed public-link consumer subsequently passed the
[actual public checkpoint](#files07-linux-public-link-checkpoint) above with
qualification source `ed84ce729e03656018eb2e1b971dd8f458123df3`. This does not
relabel the earlier locally built-host run. At that checkpoint both catalogs still
selected Files0.6. The later macOS local checkpoint is separate; other-platform
Files0.7 and surviving-browser main-death exclusion remain unqualified. Historical built-host checks and failures retain their original scope.

### Historical/current Files0.6 packaged lanes

For exact-package qualification, the separate opt-in
`test/integration/files-packaged.test.ts` takes absolute
`OMXTERM_FILES_PACKAGED_APPIMAGE` and `OMXTERM_FILES_PACKAGED_ARCHIVE` paths, plus
`OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256` and `OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256`
from the retained artifact receipts. Set `OMXTERM_FILES_PACKAGED_VERSION` to the
expected host version, `OMXTERM_FILES_PACKAGED_EXTENSION_VERSION` to the expected
archive version, and `OMXTERM_FILES_PACKAGED_EXTENSION_NAME` to its exact display
name. All three are required; neither version is inferred from the package under
test. For the stable source pair, these values are `0.24.0`, `0.6.0`, and
`Files — ARM64 preview`. Historical Linux Files0.4 uses the explicit name
`Files — Linux ARM64 preview`. The fixture checks the extracted host metadata and
running app against the expected host version. Before each Linux consent it checks
the displayed Files ID, expected name/version and selected archive SHA-256.

Set `OMXTERM_FILES_PACKAGED_EVIDENCE` to a separate evidence directory. Run the
fixture alone on the assigned idle ordinary-user Linux ARM64 desktop. It extracts
the exact AppImage, launches its unchanged executable/app.asar, and checks package
identity and unchanged bytes; it does not qualify FUSE launch or Linux helper
installation. For the exact `0.24.0` / Files `0.6.0` full lifecycle, it creates
an owned synthetic dotfile and requires the existing host-header, child-region,
toolbar, dotfile and address-draft checks in the scenario receipt. It also sends
fixture-controlled DOM `Ctrl+H` gestures to the focused child tree, checking both
visibility transitions, retained address draft/caret and native child focus. This
is not physical-keyboard or native shortcut-routing qualification. Attachment and
terminal-only diagnostics do not run or qualify these Files UI checks.

This fixture attaches only to a randomly assigned loopback main-inspector port
to observe backend retirement and supply native-dialog responses. The observer is
ordinary CommonJS loaded via Node `createRequire`: inspector evaluation does not
supply a dynamic-import callback. For attachment diagnosis only, set
`OMXTERM_FILES_PACKAGED_ATTACH_ONLY=1`; that checks module loading and actual
packaged identity, then quits without running Files. Its separately labeled
attachment-only outcome is never a Files lifecycle pass. Alternatively,
`OMXTERM_FILES_PACKAGED_TERMINAL_ONLY=1` checks the single-terminal renderer entry:
it captures the original missing-tab-button error, verifies corrected same-shell
input, and quits before Files. Select only one diagnostic stopping point; neither
qualifies the Files lifecycle. Product entry,
preload, runtime, resources and Files code remain the packaged bytes. It exercises
local captured-digest trust, dormant installation, real Files creation and
no-clobber conflict/move, reinstall retirement, fresh activation, disable/uninstall,
the same shell/Surface and normal Quit. The application PATH contains only shell
and X11 presentation support, not Node/npm/Python/compilers. Source checkout
modules are not used as product entries or dependency ancestors. Test-only
observer code is identified separately from the package and receives no publisher
or runtime authority outside this disposable test.

For catalog qualification, set `OMXTERM_FILES_PACKAGED_CATALOG=controlled` and
`OMXTERM_FILES_PACKAGED_CATALOG_FILE` to the generated candidate JSON. The same
packaged lifecycle first observes cold catalog failure, explicit retry, stale
snapshot retention and wrong-archive refusal before consent, then installs and
reinstalls exact Files bytes through the catalog. A fixture-only HTTPS request
interceptor routes only the fixed catalog and selected asset URLs to an owned
loopback TLS server with a one-day certificate (`/usr/bin/openssl` required).
Certificate verification stays enabled with an explicit fixture CA; production
endpoint/configuration and package bytes are unchanged. The server, sockets and
interceptor are retired before successful Quit. This is controlled transport
composition, **not public GitHub TLS/availability qualification**. Captures scroll
and focus the actual card or error notice, asserting its viewport bounds. A
controlled catalog-only next-patch offer, derived from the supplied release,
exercises rendered Update presentation. Archive requests are refused while that
synthetic offer is visible; it is never installed, and the exact original catalog
bytes are restored before Reinstall. This visual fixture does not qualify a real
newer Files artifact. Listener-count
checkpoints and warning traces distinguish lifecycle fan-out from retention;
the observer does not raise or suppress listener limits.

The prepared `OMXTERM_FILES_PACKAGED_CATALOG=public` adapter is a separate,
short checkpoint for the locally retained Linux ARM64 stable host `0.24.0` and
published Files `0.6.0`. In addition to the ordinary exact input paths and host
hash above, set:

```sh
OMXTERM_FILES_PACKAGED_CATALOG=public
OMXTERM_FILES_PACKAGED_CATALOG_SHA256=2ab4f15d697559a261a19dc014297200a277e60289e67bf788303d6fbc0eacda
OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256=50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143
```

The explicit catalog hash is the owner's confirmed readback of the legacy
endpoint at this promotion, not an assumption that a `main` URL is immutable.
The separate retained archive is an identity oracle, not a local install source;
its length must be 17,331 bytes. The fixture uses no controlled transport, fixture
CA, catalog file, direct-link or local-install fallback. It passively observes the
actual production IPC and authorized HTTPS response streams: the selected Files
card and opaque snapshot must match the exact endpoint bytes, immutable archive
URL, actual archive length/hash and three Official trust prompts at captured
installation generations 0, 1 and 5. Reinstall, Disable/Enable/Uninstall, the
original PTY/Surface and a live third activation at normal joined Quit are
checked; the full local Files UI campaign is not repeated. Fresh `run-*` evidence
prevents an older Quit receipt from qualifying the run. The supervisor's pass
covers the scenario and owned shutdown, not native-diagnostic disposition: a
truncated stderr fails this public checkpoint, and complete stderr still requires
manual review. Unknown diagnostics, including the observed #746 presentation
rejection, are not waived. Captures still need independent visual inspection;
synthetic Chromium input and controlled consent do
not qualify physical input or dialogs. A local stable host against public
extension URLs is **not** a publicly downloaded stable host. The adapter and its
headless tests alone are not a public checkpoint; the separately executed Linux
result is recorded [above](#files-060-linux-public-catalog-checkpoint). The historical
Files0.4 public result remains separate and unchanged. Its exact dev.11/Files0.4
fixture path and consent checks remain available as a legacy path, without the
new passive binding; it cannot qualify the stable pair, and the promoted endpoint
no longer offers its Files version. Neither catalog mode can be combined with
attachment/terminal-only diagnostics.

The existing packaged-process owner verifies actual main executable/lineage,
tracks children and joins exit/streams/owned settlement. `scenario.json` records
assertions, `quit.json` records backend exit/close and shell kernel exit at normal
Quit, and `supervisor.json` records the native outcome/cleanup distinction. A
failure preserves its profile/diagnostics, never a successful cleanup as a pass.
Before cleanup, the packaged fixture attempts one bounded `listing-failure.json`
snapshot of hosted-view count and listing DOM state (role, busy, summary, row
count and whether the directory belongs to the fixture). It omits directory
paths, redacts path-bearing summaries and reports snapshot unavailability without
replacing the original failure. Settled listing errors are not readiness: the
fixtures require current singular/plural or supported legacy success summaries.
Input is synthetic Chromium and trust answers are controlled, not physical native
dialog qualification. Successful inspection-only evidence does not substitute for
this opt-in vertical.

Qualification is scoped to distinct observations, not one final replay on a
single source revision:

- **Production workflow:** local Settings trust, shared actions, two views sharing
  a backend, create/folder/no-clobber move/trash/confirmed deletion, backend loss
  without replay, disable/uninstall, retained draft, same-PTY continuity and joined
  Quit passed. The composed window was inspected; selected hosted Copy/Paste and
  About were exercised separately.
- **Native view lifecycle:** dormant installation, modal refusal and hosted-renderer
  crash retirement passed with the core responsive and backend active. No per-view
  renderer-process isolation is promised.
- **Module-native management:** real manager/store/runtime, Files archive, leases
  and children established backend exit/close before Enable, dormant Enable,
  fresh-generation activation and an independent view pin; both children settled
  cooperatively. Controlled view presentation is not graphical recovery. Headless
  renderer/main/store checks cover admission and stale generations; a resolved DOM
  click does not prove that a disabled control sent a request.
- **Actual main death:** after main SIGKILL, the hosted renderer exited. An
  independent backend pin retained the delivered/read version A through uninstall
  and collection attempts until backend kernel exit, then collection succeeded.
  The original orphan's exit code was unknown. This does not prove universal
  renderer termination or a surviving renderer's later/fresh A or B read exclusion.

Historical composite recovery attempts remain failed: Disable admission, an
earlier directory-list failure and an uncorrelated negative backend reply remain
unexplained. Later fixture corrections and passing checks do not resolve them.
**Surviving-browser main-death file-read exclusion remains unqualified**; normal
retirement or all-browser exit cannot establish it. These Linux ARM64 observations
do not qualify other platforms, a display/locale matrix, signed distribution or
a stable SDK.
