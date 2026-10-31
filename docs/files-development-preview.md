# Files development preview implementation

Files is a separately installed Linux and macOS ARM64 development preview
([#723](https://github.com/luizomf/omxterm/issues/723),
[#728](https://github.com/luizomf/omxterm/issues/728)), not a stable extension SDK.
The current catalog offers [Files 0.4.0](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.4.0)
for Linux ARM64, requiring host `>=0.24.0-dev.8` and API `0.1.x`. The exact
controlled-qualified pair uses the already-public
[host 0.24.0-dev.11](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11)
AppImage, not a new host build. The archive and both original sidecars were
published and anonymously byte-verified on 2026-10-30. The separate actual
public-HTTPS consumption checkpoint after catalog integration also passed;
it is distinct from controlled transport and release downloads. See
[current qualification](#files-040-distribution-and-controlled-qualification).

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

Source now builds **Files 0.5.0 — ARM64 preview**, requiring host
`>=0.24.0-dev.21` and API `0.1.x`. It includes the corrected raw-path forwarding
for optional host trash. This is a new archive identity, not a replacement or
new qualification of immutable Files0.4.0. The legacy catalog remains Linux-only0.4.0;
macOS published dev.21 uses the separately published link-first pair described below.
Current source selects a separate macOS0.5 catalog; its new-host distribution
checkpoint remains separate.

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

The legacy v1 catalog stays unchanged, preserving Linux0.4/dev.11 and
SSH/Snippets. Its one-release-per-ID format cannot independently select Linux0.4
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
produce `dist/extensions/files-0.5.0.omxext`. This build needs Python 3's ZIP
writer and the locked esbuild tool; users receive the precompiled archive and do
not run Python/npm or compilation to install it. An existing destination is not
overwritten. The archive includes its MIT license. Version and compatibility come from
`extensions/files/extension.json`; source version 0.5.0 requires host
`0.24.0-dev.21` or later for the macOS trash service. Historical0.4.0 requires
`0.24.0-dev.8` or later for the hosted-language subscription. The legacy catalog
selects the original0.4.0 archive; the new macOS endpoint selects original0.5.0.
Neither is rebuilt from the catalog commit.
The historical 0.1.0 release remains immutable; building source alone does not
update the published catalog.

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
expanded. **Open directory** changes the browsing root; Home, Up and the absolute
address field remain available.

**Actions…** exposes operations for the selection; right-click an item or blank
listing space for actions at that location. Shift+F10/the context-menu key opens
the same menu from a focused row, and F2 opens Rename / move. Menus support arrow
navigation; Tab or clicking outside dismisses a menu. In the companion panel,
Escape is owned by the host and hides the entire panel, closing transient menus
but retaining operation drafts. Use **Cancel** to discard an editor without
hiding Files. New file/folder uses the targeted folder (or a targeted
file's parent); background actions use the browsing root. Permanent deletion
still requires explicit confirmation. Editors keep captured paths even if the
selection or browsing root changes.

Successful creation, move, trash and deletion automatically refresh the current
root and surviving expanded folders, preserving selection where possible. A late
mutation result never navigates back to its old root. Collapsing drops hidden
subtrees; refresh errors remain visible rather than implying rollback or retrying
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
confirmations are retained. At capacity, a new request expires the oldest retained
token rather than allowing abandoned views to reserve capacity forever. In-flight
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
it. Its initial terminal context is still copied before asynchronous activation:
Use terminal directory reports that captured local OSC7 provenance, never later
selection or process inspection. Closing the source terminal preserves the panel;
window loss, backend loss and package management still retire it. Hiding the panel
retains its state and does not cancel or replay an accepted filesystem mutation. No local report means an explicit unavailable
result, with Home and explicit paths still usable. Views reserve a 34-DIP
core-owned recovery strip, further intersected with the real renderer slot.

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

## Official catalog

Settings → Extensions offers **Browse official extensions** and explicit Refresh.
No request is made on startup or reopening Settings. Failed refresh retains the
last successful in-memory snapshot with a stale warning; cold offline failure is
unavailable, not an empty catalog. Local-file installation and installed management
remain usable. en-US/pt-BR controls relabel without repeating requests.

Main owns the fixed project HTTPS endpoints and captured release selections.
Current source chooses the complete `official-extensions-darwin-arm64-v1.json`
for macOS ARM64; every other target retains `official-extensions-v1.json`.
Only one endpoint is fetched, with no merge or fallback. The new endpoint
selects original Files0.5 for macOS and copies SSH/Snippets unchanged; common
entries must remain equal across both documents. Published dev.21 still embeds
the legacy URL. It does not gain discovery from the new JSON: a newly packaged
host and separate actual public-catalog checkpoint are required. Earlier
link-first qualification is not evidence for this new route. Before
trust, downloaded length/SHA-256 and manifest ID/version/engine strings must match
exactly; there is no fallback to unchecked link installation. The same native
trusted-code warning applies. Official means project-maintained, not harmless,
sandboxed or independently signed. Update offers a newer compatible release;
Reinstall requires identical installed bytes. Downgrades or same-version different
bytes carry explicit replacement warnings, including in the native consent dialog.
Installation/replacement remains dormant. Cancel or owner loss before approval
revokes consent; publication already dispatched cannot be recalled or retried
implicitly. Refresh cannot retarget a captured installation.

The legacy Files0.4.0 entry excludes stable0.23.0 and the older preview hosts.
The macOS Files0.5 entry requires at least dev.21, independently of which new
host first delivers the endpoint selection.
Historical Files0.1.0 remains available for local/link installation from
0.23.0-dev.8; catalog-capable host source started at 0.23.0-dev.9. The catalog
is not an index of every historical release. Declared compatibility is not
qualification of every version.
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
refusal, not a recoverable Trash operation. An assigned ordinary-user
macOS ARM64 environment can run the prepared fixture with the bundled Electron:

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
Set `OMXTERM_FILES_HTTPS=1` on that same opt-in fixture for the bounded HTTPS
installation lane instead of the full Files operations scenario. It requires
`openssl`, creates a one-day localhost test certificate and supplies it only to
the child via `NODE_EXTRA_CA_CERTS`; production TLS verification is not disabled.
It exercises a real stalled HTTPS stream/cancellation, malformed archive rejection,
relative redirect, captured-byte native consent/dormant installation, explicit
local replacement, retained real terminal/PTY and joined Quit. Its loopback TLS
server is fixture-owned and closed before Quit. Consent answers and clicks remain
controlled; it does not qualify public hosting, physical dialogs or other platforms.

For exact-package qualification, the separate opt-in
`test/integration/files-packaged.test.ts` takes absolute
`OMXTERM_FILES_PACKAGED_APPIMAGE` and `OMXTERM_FILES_PACKAGED_ARCHIVE` paths, plus
`OMXTERM_FILES_PACKAGED_APPIMAGE_SHA256` and `OMXTERM_FILES_PACKAGED_ARCHIVE_SHA256`
from the retained artifact receipts. Set `OMXTERM_FILES_PACKAGED_EVIDENCE` to a
separate evidence directory. Run it alone on the assigned idle ordinary-user
Linux ARM64 desktop. It extracts the exact AppImage, launches its unchanged
executable/app.asar, and checks package identity and unchanged bytes; it does not
qualify FUSE launch or Linux helper installation.

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

After actual publication, `OMXTERM_FILES_PACKAGED_CATALOG=public` uses the fixed
public endpoint and release URLs without interception, fixture CA or catalog file.
It skips the controlled offline/wrong-byte negatives, retaining catalog install,
reinstall and the full Files/PTY/Quit assertions against the supplied known archive
hash. Record this as a separate source/artifact/public-readback milestone. Neither
catalog mode can be combined with attachment/terminal-only diagnostics.

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
