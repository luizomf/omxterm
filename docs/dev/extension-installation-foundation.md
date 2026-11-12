# Extension installation

The installed-packages module owns everything about getting an extension archive
onto disk safely: archive validation and extraction, the registry of what is
installed, version pinning while code is in use, and cleanup. It does not run
extension code, show UI, fetch from the network or define a stable SDK. See
[ADR 0038](../adr/0038-pin-immutable-installed-packages.md) for the decision.

Settings consumes it for local-file and HTTPS installs, and the
[backend runtime](extension-backend-runtime.md) consumes it to run installed
backends. [Extension distribution](../extension-distribution.md) covers how
catalog installs reach it.

## Interface

`src/installed-packages/installed-packages.ts` is the interface. Callers never
touch lock files, staging paths or registry bytes.

- `InstalledPackages.open({root, runtime, leases})` opens a dedicated, absolute,
  user-owned store. `runtime` supplies the application and API versions.
  `createNativeLeaseAdapter(absoluteAddonPath)` is the real lease adapter.
- `snapshot()` returns installation metadata, including disabled entries and
  removed ones (tombstones).
- `install(archive, {expectedGeneration, enabled})` validates and stages the
  whole archive, then publishes it in a short writer transaction. The archive
  can be a filename or a bounded buffer, so a consent flow installs exactly the
  bytes the user approved rather than reopening a file that may have changed.
  `enabled` is metadata only and never runs code.
- `setEnabled(id, expectedGeneration, enabled)` and
  `uninstall(id, expectedGeneration)` publish a new generation. Uninstall
  leaves a tombstone; it does not promise running processes stopped or bytes
  vanished.
- `openVersion(id, expectedSelection?)` returns an independently acquired shared
  pin on one immutable version: its generation, digest, directory and manifest,
  plus `revalidate()` and `release()`. Hold the pin for as long as files are
  being read. `revalidate()` turns false after release, disable, update or
  uninstall, but it is a point-in-time check, not a lock on future side effects.
- `collect()` removes versions nothing references any more and reports what was
  removed or is still pending. Nothing runs it on a timer; the consumers call it
  at their own lifecycle points.

### Generations

Every ID has a generation number that changes on each publication. Installs,
updates and reinstalls must name the generation they observed (`0` means never
installed), so a stale decision cannot overwrite a newer one. Tombstones keep
their generation forever, which stops reinstalling identical bytes from reviving
an old approval.

### Trust service

`createExtensionPackageTrust` (main process) inspects a captured archive without
importing it, reports its identity, digest and the observed generation, and holds
one one-shot approval per owner. Approving installs exactly the retained bytes
at the observed generation. Cancelling, disposing the owner or replacing the
candidate revokes consent, and a conflict or unknown outcome consumes it without
any retry. Neither the service nor the module activates code.

## Archive contract

An `.omxext` file is a ZIP read once into a bounded immutable snapshot, used for
both the SHA-256 identity and extraction. The digest identifies those bytes; it
is not a publisher signature. Nothing runs during installation: no install
hooks, no npm, no shell, no module imports.

Limits: 64 MiB compressed, 256 MiB expanded, 10,000 entries, 64 KiB
`extension.json`, names up to 1,024 characters with components up to 255.
Decompressed sizes and CRC32 must match what the archive reports. CRC checks
integrity, not authenticity.

Rejected: absolute, drive, UNC, backslash and traversal paths; empty or dot
components; control characters; reserved names; alternate streams; trailing dots
or spaces; non-NFC names; names that collide after case or Unicode folding;
duplicates; file/directory collisions; symlinks, special files and link-bearing
extra fields. Executable bits become owner-only executable. The
`.omxterm-install.json` marker name is reserved.

### Manifest

The manifest is strict and small:

```json
{
  "format": 1,
  "id": "example.files",
  "version": "1.0.0",
  "name": "Example files",
  "engines": { "omxterm": ">=0.26.0", "api": "0.1.x" },
  "backend": "backend/index.mjs"
}
```

- Unknown fields are rejected. The ID is a bounded lowercase ASCII
  `namespace.name`; the version is semver.
- `engines.omxterm` and `engines.api` must be valid ranges that admit the
  running host and API. The API check is always ordinary semver.
- `backend` names an exact regular archive entry. It is validated, never
  imported at install time.
- An optional `view` declares one application-tab page:
  `{ "entry": "view/index.html", "action": "example.files.open", "title": "Files" }`.
  The entry must be a regular `.html` member with a simple ASCII path. The
  action is the package ID plus exactly one more dot-separated name, so packages
  cannot claim each other's namespaces. A view grants no startup activation or
  shortcut. `view.context: "window"` ties the view to its original window
  instead of a source session's directory.
- An optional, nonempty, unique `capabilities` array may use only the names the
  host knows: `terminal.openSsh.v1`, `terminal.captureLayout.v1`,
  `terminal.openLayout.v1`, `terminal.mirrorTyping.v1`,
  `terminal.semanticInput.v1`, `terminal.insertPath.v1`, `links.open.v1` and
  `state.v1`. Unknown names are refused, so an older host rejects a package
  that needs a newer capability instead of half-activating it. The first seven
  are host operations on the extension's own view; `state.v1` is backend bootstrap support, not
  browser filesystem access. A capability grants nothing beyond its contract:
  for example, `terminal.semanticInput.v1` sends text through Protected Paste
  and never exposes the PTY or key injection
  ([ADR 0044](../adr/0044-migrate-snippets-without-changing-terminal-input.md)).
- `links` is required with `links.open.v1` and refused without it: one to
  eight ids (`^[a-z][a-z0-9-]{0,31}$`), each mapped to an exact `https://` URL
  of at most 2,048 characters, for example
  `"links": { "docs": "https://github.com/luizomf/omxterm/blob/main/docs/ssh-connect.md" }`.
  The view opens one with `{ "operation": "links.open.v1", "link": "docs" }`
  ([ADR 0045](../adr/0045-open-declared-extension-links-by-id.md)).
- Other contribution fields, platform declarations and publisher metadata are
  rejected. This schema is internal, not a stable author API.

### Host compatibility

Host admission uses ordinary semver, with two additions for development builds.
Authors should declare ranges against stable versions; these rules exist so
development hosts keep accepting the same archives.

- Development bridges. A host version of the form `X.Y.Z-dev.N` (canonical, `N`
  a plain nonnegative integer, no extra suffix or build metadata) also admits an
  archive whose range accepts **both** the previous stable line and the next one.
  The bridges are `0.24.1-dev.N` (needs `0.24.0` and `0.24.1`), `0.25.0-dev.N`
  (`0.24.0` and `0.25.0`), `0.26.0-dev.N` (`0.25.0` and `0.26.0`),
  `0.26.1-dev.N` (`0.26.0` and `0.26.1`), `0.27.0-dev.N` (`0.26.0` and
  `0.27.0`) and `0.27.1-dev.N` (`0.27.0` and `0.27.1`). They do not rewrite the
  range, and a
  range with an upper bound that excludes the required stable versions gains
  nothing. Other development families need ordinary admission or a reviewed
  decision.
- A historical exception: the published Files 0.1.0 manifest is admitted on the
  enumerated hosts `0.24.0-dev.0` through `0.24.0-dev.5`.

Bridges never change the host version OMXTerm reports, and admission is not
runtime or platform qualification. Capability checks, catalog targets, archive
identity and trust are unaffected. Within these rules, an extension whose range
does not include the running host will not install; no setting overrides that.

## Store layout and transactions

The store root holds a permanent `initialized` marker, `registry.json`,
permanent `locks/`, `versions/<sha256>/`, unique `staging/` and detached
`garbage/`.

- Writers take a short exclusive lease, re-read the registry, compare the
  captured generation and publish a complete replacement. Downloads, extraction,
  waiting for processes and recursive deletion all happen outside that lease.
  The registry holds up to 2 MiB and 1,000 IDs including tombstones.
- Readers (`snapshot()`, `openVersion()`, `revalidate()`) take a shared lease and
  can overlap with each other. `openVersion()` acquires its version pin before
  releasing the registry, so collection cannot remove the selected bytes in
  between.
- Contention never waits or retries. The caller gets `busy`. At most 32 pending
  operations per store and 128 native leases are admitted.
- Completed versions are never overwritten. Reusing a digest requires matching
  stored identity and manifest.
- Collection removes only unreferenced versions it can exclusively own, moves
  them to a unique garbage name and deletes outside the writer lease. It never
  guesses from process IDs or ages, and never deletes a contended path. It
  examines a bounded number of candidates per call, so cleanup is not a
  completion guarantee. Pending cleanup is not a store failure.

### Failures

A known rejection before publication leaves the old registry in place. If
publication may have happened but the outcome is unknown (replace or flush
uncertainty, or lost transport after a mutating request), the result is
`outcome-unknown`. Inspect the current metadata before trying again; do not
retry, downgrade or assume a rollback. Cleanup failures are reported alongside
the primary result instead of hiding it. A missing or corrupt registry is a
targeted error, never an automatic reset or guessed repair.

The store expects one user's local filesystem. Symlinked subdirectories and lock
files are rejected, but the store does not defend against malicious same-user
code replacing ancestors or installed bytes. Network filesystems, power-loss
guarantees and Windows directory durability are outside what has been verified.
Nothing logs package contents or file paths, and the module manages no
application config, themes, SSH files or files an extension creates itself.

## Native leases

Pins rely on kernel file locks held by the native `extension-leases.node`
addon (Node-API 8). POSIX uses independent `flock` descriptors; Windows uses
independent `LockFileEx` handles on extended-length paths. When a process
exits, the kernel releases its locks; there is no PID sentinel, daemon or
supervisor. A lease protects managed version bytes only, not descendant
processes or writes made elsewhere.

## Build and test

```sh
npm run build:installed-packages
npm test -- test/integration/installed-packages.test.ts
```

The explicit build produces `dist/installed-packages/index.mjs` and the addon.
`npm run build` includes both on macOS ARM64, Linux ARM64/x64 and Windows
ARM64/x64. Extension admission is enabled on Linux ARM64/x64, macOS ARM64 and
Windows ARM64; see [macOS composition](macos-extension-composition.md) and
[Windows ARM64 composition](windows-arm64-extension-composition.md). Native
binaries never enter Git. `yauzl` and `semver` are external runtime
dependencies of this bundle.

Native builds need Xcode Command Line Tools (macOS), a C++17 compiler (Linux),
or MSVC with a matching Windows SDK (found through `vswhere` when no
developer shell is active) and an absolute
`OMXTERM_NODE_IMPORT_LIBRARY` pointing at an architecture-matched `node.exe`
import library that exposes Node-API 8 (Windows). Nothing downloads toolchains.

The integration suite is headless but native: it builds in a unique scratch
directory, uses the real archive, store and lease code, and spawns real child
processes. Run it on a machine you are not using. On Windows the loaded addon
stays mapped until the test worker exits, so the scratch build must be deleted
after the process ends.
