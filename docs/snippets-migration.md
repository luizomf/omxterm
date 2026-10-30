# Optional Snippets migration

The published [OMXTerm 0.24.0-dev.11 Linux ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11)
uses the separately installed [Snippets 0.1.0 extension](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
Both are non-Latest prereleases; stable **0.23.0** remains unchanged with built-in
Snippets. Distributed macOS, Windows and Linux x64 hosts retain built-in Snippets.
The macOS ARM64 **source transition** selects optional Snippets through ordinary
production composition and has passed bounded native qualification. It is not a
published macOS host migration; distribution remains a separate gate.

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

Use the exact preview pair linked above. From the host release, download the
ARM64 AppImage, its checksum and, if wanted, the version-matched application-menu
helper and checksum. Follow that release's installation instructions, not
`/latest/download` or the stable-version filenames in the general installation
guide. From the Snippets release, download `snippets-0.1.0.omxext` and its checksum
into the same folder, then verify before installation:

```sh
sha256sum --check snippets-0.1.0.omxext.sha256
```

No source build is required. Older hosts are not qualified for this package, and
existing Files/SSH packages were not newly qualified on dev.11. The official
catalog now lists these same Snippets bytes. A separate bounded public-HTTPS
checkpoint passed on this exact published host/archive pair; see
[coverage below](#preview-coverage-and-remaining-platforms).

1. Open **Settings → Extensions** and choose **Install local .omxext…**. A local
   archive works offline. Alternatively, choose
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

## macOS ARM64 source transition

The source transition reuses the single compatibility action, preserves existing catalogs
and omits the example only in newly created configuration kits. It does not install
or silently enable a package. For deliberate local/offline testing, obtain the
exact published Snippets `0.1.0` archive and checksum linked above, verify with
`shasum -a 256 -c snippets-0.1.0.omxext.sha256` on macOS, then follow the local
archive/trust/enable steps above. The existing archive has no manifest platform
restriction and requires host `>=0.24.0-dev.8`; compatibility metadata alone is
not qualification. Keep the user's existing YAML beside `config.json`.

The official catalog still advertises **Linux ARM64 only**. Do not treat its
listing or the original Linux build receipt as macOS evidence. The full ordinary
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

A compatible package must be published and verified for the matching macOS host
before any distributed macOS host removes built-in access. Whether to reuse the
immutable archive for that release is a later maintainer decision; no catalog,
archive, receipt or host release is changed here.

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

This is not host publication, catalog promotion, public-HTTPS acquisition,
Finder/Gatekeeper/notarization, physical-keyboard, natural-autorepeat, Kitty,
OS-compositor, macOS Files/SSH or full portable-suite qualification. No immutable
archive or original build receipt was changed; distributed cutover remains a
separate maintainer decision under ADR 0044.

## Preview coverage and remaining platforms

The Snippets package was published and anonymously downloaded/hash-verified
before the matching host. The exact host/archive pair passed local installation,
compatibility entry points, guidance, input/focus and retirement scenarios. The
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

Other-platform migrations remain open in [#741](https://github.com/luizomf/omxterm/issues/741).
Each requires its own compatible, published package and matching qualification
before removing built-in access from a distributed host, as required by
[ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md).
Existing published artifacts remain immutable; this preview is not a stable SDK.
