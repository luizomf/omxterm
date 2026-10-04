# Contain native resize failures without completing sessions

## Context

A validated owned resize can race real native descriptor closure before
node-pty delivers its exit callback. Pinned Unix node-pty 1.1.0 throws the exact
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
No new renderer capability, modal dialog, retry timer, runtime dependency patch,
or general all-control failure framework is introduced.

Controlled regressions exercise the production IPC/session route before exit;
owned native Unix fixtures require real closure races under Node and Electron,
actual exits, safe classification and a usable sibling. They do not establish
Windows native behavior, a renderer-originated IPC packet, or an observed crash.
