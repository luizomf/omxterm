# Contain native resize failures without completing sessions

## Context

A validated owned resize can race real native descriptor closure before
node-pty delivers its exit callback. Pinned Unix node-pty 1.2.0-beta.18 throws the exact
`ioctl(2) failed, EBADF` error in that interval. Letting it escape main's IPC
listener makes an ordinary teardown race an unhandled native-control failure.

## Decision

The Local Terminal Session catches only the native resize call's failures.
On macOS and Linux, that exact pinned error is classified as `closed-pty`;
every other thrown value is `native-failure`, including Windows failures.
The session reports only that fixed category to its owning controller, which
records `pty.resize-failed`: expected closure at debug level, actionable failure
at error level. Native error text never becomes diagnostics. The existing
`pty.resize` event describes the validated request, not successful native resize.

Discard the failed request without closing the session, suppressing subsequent
valid resizes, or synthesizing an exit. Actual native exit retains completion
ownership under [ADR 0028](0028-wait-for-native-sessions-before-application-quit.md).
Existing size/sender/session validation limits the route to its owner; sibling
sessions are unaffected.

## Consequences

A live session's grid may temporarily differ from its Surface after an
unexpected failure; a later valid resize can retry. Error-level local metadata
provides a safe diagnostic rather than declaring that usable work has ended.

Native Unix fixtures drive the production IPC listeners in-process and exercise
real PTY closure races under Node and Electron. They check actual exit, safe
classification and a usable sibling. Windows resize failures have controlled
unit coverage. Its public Windows resize remains deferred until first output;
main's synchronous catch is not a claim to contain a later deferred callback
exception. Unix's public columns/rows wrapper supplies zero pixel dimensions to
the five-argument native resize; direct packaged invalid-FD inspection must also
supply those zeros.
