# Extension distribution

OMXTerm distributes official extensions through two small static catalogs. This
is not a marketplace, a second installation store or a public SDK. Settings uses
its existing extension controls, and main reuses the HTTPS acquisition and
captured-byte trust flow described in the
[installation contract](extension-installation-foundation.md).

## Catalogs

Main picks one fixed endpoint from the host target:

- `darwin-arm64`: `distribution/official-extensions-darwin-arm64-v1.json`
- every other target: `distribution/official-extensions-v1.json`

Both are served from `raw.githubusercontent.com/luizomf/omxterm/main/`. Each is
a complete schema 1 catalog with unique extension IDs. There is no merging of
endpoints, schema negotiation or fallback to the other endpoint after a failure.

The catalogs differ only where a target needs a different offer (today, the Files
entry's `targets`). Entries shared by both, such as SSH Connect and Snippets,
must stay identical, so a promotion updates both files together.

Schema 1 allows one release per extension ID. When a new entry's host range or
capabilities exclude older hosts, those hosts lose the catalog offer. They can
still install the older archive from its release link or a local file.

## Entry format

Each entry has `id`, `name`, `description`, `version`, `engines` (`omxterm` and
`api` ranges), `targets`, `archive` (`url`, `sha256`, `bytes`), `sourceCommit`
and `releaseUrl`. The archive is an asset of a versioned project GitHub release
(`ext-<name>-vX.Y.Z`), never a `latest/download` link or an expiring Actions
artifact. The release page and the archive must name the same tag.

Catalog responses are bounded: valid UTF-8 JSON, schema version 1, at most 100
entries, unique IDs, strict known fields, bounded text lengths, and at most
256 KiB. Text is never rendered as HTML.

## Browsing and selection

- Only an explicit **Browse** or **Refresh** requests the catalog. There is no
  startup, polling or automatic update traffic.
- Main issues opaque selection identities. A renderer-supplied URL, hash or
  "Official" claim cannot authorize an installation. Refreshing invalidates old
  selections but does not change a descriptor an installation already captured.
- Main checks the entry's `targets` and the shared host/API compatibility.
  Cards show the offer's targets and tell target incompatibility apart from
  host/API incompatibility. Local and link installs check host/API only, not
  catalog targets.
- Host admission follows the
  [archive contract](extension-installation-foundation.md#archive-contract);
  API admission is ordinary semver.
- The downloaded archive's byte length, SHA-256 and parsed manifest ID, version
  and engine ranges must match the catalog entry before trust is asked.
- Installing needs a one-shot, owner-bound approval. Cancelling, losing the
  renderer or window, navigating away or shutting down revokes it. A conflict or
  an uncertain publication never triggers an automatic retry.
- Browsing and installing never import extension code. Everything installs
  dormant, and enabling is a separate explicit step.

## Offline behavior and updates

Only the last successful snapshot is kept, in memory. A failed refresh marks it
stale; a cold offline failure shows the catalog as unavailable, not as an empty
list. Catalog problems never block managing installed or local extensions, and
reopening Settings does not hit the network.

A newer compatible release offers Update. The same ID, version and digest offers
Reinstall. An older version, or the same version with different bytes, asks for
an explicit replacement warning, including in the native trust prompt.

## Trust

"Official" means maintained by this project. It does not mean harmless or
sandboxed. HTTPS plus the catalog digest binds the bytes to what the project
published at that moment; it is not an independent publisher signature. Whoever
controls the catalog can replace both metadata and hashes, and a stale snapshot
is not proof of the newest release or of revocation. The UI adds no persistent
"Official" badge and no second trust ledger.

Catalog admission also does not qualify every version in an engine range on every
platform.

## Bundled default

New profiles can get the Snippets extension without the catalog: a packaged
host installs exact bundled bytes, enabled but dormant, under a one-time grant.
It never fetches the catalog or substitutes the catalog's mutable offer. Existing
profiles, disabled entries and removed extensions keep their explicit choices.
See [default Snippets](default-snippets.md).

## Publishing and promoting

Publishing an archive and promoting it into a catalog are separate steps, and
the archive must be public and hash-verified before promotion. The procedures
live in [release.md](release.md#publishing-an-extension-archive) and
[catalog promotion](release.md#catalog-promotion).

`scripts/create-files-catalog.mjs ARCHIVE OUTPUT` builds a Files entry from the
published archive. It checks the real bytes, checksum, build receipt and embedded
manifest against `extensions/files/extension.json`, keeps the archive's original
source commit and refuses to overwrite its output. It only emits a Linux ARM64
entry, so merge its output into the right catalog by hand. Never replace a whole
catalog with it, and edit the SSH, Snippets and macOS entries by hand.

A changed archive needs a new extension version and release. Published
same-version bytes are never rebuilt or replaced.

## Current offers

Check `distribution/` for the exact entries. At the time of writing, both
catalogs offer Files, SSH Connect and Snippets. Files requires host `>=0.26.0`
and SSH Connect 0.4.0 requires `>=0.27.0-dev.0`, so older hosts install the
older archive (Files 0.7, SSH Connect 0.3.2) by link or local file.
Evidence for specific extension and host pairs lives in each extension's
development record, for example
[Files](files-development-preview.md), [SSH Connect](ssh-connect-development.md)
and [Snippets](snippets-migration.md#publish-and-install).
