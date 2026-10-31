# Explicit official extension distribution

The Linux and macOS ARM64 previews use small static project catalogs, not a marketplace,
second installation store or public SDK. Settings uses the existing page controls;
main reuses HTTPS acquisition and the captured-byte trust/management owner.

## Authority and limits

Main selects one fixed schema1 endpoint from the host target:

- `darwin-arm64`: `https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json`.
- All other targets retain `https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json`.

Each is a complete catalog with unique package IDs. There is no multi-endpoint
merge, schema negotiation or fallback to the legacy endpoint after failure.
The legacy document remained byte-for-byte unchanged by the original target split,
so Linux hosts retain the Files0.4 offer. Common SSH/Snippets entries are identical
in both documents; future promotions must update both together.
Only explicit Browse/Refresh requests the selected endpoint. No startup, reopen, polling or automatic
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
The generator emits only Files with a Linux ARM64 target: merge its entry into
the appropriate complete catalog rather than replacing SSH or Snippets. It is
not a macOS entry generator. The macOS entry is bound to the separately verified
published0.5 archive and embedded manifest, not a rebuild from current source.

The legacy Files entry selects the immutable `ext-files-v0.4.0` release,
`omxterm-files-language-b6044d6.omxext` (13,188 bytes, SHA-256
`384de7da4cc2fafe7e42cd4ccf19a455a2e634036069160c75e15b7371d2eb6e`), from original
source `b6044d65d14345adb8d7ae59340fbca978512107`. It requires host
`>=0.24.0-dev.8`, API `0.1.x`, and target `linux-arm64`. All three original assets
passed draft and anonymous public readback; the original receipt remains
`not-run` with intended host dev.12. Separate controlled qualification passed on
the already-public dev.11 ARM64 AppImage. A separate actual public-HTTPS native
consumption checkpoint also passed after reviewed catalog integration; see
[exact evidence and limits](files-development-preview.md#files-040-distribution-and-controlled-qualification).
The promotion preserves SSH/Snippets metadata and all historical releases.
Stable0.23.0 users need the historical Files0.1.0 local/link archive rather than
the current catalog entry; no host or archive rebuild is part of this promotion.

The macOS endpoint selects immutable Files0.5.0, archive
`files-0.5.0-a343704c0794.omxext` (13,200 bytes, SHA-256
`82bd4bfe6f5a3ae7c22642741718dea94543f92b636a50b357c13d3c4be6aa18`),
source `a343704c0794cb913fba9ad312e90e5f6daa4bb1`, host `>=0.24.0-dev.21`
and API `0.1.x`, target `darwin-arm64` only. Original assets and receipts remain
unchanged. Existing dev.21 hosts still fetch the legacy URL: their qualified
[local/link route](files-development-preview.md#macos-link-first-distribution)
remains valid, but catalog discovery requires a new host containing this URL
selection. New-host packaging, publication and actual public-catalog consumption
remain separate from source implementation and earlier link qualification.
This split is not a historical compatible-release resolver; revisit a separate
versioned multi-release format if same-target host generations need different offers.

SSH Connect0.3.0 uses the same catalog/installation owner, with target Linux ARM64
and host minimum0.24.0-dev.8. The immutable `ext-ssh-v0.3.0` release provides
`ssh-0.3.0-77937fc.omxext` (11,572 bytes, SHA-256
`13b265058ba051bb1dcf57ba1cef9347ed8d6851069a4ad1206af0469feb46cf`), bound to source
`77937fcf87ae71a68709111df7ace7359fb3f0b6` and its original checksum/receipt.
Draft and anonymous public asset readback passed; catalog promotion preserves
Files and Snippets metadata. Fixed-endpoint readback and bounded public packaged
consumption passed; [the SSH guide](ssh-connect.md#public-distribution-checkpoint)
records the exact catalog digest, lifecycle results and capture limitations. The exact native-qualified pair reuses public
Linux ARM64 host0.24.0-dev.11; the original receipt's build-time `not-run` and
intended dev.19 fields remain unchanged. Historical SSH0.1.0
`ssh-6d939f0.omxext` and its original sidecars remain immutable. Installing0.3.0
is a deliberate extension update, not a side effect of upgrading the host.
The Files generator above must not be used for SSH or to erase other entries.
Follow the [SSH preview procedure](release.md#ssh-preview-publication) for the
extension-only publication and bounded public-consumption gate.
Catalog admission is not qualification of every version in an engine range.

The public catalog also lists Snippets0.1.0 for Linux ARM64, bound to the
published `snippets-0.1.0.omxext`, original receipt and checksum.
Its embedded host range remains `>=0.24.0-dev.8` with API `0.1.x`; the qualified
published pair is host `0.24.0-dev.11`, not every admitted host. That Snippets
promotion left Files/SSH entries unchanged. The fixed endpoint was read back byte-for-byte and the separate
[packaged public-HTTPS checkpoint](snippets-migration.md#preview-coverage-and-remaining-platforms)
passed on that exact pair. The [promotion procedure](release.md#snippets-catalog-promotion)
retains the evidence requirements for future entries. [Local/offline installation](snippets-migration.md#install-deliberately),
explicit trust/enablement and the published Windows built-in Snippets remain unchanged.

The Linux x64 `0.24.0-dev.30` host is now published with the same archive through
the deliberate local-install route. A source candidate adds `linux-x64` to the
common Snippets entry in both complete catalogs, without altering Files/SSH or
archive identity. Linux x64 selects the legacy endpoint listed above. Candidate
source is not public endpoint readback or actual packaged public-HTTPS consumption;
those remain separate steps. See the [Linux x64 preview](snippets-migration.md#linux-x64-published-preview-and-catalog-candidate).
