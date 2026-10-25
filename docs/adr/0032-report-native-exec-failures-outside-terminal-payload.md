# Report native exec failures outside Terminal Payload

## Context

PTY creation and successful program execution are distinct. Numeric exit status
cannot distinguish failed exec from a program returning nonzero; filesystem
preflight cannot prove execution. Native startup reporting therefore uses a
private status channel rather than exit-code or Terminal Payload heuristics.

## Decision

Keep the pinned runtime and apply a source-digest-guarded native correction at
postinstall. Build its Node-API addon locally on macOS ARM64 and Linux ARM64/x64,
using the locked headers; rebuild the existing macOS spawn helper as a matched
pair. Both development and packaged native artifact locations receive the same
correction. Windows retains its separate ConPTY implementation.

A private close-on-exec pipe carries one fixed failure byte from the existing
child/helper when setup or exec fails. Successful exec closes the writer. The
native exit thread consumes this status after reaping the child and includes a
boolean in its existing exit callback. It neither blocks Electron's main thread
waiting for startup nor interprets output, errno strings, or numeric exit status.
The executable, argv, environment, working directory, native exec operation and
PTY ownership use the same direct spawn path, without a shell or executable
wrapper.

Main translates only that boolean into a fixed optional `startupFailed: true`
exit field. Strict preload validation preserves it; renderer tab ownership waits
for the native failure acknowledgement just as for unexpected signals under
[ADR 0016](0016-adopt-tabs-with-one-live-session-per-tab.md#session-ownership-and-lifecycle).
Main classifies the Operational Event as `spawn-failure` with null code and uses the
existing fixed spawn dialog. Successfully executed programs returning nonzero
retain ordinary exit semantics; requested close and rendering failure keep
their outcome precedence. Native exit, not the status byte or kill request, releases
the application shutdown record (ADR 0028).

## Consequences and verification

Unix dependency preparation requires the native compiler and `patch`; macOS
needs Apple tooling for its blur addon. Unknown upstream native or JavaScript
source bytes stop preparation rather than applying an approximate patch. This
is a maintained adaptation of the pinned dependency, not an upstream guarantee.

Native regression exercises missing explicit executables and unavailable Default
Shells through real Electron, node-pty, renderer ownership and native failure
dialogs. A simultaneously live, successfully executed program returns 1 without
a second dialog. Tests assert safe operational metadata and acknowledgement,
plus preservation of the mounting-tab and shutdown boundaries from ADR 0016.
Tests must distinguish native evidence for each platform and package from mocks
or source review. Terminal Payload never supplies the failure classification.
