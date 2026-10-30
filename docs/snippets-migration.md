# Optional Snippets migration

The published [OMXTerm 0.24.0-dev.11 Linux ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11)
and [OMXTerm 0.24.0-dev.16 macOS ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.16)
use the separately installed [Snippets 0.1.0 extension](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
All are immutable non-Latest prereleases; stable **0.23.0** remains Latest with
built-in Snippets. Windows and Linux x64 retain built-in Snippets. macOS uses
local-archive installation, available offline after download; the official catalog
remains Linux ARM64 only until the [macOS catalog candidate](#macos-arm64-catalog-promotion-candidate)
is promoted and verified.

## Existing catalogs and shortcuts

Keep `snippets.yaml` beside `config.json`, at the same configuration location as
before. Installation, upgrade, disable and uninstall do not copy, rewrite or
delete that file. YAML v1, exact text, search, Insert/Run, preview and Protected
Paste remain the same. There is no conversion or second Commands catalog.

**View → Toggle Snippets**, its Command Palette entry and existing shortcut
(`Ctrl+Shift+S` on Linux, `Cmd+Shift+S` on macOS, including custom remaps or
`null`) remain supported.
An enabled package opens in the shared companion panel; invoking the command
again hides it. Without an enabled package, the command opens **Settings →
Extensions** with an explanation. It never installs or enables anything for you.
A disabled package remains disabled. Runtime unavailability is reported separately
from a missing installation. Terminal sessions remain usable.

## Install deliberately

Use the exact preview pair for your platform linked above. On macOS, download the
ARM64 DMG and checksum; see [macOS installation](#macos-arm64-published-preview).
On Linux, download the ARM64 AppImage, its checksum and, if wanted, the
version-matched application-menu helper and checksum. Follow that release's
installation instructions, not `/latest/download` or the stable-version filenames in the general installation
guide. From the Snippets release, download `snippets-0.1.0.omxext` and its checksum
into the same folder, then verify before installation:

```sh
# macOS
shasum -a 256 -c snippets-0.1.0.omxext.sha256
# Linux
sha256sum --check snippets-0.1.0.omxext.sha256
```

No source build is required. Older hosts are not qualified for this package, and
existing Files/SSH packages were not newly qualified on dev.11. The official
catalog lists these same Snippets bytes for Linux ARM64 only. A separate bounded
public-HTTPS checkpoint passed on the Linux dev.11 host/archive pair, not macOS; see
[coverage below](#preview-coverage-and-remaining-platforms).

1. Open **Settings → Extensions** and choose **Install local .omxext…**. A local
   archive works offline after download. On Linux ARM64 only, alternatively choose
   **Browse official extensions**, select the Snippets Linux ARM64 preview and
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
launch was not qualified. Install the separate Snippets archive using the local
archive/trust/enable steps above, not the official catalog.

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
Public downloads do not establish native macOS public-HTTPS installation.

## macOS ARM64 catalog promotion candidate

The repository catalog candidate extends the existing Snippets `0.1.0` entry to
`darwin-arm64`, retaining `linux-arm64` and the unchanged Files/SSH entries.
It names the already published macOS `0.24.0-dev.16` / Linux `0.24.0-dev.11`
hosts without changing the archive, original receipt, source, digest, size,
immutable URLs or manifest engine ranges. The manifest has no platform restriction;
its host/API ranges express compatibility, not qualification of every admitted host.
Windows and Linux x64 retain built-in Snippets.

This is a **promotion candidate**, not a claim of live macOS catalog delivery.
Complete independent review, integration and exact public catalog readback remain
with the integration maintainer, followed by a separate bounded macOS packaged
production public-HTTPS consumption checkpoint. The exact-DMG nine-scenario and
FULL verifier passes below remain valid, separate evidence; neither is that
public-HTTPS checkpoint. No new Files/SSH qualification or stable SDK is implied.

After promotion, **Browse official extensions** can offer the same archive on
macOS ARM64. Installation/trust, enablement and Toggle remain deliberate; no
startup acquisition or automatic activation is added. Until then use the local
archive route above, which also remains available offline after download.
Existing YAML and terminal sessions remain untouched by installation/removal.

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

Windows and Linux x64 migrations remain open in [#741](https://github.com/luizomf/omxterm/issues/741).
Each requires its own compatible, published package and matching qualification
before removing built-in access from a distributed host, as required by
[ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md).
Existing published artifacts remain immutable; this preview is not a stable SDK.
