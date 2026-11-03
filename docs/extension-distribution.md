# Explicit official extension distribution

The Linux, macOS ARM64 and Windows ARM64 previews use small static project catalogs, not a marketplace,
second installation store or public SDK. Settings uses the existing page controls;
main reuses HTTPS acquisition and the captured-byte trust/management owner.

## Authority and limits

Main selects one fixed schema1 endpoint from the host target:

- `darwin-arm64`: `https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-darwin-arm64-v1.json`.
- All other targets retain `https://raw.githubusercontent.com/luizomf/omxterm/main/distribution/official-extensions-v1.json`.

Each is a complete catalog with unique package IDs. There is no multi-endpoint
merge, schema negotiation or fallback to the legacy endpoint after failure.
The original target split kept the legacy document unchanged, preserving Linux's
Files0.4 offer at that checkpoint. The promoted catalogs select Files0.6
for Linux ARM64 and macOS ARM64 on their respective endpoints. Common SSH/Snippets
entries are identical in both documents; promotions must update both together.
The published SSH0.3.1 offer includes Linux and macOS ARM64 for the same original
archive. After source integration and public endpoint readback, a separate bounded
[macOS public-catalog checkpoint](ssh-connect.md#macos-arm64-public-catalog-checkpoint)
passed on the exact stable0.24.0 host with controlled input and a synthetic client.
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

Main enforces target and shared host/API compatibility for catalog selection.
Cards show the selected offer's targets, not an exhaustive platform-support list,
and distinguish target from host/API incompatibility. Local/link archive admission
checks host/API, not catalog targets. Manager-unavailable errors are distinct from
an offline catalog failure and do not promise local installation will work.
Host admission uses ordinary semver first plus the explicitly bounded [development-family and
historical exceptions](extension-installation-foundation.md#archive-contract);
API admission remains ordinary semver. Exact byte length, SHA-256 and parsed
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
not a macOS entry generator. Never replace the complete catalog with its output.

<a id="files06-and-ssh031-candidate"></a>

### Files0.6 and SSH0.3.1 promotion

The source catalogs bind Files0.6.0 to archive `files-0.6.0.omxext`, 17,331
bytes, SHA-256 `50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143`,
and source `cfc9073010df586eec321641ba5013862734f8fe`. The Linux entry targets
`linux-arm64`; the macOS entry targets `darwin-arm64`. Both require host
`>=0.24.0-dev.21` and API `0.1.x`. SSH0.3.1 targets `linux-arm64` and
`darwin-arm64` in the published catalogs. It requires
host `>=0.24.0-dev.8` / API `0.1.x`, and binds `ssh-0.3.1.omxext`, 11,606 bytes,
SHA-256 `be7589f44a65c8ab763b85e78863deeb487094bd33a936923988fe41bd846b0b`,
and source `8717d47327eeab14f522b1b2a448216860d0923d`. Original build receipts
remain `not-run`; qualification evidence is separate.

These entries do not prove that every advertised pair has been qualified. The
original archive, checksum and receipt for each extension were separately published
and anonymously byte-verified; their receipts remain `not-run`. The macOS SSH
promotion integrated as `24dbf2e0dc2f9ecb5c3233d9f72f8b92f07dc423`. Afterward,
the fixed endpoints were read back: legacy SHA-256
`8233d2a6fd3e1b41034acccd7e4b6e13afddd81f0f1c8393e7b9b05329e28d5f`, macOS
`9f75bf9b0c9a58e75e48a903f8518c0deeded767bacf532a1548e22441d7bd4c`. The
separate [macOS Files0.6 public-catalog checkpoint](files-development-preview.md#files-060-macos-public-catalog-checkpoint)
and [SSH0.3.1 public-catalog checkpoint](ssh-connect.md#macos-arm64-public-catalog-checkpoint)
used the retained locally built 0.24.0 DMG, not a freshly downloaded public host.
Other public-HTTPS checkpoints remain separate. Preserve newer supported
Snippets targets when reconciling promotions. Schema1 has one release per ID: promoting Files0.6 removes a compatible
catalog offer for Linux dev.11–dev.20. Those users can upgrade their host or install
the unchanged Files0.4 archive locally or by its direct HTTPS link. Files0.1 does
not admit stable host0.24.0. Existing releases and installed packages remain unchanged.

### Earlier published checkpoints

At the earlier Linux checkpoint the legacy Files entry selected the immutable `ext-files-v0.4.0` release,
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
the newer catalog entry; no host or archive rebuild was part of that promotion.

At the earlier macOS checkpoint the endpoint selected immutable Files0.5.0, archive
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

The separately published SSH Connect0.3.0 used the same catalog/installation owner, with target Linux ARM64
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
and explicit trust/enablement remain unchanged. Older Windows releases retain
built-in Snippets; the separate Windows ARM64 dev.36 preview is described below.

The Linux x64 `0.24.0-dev.30` host offers the same archive through the official
catalog or local installation. The promoted catalogs add `linux-x64` to the common
Snippets entry without altering Files/SSH or archive identity. The host selects the
legacy endpoint listed above; its public readback and a separate bounded packaged
public-HTTPS checkpoint passed. See the [Linux x64 checkpoint](snippets-migration.md#linux-x64-public-catalog-checkpoint)
for the exact pair and limits.

The earlier common Snippets promotion added `win32-arm64` for the immutable public
Windows ARM64 dev.36 host. At that checkpoint both complete catalogs retained
every other entry and the same Snippets archive, source, engine ranges and URLs. That exact host passed
the staged ten-check scenario plus separate FULL NSIS; anonymous public host and
archive byte readback passed. The installed public-HTTPS checkpoint remains
separate from catalog integration; source/headless tests are not that result. See the [Windows boundary and local installation](snippets-migration.md#windows-arm64-published-preview-and-catalog-candidate).
