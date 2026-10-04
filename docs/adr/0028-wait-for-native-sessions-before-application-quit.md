# Wait for native sessions before application quit

## Context

Closing a window or disposing its IPC controller requests PTY termination, not
native completion. A PTY runtime can defer termination until ready. A disposed
renderer/controller stops receiving terminal events, while its session may
still be draining. Its lifetime cannot own application-wide completion.

## Decision

Electron main tracks each successfully created session until its actual native
exit callback, independently of windows and controllers. Synchronous spawn
failure releases its pending completion record. Native completion is observed
before forwarding exit to the controller; renderer delivery, logs and `kill()`
are not completion signals.

Busy Session confirmation runs first under
[ADR 0017](0017-confirm-close-only-for-busy-sessions.md). Pending or denied Quit
starts no shutdown. Once accepted, OMXTerm rejects new session starts, requests
termination and awaits every pending native exit before normal Electron quit.
Last-window close uses the same barrier; repeated requests share one drain.
Tab and failure-acknowledgement ownership remain in
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md).

## Consequences and verification

The application process can remain after its last window closes while native
sessions finish. There is no arbitrary delay or forced-success timeout in this
barrier. A missing native completion can prevent quit; the barrier does not
promise that every native-runtime hang resolves.

Ownership tests cover accepted/cancelled Quit, last-window closure, sessions
whose owners already closed, deferred exits, repeated requests, spawn failure
and rejected late starts. Native fixtures observe actual process exit and
complete results under an external bound; a `quit` event alone is insufficient.
See [development](../development.md) and [release verification](../release.md)
for the distinction between tests and exact-package qualification.
