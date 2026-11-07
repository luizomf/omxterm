# Exact macOS ARM64 Files consumer checkpoint

The [bounded exact-pair checkpoint](../../docs/files-development-preview.md#files-050-macos-controlled-qualification)
passed on 2026-10-31; this procedure itself is not a publication receipt or
qualification of other inputs. Run only on the
assigned ordinary-user unlocked, idle Aqua guest, after root-owned executable,
artifact and ownership preflight. Follow the [macOS preference precautions](../../docs/development.md#macos-preferences-and-native-verification);
the isolated paths do not protect the guest user's OS preferences. Never use the
owner's desktop. No Quartz or physical-input qualification is selected.

## Separate immutable inputs

Use the separately retained exact host and Files archive; do not rebuild or
replace the selected Files0.6.0 release trio. For a different local-only source
experiment, `node scripts/build-files-extension.mjs /absolute/new-files.omxext
FULL_SOURCE_COMMIT darwin-arm64` writes new archive/checksum/JSON files and refuses
replacement. A supplied commit is labeled `supplied-commit`; the owner verifies
exported source identity. The build receipt's intended host is not proof of the
actual host used. `not-run` is never rewritten after native execution: record
actual qualification separately.

```sh
OMXTERM_FILES_DMG_DMG=/absolute/retained-host.dmg \
OMXTERM_FILES_DMG_DMG_SHA256=EXACT_DMG_SHA256 \
OMXTERM_FILES_DMG_ARCHIVE=/absolute/new-files.omxext \
OMXTERM_FILES_DMG_ARCHIVE_SHA256=EXACT_ARCHIVE_SHA256 \
OMXTERM_FILES_DMG_VERSION=0.24.0-dev.21 \
OMXTERM_FILES_DMG_EVIDENCE=/absolute/private-lane \
  npm test -- test/integration/files-dmg.test.ts
```

For the current Files0.6.0 archive, additionally set
`OMXTERM_FILES_DMG_EXTENSION_VERSION=0.6.0`; omitting it retains the historical
Files0.5.0 expectation shown in the example. The observer checks this version,
the manifest ID and the exact archive digest at trust. This local mode adds a
fixture-owned dotfile and checks the packaged host title, icon controls, visible
Go explanation, default filtering, toggle and retained address draft/caret.
A source build is not qualification or permission to replace a published archive.

No opt-in skips; partial, malformed or mixed adapter inputs refuse. Source
Node/npm/esbuild and Command Line Tools are fixture preparation dependencies,
not user installation dependencies. The fixture compiles the small test-only
Foundation directory lookup with `/usr/bin/xcrun clang++`; it does not compile
or replace the retained application's addons. The app uses system PATH, isolated
HOME/XDG/profile, native macOS graphics and Chromium sandboxing. No Linux flags,
replacement application entry, changed ASAR, automatic permission requests or
catalog/network interception is involved.

`files-dmg.ts` uses the existing `snippets-dmg.ts` readonly mount/copy/bundle
identity/seal functions and the existing finite `snippets-dmg-main.ts` controller
under `runNativeFixture`. The controller selects the actual Files CommonJS
observer through a loopback inspector. Snippets retains its original default
observer and input assertions. A new generic campaign framework is not introduced.

## Files0.7 macOS Files-only mode

On an assigned disposable, unlocked ordinary-user macOS ARM64 guest, after the
[console and resource checks](../../docs/development.md#macos-console-admission),
use independently verified public inputs and a fresh private evidence lane:

```sh
OMXTERM_FILES_DMG_DMG=/absolute/OMXTerm-0.25.0-arm64.dmg \
OMXTERM_FILES_DMG_DMG_SHA256=eab799c16150ddb0852299a669df53cf7eb098cf223978cc30aa34ea8a20f32c \
OMXTERM_FILES_DMG_ARCHIVE=/absolute/files-0.7.0.omxext \
OMXTERM_FILES_DMG_ARCHIVE_SHA256=611886517ee1bd662c8d6bbed2a7673f3b9994ba0d68724be76251427b3c72ef \
OMXTERM_FILES_DMG_VERSION=0.25.0 \
OMXTERM_FILES_DMG_EXTENSION_VERSION=0.7.0 \
OMXTERM_FILES_DMG_FILES_070_ONLY=1 \
OMXTERM_FILES_DMG_EVIDENCE=/absolute/private-lane \
npm test -- test/integration/files-dmg.test.ts
```

The mode refuses other host/archive identities and direct-link acquisition. Its
local form uses a copied DMG app, exact local captured-byte consent, the installed backend
and a synthetic guest-owned tree. It checks loaded filtering and keyboard focus,
cancelled confirmation, conflict preservation, confirmed same-inode/content
move, refreshed UI and active-backend normal Quit. It sends no terminal input
and does not request terminal-directory, insertion or drag. It does not exercise
trash, reinstall or public catalog/link consumption. The selected observer uses
synthetic Chromium input, not the OS clipboard. Inspect captures and process
settlement separately; neither DOM predicates nor a copied app prove compositor
or Finder behavior.

The [actual prior run](../../docs/files-development-preview.md#files07-macos-stable-local-checkpoint)
used a temporary adapted controller; this durable mode's local filesystem form
has not itself been run natively. The mapping is:

- The executed Files consumer used the existing 0.7 filtering/move code, added
  the cancellation check, and ended after the completed-move capture. The durable
  shared consumer gates the same cancellation check and early return on
  `filesOnly`, preserving the Linux continuation otherwise.
- The executed packaged observer skipped the initial terminal-input call and
  omitted the unused continuation. The durable observer keeps legacy branches,
  skips that call for this mode and additionally refuses terminal calls in it.
- The executed local adapter checked one approval and active backend, then joined
  backend exit/close at Quit. The durable adapter retains those checks and adds
  an explicit mode guard. The durable DMG wrapper adds exact host identity
  admission and retains the existing supervisor and read-only mount/copy paths.
  These are guards/composition changes, not a new host or archive build.
- The short public-catalog branch is additional behavior, not inferred from the
  local run. It later passed its own [public checkpoint](../../docs/files-development-preview.md#files07-macos-public-catalog-checkpoint)
  with committed controller `c5e7c436ec67e27c5ef155e22cfbcea1f640452c`.
  Existing local, public-link and public-catalog results remain distinct.

### Public-catalog consumption

After verifying the public endpoint's exact readback, the same exact-pair inputs
above may additionally set:

```sh
OMXTERM_FILES_DMG_PUBLIC_CATALOG=https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json
```

This separate short mode uses real Settings Browse and the exact
Files0.7 card, production HTTPS, one catalog-bound captured-byte consent at
generation 0, dormant installation, explicit activation and active-backend
normal Quit. The separately downloaded archive is only a controller digest
oracle; no local chooser or direct-link fallback is permitted. It does not repeat
the filesystem/filter matrix; reuse the prior local exact-pair result only for
matching inputs. The recorded endpoint and install action are not a passive
network trace. The [bounded actual public result](../../docs/files-development-preview.md#files07-macos-public-catalog-checkpoint)
records the separate endpoint readback, executed controller and limits; later
runs require their own fresh input/endpoint verification and native outcome.

## Public-link mode

The default local eleven-check campaign above is unchanged. The separate bounded
public-acquisition mode passed all six checks on 2026-10-31 using exact public
dev.21/Files0.5 bytes and fixture source `ad6adc0`; see the
[actual outcome and limitations](../../docs/files-development-preview.md#macos-link-first-distribution).
This is not qualification of other inputs. After release asset verification,
supply all ordinary inputs above plus:

```sh
OMXTERM_FILES_DMG_PUBLIC_LINK=https://github.com/luizomf/omxterm/releases/download/ext-files-v0.5.0/files-0.5.0-a343704c0794.omxext
```

Export that variable for the test invocation (or add it as another inline
assignment). The URL must be an exact immutable project Files0.5 HTTPS archive,
without credentials, query or fragment. `ARCHIVE` is the separately downloaded
public archive used only as a hash oracle; the fixture does **not** copy it into
the app's profile or return it through a local chooser. `DMG` must also be the
verified public download. Root records their public readback provenance separately.
The example identifies the published immutable Files0.5 asset.

The observer fills the real Settings **HTTPS archive link** field and clicks
**Install from link** for initial install, reinstall and the final install before
Quit. Production HTTPS/download/validation runs unchanged; no fixture CA, catalog
server, transport interception, preload install shortcut or mocked archive bytes.
Native consent remains controlled and asserts Files0.5 name/version, package ID
and exact captured digest before approval. Direct links do not carry an Official
catalog descriptor. Local chooser use in this mode fails the fixture.

Six scenario checks cover exact-byte dormant install, real create/move/conflict,
reinstall retirement/dormancy, activation/Disable/dormant Enable/Uninstall, the
same PTY/Surface and third-consent active Files at normal Quit. Existing controller
and observer joins still require three normal backend exit/close outcomes, shell
exit, normal main exit, stream closure and descendant settlement. `scenario.json`
and `quit.json` record the public URL and three submitted link installations;
artifact hashes, consent counts and selected checks must match. Failure preserves
the existing lane ownership/evidence rules, never substitutes local installation.

This mode does not compile the Foundation lookup, prepare a recovery entry, trash,
permanently delete, close the source terminal, or replay retained draft/transition
matrices. No `trash-lookup.json` or `trash-recovery.json` is expected. Inspect actual
Files/terminal captures separately. In the actual checkpoint, terminal paint was
accepted but the Files operation capture was stale and is not final-move visual
proof; destination bytes and source `ENOENT` passed independently. Public link
acquisition is not public catalog
discovery or physical-input/Gatekeeper qualification. That historical checkpoint
did not modify the v1 Linux0.4 catalog or any immutable asset.

## Public-catalog mode

The following Files0.5 recipe records the **historical** six-check checkpoint
that passed on published dev.26 on 2026-10-31; see [actual evidence and limits](../../docs/files-development-preview.md#macos-catalog-distribution).
After the historical Files0.6 promotion, the old Files0.5 card was no longer
available there. The current catalog selects Files0.7; the earlier
[Files0.6 checkpoint](#prepared-files06-public-catalog-checkpoint) remains historical. Published dev.21 still selects the legacy Linux Files offer; its existing
local/link qualification cannot prove macOS catalog discovery.

For that historical 0.5 run, the ordinary DMG/hash/archive/hash/version/evidence
inputs used the exact then-selected host plus this assignment instead of `PUBLIC_LINK`:

```sh
OMXTERM_FILES_DMG_PUBLIC_CATALOG=https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json
```

Only that fixed URL is accepted; mixed public modes refuse. The endpoint value
is a fixture expectation/receipt, **not an override of production fetching**.
ROOT separately verifies host selection code and exact public endpoint readback.
The original immutable Files0.5 archive remains an external digest oracle, never
copied into the profile or supplied through a local chooser. No transport
interceptor, fixture CA, archive rebuild or Foundation lookup is involved.

The short six-check public-link scope is reused: real Browse, the exact Files0.5
card's Install, Reinstall, then Install after Uninstall, with three exact digest,
manifest and **Official catalog** consents. Clicks and catalog captures select the
Files card rather than another tool's identically labeled button. Incompatible
SSH catalog buttons do not count as pending Settings management; the selected
Files action must still be enabled. No direct-link or local fallback is allowed.
Dormant installation/Enable, basic create/move/conflict, retirement/management,
the same PTY/Surface and third-activation active Files at normal Quit retain the
short-mode assertions and actual exit/stream joins. Trash, source-terminal-close
and retained-state matrices are not replayed.

`scenario.json` and `quit.json` add `publicCatalog` with the configured URL and
`["Install", "Reinstall", "Install"]`; the ordinary `catalog` field records public
mode with null request/transport observations. This is **not a passive network
trace** and makes no packaged assertion of absent startup/reopen requests. Only
the controlled transport lane can assert its request counts. ROOT owns public
byte verification, exact-package provenance and later actual execution.

Public-link and public-catalog observers now gate `files.png` on the completed
move notice, inactive/hidden editor, successful nonbusy listing of the exact
fixture directory, destination row present and source row absent. They then
await two animation-frame callbacks in that same child, recheck the predicates,
and capture it before switching to Settings. This is render-opportunity ordering,
not an acknowledgement of compositor submission or fresh pixels. Local legacy
and the longer macOS lifecycle mode retain their different final-state capture
path. Headless actual-page/caller tests cover refusal and capture ordering; they
do not reproduce or resolve the historical stale image. Inspect the resulting
image on the next bounded native consumption checkpoint before claiming improved
paint evidence. No native replay or package rebuild is implied by this observer
change; original excluded captures stay excluded.

Inspect captures separately; a DOM success or named image is not final-operation
paint proof. Existing synthetic-input, controlled-consent, native-I/O cancellation,
physical/Gatekeeper and main-death limitations remain. Preserve the complete
legacy endpoint and original immutable releases. This mode neither republishes
Files0.5 nor teaches already published dev.21 a new endpoint.

### Prepared Files0.6 public-catalog checkpoint

The [bounded Files0.6 public-catalog checkpoint](../../docs/files-development-preview.md#files-060-macos-public-catalog-checkpoint)
passed on 2026-11-02 using a retained locally built host DMG, not a downloaded
public stable host. A separate run requires verification that the selected public endpoint still
offers those exact bytes; the current catalog selects Files0.7 instead. Keep the original Files0.5 instructions, receipts and captures
as historical separate evidence; do not overwrite or relabel them.

Use the exact independently downloaded Files0.6 archive as `ARCHIVE` and set:

```sh
OMXTERM_FILES_DMG_EXTENSION_VERSION=0.6.0
OMXTERM_FILES_DMG_ARCHIVE_SHA256=50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143
OMXTERM_FILES_DMG_PUBLIC_CATALOG=https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json
```

Export these along with the ordinary absolute DMG/archive/evidence paths, exact DMG
hash and actual host version above. The adapter refuses a different Files0.6 hash
or archive length (17,331 bytes), selects and captures only the Files0.6 card, and
requires the exact Official warning, package ID, digest and captured generations
0, 1 and 5 before the three approvals. The host enforces catalog size/hash and
manifest ID/version/engine equality. The six scenario checks, joined shutdown and
no-fallback boundaries remain the same. Actual captured-image inspection remains
separate from DOM success; source tests do not establish native rendering or public
consumption. A local stable host used against public extension endpoints is not a
freshly downloaded public stable host: record host provenance accordingly.

## One-entry Trash oracle

The production Files service intentionally discards Foundation's returned Trash
path. `files-trash-directory.mm` only asks Foundation for `NSTrashDirectory` in
`NSUserDomainMask` with `create:NO`; it never trashes, enumerates or creates a
Trash directory. The SDK declares that directory since macOS10.8. Its
`NSFileManager.h` documents `appropriateForURL` for item-replacement lookup, so
this fixture does not assume that parameter selects arbitrary-volume Trash.
Instead `files-trash-recovery.cjs` requires the owned source parent and returned
user Trash directory to have the same device identity. Root must establish this
local-volume lane and lookup permissions during guest preflight.

Before the UI operation, create one unique owned filename, check its expected
Trash child is absent, and durably record source device/inode/content plus Trash
directory identity in a mode0600 receipt. Then **Move to Trash in the installed
Files page** invokes the real backend/bootstrap/native service. UI completion and
row removal are necessary but insufficient. Verify only the exact expected child
by directory identity, device/inode and contents, then restore through the exact
packaged addon's no-clobber move. The direct addon call is recovery only, never a
substitute trash operation. Verify restored identity/content and Trash-child
absence; leave the restored fixture file inside the retained owned profile.

The SDK expressly permits renaming the trashed item. The unique-name assumption
is therefore a bounded test oracle, not an OS guarantee. Unexpected rename,
lookup failure, device mismatch, identity/content mismatch or restore failure
fails the checkpoint and preserves source/Trash/evidence for deliberate recovery.
No unrelated Trash enumeration, blind cleanup, retry, permanent deletion or
production result-path API compensates for it. A staged `.next.json` receipt
also survives failure and refuses replacement. A missing or unverified destination
is never recoverability proof, even if the source disappeared. Root must inspect
and settle the entry before removing a failed profile or starting another run.

## Legacy local lifecycle assertions

This checklist applies to the original local lifecycle campaign. Files0.7
Files-only, public-link and public-catalog modes use their own checklists above;
they do not inherit this campaign's three consents or Trash requirements.

- Exact local captured-byte trust, dormant installation, explicit Files menu
  activation, real installed backend/listing and captured OSC7 directory.
- One retained companion outside tabs, correct native focus across hiding,
  Settings and terminal switches. Close its original source terminal while a
  distinct survivor remains; retain the same Files view/backend. Never claim
  the closed source PTY continued.
- Real create-file/folder, no-clobber conflict preserving both entries, successful
  move, cancel/fresh-confirm permanent deletion, real backend/UI trash with the
  one-entry recoverability oracle.
- Same operation-editor node, draft/caret and backend across hide/reveal.
- Exact reinstall retirement/dormancy, explicit fresh activation, joined Disable,
  dormant Enable, Uninstall, and continued surviving PTY/Surface. Close Settings
  and verify terminal focus before the final terminal capture.
- Third deliberate exact-byte consent and explicit activation leave a **live Files
  backend/view at normal Quit**. All backend exit/close events, baseline and
  surviving shell kernel exits, normal main exit0, stream closure and captured
  descendant settlement must join. Forced cleanup cannot become normal Quit PASS.

`scenario.json`, `quit.json`, `controller.json`, `artifacts.json`,
`trash-lookup.json`, `trash-recovery.json` and supervisor receipts retain distinct
facts. A successful legacy local receipt requires all its checks, three consents
and verified restoration. Captures require actual inspection; separate WebContents
captures are not full OS-compositor evidence.

Each run has fresh `run-*` evidence, but the same configured evidence lane owns
the unresolved-ownership guard. Never switch lanes to evade it. The copied app,
profile and evidence remain outside the supervisor's disposable launcher and are
retained on every outcome. Root owns later cleanup. Artifact/bundle/tool hashes
are checked after work, including failure; cancellation/finalization failure
cannot publish PASS. Missing/truncated/finalizing receipts are not success.

No primitive nine-group replay, unexpected backend crash, blocked native-I/O
cancellation, read-only/unavailable volume, macOS12, surviving-browser main-death,
physical keyboard/dialog, Finder/Gatekeeper/notarization, catalog promotion or
public installation is qualified by the local mode. The public-link mode above
must record its own actual result. At the historical link-first checkpoint the Linux0.4 catalog remained unchanged.
The single Files release slot cannot independently offer Linux0.4/dev11 and
macOS0.5/dev21. Published dev.21 retains deliberate link/local installation;
public-catalog mode requires a host selecting the separate complete macOS schema1
endpoint. Later catalog promotion does not rewrite historical capture evidence.
