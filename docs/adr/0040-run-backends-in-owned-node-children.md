# ADR 0040: Run extension backends in owned bundled-Node children

- Status: accepted internal backend runtime, consumed by explicit actions in the Linux ARM64 Files development preview
- Context: [#719](https://github.com/luizomf/omxterm/issues/719), under [#712](https://github.com/luizomf/omxterm/issues/712)
- Supersedes: the #712 proposal's `utilityProcess` placement for extension backends, not ADR 0038 immutable-version ownership or #718 web-content hosting

## Decision

Use one lazy standard Node ChildProcess per explicitly active extension per application runtime. Fork the app-owned bootstrap with the bundled Electron executable (`execPath: process.execPath`), empty debug arguments, a deliberate normal-user environment plus Electron Run-as-Node, and bounded epoch-bound Node IPC. No stock Node installation, Electron upgrade or weakened security fuse is part of this decision. A missing required runtime mode fails startup before package import.

The bootstrap is a real Installed Packages consumer. Main retains its startup guard until independent child acquisition or settled cancellation; child independently pins the captured generation/digest before import, then main revalidates admission. No registry writer is held while spawning, importing, awaiting IPC or retiring. Child holds its version pin until actual process exit, not merely deactivate completion. Admission is point-in-time; disable does not undo already admitted ordinary trusted-code effects or prove every instance stopped.

Revoke infrastructure authority first, allow two seconds of cooperative grace, then request at most one forced termination through the retained ChildProcess object. Cancel escalation on actual exit and separately join exit and bounded stream closure. Node is the sole direct-child reaper. Preserve unknown outcomes; do not infer exit from a kill return, logical disposal, lock release or deactivation acknowledgement. Do not retry unknown effects. Stdout/stderr are ignored rather than retained as unbounded extension logs.

This is ordinary direct-child lifetime ownership, not absolute PID-reuse immunity, a malicious-code sandbox or descendant containment. No raw saved-PID signaling, custom waitpid loop, Mach-port adapter, extra supervisor, boot quarantine or descendant scanner is added.

## Why change the utility choice?

The actual utility runtime/store checkpoint `4b66db07eff813a0292b90ac0fce083e430b8c3b` preserved independent pins and observed actual child exit, but macOS Electron 43.8.1 forced retirement produced a **2008ms main timer gap**. Normalized exit 0 did not mean cooperation. This contradicted responsive main-thread retirement; the failed outcome remains failed.

A separately authorized throwaway discriminator using standard Node ChildProcess, the same bundled Electron 43.8.1/Node 24.22.0 and the same two-second grace/<250ms timer oracle passed on Fedora/macOS ARM64. Refusing-loop main gaps were approximately 159ms/29ms, with one owned SIGKILL, actual exit and stream closure, and pin retention/collection. It also refused a no-Node-mode negative control before import. Those bounded results justified the narrower production substitution, not automatic qualification of subsequent code or signed packages.

Keeping utilityProcess while silently raising the responsiveness threshold would weaken the requirement. A custom native termination capability or supervising process hierarchy adds ownership/build/lifetime obligations that the selected direct-child API does not need for the demonstrated behavior. Moving trusted backend execution into main/terminal renderers would remove fault locality. A separate stock Node runtime adds distribution and version ownership without a demonstrated need.

## Consequences and boundary

The [runtime contract](../extension-backend-runtime.md) governs actual caller/export interfaces, limits, cancellation and settlement. The environment allowlist excludes app bootstrap/diagnostic variables but cannot isolate trusted code from user files or credentials. Each application establishes fresh authority; surviving orphan versions can remain Pending Cleanup while unrelated management and fresh admission continue.

### Current application consumer

Linux ARM64 and macOS ARM64 application startup construct the runtime without
activating installed code. [macOS composition](../macos-extension-composition.md)
is preparatory; existing package/module receipts are not production-lifecycle qualification. The [runtime reference](../extension-backend-runtime.md) covers
current consumers and builds; [Files composition](../files-development-preview.md#owned-composition-modules)
covers the application manager's separate installation/trust, backend and view
owners. Installation and enable remain dormant; explicit actions activate code.
Settings, catalog acquisition, action discovery and web-content hosting are not
runtime responsibilities. Extension archives remain separate from the host;
there is no stable SDK.

[Files qualification](../files-development-preview.md#build-and-evidence-boundary)
keeps product observations distinct from package inspection and module-native
tests. Prototype evidence and historical failures retain their identities and
limits. Surviving-browser main-death file-read exclusion remains unqualified.
The integration and bounded public-consumption evidence do not establish
FUSE/helper installation, physical dialogs/input, security-fuse bytes,
signing/notarization, deployment floors, ordinary-user Windows behavior or
other-platform qualification.
