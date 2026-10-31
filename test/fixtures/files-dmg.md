# Exact macOS ARM64 Files consumer checkpoint

The [bounded exact-pair checkpoint](../../docs/files-development-preview.md#files-050-macos-controlled-qualification)
passed on 2026-10-31; this procedure itself is not a publication receipt or
qualification of other inputs. Run only on the
assigned ordinary-user unlocked, idle Aqua guest, after root-owned executable,
artifact and ownership preflight. Never use the owner's desktop. No Quartz or
physical-input qualification is selected.

## Separate immutable inputs

Build corrected Files0.5.0 from committed clean source:

```sh
node scripts/build-files-extension.mjs /absolute/new-files.omxext FULL_SOURCE_COMMIT darwin-arm64
```

The supplied commit is labeled `supplied-commit`; the owner verifies exported
source identity. Omit optional arguments for clean-Git/default Linux intent.
Archive/checksum/JSON refuse replacement. The receipt's source host version may
be dev.22 while the actual compatible retained host is dev.21. `not-run` is never
rewritten after native execution: record actual qualification separately.

```sh
OMXTERM_FILES_DMG_DMG=/absolute/retained-host.dmg \
OMXTERM_FILES_DMG_DMG_SHA256=EXACT_DMG_SHA256 \
OMXTERM_FILES_DMG_ARCHIVE=/absolute/new-files.omxext \
OMXTERM_FILES_DMG_ARCHIVE_SHA256=EXACT_ARCHIVE_SHA256 \
OMXTERM_FILES_DMG_VERSION=0.24.0-dev.21 \
OMXTERM_FILES_DMG_EVIDENCE=/absolute/private-lane \
  npm test -- test/integration/files-dmg.test.ts
```

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
discovery or physical-input/Gatekeeper qualification. Keep the v1 Linux0.4 catalog
and all immutable assets unchanged.

## Public-catalog mode

Prepared for a **new macOS host containing target-specific catalog selection**;
this is not an execution or publication receipt. Published dev.21 still selects
the legacy Linux Files offer. Its existing local/link qualification cannot prove
new catalog discovery.

Supply the ordinary DMG/hash/archive/hash/version/evidence inputs, using the exact
new host version, plus this assignment instead of `PUBLIC_LINK`:

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

Inspect captures separately; a DOM success or named image is not final-operation
paint proof. Existing synthetic-input, controlled-consent, native-I/O cancellation,
physical/Gatekeeper and main-death limitations remain. Preserve the complete
legacy endpoint and original immutable releases. This mode neither republishes
Files0.5 nor teaches already published dev.21 a new endpoint.

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

## Actual assertions when executed

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
facts. A successful receipt requires all selected checks, three consents and
verified restoration. Captures require actual inspection; separate WebContents
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
must record its own actual result. The immutable Linux0.4 catalog remains intact.
Its single Files release slot cannot independently offer Linux0.4/dev11 and
macOS0.5/dev21. Published dev.21 retains deliberate link/local installation;
the prepared public-catalog mode above requires a new host and separate complete
macOS schema1 endpoint, not silent replacement of the Linux offer.
