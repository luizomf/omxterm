# Linux ARM64 ordinary-default Snippets consumer

`test/integration/snippets-ordinary.test.ts` is a separate opt-in consumer of an
exact packaged host, not the older overridden-profile Snippets input matrix.
Run it only in an **assigned disposable Linux ARM64 guest**, as the ordinary
logged-in test user on its normal desktop, bus and runtime. First establish the
[Linux shared-service/input baseline](../../docs/development.md#linux-desktop-services-and-native-verification).
An idle unlocked X11/XWayland display with working WebGL2 and the normal native
build/verification prerequisites is required. No physical-host Electron/browser
probes, including headless ones, or nested delegates outside that guest.

## Inputs and ownership

The selected package build source is
`575407cc61648b8dbf598dd7e1c4d46345c31ff2`, version **0.25.0**. Later fixture-only
commits do not relabel or rebuild it. Build fresh exact bytes and run the ordinary
FULL package verifier separately. Preserve old packages with the same basename.
The fixture checks the supplied AppImage digest, extracts without modifying the
entry/ASAR, checks version, and uses its exact bundled Snippets0.1.0 archive,
SHA256 `6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`.
Do not rebuild the archive or rewrite its original receipt.

```sh
OMXTERM_SNIPPETS_ORDINARY_APPIMAGE=/absolute/OMXTerm-0.25.0-arm64.AppImage \
OMXTERM_SNIPPETS_ORDINARY_SHA256=<exact-new-package-sha256> \
OMXTERM_SNIPPETS_ORDINARY_EVIDENCE=/absolute/private/evidence \
OMXTERM_FIXTURE_SOURCE=<full-fixture-commit> \
  npm test -- test/integration/snippets-ordinary.test.ts
```

Without ordinary opt-in variables the test skips. Partial inputs fail. HOME must
be the actual account home; normal XDG roots are resolved from that account's
inherited session environment. The product config/userData and operational-state
roots must both be genuinely absent with real, nonlinked ancestors. An existing
empty root is **not** fresh. Do not run on an owner/developer profile, change
HOME/XDG to simulate account isolation, use `--user-data-dir`, or delete a consumed
witness for a retry. The evidence directory must be outside product roots.

The fixture exclusively owns the product roots it creates from verified absence.
It first exercises a distinct pre-existing history with an empty root, deliberate
local installation/disable, then sentinel config/YAML/theme files and disabled /
tombstoned restarts. No default witness may appear in that history. After natural
Quit and process settlement, its **complete** owned roots move into the evidence
hold. This is not deleting a witness or retrying enrollment. Only then does the
fixture establish genuine ordinary-root absence for the new-profile history.

The new-profile history verifies generation1, enabled+dormant default installation,
fixed digest and literal permanent witness, no user YAML, a retained live terminal,
normal Quit, restart without reprovisioning, deliberate disable, disabled restart,
uninstall and tombstoned restart. Seven process invocations cover the two histories.
On success the second complete history is also held outside the ordinary roots;
initial absence is restored without discarding the witness. There is no subsequent
launch after that hold. On failure ordinary roots and extraction/evidence remain
for diagnosis; never automatically clear them or rerun a consumed first-use claim.

## Cold-start evidence, not a late inspector inference

The exact application's normal entry starts with `--inspect-brk=127.0.0.1:0`.
The controller verifies the owned endpoint PID, the exact ASAR entry source digest,
initial module location0:0, `Break on start`, no later breakpoint, module scope,
and Electron43.8.1's pinned ESM **instantiation-before-evaluation** loader source
hash/location. The observer must report not-ready, zero windows and zero PTYs
before resume. Unknown/late pauses fail; there is no fallback to attaching after
readiness. No replacement entry, profile getter/setter, defaultSession access,
production module injection, preload, startup configuration or provisioning bypass
is used. Native entry/import evaluation and the production capture/claim proceed.

Before resuming, the observer registers web-content navigation observations,
forwards `child_process.fork` and node-pty instance events unchanged, and observes
public Node filesystem mutation calls for `snippets.yaml`. Chromium's NetLog is
started by its normal launch option, independently of the late renderer snapshot.
All phases reject backend forks, transient/current hosted-extension URLs, observed
YAML mutation and network URL/DNS/TCP/UDP attempts. Existing YAML bytes must remain
unchanged. These are passive test observations, not transport interception or
security containment; they perturb timing and do not cover arbitrary native
filesystem syscalls or an unknown backend mechanism. Failed/unknown evidence is
not absence. The pinned loader/runtime boundary is deliberate, not a public API.

The initial actual PTY is observed from acquisition, emits a synthetic readiness
marker and remains the same live PID through a simple Chromium-inserted command
and ordinary Settings management. Enter is always released. Captures are synthetic
WebContents images, not physical keyboard or OS-compositor proof. No old Insert /
Run/IME, Files handoff, catalog/network acquisition or public distribution campaign
is replayed.

Ordinary startup retains the product's generated config/theme bytes; the existing
history adds only its synthetic YAML after the empty-root checkpoint. No startup
config is prewritten to disable close confirmation. Normal **Quit OMXTerm** consent
is answered separately from archive trust after checking its real question,
buttons and cancel/default IDs. Each phase requires one such controlled consent;
this is synthetic native-dialog acceptance, not physical-button input.

Normal Quit must produce PTY actual-exit and child exit/close evidence before
`will-quit`, followed by native main exit0, stream closure and the existing Linux
process owner's unassisted settlement. Forced TERM/KILL is failure recovery only.
Each phase retains pause, initial/final snapshot, registry, NetLog, synthetic
terminal/management PNGs, Quit and result receipts. Management capture waits for
the selected Extensions tab and exact Snippets generation/state, scrolls that
card into view and crosses two renderer frames before capture; a registry update
alone is not visual-state evidence. AppImage and ASAR hashes are rechecked. The fixture does not provision or verify shared-service isolation:
its owner must compare original portal/bus/mount/FUSE/consumer preservation after
settlement **and again after owned cleanup**, independently of its assertions.

Headless controls (Node/filesystem only):

```sh
npm test -- test/unit/snippets-ordinary.test.ts test/unit/packaged-inspector-early.test.ts
```

This consumer does not qualify FUSE/helper installation (covered separately by the
stock verifier), physical input/IME, a different runtime, macOS/Windows ARM64,
x64 desktop use, stable publication or the entire release. It records actual
outcomes; a source commit or a prior successful package is not a native PASS.
