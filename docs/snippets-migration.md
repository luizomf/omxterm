# Optional Snippets migration

The published [OMXTerm 0.24.0-dev.11 Linux ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11),
[OMXTerm 0.24.0-dev.16 macOS ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.16),
and [OMXTerm 0.24.0-dev.30 Linux x64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.30)
use the separately installed [Snippets 0.1.0 extension](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
All are immutable non-Latest prereleases; stable **0.23.0** and published Windows
hosts retain built-in Snippets. The ARM64 pairs offer Snippets through the official
catalog; use local-archive installation for the Linux x64 preview while its catalog
promotion and public-HTTPS checkpoint remain separate. Local installation is
available offline after download. See the [macOS public-catalog checkpoint](#macos-arm64-catalog-delivery).

## Existing catalogs and shortcuts

Keep `snippets.yaml` beside `config.json`, at the same configuration location as
before. Installation, upgrade, disable and uninstall do not copy, rewrite or
delete that file. YAML v1, exact text, search, Insert/Run, preview and Protected
Paste remain the same. There is no conversion or second Commands catalog.

**View → Toggle Snippets**, its Command Palette entry and existing shortcut
(`Ctrl+Shift+S` on Linux, `Cmd+Shift+S` on macOS, including custom remaps or
`null`) remain supported.
An enabled package opens in the shared companion panel. In the published ARM64
previews, invoking the command again hides it. The published Linux x64 dev.30 host
and current source instead **close** the selected-visible tool, discarding its view's
search/scroll state; **Hide** or
Escape preserves that state for reopening. Without an enabled package, the command opens **Settings →
Extensions** with an explanation. It never installs or enables anything for you.
A disabled package remains disabled. Runtime unavailability is reported separately
from a missing installation. Terminal sessions remain usable.

## Install deliberately

Use the exact preview pair for your platform linked above. On macOS, download the
ARM64 DMG and checksum; see [macOS installation](#macos-arm64-published-preview).
On Linux, download the AppImage for your architecture, its checksum and, if wanted,
the version-matched application-menu helper and checksum. Follow that release's
installation instructions, not `/latest/download` or the stable-version filenames in the general installation
guide. For local installation, download `snippets-0.1.0.omxext` and its checksum
from the Snippets release into the same folder, then verify before installation:

```sh
# macOS
shasum -a 256 -c snippets-0.1.0.omxext.sha256
# Linux
sha256sum --check snippets-0.1.0.omxext.sha256
```

No source build is required. Older hosts are not qualified for this package, and
existing Files/SSH packages were not newly qualified on these previews. The official
catalog lists these same Snippets bytes for Linux ARM64 and macOS ARM64. Separate
bounded public-HTTPS checkpoints passed on the Linux dev.11 and macOS dev.16
host/archive pairs; see [macOS delivery](#macos-arm64-catalog-delivery) and
[Linux coverage](#preview-coverage-and-remaining-platforms).

1. Open **Settings → Extensions** and choose **Install local .omxext…**. A local
   archive works offline after download. On either ARM64 preview, alternatively choose
   **Browse official extensions**, select the Snippets preview and
   install it. Browse/Refresh is explicit; reopening Settings does not fetch the
   catalog. Both routes use the same captured-byte trust and installation flow.
2. Inspect the captured package identity and trust information before approving.
   Extension code is trusted code, not a sandboxed command catalog.
3. If the installation is disabled, enable it explicitly. Installation does not
   start its backend: **Toggle Snippets** is the deliberate activation step.
4. Keep your existing catalog where it is. For a new catalog, copy/adapt the
   package's `snippets.example.yaml` using the [documented YAML format](configuration.md#snippets).
   Opening the tool with no catalog is a clean empty state, not an error or a
   reason to create a file automatically.

Disabling/removing Snippets retires its view and cancels unaccepted previews,
not terminal sessions or already accepted Surface-owned paste. It does not undo
commands already sent. Reinstalling does not require rebuilding your catalog.

## macOS ARM64 published preview

Host `0.24.0-dev.16` was published on **2026-10-30 at 16:25:11 UTC**, with the
DMG and its checksum only. Download them from the macOS release linked above and
verify before installation:

```sh
shasum -a 256 -c OMXTerm-0.24.0-dev.16-arm64.dmg.sha256
```

Follow that release's copy-to-Applications and first-launch instructions. The app
is ad-hoc signed, not Developer ID signed or notarized; Finder/Gatekeeper first
launch was not qualified. Install Snippets through the official catalog or the
local archive/trust/enable steps above.

The final source/tag target is `42328767a1510f5cec15deb6e274366ca76f972c`.
The qualified build source is `c3655a5b6ec13dbfb870665fc23b83caef71aac6`;
squash integration means it is not an ancestor of the tag. Complete tree comparison
found only 35 added factual documentation lines; application and packaging inputs
were unchanged. The published DMG is the original qualified artifact identified
[below](#macos-arm64-exact-dmg-qualification), not a rebuild.

The unchanged public Snippets `0.1.0` archive (76,653 bytes, SHA-256
`6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`)
was downloaded and verified **before** host publication. Public host/checksum
readback also verified the exact DMG bytes. The archive and its original Linux
build receipt remain immutable, including source
`805e95dbc77552dc137707578b18b48ad6d047e9` and build-time
`qualification.status: not-run`; later qualification is separate evidence.
That public-download verification alone did not establish native macOS
public-HTTPS installation; the subsequent checkpoint is recorded below.

<a id="macos-arm64-catalog-promotion-candidate"></a>

## macOS ARM64 catalog delivery

The promoted catalog extends the existing Snippets `0.1.0` entry to
`darwin-arm64`, retaining `linux-arm64` and the unchanged Files/SSH entries.
It names the already published macOS `0.24.0-dev.16` / Linux `0.24.0-dev.11`
hosts without changing the archive, original receipt, source, digest, size,
immutable URLs or manifest engine ranges. The manifest has no platform restriction;
its host/API ranges express compatibility, not qualification of every admitted host.
Stable `0.23.0` and published Windows hosts retain built-in Snippets; the later
Linux x64 preview is described separately below.

Catalog source `dbbc1a9814606f72bcaea226ab68564da4a345fb` received complete
independent review and was integrated. Fixed public endpoint readback matched
source byte-for-byte, SHA-256
`c86ea2ee6f4f27eb17718e5832ce29a8e862aca99fb91afe358c9572ca844ead`.
A separate bounded **production public-HTTPS checkpoint passed** using freshly
downloaded public dev.16 DMG (129,712,879 bytes, SHA-256
`52b8a6b60dce7380b1157755e5ba3dcda0dfdc8e4c54ed2a71b723b160ef061f`)
and the unchanged Snippets archive identified above:

1. Actual Browse/Install, exact-digest trust and dormant first-generation installation.
2. Explicit Toggle, existing YAML and one exact Run with actual shell output.
3. Public Reinstall, joined old backend and dormant second generation.
4. Disable/disabled guidance, explicit dormant enablement/Toggle, disable/uninstall
   and unchanged YAML.
5. The same Surface/canvas and PTY remained usable after retirement; normal Quit
   joined baseline/scenario PTYs and both backends.

Both controlled trust prompts, four actual WebContents captures, main exit/stream
closure and controller/supervisor settlement were inspected. Independent checks
confirmed recorded process absence, packet/artifact and complete bundle identity,
code seal, unchanged YAML, no task mount or unresolved ownership/input guard, and
final OS Return key-up state. Supplementary process sampling is not a complete
historical descendant census.

Scope is synthetic Chromium input, controlled DOM/menu interaction and consent,
an isolated plain-paste shell and unchanged native macOS graphics/sandboxing.
This is not physical-keyboard, natural-autorepeat, held-Enter, Kitty,
OS-compositor, Finder/Gatekeeper/notarization or full portable-suite qualification.
The earlier exact-DMG nine-scenario and FULL verifier passes remain separate;
neither was rerun. No application version, published release/tag/asset, original
receipt or Files/SSH entry changed; no new Files/SSH qualification or stable SDK
is implied.

**Browse official extensions** now offers the same archive on macOS ARM64.
Installation/trust, enablement and Toggle remain deliberate; no startup acquisition
or automatic activation is added. The local archive route remains available
offline after download. Existing YAML and terminal sessions remain untouched by
installation/removal.

## macOS ARM64 source transition

The source transition reuses the single compatibility action, preserves existing catalogs
and omits the example only in newly created configuration kits. It does not install
or silently enable a package. The source campaign used the
exact published Snippets `0.1.0` archive linked above through ordinary local
archive/trust/enable steps. The existing archive has no manifest platform
restriction and requires host `>=0.24.0-dev.8`; compatibility metadata alone is
not qualification. Keep the user's existing YAML beside `config.json`.

At source qualification, the official catalog advertised **Linux ARM64 only**.
Do not treat a listing or the original Linux build receipt as macOS evidence. The full ordinary
nine-scenario source campaign passed on macOS 27.0.1 ARM64, Electron 43.8.1,
host `0.24.0-dev.16`, source `117428a31d897d6ba4775cbe31f3e3d52df5d917`, using
published Snippets `0.1.0` SHA-256
`6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`.
It used native macOS graphics and sandboxing, controlled consent and a plain-paste
shell. Tagged Quartz down/repeat/up and session held/up observations accompanied
trusted child activation, prevented Chromium core repeat, exact PTY bytes and
fresh Enter. Normal Quit joined backend/PTY shutdown; owned PID/start identities
and profiles were absent after all nine scenarios. Three separate WebContents captures were inspected,
as were final session/HID-up state, absent unsettled-input marker and tool hashes.

Formatting, types, lint, 118 focused tests, Swift code generation and build passed;
prior 4,198 headless passes and 66 skips were reused only for unchanged inputs.
Independent review was completed, its version finding corrected, and later
corrections verified by the integration owner. This is not a full portable-suite,
exact-DMG GUI, physical-keyboard, natural-autorepeat, Kitty, OS-compositor or
public-HTTPS qualification. The historical minimal-composition fixture remains
separate; its changed optional-Snippets assertion was not rerun.

This historical source campaign preceded the exact-DMG checkpoint and publication
recorded separately here; it does not itself establish either boundary.

## macOS ARM64 exact-DMG qualification

A separate exact-package checkpoint passed using host `0.24.0-dev.16`,
source `c3655a5b6ec13dbfb870665fc23b83caef71aac6`, and the same immutable
Snippets `0.1.0` archive identified above. The freshly built ARM64 DMG was
129,712,879 bytes, SHA-256
`52b8a6b60dce7380b1157755e5ba3dcda0dfdc8e4c54ed2a71b723b160ef061f`.
Its application was copied from a read-only mount, checked for complete bundle
identity and code seal, and launched only after detachment. The packaged ASAR
SHA-256 was `997d1c70e6d54c97495226d148c419e879baacd87ae3ad93d47f968b0c69c14c`.

All nine shared Snippets scenarios passed through ordinary production composition,
installation and controlled trust. Exact PTY assertions, targeted Quartz
activation/repeat/release and fresh Enter passed; three separate WebContents
captures were inspected. Normal Quit joined the baseline/scenario PTYs and
backend, actual main exit, stream closure and supervisor settlement. Independent
checks confirmed recorded process absence, final OS key-up state, unchanged
artifact identities and no unsettled-input or ownership marker. Useful campaign
profiles were deliberately retained for the integration owner, not deleted by
the adapter.

The same DMG-derived application also passed the ordinary **FULL macOS package
verifier**, including native/runtime resources, code seal, real PTY startup,
parsed Restty output-query response, launch-data non-disclosure and process-group
cleanup. Its isolated temporary scope was empty afterward. This startup verifier
is distinct from the campaign's normal-Quit evidence. Full formatting, types,
lint and 4,261 headless tests passed (66 skips); independent review's two ownership/
cancellation findings and composition-test gap were corrected and verified.

This checkpoint is separate from the later host publication above. It does not
qualify catalog promotion, native macOS public-HTTPS installation,
Finder/Gatekeeper/notarization, physical-keyboard, natural-autorepeat, Kitty,
OS-compositor, macOS Files/SSH or the full portable suite. No immutable archive
or original build receipt was changed.

## Linux x64 source transition

Linux x64 source selects the same optional Snippets implementation as ARM64.
The existing menu/palette action and configured shortcut open or close the installed
companion; missing/disabled guidance never installs, enables or falls back to a
built-in view. Existing YAML is untouched; only newly created configuration kits
omit the example. Use explicit local-archive installation of the unchanged published
Snippets `0.1.0` archive identified above. A source catalog candidate adds Linux x64;
public endpoint readback and packaged public-HTTPS consumption remain separate.
The original build receipt is not rewritten to infer qualification.

The ordinary production source campaign passed on Ubuntu 24.04 x64 / Electron
43.8.1, host `0.24.0-dev.30`, source
`d9e3cb535152cee2e3b8d2665f2eef4037fd7b5b`, with the unchanged published
Snippets `0.1.0` archive (76,653 bytes, SHA-256
`6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`).
All ten current shared-campaign checks passed: ordinary trust/dormant installation,
missing/disabled guidance, Close versus retained Hide, exact Insert/Run, held Enter
repeat/release isolation and fresh Enter, preview overrides/Cancel focus, retained
search, live en-US/pt-BR, and uninstall with unchanged YAML and the same usable
Surface/PTY. The backend retired at Disable with exit zero; normal Quit subsequently
joined the PTY. This is not an active-backend-at-Quit test.

Exact source/runtime/archive identities, unchanged ordinary and qualification
builds, all 219 qualification input hashes, actual process/stream settlement and
an empty independent scope snapshot were checked. Three WebContents captures were
inspected: the child shows its search and two rows, the core shows terminal/panel
chrome, but the preview capture has a blank content region. Functional preview
DOM/focus/byte assertions passed; that capture does **not** establish rendered
preview appearance. Capture timing is unconfirmed, not a diagnosed product defect.
D-Bus and X keyboard-map diagnostics remain retained.

One complete independent 21-path review found four low-severity documentation/
receipt-wording issues, all corrected and verified. Full formatting, typecheck,
type-aware lint and 4,759 headless tests passed (66 skipped); later documentation
and builder-receipt corrections received focused checks. The changed minimal
composition assertion was not rerun; its earlier evidence remains separate.

Scope is synthetic Chromium/X11 input, ANGLE SwiftShader, controlled consent and
a plain-paste shell—not physical keyboard, Kitty, default GPU, compositor, full
portable-suite, exact-AppImage GUI or public-HTTPS qualification. This historical
source campaign did not itself establish a published Linux x64 preview. The separate
exact-AppImage checkpoint below does not expand that historical source campaign's evidence or
explain its blank preview capture. The shared
[exact-AppImage adapter](../test/fixtures/snippets-packaged.md#exact-appimage-adapter)
admits Linux x64 alongside ARM64 without replacing the packaged entry/ASAR/runtime
or archive. Its capture barrier and acknowledged-Hide readiness checks are fixture
changes, not product fixes; headless coverage alone is not native or visual
qualification. Publication and public catalog consumption are separate from this
historical source campaign.

## Linux x64 exact-AppImage checkpoint

A bounded prepublication exact-package checkpoint passed on Linux x64 with
host `0.24.0-dev.30` / Electron 43.8.1. Package source is
`04943ae5f6af10bb7d1f482da780d011445cf7ae`; test-fixture source is
`6a3728c1d9d3024a6499f4b8fa3971d74f539e33`. The latter changes only the shared
scenario's completed-Hide wait and its headless regression. Product/build inputs
are identical; the package was not rebuilt or relabeled as coming from that test
revision.

- AppImage: `OMXTerm-0.24.0-dev.30-x64.AppImage`, **127,994,725 bytes**, SHA-256
  `8a1e73d16833a97819273c23d566cc2d46af6b6dddf3a475c616d1109a3a2a95`.
- Packaged ASAR SHA-256:
  `7aa7f7aa2a0fd0a91076d365354acf5e1867b7c62531c043fec0c294a48e4b75`.
- Unchanged published Snippets `0.1.0`: **76,653 bytes**, SHA-256
  `6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`.
  Its original build receipt, user YAML catalog and archive remain unchanged.

One executed native test passed all ten shared checks: absent/disabled guidance,
ordinary trust and dormant installation, Close versus retained Hide, exact
Insert/Run with held Enter repeat/release isolation and fresh Enter, preview
intent overrides/Cancel focus, retained search, live en-US/pt-BR, and
Disable/uninstall with unchanged catalog and usable Surface/PTY. Disable joined
the backend with exit zero; normal Quit then joined the distinct baseline and
scenario PTYs, with packaged main exit zero, closed streams and bounded owned
settlement. This is not an active-backend-at-Quit test. The shared scenario's
original exact-byte assertions passed; a separate raw PTY byte transcript was
not exported.

All three actual WebContents captures were inspected. The child shows its search,
rows and Preview controls; the core shows terminal/panel chrome. The preview is
not blank: literal command text, Cancel, Insert and Run controls are readable,
with a visible Run focus outline and dimmed background. This establishes visible
preview content for this exact controlled execution, not why the earlier source
capture was blank or every rendering/theme/compositor mode.

The same exact artifact separately passed the ordinary stock **FULL Linux
verifier** in direct and extract-and-run modes, both with code zero/no signal,
stream closure and owned settlement. The extract-and-run result belongs to the
failure-propagation-checked wrapper, not a separate kernel wait of Electron main. That passing verifier subreceipt is
separate from its enclosing diagnostic's failed retained-input guard; the latter
remains failed. Earlier teardown and panel-reveal attempts also remain failed,
with original causes unproven. The successful run does not retrospectively
qualify them or prove that a fixture race caused the earlier native failure.

Application stderr was not clean: one request logged `outcome-unknown` on a
view-destruction stack, consistent with supported post-dispatch cancellation,
but its method, timing and effect remain unknown. D-Bus errors were also
retained. These were accepted as nonblocking explicit limitations alongside the independently passing
scenario/continuity/shutdown checks, not proof that the interrupted request
succeeded or that D-Bus behavior is qualified.

Scope remains synthetic Chromium/X11 input, ANGLE SwiftShader, controlled consent
and a controlled plain-paste shell. This does not qualify physical keyboards,
natural autorepeat, Kitty, default GPUs, physical-desktop/compositor behavior,
account-shell/bracketed-paste behavior, public acquisition, other platforms or the
full portable suite. The Snippets adapter itself does not qualify FUSE/helper
installation; the separately tested FULL modes remain distinct. This checkpoint
did not itself publish the host or promote the catalog; Windows and the remaining
#741 gates stay open.

## Linux x64 published preview and catalog candidate

The [Linux x64 `0.24.0-dev.30` host](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.30)
was published on **2026-10-31 at 19:33:37 UTC** as an immutable, non-Latest
prerelease. Its original AppImage, version-matched helper and both checksum files
passed draft and anonymous public byte verification. The unchanged published
Snippets archive/checksum/original receipt were anonymously verified before host
publication. The package was built from `04943ae5f6af10bb7d1f482da780d011445cf7ae`,
qualified with test fixture `6a3728c1d9d3024a6499f4b8fa3971d74f539e33`, and tagged
at `2aa533f99e61a690496e16b93d68286bead5fb48`; the later changes were test/docs
only and did not rebuild the image. The original Snippets receipt retains source
`805e95dbc77552dc137707578b18b48ad6d047e9`, its Linux ARM64 build target and
build-time `not-run` qualification field.

Verify `OMXTerm-0.24.0-dev.30-x64.AppImage.sha256` and, if used,
`linux_install.sh.sha256` from that release. Install the separate Snippets archive
through the deliberate local/trust/enable steps above. The candidate catalog adds
`linux-x64` to the unchanged Snippets archive identity in both complete source
catalogs, preserving Files/SSH and the existing ARM64 targets. The embedded manifest
has no platform restriction and retains host `>=0.24.0-dev.8` / API `0.1.x`;
that compatibility range does not qualify every admitted host. The host selects
`https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json`.
Source candidate integration, fixed-endpoint readback and a separate actual
packaged public-HTTPS installation checkpoint are not established by publication
or local qualification. Do not assume catalog discovery works on Linux x64 until
those steps are completed and recorded.

## Preview coverage and remaining platforms

For the Linux ARM64 dev.11 preview, the Snippets package was published and
anonymously downloaded/hash-verified before the matching host. The exact host/archive
pair passed local installation, compatibility entry points, guidance, input/focus and retirement scenarios. The
host also passed full Linux package verification, including isolated helper
installation, direct/FUSE and extract-and-run startup/output. See both release
notes for exact identities and evidence.

Snippets scenarios used synthetic Chromium/X11 input, explicit SwiftShader,
controlled consent and a controlled plain-paste shell. They do not qualify
physical keyboards, default GPUs, account-shell/bracketed-paste behavior or other
platforms. The full package verifier used an authenticated nested X11 desktop,
not a broad distro/GPU campaign.

A separate public-catalog checkpoint passed on the same published pair: production
HTTPS catalog acquisition and Install/Reinstall, exact-digest trust, dormant
installation, explicit enablement/Toggle, one exact Run with shell output,
disable/uninstall, unchanged YAML, the same usable terminal and joined normal
Quit. Actual captures and process settlement were checked. It used controlled
consent, synthetic input, ANGLE SwiftShader and an isolated plain-paste shell;
this does not expand the earlier keyboard/GPU/platform limits or requalify
Files/SSH. No archive, host package or original build receipt was changed.

[#741](https://github.com/luizomf/omxterm/issues/741) remains open: Linux x64
catalog promotion and public consumption remain separate from the published
preview, and Windows retains built-in Snippets until its own prerequisites are met.
Existing published artifacts remain immutable; this preview is not a stable SDK.
