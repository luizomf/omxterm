# Internal extension backend runtime

Internal checkpoint for [#719](https://github.com/luizomf/omxterm/issues/719), under [#712](https://github.com/luizomf/omxterm/issues/712). This module is not a public SDK, catalog/installer UI or completed extension support. Its production application consumer is now the [Linux ARM64 Files preview](files-development-preview.md), with startup construction but no automatic code activation. Web-content hosting belongs to [#718](https://github.com/luizomf/omxterm/issues/718), not this module. See [ADR 0040](adr/0040-run-backends-in-owned-node-children.md) and the [Installed Packages contract](extension-installation-foundation.md).

The Files application manager composes the separate backend and UI consumers with independent generation-matched pins and bounded Quit retirement. Internal/native module fixtures alone do not qualify that production composition or surviving-browser file-read exclusion after main death.

## Caller and backend interfaces

`src/extension-runtime/electron-runtime.ts` exports `createExtensionRuntime({root, runtime, addon, bootstrap, environment, owner})`. The caller is Electron main, after application readiness, with an explicit application-owned AbortSignal, absolute app-owned artifact paths, a dedicated installed-package root and application/API versions. Construction opens the store but launches no backend. It does not inspect user directories or execute any installed module.

The returned `ExtensionRuntime` owns at most 32 live, starting or unresolved activations, one per extension ID within that instance:

- `activate(id, selection?)` explicitly selects an enabled compatible installed version and lazily starts its backend. An issued action supplies its captured ID/generation/digest; initial store acquisition must match before spawning, and an existing activation must match before reuse. This prevents an old callback from resolving to replacement bytes. Concurrent startup requests share that activation; reuse of an active backend rechecks its captured installation selection. A stopping/unknown activation cannot be replaced before its actual settlement. A later deliberate activation creates fresh authority, never reconnects to an old backend.
- The resulting handle exposes immutable selection metadata (`id`, `generation`, `digest`), a fresh UUID `epoch`, a host-side lifetime `signal`, `call(value, signal?)`, `state()` and `retire()`. `state()` derives local activity from the actual owned process and cleanup facts; unexpected exit becomes failed only after ownership settles, and incomplete cleanup remains unknown/stopping. Request-local refusal does not change active process state.
- `call` captures a bounded JSON value before asynchronous admission, rechecks the captured version, then dispatches to that exact epoch. It never retargets to the latest installation or a currently selected window. An already-aborted caller is rejected before dispatch. Cancellation after dispatch is advisory and returns outcome-unknown; it cannot undo ordinary Node effects.
- `retire(id)` stops only the known activation; no known activation returns null. Handle `retire()` returns the same cached retirement operation. Neither method is an automatic retry of a failed kill/cleanup.
- `dispose()` or owner abort prevents all new activation/admission, revokes pending infrastructure work and retires known children. It does not close terminals or the application. The embedding application must await and inspect retirement before claiming its runtimes stopped.

The host-side lifetime signal aborts synchronously on retirement, channel loss or observed exit, before native settlement. The application manager uses it to revoke view authority and start view retirement even when no further request arrives. Abortion is not proof that native views, pins or the backend have settled; their existing retirement joins remain required.

These are internal caller/test interfaces, not extension author access to installation locks. The test process adapter models the same spawn/error/message/disconnect/exit/close events; it is not an alternative shipping backend.

Installed backend entrypoints must be prebuilt `.mjs` files inside the captured immutable directory. The app bootstrap dynamically imports that local entry only after admission. It expects this deliberately small internal shape:

```ts
type ActivatedBackend = {
  invoke(value: JsonValue, signal: AbortSignal): JsonValue | Promise<JsonValue>;
  deactivate?(signal: AbortSignal): void | Promise<void>;
};
// Backend ESM exports activate({signal, files, state?}), returning ActivatedBackend or a Promise.
// state is supplied only for a manifest declaring state.v1.
// files.moveNoReplace(source, destination): Promise<void> is the concrete
// Linux ARM64 preview primitive; unsupported platforms refuse explicitly.
```

`activate` receives the real epoch-lifetime cancellation signal; individual invocations receive their own real signal. Deactivation is best effort and receives a grace-bounded signal. The concrete Files no-replace operation runs in the backend's worker-pool addon, with no overwrite fallback. The separate [SSH Connect](ssh-connect.md) consumer uses a declared, own-view
main capability (`terminal.openSsh.v1`), not a backend-owned PTY. Its package
requires host0.24.0-dev.0; API0.1.x and existing Files manifests remain compatible.
The separate [Mirror Typing](mirror-typing.md#capability-and-lifetime) consumer
requires host 0.24.0-dev.2 and declares `terminal.mirrorTyping.v1`. Core owns
its visible revocable input lease; no keyboard bytes or per-key calls enter the
backend. Backend lifetime loss revokes its views and input authority before
settlement. One settled-replacement setup per extension/window is specific to
this capability, not a change to ordinary Files/SSH invocation semantics.
There are no dummy action/tab/terminal methods, automatic registrations, or stable discovery promises. The module owns its channels, timers and pending calls; future capability registrations need their own concrete consumer and retirement contract.

## Explicit extension state

A `state.v1` declaration supplies `state.read()` and
`state.replace(expectedRevision, valueOrNull)` in the backend bootstrap context.
Both return `{revision, value}`. One bounded document per extension ID lives at
`<userData>/extension-state/<id>/state.json`, not in immutable package bytes.
Construction is lazy with no state reads at application startup. Short stable
native exclusive leases protect read/revision/CAS/atomic flushed replacement;
null writes a fresh revisioned tombstone, not deletion of revision history.
Errors distinguish busy, conflict, invalid-state/value and outcome-unknown.

No retry, repair, sweep, migration, arbitrary filename or global event bus is
provided. State survives installation management. Interrupted temp documents
can remain; Forget removes only active data. This helper is correctness support
for trusted code, not a filesystem sandbox. See [Saved Layout](saved-layout.md)
for the first concrete consumer, privacy and cleanup disclosure.

## Bootstrap and immutable-version handoff

1. Main calls actual `InstalledPackages.openVersion(id)` and holds the resulting startup guard. The store releases its short registry writer lease before returning; no writer lock spans spawn, IPC, import or retirement.
2. Main forks the app-owned bootstrap using the bundled Electron executable, not the extension entrypoint. Node IPC carries a captured selection and a fresh epoch, not author-selected authority.
3. Bootstrap opens the same actual store/native adapter and independently pins that exact selection. It acknowledges acquisition before any extension import.
4. Main revalidates generation/digest/enabled state under another short store transaction, checks owner/epoch liveness and grants admission. Startup guard release follows the independent acquisition acknowledgement, or settled cancellation/actual exit if the handshake fails. Unknown startup cancellation keeps unresolved ownership, rather than guessing that a child acquired its pin.
5. Bootstrap checks live channel and captured admission again, then imports. It keeps the actual pin object strongly referenced until OS process exit. Returning from `deactivate`, sending an acknowledgement or losing IPC does not release package bytes early.

Admission is point-in-time and linearized by the store transaction. A later disable/update cannot retroactively prevent already admitted trusted code from executing. New requests and active-handle reuse revalidate; known stale authority is retired. Clean store contention refuses only that admission with `busy`, without dispatch, automatic retry or retirement of unrelated admitted work. Every later explicit request still revalidates. Cleanup failures remain fatal even when the primary error was `busy`. The manager caller still needs to publish disable/update and deliberately retire its local runtime. There is no cross-application global-stop notification protocol here. Disabled means blocked new admission, not proof that all instances or side effects stopped.

Other application instances, fresh generations and unrelated IDs remain independent. A surviving backend pins only its immutable version, not the whole root. A fresh process never adopts orphan ports, replays unknown requests, resets generations or uses a boot quarantine. Collection remains an explicit Installed Packages operation, not a runtime scan/daemon.

## Direct child, environment and IPC

The production adapter uses standard `node:child_process.fork` with explicit `execPath: process.execPath`, empty `execArgv`, JSON IPC serialization and a deliberate environment. It uses the bundled Electron **Run-as-Node** capability, not a separately installed stock Node. No Electron upgrade or security-fuse change is made. Bootstrap refuses absent Node mode/IPC before opening an installed package; lack of the required runtime mode is a startup failure, not a browser-mode fallback.

Normal helper environment values (home/user/path/temp/locale and selected desktop/XDG variables) are copied by an explicit allowlist. App diagnostic/bootstrap variables, `NODE_OPTIONS`, inherited debug arguments and unrelated environment values are not forwarded. `ELECTRON_RUN_AS_NODE=1` is then deliberately set by the host. This is launch hygiene, not credential isolation: ordinary trusted Node code can access user files, processes and the network. No sandbox, hostile same-user protection, resource containment or arbitrary descendant lifetime guarantee is claimed.

Each direction requires the exact epoch and a strictly increasing sequence. Requests have monotonically increasing IDs; duplicate/stale messages or replies cannot reapply effects. Unknown/invalid traffic retires the channel with fixed errors. There are no automatic effectful retries.

Wire strings are limited to 1 MiB before the application JSON parser. Caller/result JSON uses a conservative serialized upper bound, depth 16 from the payload root and at most 256 members per array/object; unsupported/cyclic/nonfinite values are refused, not truncated. Payload capture reserves 1 KiB for envelope metadata; encoding keeps that budget and depth separate from the envelope, so accepted payload boundaries remain encodable in both directions. There are at most 32 admission/pending call slots per activation. A cancelled dispatched request retains its slot until its response or epoch retirement, preventing an unbounded cancelled-ID history. Admission and request timeouts are 10 seconds. Outstanding infrastructure callbacks/signals/timers are revoked on retirement; unresolved store I/O retains ownership and makes settlement unknown.

These bounds concern application-retained requests and protocol admission, not Node's native IPC decoder allocations or malicious trusted code's heap/OS use. Parent stdout/stderr are `ignore`: no extension console stream is retained or forwarded into operational logs. Errors use fixed categories, not package contents, commands, clipboard data, arbitrary exception text or private paths.

## Retirement facts and bounds

Retirement revokes admission and pending work before asking the backend to stop. It allows **2 seconds** for cooperative deactivation/exit, then makes **at most one** `child.kill('SIGKILL')` request against the retained ChildProcess object. Actual exit cancels escalation. Node remains the sole direct-child reaper; there is no raw saved-PID signaling, second supervisor or custom waitpid loop. This is ordinary bounded direct-child ownership, not an absolute PID-reuse-proof capability.

After escalation, exit is joined for at most 5 seconds. Stream/IPC closure and remaining owned cleanup are separately bounded by 2 seconds. An in-progress initial store acquisition also has a bounded cancellation observation; a late acquisition is released without spawning. These observations do not promise that arbitrary filesystem I/O can be forcibly cancelled.

`Retirement` reports separate facts: `processStarted`, `exitObserved`, `exitCode`, `exitSignal`, `streamsClosed`, `killRequested`, `killAccepted`, `cooperative`, `cleanupFailed` and `settled`. A spawn error can settle without inventing a child exit. Exit without stream closure is not complete settlement. A successful kill return or `killed` flag is not exit. A deactivation acknowledgement is not exit; normalized exit 0 after forced termination is not cooperation. Unknown exit/close/cleanup remains unsettled with no repeated kill or mutation replay. A late actual receipt may settle retained local ownership without retroactively changing the earlier unknown result.

On parent/channel death, responsive bootstrap code stops through the same cancellation/deactivation path. Unresponsive trusted code may survive and continue holding its independent pin. A manager must not delete its bytes based on logical owner disposal or PID/age. Arbitrary descendants are neither recursively stopped nor promised package retention after the managed backend actually exits.

## Build, tests and qualification boundary

```sh
npm run build:extension-runtime
npm test -- test/unit/extension-runtime-controlled.test.ts test/unit/extension-runtime-protocol.test.ts
npm test -- test/integration/extension-runtime.test.ts
# Linux native parent-death gate (Python 3.9+ and kernel pidfd support):
npm test -- test/integration/extension-runtime-parent-death.test.ts
```

The explicit artifact includes `index.mjs`, app-owned `bootstrap.mjs`, `packages.mjs` and the existing native lease addon under `dist/extension-runtime`. Native prerequisites are those of the foundation; `yauzl`/`semver` remain direct external dependencies. Normal Linux ARM64 app builds now include these assets and `files-move.node`; startup constructs infrastructure only; shared action invocation activates installed code. A separate `scripts/build-files-extension.mjs` creates the Files archive, not a built-in browser. See [Files development preview](files-development-preview.md) for implemented composition, phase-specific product evidence and remaining qualification limits.

Controlled tests cover admission races, cancellation, bounded pending calls, replay rejection and separate exit/close facts. Native tests use the actual runtime/store/ESM/bootstrap interface and real direct children, not a copied prototype. They require an assigned disposable native environment; never run them on an owner's working desktop merely because the outer Vitest wrapper is headless. Test artifacts remain when settlement is unknown. Actual parent-process death is a separate native gate from channel loss; do not substitute one for the other. The Linux-only parent-death test uses a read-only Python pidfd observer, opened while the backend still belongs to its live main. It neither signals nor reaps the backend; the parent is terminated through its retained ChildProcess handle. Missing Python/pidfd support fails before deliberate parent death. This test-only observer is not an app dependency or a cross-platform exit-code claim; non-Linux explicitly skips that case. Its source/build/profile receipts are retained for the outer qualification owner to export and remove only after verified settlement.

Earlier utility-process and throwaway Node-child outcomes retain their original identities. The utility path is not retained as a speculative alternate implementation. Production qualification must name its exact source and runtime, including architecture/elevation limits. This internal artifact alone does not qualify packaged inclusion/unpacking, security-fuse bytes, Developer ID/notarization, deployment floors, x64 or Windows ordinary-user permissions. Separate Linux ARM64 Files product observations cover composed actions/views and joined Quit. A current module-native management observation additionally confirms backend exit/close before re-enable, dormant enable and explicit fresh-generation activation with an independent view pin; its controlled view port is not graphical recovery qualification. See the Files guide for the separate renderer-crash/core-survival and bounded actual-main-death observations. Surviving-browser file-read exclusion remains unqualified. Source wiring alone is not qualification, and these observations do not establish signed distribution or a cross-platform matrix.
