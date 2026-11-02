# Optional Snippets migration

In OMXTerm `0.24.0` source, Linux ARM64/x64, macOS ARM64 and Windows ARM64 use
separately installed Snippets. Windows x64 retains the built-in tool. The
instructions below describe the selected host behavior, not proof that a stable
host or a particular catalog offer has been published or qualified. Check the
[installation guide](installation.md) and the selected release for available files.

The published [OMXTerm 0.24.0-dev.11 Linux ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11),
[OMXTerm 0.24.0-dev.16 macOS ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.16),
[OMXTerm 0.24.0-dev.30 Linux x64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.30),
and [OMXTerm 0.24.0-dev.36 Windows ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.36)
use the separately installed [Snippets 0.1.0 extension](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
All are immutable non-Latest prereleases. At Windows dev.36 publication, stable
**0.23.0** remained Latest with built-in Snippets; earlier Windows hosts and
Windows x64 were unchanged. The Linux/macOS previews have public-catalog
checkpoints; the [Windows publication and catalog candidate](#windows-arm64-published-preview-and-catalog-candidate)
remains separate from its pending installed public-HTTPS checkpoint. A verified
local archive also works offline after download. See
the [Linux x64 public-catalog checkpoint](#linux-x64-public-catalog-checkpoint)
and [macOS public-catalog checkpoint](#macos-arm64-catalog-delivery).

## Existing catalogs and shortcuts

Keep `snippets.yaml` beside `config.json`, at the same configuration location as
before. Installation, upgrade, disable and uninstall do not copy, rewrite or
delete that file. YAML v1, exact text, search, Insert/Run, preview and Protected
Paste remain the same. There is no conversion or second Commands catalog.

**View → Toggle Snippets**, its Command Palette entry and existing shortcut
(`Ctrl+Shift+S` on Linux/Windows, `Cmd+Shift+S` on macOS, including custom remaps or
`null`) remain supported.
An enabled package opens in the shared companion panel. In the published Linux
ARM64 dev.11 and macOS ARM64 dev.16 previews, invoking the command again hides it.
The Linux x64 dev.30 and Windows ARM64 dev.36 hosts and current source instead
**close** the selected-visible tool, discarding its view's
search/scroll state; **Hide** or
Escape preserves that state for reopening. On optional-Snippets hosts, without an
enabled package the command opens **Settings → Extensions** with an explanation.
It never installs or enables anything for you. On Windows x64, it opens the built-in tool.
A disabled package remains disabled. Runtime unavailability is reported separately
from a missing installation. Terminal sessions remain usable.

## Install deliberately

On the four optional-Snippets `0.24.0` targets, use the matching, actually available
platform package and checksum described in the [installation guide](installation.md).
Windows x64 uses built-in Snippets instead. For a preview, use its exact host and
archive pair linked above; the Windows dev.36 section has [installer and SmartScreen
instructions](#windows-arm64-published-preview-and-catalog-candidate).
For local installation, download `snippets-0.1.0.omxext` and its checksum
from the Snippets release into the same folder, then verify before installation:

```sh
# macOS
shasum -a 256 -c snippets-0.1.0.omxext.sha256
# Linux
sha256sum --check snippets-0.1.0.omxext.sha256
```

On Windows, compare the PowerShell result with the hash in the matching sidecar:

```powershell
Get-FileHash .\snippets-0.1.0.omxext -Algorithm SHA256
Get-Content .\snippets-0.1.0.omxext.sha256
```

The checksum identifies bytes, not a verified publisher. No source build is required. Older hosts are not qualified for this package, and
existing Files/SSH packages were not newly qualified on these previews. The official
catalog uses the same Snippets bytes for all admitted targets; its Windows ARM64
promotion changes no archive or manifest range. Separate bounded public-HTTPS
checkpoints passed on the three Linux/macOS pairs; Windows public consumption
remains pending at this revision. See
[Linux x64](#linux-x64-public-catalog-checkpoint), [macOS](#macos-arm64-catalog-delivery)
and [Linux ARM64](#preview-coverage-and-remaining-platforms).

1. Open **Settings → Extensions**, choose **Browse official extensions**, select
   the Snippets preview and install it. Alternatively, choose
   **Install local .omxext…**; a downloaded local archive works offline. Browse/Refresh is explicit;
   reopening Settings does not fetch the catalog. Both routes use the same
   captured-byte trust and installation flow.
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
At that checkpoint, stable `0.23.0` and published Windows hosts retained built-in
Snippets; the later Linux x64 and Windows ARM64 previews are described separately below.

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

## Windows ARM64 source transition

🤖 AI-assisted.

The full ordinary ten-check source scenario passed on **2026-11-01** with
`684d3ee9ca07a5bddade18d147fd3b23d6af2bfb` (tree
`a679a0e3f04edb873c7954207963b6a9ff714724`, `0.24.0-dev.33`). This is a bounded
source checkpoint, not a complete `check:portable`, package/NSIS or public-catalog
qualification. All child-input, Insert, readiness and memory diagnostic flags were
absent from the actual selected subprocess environment.

The unchanged Snippets `0.1.0` archive was 76,653 bytes, SHA-256
`6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7`.
Ordinary local trust/dormant installation and explicit activation, missing/disabled
guidance, Close versus Hide, exact Insert/Run, held Enter/repeat/release, preview
intent overrides/Cancel, retained search, live en-US/pt-BR relabeling and
retirement with unchanged YAML all passed. Seven action windows and the whole
interaction retained exact semantic input and separately checked child receipts;
the same Surface and creation-identified ConPTY remained usable after retirement.

The run used a non-elevated interactive Windows ARM64 session, synthetic SendInput,
controlled consent and a controlled Node console probe. Trusted child activation,
a prevented core Enter repeat and independently observed held-to-up states were
recorded. Normal application Quit joined PTY onExit, backend exit/close and
Electron exit/close/both stream EOFs. The captured PTY/backend identities were
absent afterward; no separate PTY close-event or arbitrary-descendant census is
claimed. Build, typecheck and lint passed, with 303 focused passes and one documented
skip, 29 Installed Packages passes, one runtime pass and this one ordinary scenario.
Those selected suites and earlier headless tests are not the complete default suite.

All three actual captures were inspected: search/items, the preview's literal text
and Cancel/Insert/Run controls, focus and host chrome were legible without visible
clipping. Core and native-child images were captured separately, not as one
flattened native-view screenshot or proof of unpictured interaction. This does not
qualify physical keyboards/autorepeat, account-shell or bracketed-paste behavior,
Kitty, broad GPU/compositor behavior, Files/SSH or other platforms.

Windows ARM64 source selects the same optional implementation and preserves the
existing shortcut, user-owned YAML and deliberate installation/enablement. The
unchanged published Snippets `0.1.0` archive is the qualified input for this
source checkpoint, not evidence of compatibility with every admitted host. Its historical bundled example
uses POSIX `printf`; choose commands appropriate for the configured Windows shell.

The attempted source campaign at `fac36ba` timed out at its original exact-write
Insert assertion; a later diagnostic observed the exact 19-byte literal followed
by four focus reports but did not prove child consumption. The `659d4b7` campaign
then timed out on its outer-focus-off readiness predicate before Snippets. A
separate single-session ConPTY experiment observed the exact literal without
focus bytes in its child-disabled phase, and the focus pair followed by that
literal in its child-enabled phase. Its two input-mode snapshots had VT input
set; equal snapshots do not prove continuous mode. The experiment used synthetic
input and an intentionally closed owned PTY, not product GUI or graceful Quit.
It supports the fixture's distinction between child focus and ConPTY's outer
focus protocol; it does not turn either earlier failure into a pass. The revised
[fixture contract](../test/fixtures/snippets-packaged.md#composition-supplied-by-the-integration-owner)
retains raw writes and a bounded, truncation-marked selected-PTY output snapshot
containing the separately asserted child receipts when observed. That decoded
output is not a complete child-stdin recording or semantic-write provenance.
The fixture also records bounded standalone CPR-shaped writes paired with prior
lexical cursor-query observations; this does not establish their provenance or
relax the exact semantic and child-receipt assertions.
The separate, opt-in first-Insert diagnostic can additionally retain bounded raw
Node-delivered child stdin chunks from startup, with explicit truncation and a
pre-click checkpoint hint; this does not alter the ordinary input oracle or
retroactively qualify the earlier failures. A separate capture-only fixture flag
can retain the same bounded child observations without enabling the stopping
diagnostic or its extra marker. It may perturb timing, may continue through the
ordinary scenario, and is not proof of uninstrumented behavior or qualification
by itself.

Later ordinary capture-off campaigns also genuinely lacked the first draft
receipt. A memory-instrumented occurrence received the exact bytes and emitted its
receipt, but changed timing/liveness; it was not an ordinary qualification. The
subsequent full ordinary pass above satisfies the source scenario gate without
establishing a causal fix for historical intermittence. Earlier failures remain
failures, not retroactive passes.

### Default baseline and fixture follow-up

The subsequent unfiltered Windows ARM64 default suite on `a59f28f` failed: 5,304
assertions passed, 33 failed and 214 were skipped. Two unhandled Files readiness
rejections were recorded separately. The earlier ten-check pass and inspected
visuals above remain evidence for `684d3ee`; they did not pass this default suite.

On `ca45a58`, five corrected fixture cases passed separately: two tab-removal
variants, theme-appearance reload, host lifecycle/refit and image-palette refit.
Their enclosing host diagnostic gate failed on nonempty diagnostic stderr. A
separate bounded retrospective review accepted the retained absence observation
as evidence; it did not change the failed host outcome into a machine pass or
rewrite the earlier baseline. The other 28 historical failed assertions were not
rerun or waived: Files/SSH controls ([#761](https://github.com/luizomf/omxterm/issues/761)),
DMG identity controls ([#758](https://github.com/luizomf/omxterm/issues/758)),
fixture ownership and cascading refusals ([#759](https://github.com/luizomf/omxterm/issues/759)),
and a Settings renderer failure ([#760](https://github.com/luizomf/omxterm/issues/760))
remain tracked. These results do not establish a full portable pass.

At that historical boundary, exact-package and public-consumption qualification
had not passed for this transition. Earlier Windows composition, packaged-GUI and
exact-NSIS checkpoints used built-in Snippets and remain distinct. Published
Windows hosts and Windows x64 retain built-in Snippets; no host, catalog or archive
was published or changed by this source transition.

## Windows ARM64 exact-stage and NSIS checkpoint

🤖 AI-assisted.

On **2026-11-02**, the frozen host
`c04a350fcd5d5a411b1993300cb62eab4a0feace` (tree
`e80f2acec00988f390779e1b25d1d3e3d2439825`, `0.24.0-dev.36`) passed a fresh
complete Windows ARM64 `check:portable`: **5,535 passed, 215 skipped, zero failed**,
with all 518 discovered files accounted for. Its native stage and exact NSIS were
built and inspected from that clean source, separately from the fixture-only
adapter changes. This fresh result does not rewrite the earlier failed baseline.

The exact installer was **155,134,581 bytes**, SHA-256
`57a556f64c6665befef6a096e902c1435fcc27c7c2db701b821bd224dd9d8d1b`;
`resources/app.asar` was **18,344,994 bytes**, SHA-256
`d9d3b4d67ebfb7aed7dbbf50f2b74f7282637e720ba670d2c6e57c34f61ea709`.
The actual staged executable ran the shared ten-check optional-Snippets scenario
with the unchanged public `0.1.0` archive above. The controller and controlled
ConPTY child used official **Node 24.22.0 ARM64**, SHA-256
`df4b0e71e4e4d022bf8582fbe75f6061feb9c4a111a86f3fec6300d24b6fe5e0`.
The host itself used locked Electron **43.8.1** / embedded Node **24.22.0**.
The source build/default suite and stock NSIS verifier instead used Node 26.12.1;
these are distinct toolchain roles, not interchangeable receipts.

The [exact Windows fixture](../test/fixtures/snippets-packaged.md#exact-windows-arm64-staged-adapter-provisional-qualification)
attached at the verified ESM instantiation pause, before the production entry
body, window and first ConPTY. It released only the inspector-induced startup
pause of the exact node-pty output worker. No package entry, dependency bytes,
input admission or scenario oracle was replaced. Stage, installer, archive and
controlled-Node identities matched before and after. All diagnostic capture/stop
flags were absent from the successful ordinary campaign.

All ten checks passed, including ordinary local install/trust, missing/disabled
guidance, Close versus Hide, exact Insert/Run and full-interaction no-leak checks,
held Enter/prevented repeat/independent held-to-up observation, preview overrides
and Cancel, retained search, live locale changes, and disable/uninstall with
unchanged catalog and the same usable Surface/ConPTY. Normal Quit joined PTY
onExit, backend exit/close, actual main exit 0, close and both stream EOFs; captured
creation identities were absent and the supervisor reported no cleanup errors.
The actual child, core and preview captures were inspected: child search/items and
the preview's literal `SNIPPETS_RUN` body and Cancel/Insert/Run controls were
visible. Core and child WebContents were captured separately; this is not an
OS-compositor claim.

The first ordinary exact-stage occurrence with a **Node 26.12.1** controller/child
had failed: the observer recorded the exact 19-byte first Insert, but the child
draft receipt never appeared within its unchanged deadline. The separately chosen
Node 24 pair passed without changed package bytes, timeouts or input oracles.
One occurrence per pair does not establish a Node-version cause, prove OS byte
consumption in the failed case, or eliminate historical intermittence. That failed
occurrence and its black failure capture remain unqualified.

The matching stock **FULL NSIS** verifier separately passed exact payload
comparison, installed startup, owned uninstall and cache cleanup in the authorized
non-elevated disposable Windows ARM64 VM with a recovery snapshot. It replaced no
existing installation; registry/shortcuts/default paths/process inspection and
custom temporary destination cleanup were empty afterward. Package bytes remained
unchanged through both campaigns and the installer transaction. This is a staged
Snippets GUI campaign plus matching installed-host verification, **not installed-path
Snippets GUI**. Neither gate qualifies public acquisition/catalog delivery,
physical input/natural autorepeat, an account shell, Windows x64, Files/SSH or
later main. No host or extension was published by this checkpoint.

## Windows ARM64 published preview and catalog candidate

🤖 AI-assisted.

The [PARTIAL Windows ARM64 `0.24.0-dev.36` release](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.36)
was published on **2026-11-02 at 09:17:33 UTC**, with only the NSIS installer and
its checksum. Its immutable tag points exactly to
`c04a350fcd5d5a411b1993300cb62eab4a0feace`; these are the retained qualified
155,134,581-byte installer and ASAR identities above, not a rebuild from later
main. The draft's two assets were downloaded and hashed before publication;
anonymous HTTPS readback then matched both public assets. All 39 earlier releases,
including 36 immutable releases, and 67 existing tag refs remained unchanged.
Stable `0.23.0` remained Latest. This is not Windows x64 or stable-version evidence.

All three existing public Snippets assets were independently downloaded and
verified **before** host publication. The archive remains 76,653 bytes with the
SHA-256 above; its original source, receipt, Linux target and build-time `not-run`
field were not changed. The preview's ten-check staged GUI and separate FULL
NSIS results remain distinct from public download and installed public consumption.
The failed Node26 first-Insert occurrence remains failed, with cause unproved.

### Windows installation and migration

Download `OMXTerm-0.24.0-dev.36-arm64.exe` and its `.exe.sha256` from that exact
release. On ARM64 Windows 11, with the Microsoft Visual C++ Redistributable,
verify in PowerShell before running:

```powershell
$expected = '57a556f64c6665befef6a096e902c1435fcc27c7c2db701b821bd224dd9d8d1b'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath 'OMXTerm-0.24.0-dev.36-arm64.exe').Hash.ToLowerInvariant() -ne $expected) {
  throw 'Installer checksum mismatch'
}
$expected = '6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath 'snippets-0.1.0.omxext').Hash.ToLowerInvariant() -ne $expected) {
  throw 'Snippets checksum mismatch'
}
```

Quit OMXTerm before installation. This unsigned per-user installer can replace
an existing installation and its registration/shortcuts; it is not a side-by-side
preview. Verify the checksum before choosing **More info → Run anyway** for the
expected SmartScreen warning; never disable system-wide protections. Automated
VM evidence does not qualify browser quarantine, SmartScreen/UAC or physical
first-launch interaction. User configuration/YAML are preserved; keep a backup.

Use **Settings → Extensions → Install local .omxext…** with the verified separate
Snippets archive, review trusted-code identity, enable deliberately if disabled,
then **View → Toggle Snippets**. After catalog integration, Browse offers the same
bytes; no update/enable/activation occurs automatically. Existing YAML/custom
shortcuts remain in place. New configuration kits omit the example; the immutable
archive's POSIX example needs commands appropriate for the Windows shell.

### Catalog and public-consumption boundary

The Windows promotion added `win32-arm64` and factual Windows dev.36 wording to
the common Snippets entry in **both complete fixed catalogs**. Its integration
and exact fixed-endpoint readback completed. The promotion preserved other
entries and Snippets archive identity; subsequent Files/SSH promotions are
separate changes. Windows uses the legacy endpoint, not the macOS endpoint.
Manifest admission, including other admitted host versions, is not qualification.

The first [installed public fixture](../test/fixtures/snippets-packaged.md#windows-arm64-installed-public-catalog-adapter)
occurrence used the publicly downloaded dev.36 NSIS but **failed before Browse,
trust or backend activation**, with a renderer script error while Settings General
was selected. Guarded failure cleanup is not normal Quit or a public-consumption
pass. The failure is retained; its cause and a successful public checkpoint remain
pending at this revision. Headless controls do not establish native success.
The intended bounded checkpoint uses the exact NSIS, the guarded installed callback and
production Browse/Install/Reinstall HTTPS, controlled Official consent, the
supported Node24 probe, two backend retirements, unchanged YAML, the same usable
Surface/ConPTY and joined normal Quit, followed by owned NSIS cleanup. A local
chooser is refused in public mode. Unresolved native ownership refuses uninstall
and retains the installation/cache and any relocated uninstaller copy; it is not
a successful cleanup or permission to rerun. The earlier complete ten-check/FULL
results are reused, not repeated or relabeled as this public milestone.

## Linux x64 source transition

Linux x64 source selects the same optional Snippets implementation as ARM64.
The existing menu/palette action and configured shortcut open or close the installed
companion; missing/disabled guidance never installs, enables or falls back to a
built-in view. Existing YAML is untouched; only newly created configuration kits
omit the example. This source campaign used explicit local installation of the
unchanged published Snippets `0.1.0` archive identified above. The later [catalog
promotion and public-HTTPS checkpoint](#linux-x64-public-catalog-checkpoint) are
separate evidence. The original build receipt is not rewritten to infer qualification.

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

<a id="linux-x64-published-preview-and-catalog-candidate"></a>

## Linux x64 published preview and catalog delivery

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
`linux_install.sh.sha256` from that release. Install Snippets through the official
catalog or the deliberate local/trust/enable steps above. The promoted catalogs
add `linux-x64` to the unchanged Snippets archive identity, preserving Files/SSH
and the existing ARM64 targets. The embedded manifest has no platform restriction
and retains host `>=0.24.0-dev.8` / API `0.1.x`; that compatibility range does
not qualify every admitted host.

## Linux x64 public-catalog checkpoint

Catalog source `0164f768b060e4ac3a1fc7afa20b30d4426e6fc8` was integrated after
review. Both fixed public endpoints matched their source bytes; this host selects
the legacy endpoint, SHA-256
`b1383fe0690b3320433cd9419d9863b6ac8a7b2bcb48b9d2205d3e7248e45d97`.
A separate bounded **production public-HTTPS checkpoint passed** on 2026-10-31
with the freshly downloaded dev.30 AppImage and unchanged Snippets archive
identified above. The independently downloaded archive was an identity reference;
actual Browse, Install and Reinstall used the application's production catalog
and HTTPS downloader, not a local-archive fallback.

Both controlled Official trust prompts named the exact package and digest, with
current generations 0 and 1; installed generations 1 and 2 remained dormant until
explicit activation. The scenario used a pre-existing YAML fixture, sent one exact
Run and observed shell output, then exercised disable, enable, reinstall and
uninstall without changing the YAML. The same Surface and PTY remained usable
afterward. Reinstall and disable each retired a backend before Quit. Normal Quit
joined the baseline and scenario PTYs and confirmed both backends had exited; the
actual main process exited zero, its captured stderr closed and observed owned
processes settled. Four actual captures were inspected alongside these functional
receipts.

This checkpoint used synthetic Chromium/X11 input, ANGLE SwiftShader, controlled
consent and a controlled plain-paste shell. Application stderr included D-Bus
errors, Xvfb reported nonfatal keyboard-map warnings, and the restricted shell
PATH lacked `groups`. It does not qualify an ordinary account shell, physical
keyboard or autorepeat, Kitty, default GPU/compositor, FUSE/helper installation,
other platforms or the full portable suite. The earlier ten-check exact-AppImage
and stock FULL results remain separate, as do the failed enclosing diagnostic and
earlier failed attempts described above; none was rerun or explained by this pass.

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

[#741](https://github.com/luizomf/omxterm/issues/741) remains open. Windows ARM64
dev.36 is a separate published optional-Snippets preview with public consumption
still pending at this revision; older Windows hosts and Windows x64 are unchanged.
Remaining platform and later stable-version gates are separate. Existing published artifacts remain immutable; these
previews are not a stable SDK.
