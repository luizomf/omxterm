# ADR 0038: Serialize installation transactions and pin immutable package versions

- Status: accepted internal installation foundation, consumed by the Linux ARM64 Files development preview
- Context: [#715](https://github.com/luizomf/omxterm/issues/715), under [#712](https://github.com/luizomf/omxterm/issues/712)

## Decision

Use one deep Installed Packages module for local archive installation, bounded validation/extraction, compatibility, aggregate registry publication, installation generations, disable/tombstones and eligible cleanup. Its caller interface is shared by implementation tests and management/bootstrap consumers; no extension code executes during installation.

Shared host compatibility follows ordinary semver plus the narrowly documented
historical and explicitly selected development-family exceptions in the
[foundation contract](../dev/extension-installation-foundation.md#archive-contract).
They do not alter the actual API check, target, archive identity, trust or pin
fences, and do not qualify a package/platform pair.

Keep registry writer transactions short and independently pin immutable digest-addressed versions with shared native use leases. Collection requires registry nonreference and exclusive version ownership; detach to unique garbage and delete outside the writer interval. Staging and active garbage deletion also retain independent leases. Permanent lock sidecars are never deleted while the namespace can be used. Use a small host-distributed Node-API 8 adapter, with potentially blocking open/stat/close operations off-main, nonblocking POSIX `flock` / Windows `LockFileEx`, noninherited handles and explicit native cleanup lifetime.

Read-only registry snapshots, version acquisition and generation revalidation share the registry sidecar; initialization, mutation and collection retain exclusive ownership. Acquire the immutable-version pin inside the shared registry interval. This permits concurrent main/backend admissions without weakening writer exclusion or adding queues, retries or mutation replay. Busy against a writer remains a deliberate nonblocking refusal.

Multiple independent app instances may run their own backends. A surviving backend delays only its pinned version's physical removal, not all extension management. Disable means blocked new admission, not globally stopped trusted code. Uninstall means tombstoned admission with possibly pending physical cleanup. Same-byte reinstall increments generation; stale activation/update permits remain stale. Actual runtime/IPC/bootstrap handoff belongs to the separate [backend runtime consumer](../dev/extension-backend-runtime.md), not this module.

A fresh process reads valid published state and creates fresh authority; it does not adopt dead channels or replay unknown mutations. Known prepublication failures preserve old registry state; publication/response-loss uncertainty is not automatic rollback. Native locks and atomic rename do not imply universal power-loss durability or hostile same-user containment.

## Alternatives and cost

A whole-root process-lifetime lock/quarantine would block ordinary independent instances after a main crash while children survive. Boot witnesses, support-only/reboot recovery, PID-file stealing and a general descendant supervisor are rejected. Writer-only locking cannot protect late imports from a surviving backend. Keeping every version forever avoids deletion races but fails manageable cleanup. A database/daemon does not remove the need for independent reader lifetime and is unnecessary for a bounded registry without a general state API.

The selected adapter adds a small per-target native build obligation, including Windows C++/SDK/import-library and runtime-loading qualification. Node-API reduces ABI churn, not architecture/deployment/signing obligations. It is separate from the Files no-clobber move primitive. Pinned `yauzl` and `semver` are direct runtime dependencies; implementing ZIP parsing or semver from scratch would increase security/maintenance cost.

## Current integration and qualification

The [foundation contract](../dev/extension-installation-foundation.md) owns interfaces,
limits, builds and error behavior. Application startup on every supported target
(Linux ARM64/x64, macOS ARM64, Windows ARM64/x64) constructs installation/runtime
infrastructure without activating installed code. The bounded [Windows ARM64 source-composition checkpoint](../dev/windows-arm64-extension-composition.md#installed-package-production-fixture)
passed separately from packaging. Execution, web-content hosting, acquisition and trust UI remain consumer responsibilities;
[Files composition](../dev/files-development-preview.md#host-composition)
documents their integration. Installation and enable remain dormant. Separate
extension archives remain excluded from host payloads except the exact pinned
[one-time default Snippets resource](../dev/default-snippets.md) on optional targets.
That packaged-new-profile grant neither enrolls existing profiles nor activates code.
[macOS composition](../dev/macos-extension-composition.md)
and [Linux x64 composition](../dev/linux-x64-extension-composition.md)
are separate from Files qualification or Snippets migration. Terminal ownership and ADR 0018
are unchanged; the [specification](../spec.md#configuration-and-local-state) owns
the application network policy.

[Files qualification](../dev/files-development-preview.md#platform-limits)
separates product, module and main-death evidence. Source wiring and module tests
do not qualify FUSE/helper installation, physical dialogs/input, other platforms,
signing or a stable SDK. Historical failures remain failed; surviving-browser
main-death file-read exclusion remains unqualified.
