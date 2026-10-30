# Optional Snippets on Linux ARM64

The published [OMXTerm 0.24.0-dev.11 Linux ARM64 preview](https://github.com/luizomf/omxterm/releases/tag/v0.24.0-dev.11)
uses the separately installed [Snippets 0.1.0 extension](https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0).
Both are non-Latest prereleases; stable **0.23.0** remains unchanged with built-in
Snippets. macOS, Windows and Linux x64 also retain built-in Snippets until their
extension infrastructure and matching migration are qualified.

## Existing catalogs and shortcuts

Keep `snippets.yaml` beside `config.json`, at the same configuration location as
before. Installation, upgrade, disable and uninstall do not copy, rewrite or
delete that file. YAML v1, exact text, search, Insert/Run, preview and Protected
Paste remain the same. There is no conversion or second Commands catalog.

**View → Toggle Snippets**, its Command Palette entry and existing shortcut
(`Ctrl+Shift+S` on Linux, including custom remaps or `null`) remain supported.
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
existing Files/SSH packages were not newly qualified on dev.11. No Snippets
catalog entry was promoted with this release; use the explicit local archive
rather than expecting it in **Browse official extensions**.

1. Open **Settings → Extensions** and choose **Install local .omxext…**. A local
   archive works offline; browsing the official catalog is optional and explicit.
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
platforms. Public download verification is not a new public-HTTPS installation
campaign. The full package verifier used an authenticated nested X11 desktop,
not a broad distro/GPU campaign.

Other-platform migrations remain open in [#741](https://github.com/luizomf/omxterm/issues/741).
Each requires its own compatible, published package and matching qualification
before removing built-in access from a distributed host, as required by
[ADR 0044](adr/0044-migrate-snippets-without-changing-terminal-input.md).
Existing published artifacts remain immutable; this preview is not a stable SDK.
