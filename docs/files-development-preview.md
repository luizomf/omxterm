# Files development preview implementation

Files is a separately installed Linux ARM64 development preview
([#723](https://github.com/luizomf/omxterm/issues/723),
[#728](https://github.com/luizomf/omxterm/issues/728)), not a stable extension SDK.
The published [Files 0.1.0 archive](https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.1.0)
works with the separately published [host dev.9](https://github.com/luizomf/omxterm/releases/tag/v0.23.0-dev.9)
and [stable host 0.23.0](https://github.com/luizomf/omxterm/releases/tag/v0.23.0).
Public catalog/archive installation passed on both exact extracted AppImages,
including Files operations/conflicts, reinstall/management, same-PTY continuity
and joined Quit. Input and consent were fixture-controlled; extraction does not
qualify FUSE/helper installation. See the stable release notes for its separate
package checks and [below](#build-and-evidence-boundary) for other evidence limits.

The [foundation's exact-host exception](extension-installation-foundation.md#archive-contract)
admits unchanged Files 0.1.0 on hosts 0.24.0-dev.0, dev.1 and dev.2 without
broadening its manifest range or replacing published bytes. The
[Saved Layout delivery](https://github.com/luizomf/omxterm/issues/673#issuecomment-6495927726)
records the unchanged archive's lifecycle check on dev.1. Admission on dev.2 is
not dev.2 package or Files lifecycle qualification; earlier host evidence does
not qualify every admitted version.

## Concrete consumer

`extensions/files` is separately built, not imported into application main or the
terminal renderer. Maintainers run `node scripts/build-files-extension.mjs` to
produce `dist/extensions/files-0.1.0.omxext`. This build needs Python 3's ZIP
writer and the locked esbuild tool; users receive the precompiled archive and do
not run Python/npm or compilation to install it. An existing destination is not
overwritten. The archive includes its MIT license. Version and compatibility come from
`extensions/files/extension.json`; the minimum host is now `0.23.0-dev.8`.
Existing #622 attribution and third-party notices elsewhere in the application
remain unchanged.

The builder also writes `<archive>.sha256` and `<archive>.json`, refusing to
replace any of the three outputs. The JSON binds the final archive size/digest,
manifest, source commit, lockfile digest and Node/esbuild/Python versions. From a
Git checkout, commit changes first: the builder requires a clean source tree.
For an exported source tree, supply the original full commit as the second
argument after the output filename; the receipt labels it `supplied-commit`,
not a locally verified Git identity. Maintainers must verify that transport
against the commit. A build receipt records the intended host/target with
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
back to permanent deletion. Dispatched desktop-command failure is conservatively
unknown. No failed or uncertain mutation is retried automatically.

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
default or configurable shortcut. Terminal-popup actions must claim the same live,
one-shot popup/window target as core actions. All explicit openings pass through
core renderer modal admission before activation. Files and SSH Connect use one
retained companion view per tool/window. Concurrent opens coalesce; later opens
revalidate the captured package generation and reveal that view instead of
allocating another epoch. The main-owned presentation policy recognizes their
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

Main owns the fixed project HTTPS endpoint and captured release selections. Before
trust, downloaded length/SHA-256 and manifest ID/version/engine strings must match
exactly; there is no fallback to unchecked link installation. The same native
trusted-code warning applies. Official means project-maintained, not harmless,
sandboxed or independently signed. Update offers a newer compatible release;
Reinstall requires identical installed bytes. Downgrades or same-version different
bytes carry explicit replacement warnings, including in the native consent dialog.
Installation/replacement remains dormant. Cancel or owner loss before approval
revokes consent; publication already dispatched cannot be recalled or retried
implicitly. Refresh cannot retarget a captured installation.

Files0.1.0 still supports local/link installation on dev.8; catalog-capable host
source starts at dev.9. Declared compatibility is not qualification of every version.
See [distribution](extension-distribution.md) and the
[publication procedure](release.md#files-catalog-publication). An empty source
catalog does not mean a usable public preview has shipped.

## Build and evidence boundary

Normal Linux ARM64 application builds include the bootstrap, independent native
lease addon and Files no-replace addon. The tiny Node-API8 worker-pool adapter
uses Linux `renameat2(RENAME_NOREPLACE)`, at most32 pending calls and fixed error
categories. Destination conflicts, permissions, unsupported filesystems and
cross-device moves fail explicitly. Other platforms are not enabled by this
preview and have no overwrite fallback. Explicit runtime builds remain available.
No fuse or Electron version change is required.

`test/fixtures/files-move-native.mjs <absolute-addon>` must run under the bundled
Electron executable with `ELECTRON_RUN_AS_NODE=1`, as an ordinary Linux ARM64
user, inside an assigned disposable environment. It checks actual file/directory/
symlink moves, destination races, permissions and cross-device refusal. Source
inspection and controlled adapter tests are not native qualification.

The opt-in `test/integration/files-production.test.ts` runs the already-built
production entry point when `OMXTERM_FILES_PRODUCTION_SOURCE` names its exact
source directory on an assigned Linux ARM64 guest. Build the app and separate
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
controlled catalog-only `0.2.0` offer exercises rendered Update presentation;
it is never installed and the original `0.1.0` offer is restored before Reinstall.
This visual fixture does not qualify a real Files `0.2.0` artifact. Listener-count
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
