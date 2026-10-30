# Explicit official extension distribution

The Linux ARM64 preview uses a small static project catalog, not a marketplace,
second installation store or public SDK. Settings uses the existing page controls;
main reuses HTTPS acquisition and the captured-byte trust/management owner.

## Authority and limits

The only catalog endpoint is
`https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json`.
Only explicit Browse/Refresh requests it. No startup, reopen, polling or automatic
update traffic is added. Responses use the existing 60-second HTTPS/redirect policy
with a smaller 256 KiB declared/actual body bound. JSON must be valid UTF-8,
schemaVersion1, at most100 entries, unique IDs and strict known fields. Names,
versions, descriptions and engine ranges have bounded lengths; text is never HTML.

Each entry contains `id`, `name`, `description`, `version`, `engines` (omxterm/api),
`targets`, `archive` (url/sha256/bytes), `sourceCommit` and `releaseUrl`. Initial
assets are versioned project GitHub extension releases, not latest/download or
expiring Actions artifacts. The release page and archive must name the same tag.
Main issues opaque selection identities; renderer-provided URLs, hashes or Official
claims cannot authorize catalog installation. Refresh invalidates future use of old
selections, but cannot change a descriptor already captured by an installation.

Main enforces target and standard prerelease semver compatibility. Existing archive
validation additionally checks the host/API. Exact byte length, SHA-256 and parsed
manifest ID/version/engine strings must match the captured release **before trust**.
One-shot owner-bound approval retains bytes and observed installed generation;
conflict/uncertain publication never triggers automatic retry. Acquisition/consent
is revoked by cancellation, renderer loss/navigation, window loss or shutdown.
Already dispatched publication cannot be recalled. Neither browse nor install
imports extension code; explicit later activation remains required.

Official means maintained by this project, not harmless or sandboxed. HTTPS and
catalog digests bind bytes to the selected project-controlled snapshot, not an
independent publisher signature. A compromised catalog authority can replace both
metadata and hashes. A stale snapshot is not proof of newest release or revocation.
The UI does not add persistent installed Official badges or a second trust ledger.

## Offline and replacement behavior

Only the last successful snapshot is retained, in memory. Failed refresh visibly
marks it stale; cold offline failure is unavailable rather than a successful empty
catalog. Catalog acquisition does not block local/installed management. Snapshot
inspection and Settings reopen never request the network. Newer compatible releases
offer Update; identical installed ID/version/digest offers Reinstall. Older versions
or same-version different bytes require an explicit replacement warning, including
in native trust. All installs/replacements remain dormant.

## Publication boundary

`extensions/files/extension.json` remains the sole Files metadata input. The builder
emits archive/checksum/receipt. `scripts/create-files-catalog.mjs ARCHIVE OUTPUT`
checks actual archive bytes, checksum, receipt and embedded manifest against that
input and refuses output replacement. It preserves the artifact's original source
commit and does not infer qualification or rebuild identical-version bytes.

Changed published bytes require a new Files version and release. A separate Linux
ARM64 host prerelease and separate Files release are both **not Latest**. Assets
must be published and downloaded/hash-verified before promoting the generated
entry. Empty source catalog integration is useful implementation, not completed
public distribution. Public-endpoint packaged consumption is a separate required
milestone; follow the [Files publication procedure](release.md#files-catalog-publication).

SSH Connect0.1.0 uses the same catalog/installation owner, with target Linux ARM64
and host minimum0.24.0-dev.0. The separately released source-named
`ssh-6d939f0.omxext` and its original checksum/receipt retain the qualified bytes;
its version is the manifest/release version, not a renamed artifact. The catalog
keeps Files metadata unchanged and adds SSH only after exact public asset
readback. The Files generator above must not be used for SSH or to erase other
entries. Follow the [SSH preview procedure](release.md#ssh-preview-publication)
for its partial host/extension prereleases and bounded public-consumption gate.
Catalog admission is not qualification of every version in an engine range.

The source catalog also includes a Snippets0.1.0 Linux ARM64 candidate bound to
its already published `snippets-0.1.0.omxext`, original receipt and checksum.
Its embedded host range remains `>=0.24.0-dev.8` with API `0.1.x`; the qualified
published pair is host `0.24.0-dev.11`, not every admitted host. Files/SSH entries
are unchanged. This source addition does not establish catalog publication or
packaged public-HTTPS consumption. Follow the
[Snippets catalog checkpoint](release.md#snippets-catalog-promotion) before claiming
public delivery. [Local/offline installation](snippets-migration.md#install-deliberately),
explicit trust/enablement and other-platform built-in Snippets remain unchanged.
