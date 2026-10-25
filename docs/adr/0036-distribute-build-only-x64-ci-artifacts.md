# Distribute build-only x64 CI artifacts

## Decision

The maintainer approves native Linux and Windows x64 downloadable packages for
the next release without real client desktop hardware. This supersedes the
Linux x64 exclusion and stronger x64 qualification requirements in ADRs 0019
and 0034. ARM64 release checks remain unchanged. Neither #223 nor #224 is thereby
fully desktop-qualified; broader release automation and #680 remain separate.

Use manual GitHub Actions lanes on `ubuntu-22.04` and `windows-2025` with native
x64 Node 24, exact dispatch SHA checkout, read-only contents, pinned actions,
no dependency caches and no publication. Upload only named binaries, exact
checksum files and build-evidence JSON after every required check succeeds.
Artifacts expire after seven days; names bind platform, full source SHA, run ID
and attempt. This is artifact delivery, not automatic release assembly.

Linux x64 rebuilds the pinned source-digest-guarded node-pty correction using
locked Node-API headers. Patch identity, literal argv and native exec-status
semantics are unchanged. ARM64 and x64 share one byte-identical versioned Linux
helper; it checks host/ELF architecture before executing any supplied image.

Explicit `--inspection-only` reuses package content, version, license, icon and
architecture checks without GUI startup, Linux helper provisioning or NSIS
execution. Linux extracts the exact checksummed AppImage without FUSE, checks
reviewed AppRun bytes and reports ELF NEEDED entries. Both platforms run the
exact packaged Electron with `ELECTRON_RUN_AS_NODE=1`, loading the packaged
addon via an absolute package path and reporting actual runtime versions.
Linux additionally exercises bounded real PTY output/exit/resize and distinguishes
missing-executable exec failure from successfully executed exit 1. Windows only
loads native modules: no real ConPTY spawn is claimed. NSIS is hashed separately;
unpacked inspection does not establish its payload equivalence.

## Consequences

Native x64 packages are distributed with build-only qualification and enumerated
headless checks. Desktop, GPU, installer and ordinary-user OS integration remain
unverified and are not release gates for these lanes. The Linux runner/glibc
baseline is evidence for that runner, not broad distro compatibility or a FUSE
launch pass. Static AppImage runtime does not make Electron or addons static.
The first hosted runs must establish downloaded tool execution and artifact
upload success; source review or local ARM64 checks cannot establish either.

Default full verification remains unchanged, including the Windows disposable-VM
consent boundary and Linux helper installation/startup checks. Inspection never
reports FULL. Release assembly stays manual: retrieve before expiry, verify
checksums/provenance, reconcile the common Linux helper pair, compare build SHA
to tag inputs, upload all assets to a draft, download/verify again, then publish.
See [release procedures](../release.md).
