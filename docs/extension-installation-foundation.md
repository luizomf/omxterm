# Internal installed-package foundation

Status: internal foundation from [#715](https://github.com/luizomf/omxterm/issues/715), under [#712](https://github.com/luizomf/omxterm/issues/712). The [Linux ARM64 Files preview](files-development-preview.md) now consumes this module through production Settings and a composed application owner. This module itself defines neither execution nor UI, catalog/network acquisition or a stable SDK. See [ADR 0038](adr/0038-pin-immutable-installed-packages.md).

## Interface and ownership

`src/installed-packages/installed-packages.ts` is the caller/test interface. The module owns archive admission/extraction, registry validation/publication, generations, writer exclusion, immutable version paths, independent use leases and garbage collection. Callers do not manipulate lock files, staging paths or registry bytes.

- `InstalledPackages.open({root, runtime, leases})` opens a dedicated absolute, user-owned local store. `runtime` supplies valid application/API semver versions. `createNativeLeaseAdapter(absoluteAddonPath)` is the real adapter; a controlled adapter can hold acquisition/release boundaries in tests while retaining real kernel locks.
- `snapshot()` returns installation metadata, including disabled entries and tombstones. It does not observe global process/runtime state.
- `install(localArchive, {expectedGeneration, enabled})` validates and stages a complete local package before the bounded writer transaction. The internal caller may supply a bounded Buffer instead of a filename; bytes and options are copied synchronously before asynchronous admission so a consent service can install exactly its captured archive rather than reopen a mutable source. Generation `0` means never installed; updates and reinstalls must name the observed generation, including tombstones. The explicit `enabled` choice is metadata only, never code execution or a substitute for explicit trust. The resulting entry includes its digest and new generation.
- `setEnabled(id, expectedGeneration, enabled)` and `uninstall(id, expectedGeneration)` publish a new generation. Uninstall publishes a tombstone, not a claim all processes stopped or bytes disappeared. Disable retains its installed version as referenced. A tombstone retains generation indefinitely to prevent identical-byte reinstall from reviving stale permits.
- `openVersion(id, expectedSelection?)` returns a separately acquired shared pin, captured generation/digest, immutable directory, manifest, `revalidate()` and idempotent async `release()`. A second process can use the captured selection to acquire its **own** pin. Hold each pin until its actual file-reading lifetime ends; never pass a borrowed descriptor as an independent pin. `revalidate()` returns false after release, disable, update or tombstone/reinstall. It is a point-in-time admission check, not a revocable lock on future side effects.
- `collect()` performs bounded eligible detachment/deletion and returns `removed` and `pending` identities. No collection timer/daemon is installed. Management/runtime consumers call it at their owned lifecycle points. Pending cleanup is not whole-root failure. Collection inventories at most 10,000 namespace entries outside writer exclusion and examines at most 32 candidates per writer transaction, including pinned/referenced candidates and registry temporary files. `more` indicates an unexamined remainder of that snapshot; the same instance advances its cursor on the next deliberate call. Concurrent mutations can change that snapshot, so this is not global cleanup completion. Sidecar files remain permanent, including garbage/staging sidecars.

The separate [internal backend runtime](extension-backend-runtime.md) acquires its independent pin before extension import, obtains live main authority after generation revalidation and retains the child pin until actual process exit. That IPC/activation protocol belongs to the runtime consumer, **not** this installation module. New main authority must not adopt orphan ports or replay mutations after response loss. A retained native lease protects only managed version bytes, not arbitrary descendants or external writes.

A store admits at most 32 pending operations per instance, native addon at most 128 pending/live/retiring leases. Busy writer acquisition is nonblocking and returns `busy`; it does not wait for another process or replay an operation. Native capacity failure is distinct from lock contention. Caller-controlled runtime/lease objects are infrastructure, not untrusted manifest data.

## Archive contract

`.omxext` is a ZIP archive, read once into a bounded immutable snapshot for both SHA-256 identity and extraction. The digest identifies the archive bytes, not a publisher signature or equivalent normalized file tree. ZIP metadata and decompression use pinned maintained `yauzl` as a direct runtime dependency; `semver` is also directly declared. Neither dependency is reached from a renderer.

Limits: 64 MiB compressed input, 256 MiB expanded bytes, 10,000 entries, 64 KiB `extension.json`; names at most 1,024 characters, components at most 255. Actual decompressed byte counts, reported sizes and CRC32 must agree. Entries are processed sequentially into exclusive-created files. No package install hooks, npm install, remote resolution, shell commands or module imports occur.

Reject absolute/drive/UNC/backslash/traversal paths, empty/dot components, controls, portable reserved names, alternate streams, trailing-dot/space aliases, non-NFC names, conservative NFKC/uppercase/lowercase collision keys (including non-ASCII aliases), duplicate entries, file/directory collisions, symlinks, special nodes and link-bearing Unix extra fields. Parent directory entries may be implicit; all implied/explicit namespace nodes share the 10,000-node bound. Explicit directories must be stored empty entries with zero compressed/uncompressed sizes and CRC, not compressed streams. The manifest must be an exact regular `extension.json` entry independently of host case sensitivity. Executable file bits are preserved as owner-only executable permission, never setuid/group/world access. The reserved `.omxterm-install.json` marker cannot come from the archive. ZIP CRC is integrity checking, not authentication.

The first internal manifest is strict and deliberately small:

```json
{
  "format": 1,
  "id": "example.files",
  "version": "1.0.0",
  "name": "Example files",
  "engines": { "omxterm": ">=0.23.0-0 <0.24.0", "api": "0.1.x" },
  "backend": "backend/index.mjs"
}
```

The main-owned `createExtensionPackageTrust` service validates captured chooser
bytes (or a synchronously copied, bounded main-owned download Buffer) by extracting without importing, returns identity/digest and the observed
installation generation, and retains one one-shot approval per infrastructure
owner. Cancellation, owner disposal and replacement revoke that consent. Approval
installs the retained bytes with the observed generation; conflicts or unknown
publication consume the approval and never authorize an automatic retry. This
service is consumed by the production Settings local/HTTPS install dialog; it never activates code. HTTPS acquisition is a separate main-owned caller, not part of Installed Packages.

Unknown fields are rejected. ID is bounded lowercase ASCII namespace/name; version is semver; application and API ranges must parse and match the explicitly supplied runtime. Normal semver prerelease rules apply: a development application requires a range admitting that prerelease tuple. Backend must name an exact regular archive entry. It is validated but never imported. An optional exact `view` object declares one concrete application-tab entry and shared action: `{ "entry": "view/index.html", "action": "example.files.open", "title": "Files" }`. The entry must be an exact regular `.html` archive member admitted by the hosted resource grammar: at most 512 characters, slash-separated ASCII components starting with a letter, digit, underscore or hyphen, containing only letters, digits, underscores, hyphens and dots, with no trailing dot. The action is the exact package ID plus one dot-separated leaf (no further dots), preventing nested package namespaces from claiming the same action; the title is bounded nonblank display text. It grants no startup activation or shortcut. Other contribution fields, platform declarations and publisher/source trust metadata remain rejected, not permissive placeholders. This internal schema is not a stable extension author API or an assignment of an application release number.

The preview now admits the exact capability names `terminal.openSsh.v1`,
`terminal.captureLayout.v1`, `terminal.openLayout.v1`, `terminal.mirrorTyping.v1`
and `state.v1` in an
optional nonempty unique `capabilities` array. Unknown names refuse. The first
four are own-view host operations; state is declaration-gated backend bootstrap
support, not browser filesystem access. Optional `view.context: "window"`
selects original-window lifetime without a captured source-session directory;
omission retains existing session context. Layout/state declarations require a
compatible newer host; older hosts reject them rather than partially activating.
Mirror Typing requires host 0.24.0-dev.2 or newer within its declared 0.24.x
range. Its own-view describe/start/stop capability grants no extension-authored
keyboard payload route; see [the capability contract](mirror-typing.md#capability-and-lifetime).

The immutable Files0.1.0 manifest's exact historical engine metadata is admitted
on the deliberately enumerated hosts 0.24.0-dev.0, 0.24.0-dev.1,
0.24.0-dev.2, 0.24.0-dev.3 and 0.24.0-dev.4, in both store
and catalog compatibility. This is not an open-ended prerelease exception or a
mutation of published bytes; other host versions need ordinary range admission
or another explicit reviewed decision.

## Shared store transactions

The canonical root contains a permanent `initialized` witness, `registry.json`, permanent `locks/`, `versions/<sha256>/`, unique `staging/` and detached `garbage/`. All cooperating writers use one short exclusive writer lease. Under it, re-read bounded aggregate metadata, compare the captured generation, then publish a complete JSON replacement. Distinct IDs cannot overwrite one another's latest changes. Downloads/extraction, bootstrap/import waiting, process retirement and recursive deletion are outside writer exclusion. Registry limits are 2 MiB and 1,000 IDs including tombstones. First initialization is permitted only in an otherwise empty managed namespace and records its witness before registry publication. An interrupted initialization or subsequently missing/corrupt registry is a targeted error, never automatic generation reset, including after all versions have been collected.

Staging holds a use lease from before directory creation through commit/abandonment. Completed versions are never overlaid; existing digest reuse requires matching app-written identity/manifest metadata. Managed publishers and collectors use the same writer exclusion for no-overlay publication. This is **not** a general filesystem no-replace move primitive; the Files operation remains separate.

Collection checks registry nonreference, then tries exclusive version ownership without waiting. It detaches an eligible directory to a unique garbage name and deletes outside writer exclusion while holding that garbage path's own lease. Other collectors skip active staging/garbage. A fresh installation of the same digest cannot be removed by an older garbage continuation. Unreferenced complete versions, abandoned staging and detached garbage become eligible after actual handle release/process death; never infer this from PID/age or delete a contended sidecar. Directory scans reject excessive/invalid namespace contents rather than blindly delete arbitrary paths.

Known prepublication rejection leaves the old registry. Replacement/flush uncertainty or cleanup failure after publication was attempted returns `outcome-unknown`; `cleanupFailed` records failed cleanup without losing a primary rejection or unknown outcome, and all retained cleanup steps are attempted. Any transport loss after a mutating request also remains unknown regardless of local error type. Inspect current metadata/files before a new deliberate operation; do not automatically retry, downgrade or assume rollback. Atomic replacement and file sync are not universal power-loss proof. POSIX package directories and publication parent are synced; Windows directory durability and storage/antivirus/filesystem behavior remain qualification limits. Missing/corrupt metadata produces an error, never a boot quarantine or guessed repair. No application/user configuration, themes, SSH files or external extension-created files are managed.

Managed namespace must remain stable and under one user's control. Canonical aliases resolve to the same root; managed subdirectory symlinks and lock-file symlinks/reparse/nonregular nodes are rejected. This is not protection against malicious same-user code replacing ancestors, mounts or already installed bytes concurrently. Network/unqualified filesystem locking and power-loss guarantees are outside the supported local-filesystem evidence. Do not copy/move the store while readers exist. No file paths or package contents are logged by the module; future UI may show user-selected context but must not log native error text wholesale.

## Native implementation and builds

Node-API 8 `extension-leases.node` performs open/stat/try-lock/unlock/close off the JavaScript thread through bounded async work. POSIX uses independent noninherited `flock` descriptors; Windows uses independent noninherited fixed-range `LockFileEx` handles. Absolute Windows sidecar paths are converted to extended-length names before native open, rather than assuming Node's filesystem normalization also applies to direct `CreateFileW`. An owned JS lease retains its native token; pending work and environment teardown retain cleanup ownership. GC closes abandoned tokens asynchronously, not retained live pins. Actual process exit releases kernel ownership; it does not establish arbitrary descendant exit. No PID sentinel, daemon, process scanner or custom supervisor.

Build the isolated internal artifact explicitly:

```sh
npm run build:installed-packages
npm test -- test/integration/installed-packages.test.ts
```

The explicit build produces `dist/installed-packages/index.mjs` and the addon. Normal Linux ARM64 `npm run build` includes the runtime and native addons used by the production Files preview. The runtime consumes independent leases in main and its app-owned bootstrap.
Linux ARM64 package verification checks required resources and actual bundled
Node-mode store/native loading; that is not GUI activation, signing or other
platform qualification. `yauzl`/`semver` remain external direct dependencies of this Node bundle. No binaries enter Git.

macOS needs Xcode Command Line Tools; Linux needs a C++17 compiler; pinned `node-api-headers` supplies Node-API declarations without downloading runtime headers. Windows needs a target-native MSVC developer shell, matching Windows SDK/Visual C++ runtime, and an absolute `OMXTERM_NODE_IMPORT_LIBRARY` pointing to an architecture-matched `node.exe` import library exposing Node-API 8. The delay-load helper binds only that library to the current Node/Electron executable. Build performs no toolchain provisioning/download. Native ARM64 results do not qualify x64, deployment floors or signed packages.

The integration suite is headless but **native**, builds in a unique scratch directory, uses real archive/store/native adapters and actual owned child exits, and invokes focused lifetime/GC/worker teardown controls. Run native checks on an assigned disposable environment, not the owner's working desktop. On Windows the loaded addon remains mapped until the Vitest worker exits, so its unique `.scratch/` build is retained during in-process teardown and must be removed by the outer qualification owner after actual test-process exit. It is a build artifact, not a live version lease or process. Browser/PTY/UI/installer scenarios are not part of this suite. Prior feasibility prototypes retain their own identities and are not these production regressions.
