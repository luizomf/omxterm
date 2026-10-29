# ADR 0038: Serialize installation transactions and pin immutable package versions

- Status: accepted internal installation foundation, consumed by the Linux ARM64 Files development preview
- Context: [#715](https://github.com/luizomf/omxterm/issues/715), under [#712](https://github.com/luizomf/omxterm/issues/712)

## Decision

Use one deep Installed Packages module for local archive installation, bounded validation/extraction, compatibility, aggregate registry publication, installation generations, disable/tombstones and eligible cleanup. Its caller interface is shared by implementation tests and management/bootstrap consumers; no extension code executes during installation.

Keep registry writer transactions short and independently pin immutable digest-addressed versions with shared native use leases. Collection requires registry nonreference and exclusive version ownership; detach to unique garbage and delete outside the writer interval. Staging and active garbage deletion also retain independent leases. Permanent lock sidecars are never deleted while the namespace can be used. Use a small host-distributed Node-API 8 adapter, with potentially blocking open/stat/close operations off-main, nonblocking POSIX `flock` / Windows `LockFileEx`, noninherited handles and explicit native cleanup lifetime.

Multiple independent app instances may run their own backends. A surviving backend delays only its pinned version's physical removal, not all extension management. Disable means blocked new admission, not globally stopped trusted code. Uninstall means tombstoned admission with possibly pending physical cleanup. Same-byte reinstall increments generation; stale activation/update permits remain stale. Actual runtime/IPC/bootstrap handoff belongs to the separate [backend runtime consumer](../extension-backend-runtime.md), not this module.

A fresh process reads valid published state and creates fresh authority; it does not adopt dead channels or replay unknown mutations. Known prepublication failures preserve old registry state; publication/response-loss uncertainty is not automatic rollback. Native locks and atomic rename do not imply universal power-loss durability or hostile same-user containment.

## Alternatives and cost

A whole-root process-lifetime lock/quarantine would block ordinary independent instances after a main crash while children survive. Boot witnesses, support-only/reboot recovery, PID-file stealing and a general descendant supervisor are rejected. Writer-only locking cannot protect late imports from a surviving backend. Keeping every version forever avoids deletion races but fails manageable cleanup. A database/daemon does not remove the need for independent reader lifetime and is unnecessary for a bounded registry without a general state API.

The selected adapter adds a small per-target native build obligation, including Windows C++/SDK/import-library and runtime-loading qualification. Node-API reduces ABI churn, not architecture/deployment/signing obligations. It is separate from the Files no-clobber move primitive. Pinned `yauzl` and `semver` are direct runtime dependencies; implementing ZIP parsing or semver from scratch would increase security/maintenance cost.

## Current integration and qualification

The [foundation contract](../extension-installation-foundation.md) owns interfaces,
limits, builds and error behavior. Linux ARM64 application startup constructs
installation/runtime infrastructure without activating installed code. Execution,
web-content hosting, acquisition and trust UI remain consumer responsibilities;
[Files composition](../files-development-preview.md#owned-composition-modules)
documents their integration. Installation and enable remain dormant. Separate
extension archives are not bundled into the host. Terminal ownership and ADR 0018
are unchanged; the [specification](../spec.md#configuration-and-local-state) owns
the application network policy.

[Files qualification](../files-development-preview.md#build-and-evidence-boundary)
separates product, module and main-death evidence. Source wiring and module tests
do not qualify FUSE/helper installation, physical dialogs/input, other platforms,
signing or a stable SDK. Historical failures remain failed; surviving-browser
main-death file-read exclusion remains unqualified.
