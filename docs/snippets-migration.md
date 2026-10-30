# Optional Snippets on Linux ARM64

The development source uses a separately installed Snippets extension on Linux
ARM64. macOS, Windows and Linux x64 retain built-in Snippets until their extension
infrastructure and matching migration are qualified. This guide does not announce
a published Snippets package or a new host release.

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

Use a Snippets `.omxext` archive compatible with your exact host version and
platform. Once a compatible release is published, use its release instructions
and checksum; a source build or catalog entry alone is not qualification.

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

## Release prerequisite

Maintainers must publish and download/hash-verify a compatible Snippets package
before distributing a Linux ARM64 host that removes built-in access. Qualify the
matching host/package through ordinary installation, compatibility entry points,
guidance, native input/focus and retirement. Preserve explicit input/rendering
limits and provide both release/catalog and local-archive instructions. Existing
published artifacts are immutable. Until that release work is complete, source
integration is not a claim that ordinary released hosts have migrated.
