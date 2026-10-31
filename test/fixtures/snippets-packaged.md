# Installed Snippets native qualification

This fixture exercises an ordinary `.omxext` install and explicit trust through
Settings, followed by real hosted-page requests through production semantic
admission, presentation, Surface and PTY delivery. Source, exact-AppImage and exact-DMG
adapters share one current ten-check scenario body. Historical nine-scenario
receipts below remain bound to their original inputs. Adapter admission and
headless tooling tests are not native qualification. The adapters' evidence
remains distinct; none qualifies physical keyboards or other platforms; Linux
uses software rendering.

## Composition supplied by the integration owner

`OMXTERM_SNIPPETS_PACKAGED_ENTRY` must be an absolute path to a built Electron
main entry with unchanged production Linux ARM64/x64 or macOS ARM64 composition, lifecycle and
assets. Production routes the ordinary Snippets command to the optional installed
companion or Extensions guidance, with no duplicate action or built-in view. Retain production
`registerSemanticInputIpc`, renderer semantic capture/preview, native gesture
ownership and hosted presentation wiring. Do not bypass admission or expose a
fixture terminal-injection API. The entry must honor the isolated configuration
root and `-e /bin/sh -i` arguments and join normal shutdown.

The fixture imports this entry after installing test-only observers for PTY writes,
backend retirement, native chooser and trust responses. Observed PTY writes are
forwarded unchanged; no input is admitted by those observers. Catalog and profile
are created inside the supervisor-owned temporary root. The supplied archive and
entry are read only. The source adapter copies the matching source host version
into its temporary application manifest, asserts actual `app.getVersion()` before
installation and records it as `SNIPPETS_SOURCE_HOST`; Electron's fallback version
is not matching-host evidence. The archive digest is checked before launch, at consent, in
the result, and after execution; the entry digest is checked before/after.

On an assigned disposable Linux ARM64/x64 or macOS ARM64 desktop only, run the normal source build,
then `node test/fixtures/snippets-qualification-build.mjs /absolute/new/qualification`
to copy its artifacts and rebuild main/renderer without source substitutions.
The builder refuses output reuse and records source hashes (including the real
application icon) and `differences: []`. Its owned output preserves the development
layout: `dist/`, `assets/application-icon.png`, `node_modules` (a dependency link),
`package.json` and `qualification.json`. Main still resolves its normal relative
assets; no parent-directory writes, dummy icon or product fallback are used.
It leaves shipping `dist` unchanged. The copied host uses the source's installed
dependencies; keep both until qualification settles.

```sh
OMXTERM_SNIPPETS_PACKAGED_ENTRY=/absolute/qualification/dist/main/index.js \
OMXTERM_SNIPPETS_PACKAGED_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_PACKAGED_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_PACKAGED_EVIDENCE=/absolute/evidence \
  npm test -- test/integration/snippets-packaged.test.ts
```

With none of these variables set, the test skips without opening Electron. Partial
configuration fails rather than silently skipping. `runNativeFixture` supervises
launch, timeout, cancellation and cleanup. A successful result requires normal
exit, no cleanup errors, joined backend/PTY shutdown and exactly one scenario
receipt. The integration owner should retain the supervisor receipts alongside
host commit/build and archive provenance.

The macOS ARM64 source transition passed all nine ordinary scenarios on the exact
host/archive pair recorded in the [migration guide](../../docs/snippets-migration.md#macos-arm64-source-transition).
The source layout preserves the development icon under the owned output and has a
headless CLI/filesystem regression. This does not establish a universal remedy for
pre-JavaScript AppKit stalls. Startup timeouts are not held-key failures, and
neither scenario oracles nor timeouts are relaxed.

The campaign uses native macOS graphics and Chromium sandboxing, without Linux/X11 flags. The published
Snippets 0.1.0 manifest has no platform restriction and its engine permits the
qualified source host; reuse its exact archive without editing the published catalog
or original build receipt. A new macOS receipt must identify that archive and
matching host independently. The extension builder's `qualification.target` is
still `linux-arm64` / `not-run`, not macOS evidence; no rebuild is needed here.

## macOS Quartz tool provisioning and ownership

On the assigned disposable macOS ARM64 desktop, build the stock Swift helper into
a new **stable** directory (Command Line Tools required). Do not rebuild it for each
fixture profile or grant permissions to arbitrary newly generated tools:

```sh
node test/fixtures/snippets-quartz-build.mjs /absolute/stable/quartz-tool
/absolute/stable/quartz-tool/quartz-input status
```

The explicit builder compiles and ad-hoc signs the helper, writes `tool.json` with
absolute executable path and SHA-256 bindings to the exact tracked Swift source and
binary, and does not post input or request permissions. The manifest is local trusted
provisioning evidence, not a signed supply-chain attestation. Keep its directory
writable by the fixture user for the durable input-ownership marker. To reuse an
already provisioned identical source/binary, the integration owner may create the
same manifest from independently verified hashes without replacing that binary.

If needed, explicitly run `quartz-input request-access` and approve the actual guest
responsible executable/application in Accessibility/Input Monitoring. Request return
is not permission. Observe post/listen preflights and successful tap creation in the
actual fixture ancestry; TCC attribution can differ from a shell invocation. Do not
edit TCC databases, disable SIP, or assume root/SSH access grants input access. Run
nonroot in the active unlocked Aqua session, with no competing GUI suite, real held
keys or modifiers. No host GUI or permission changes are part of headless tests.

Set `OMXTERM_SNIPPETS_PACKAGED_QUARTZ_TOOL=/absolute/stable/quartz-tool/tool.json`
alongside the three source-adapter inputs on macOS. Missing configuration or changed
source/binary hashes refuses the native launch. Linux retains its existing X11 route
and needs no Quartz tool. `snippets-quartz.cjs` owns a separate listen-only annotated
session observer, literal-argument bounded poster calls, per-gesture cursors and
fresh token/PID checks. It records `quartz.jsonl` and `quartz-lifecycle.jsonl` in the
private evidence directory (or temporary root if none was requested).

Before observation/posting it exclusively creates `<executable>.unsettled.json`,
**outside** the disposable profile. It removes that marker only after normal joined
observer close, continuous observation, completed gestures and independent final
session/HID-up queries. Interrupted input, unexpected observer exit, disabled taps,
missing observations and cleanup releases retain refusal. A cleanup keyUp is labeled
and cannot turn a failed gesture into successful qualification. The existing joined
native supervisor still owns all descendant processes; if observer close cannot be
established, the fixture fails and leaves the marker for the integration owner.

After cancellation/SIGKILL, process/profile cleanup alone does not prove OS key
release. Before another campaign the owner must inspect the retained marker and
receipts, verify PID/start settlement and independently check guest key state; any
necessary release is a separate documented recovery, never retroactive PASS. Only
then may the owner archive/remove the marker explicitly. There is no automatic
marker reset, rerun, permission prompt, or fallback from failed Quartz evidence.

## Exact AppImage adapter

On an assigned disposable, nonroot Linux ARM64 or x64 X11 desktop,
`test/integration/snippets-appimage.test.ts` extracts the supplied exact AppImage
without replacing its entry, dependencies or ASAR. Both architectures use the
same observer and shared scenario, with architecture-specific expected input
receipts; admitting x64 is tooling, not an exact-package PASS or release gate
completion. It uses the existing packaged process owner and loopback inspector,
loading a separate CommonJS observer. The application runs with isolated
HOME/XDG/profile and a PATH without source Node/npm dependencies. The ordinary
guest account shell must be sh or bash. Provision xdotool, Python 3/libX11,
xprop and bwrap in that guest; keep the desktop idle with no competing GUI suite.
Rendering explicitly remains X11/ANGLE SwiftShader on both architectures.

```sh
OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE=/absolute/host.AppImage \
OMXTERM_SNIPPETS_APPIMAGE_APPIMAGE_SHA256=<sha256> \
OMXTERM_SNIPPETS_APPIMAGE_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_APPIMAGE_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_APPIMAGE_VERSION=<host-version> \
OMXTERM_SNIPPETS_APPIMAGE_EVIDENCE=/absolute/evidence \
  npm test -- test/integration/snippets-appimage.test.ts
```

Do not set source or DMG adapter variables in this mode. Mixed adapters and
partial configuration fail; with no AppImage opt-in variables the test skips.
For Linux x64, use the unchanged published Snippets `0.1.0` archive identified in
the [source transition](../../docs/snippets-migration.md#linux-x64-source-transition),
not a rebuilt archive, edited catalog or relabeled original build receipt. Bind
`VERSION` to the supplied exact host, not Electron's version. Each run has new receipts. The
observer asserts actual packaged version, executable, ASAR and backend paths.
AppImage/archive/ASAR hashes are rechecked even on failure. Successful completion
requires normal Quit, actual main exit and joined process ownership; failed roots
and evidence are retained. Extraction does not qualify FUSE/helper installation
or public acquisition. Run the ordinary Linux package verifier separately on
the same exact artifact; the Snippets campaign does not replace it. The bounded
[Linux x64 exact-AppImage checkpoint](../../docs/snippets-migration.md#linux-x64-exact-appimage-checkpoint)
records package-source and test-fixture identities separately, its ten-check and
actual-preview evidence, reused FULL modes and retained diagnostic limitations.
A later fixture-only revision does not imply an artifact rebuild. Shared Hide
waits require native hide/core focus **and** committed renderer panel hiding and
terminal DOM focus before another reveal; native effects alone can precede the
Hide acknowledgement. Reveal/input oracles and timeouts remain unchanged. No
package, catalog, public-HTTPS or Files qualification follows from headless tests.

All adapters observe new `node-pty` instances at their existing event-forwarding
prototype seam and forward writes unchanged. This avoids assuming that replacing
a CommonJS export changes main's already captured ESM spawn binding. The package
adapter creates one ordinary New Tab after attachment; that new session runs the
shared scenario. The initial readiness session remains alive and is independently
checked for kernel exit at Quit. The scenario session and backend must join too.
The source adapter observes its initial session before importing production main.
Neither observer exposes a product input API or bypasses semantic admission.
Before the shared scenario, ordinary terminal text and Enter replace the scenario
shell with `/bin/sh -i` in the same PTY. A preceding shell output marker explicitly
disables bracketed paste; the fixture verifies that marker and that plain-paste
mode remains selected at every exact-byte assertion. This makes source and
account-shell launches comparable without stripping framing from observed writes
or accepting either encoding. Account-shell startup and bracketed-paste delivery
are not qualified by this controlled-shell scenario.

## Exact macOS ARM64 DMG adapter

`test/integration/snippets-dmg.test.ts` is opt-in tooling, not a qualification
receipt. On the assigned disposable, unlocked Aqua desktop, supply:

```sh
OMXTERM_SNIPPETS_DMG_DMG=/absolute/host.dmg \
OMXTERM_SNIPPETS_DMG_DMG_SHA256=<sha256> \
OMXTERM_SNIPPETS_DMG_ARCHIVE=/absolute/snippets.omxext \
OMXTERM_SNIPPETS_DMG_ARCHIVE_SHA256=<sha256> \
OMXTERM_SNIPPETS_DMG_VERSION=<host-version> \
OMXTERM_SNIPPETS_DMG_EVIDENCE=/absolute/private-evidence \
OMXTERM_SNIPPETS_DMG_QUARTZ_TOOL=/absolute/stable/quartz-tool/tool.json \
  npm test -- test/integration/snippets-dmg.test.ts
```

No opt-in skips; partial or mixed-adapter configuration refuses. The guest must
have Command Line Tools, `hdiutil`, `ditto`, `codesign`, `lipo`, `plutil`, a
sh/bash/zsh account shell and the already provisioned Quartz permissions described
above. No permissions are requested automatically. Root owns exclusive native-lane
preflight and execution. Build a fresh DMG from verified source and locked,
self-contained dependencies, and run the existing package inspection separately.
Do not reuse an unpackaged build as DMG evidence.

Preparation mounts the exact digest-bound DMG read-only, copies `OMXTerm.app`
with `ditto`, compares the complete bundle's files/modes/symlink targets and
unmounts before launch. Mount/copy/detach failures refuse launch. It verifies the
app's code seal, ARM64 executable, plist and ASAR version, and records executable,
ASAR, backend and complete bundle digests. No entry, dependency, ASAR, signature or
quarantine attribute is rewritten. This is a copied DMG application, not Finder,
Gatekeeper/notarization or public-download qualification.

The thin integration entry calls `snippets-dmg-campaign.ts`; a separate
`snippets-dmg-main.ts` entry invokes the finite `snippets-dmg-driver.ts` controller.
These are the same orchestration functions exercised by controlled headless tests,
not alternate scenario implementations. The controller runs under
`runNativeFixture`; it registers the actual
packaged launch with the existing write-ahead ownership protocol. The unchanged
app receives only a loopback inspector, isolated profile and readiness-shell
arguments. Its environment excludes source Node/npm settings and uses system
commands, isolated HOME/XDG roots, native graphics and Chromium sandboxing—no
Linux flags. The existing inspector observer asserts actual app/version/executable/
ASAR and backend identity, creates an ordinary New Tab and invokes the shared
scenario. Baseline readiness PTY liveness uses real macOS `ps` start identity,
not `/proc` or PID-only existence.

Normal Quit must join baseline/scenario PTYs and backends; the controller also
requires actual main exit, stream closure and absence of its captured descendants
before it can succeed. The shared scenario joins the Quartz observer and verifies
OS release independently. The outer supervisor owns timeout, cancellation,
controller loss and remaining native descendants. It may recover processes but
cannot convert forced settlement into a successful normal Quit or prove OS keyup.

Each run uses fresh private `EVIDENCE/run-*` receipts, but supervisor receipts use
unique `EVIDENCE/supervisor-run-*.json` filenames in the **same configured lane**.
`run-*/supervisor-location.json` records that path. The existing runner therefore
shares `EVIDENCE/ownership-blocked.json` across attempts and refuses unresolved
ownership before preparing or launching another controller. Do not change the
configured evidence lane to evade a stop receipt; macOS recovery remains manual.

The application/profile and input evidence are outside the supervisor's disposable
launcher directory and are retained on **every** outcome, including success. Root
owns later useful-profile cleanup; profile existence is not evidence of live
processes. There is no asynchronous profile-deletion race to disguise cancellation
or destroy failure evidence. DMG, archive and complete copied-bundle identities
are checked again even after a reported failure. Finalization first writes an
asynchronous non-success checkpoint, then checks cancellation and synchronously
publishes the final outcome without another await. Cancellation during final
identity checks or checkpoint publication rejects and records failure. A failed,
missing, truncated or still-finalizing result is not PASS. The final receipt is a
completion-boundary snapshot, not a promise of filesystem atomicity or protection
against cancellation after completion. If the worker itself is killed, root must
perform identity checks from the retained receipts; missing `result.json` is not
PASS. The external Quartz
marker is never reset by this adapter. After interruption, inspect the marker,
PID/start settlement and independent OS state before authorizing another run.

This adapter does not repeat or supersede the delivered source qualification,
extend published catalog admission, change immutable archives/receipts or authorize a
release. Exact native DMG execution remains an integration-owner gate.

## Oracles and limits

- Absent/disabled package guidance without implicit installation or enablement;
  retained compatibility toggle with catalog readiness before row interaction.
- Dormant install, exact archive trust, one active native child/backend, and no
  built-in Snippets DOM in the core renderer.
- Exact PTY bytes for Insert and Run, with shell output receipts proving actual
  execution. Native Enter activation, repeat after focus handoff, and release
  must not append additional input. Chromium repeat receipt is checked explicitly.
- Both preview intent overrides; literal preview body; native-child exclusion;
  Cancel emits no bytes and restores the initiating control's native focus.
- Retained query across hide/reactivate; live en-US/pt-BR labels via real Settings
  language changes without replacing the query.
- Disable/uninstall joins backend retirement, preserves catalog bytes, and leaves
  the same canvas and PTY usable for a subsequent shell command.

Linux rendering explicitly selects ANGLE SwiftShader, not the default GPU. Optional
evidence retains supervisor results, child/core/preview captures and failure
DOM outside the cleaned fixture profile. Preview evidence now waits for two
renderer animation-frame opportunities after dialog-open/exact-body readiness,
then rechecks the same connected open dialog, body identity/exact text and native
child exclusion before capturing. This test-only barrier follows the existing
child/Files capture pattern; the unchanged enclosing native deadline bounds stalled
frames. Headless regressions check ordering and stale-state refusal, not pixels.
The earlier Linux x64 source preview capture remains blank/unqualified: neither
this barrier nor a DOM PASS proves paint or diagnoses that observation. The next
native campaign must inspect the actual new image. If still blank, retain it and
compare dialog/body computed visibility and bounds with the capture under the
same rendering mode before considering a product change. Separate WebContents
captures are not OS-compositor evidence. Input uses DOM clicks and Electron
`sendInputEvent`, plus `/usr/bin/xdotool` XTest events for the held Enter sequence
across native focus handoff (install xdotool in the assigned guest). Keydown,
and repeat are observed through Electron on the child/core respectively. Release
is verified with X11 `XQueryKeymap` (Python 3 and libX11), followed by exact PTY
byte isolation and a fresh Enter that must reach the terminal. A minimal Electron
comparison reproduced missing `before-input-event` and DOM keyUp after prevented
autorepeat, even without OMXTerm; this fixture does not claim an Electron keyUp
receipt for that suppressed sequence. This is synthetic X11 input, not physical keys. Consent is
controlled.

On macOS, the held and fresh Enter sequences use synthetic Quartz session events.
The fixture requires trusted child activation, actual prevented Chromium core
repeat after focus handoff, and independently observed tagged OS release to the
actual application PID with session key state transitioning from held to up.
Product-independent Electron 43.8.1 comparisons reproduced omitted keyUp after
prevented autorepeat; a Quartz comparison observed both OS release and session
state while that omission persisted. The fixture does not claim a consumed
Electron keyUp when it was omitted. Any delivered held keyUp must still be consumed.
Exact PTY bytes, bounded no-leak drain and a fresh Enter delivered to the same PTY
remain unchanged. API submission, stale prior-gesture receipts, wrong tokens/PIDs,
and constant HID-key-up queries cannot satisfy release. Missing observation or
observer continuity fails without fallback or timeout increases.

This is synthetic Quartz **session** input, not hardware/HID state or physical
keyboard/natural autorepeat timing. Repeat is explicitly marked in a posted event.
Native graphics selection is not broad GPU qualification. Separate WebContents
captures are not OS-compositor evidence. The full ordinary nine-scenario macOS
source campaign passed with inspected child/core/preview captures, joined native
cleanup, final session/HID-up state, no unsettled-input marker and verified tool
hashes. It does not qualify exact-DMG GUI execution or public-HTTPS acquisition.

There is a bounded post-delivery drain assertion, not proof against
arbitrarily delayed events. This fixture does not cover Kitty protocol, Protected
Paste, stale selection, missing targets, removal during preview, update, backend
crash, all catalog boundaries or published artifact compatibility; those require
separate evidence. Native execution remains the integration owner's responsibility.
